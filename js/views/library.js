// Library & AI: your reference books (synced through a private GitHub repo) and the optional
// Claude tutor key.

import { h, toast } from '../ui.js';
import { listDocs, importPdf } from '../refs.js';
import { cloudConfig, setCloudConfig, cloudOn, parseRepo, testCloud, syncLibrary, uploadDoc, removeDoc, lastSync } from '../cloud.js';
import { tutorKey, setTutorKey, TUTOR_MODEL } from '../tutor.js';

const fmtKB = n => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
const ago = t => { if (!t) return 'never'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

export function render(root) {
  // ---------- books ----------
  const status = h('div.muted.small', {});
  const bar = h('div.bar', { hidden: true }, h('span', { style: { width: '0%' } }));
  const listEl = h('div.ref-list', {});
  const backupPdf = h('input', { type: 'checkbox', checked: true });
  const file = h('input', {
    type: 'file', accept: 'application/pdf,.pdf', multiple: true, hidden: true,
    onchange: async e => {
      const files = [...e.target.files];
      e.target.value = '';
      for (const f of files) {
        bar.hidden = false;
        try {
          const doc = await importPdf(f, (p, l) => { status.textContent = `${f.name}: ${l}`; bar.firstChild.style.width = `${Math.round(p * 100)}%`; });
          if (cloudOn()) {
            status.textContent = `Uploading ${doc.name} to your cloud library…`;
            await uploadDoc(doc, backupPdf.checked ? f : null);
          }
          toast(`Added ${doc.name}: ${doc.pages} pages${cloudOn() ? ', synced' : ''}`);
        } catch (err) { toast(`${f.name}: ${err.message || err}`, 5000); }
      }
      bar.hidden = true; status.textContent = '';
      drawList();
    },
  });

  const drawList = async () => {
    let docs = [];
    try { docs = await listDocs(); } catch { listEl.replaceChildren(h('p.muted.small', {}, 'This browser is blocking local storage (private mode?).')); return; }
    listEl.replaceChildren(...(docs.length ? docs.map(d => h('div.ref-row', {},
      h('div.ref-ico', {}, 'PDF'),
      h('div.grow', {}, h('div.ref-name', {}, d.name),
        h('div.muted.small', {}, [`${d.pages} pages`, `${d.chunks.length} passages`, d.size ? fmtKB(d.size) : null, d.cloud ? (d.pdf ? '☁ text + PDF' : '☁ text') : 'this device only'].filter(Boolean).join(' · '))),
      h('a.btn.small.ghost', { href: '#/cues' }, 'Cues'),
      h('button.icon-btn.tiny', {
        'aria-label': `Remove ${d.name}`,
        onclick: async () => {
          if (!confirm(`Remove "${d.name}"${d.cloud ? ' from every device' : ''}?`)) return;
          try { await removeDoc(d); toast('Removed'); } catch (err) { toast(err.message, 5000); }
          drawList();
        },
      }, '✕'))) : [h('p.muted.small', {}, 'No books yet.')]));
  };

  // ---------- cloud ----------
  const cfg = cloudConfig() || {};
  const repoIn = h('input.input', { placeholder: 'you/ccna-library', value: cfg.repo || '', autocapitalize: 'off', autocorrect: 'off', spellcheck: false });
  const branchIn = h('input.input', { placeholder: 'main', value: cfg.branch || '' });
  const tokenIn = h('input.input', { type: 'password', placeholder: cfg.token ? '•••••••• (saved)' : 'github_pat_…', autocomplete: 'off' });
  const cloudStatus = h('div.small', {});
  const syncBtn = h('button.btn.small', { onclick: () => doSync() }, '↻ Sync now');
  const drawCloud = () => {
    cloudStatus.replaceChildren(cloudOn()
      ? h('span', {}, `☁ Connected to ${cloudConfig().repo} · last sync ${ago(lastSync())}`)
      : h('span.muted', {}, 'Not connected: books stay on this device only.'));
    syncBtn.hidden = !cloudOn();
    disconnect.hidden = !cloudOn();
  };
  const doSync = async () => {
    syncBtn.disabled = true;
    try {
      const r = await syncLibrary(l => { cloudStatus.textContent = l; });
      toast(r.down || r.up || r.gone ? `Synced: ${r.down} downloaded, ${r.up} uploaded${r.gone ? `, ${r.gone} removed` : ''}` : 'Library is up to date');
    } catch (err) { toast(err.message, 6000); }
    syncBtn.disabled = false;
    drawCloud(); drawList();
  };
  const connect = async () => {
    const repo = parseRepo(repoIn.value);
    if (!repo) return toast('Enter the repository as owner/name');
    const next = { repo, branch: branchIn.value.trim() || 'main', token: tokenIn.value.trim() || cfg.token };
    if (!next.token) return toast('Paste the access token');
    cloudStatus.textContent = 'Checking…';
    try {
      const desc = await testCloud(next);
      setCloudConfig(next);
      tokenIn.value = '';
      toast(`Connected: ${desc}`);
      await doSync();
    } catch (err) { cloudStatus.replaceChildren(h('span.bad-text', {}, err.message)); }
  };
  const disconnect = h('button.btn.small.ghost', { onclick: () => { if (confirm('Disconnect this device from the cloud library? Books already here stay.')) { setCloudConfig(null); drawCloud(); } } }, 'Disconnect');

  // ---------- Claude ----------
  const keyIn = h('input.input', { type: 'password', placeholder: tutorKey() ? '•••••••• (saved)' : 'sk-ant-…', autocomplete: 'off' });
  const keyStatus = h('div.small', {});
  const drawKey = () => keyStatus.replaceChildren(tutorKey() ? h('span', {}, `✓ Key saved on this device · model ${TUTOR_MODEL}`) : h('span.muted', {}, 'No key: the chat uses Book mode only.'));

  root.append(
    h('header.view-head', {}, h('a.icon-btn', { href: '#/chat', 'aria-label': 'Back' }, '‹'), h('h1.grow', {}, 'Library & AI')),
    h('div.lib-grid', {},
      h('section.panel', {},
        h('div.panel-head', {}, h('h2', {}, '📚 Your books'), h('span.muted.small', {}, 'chat, cues and background all search these')),
        h('p.hint', {}, 'PDFs with real text: study guides, official cert guides, cheat sheets. The text is read on the device and split into passages with page numbers. Scanned image-only PDFs need OCR first.'),
        h('div.row.wrap', {}, h('button.btn', { onclick: () => file.click() }, '+ Add PDFs'),
          h('label.check-row.small', {}, backupPdf, h('span', {}, 'Also back up the PDF file to the cloud'))),
        file, status, bar, listEl),
      h('section.panel', {},
        h('div.panel-head', {}, h('h2', {}, '☁ Cloud library'), h('span.muted.small', {}, 'same books on every device')),
        h('p.hint', {}, 'Your books sync through a private GitHub repository that only you can see. The app itself is public, so the books never go into it.'),
        h('details.panel-sub', {},
          h('summary', {}, 'One-time setup (5 minutes)'),
          h('ol.small', {},
            h('li', {}, 'On GitHub, create a new repository, set it to ', h('strong', {}, 'Private'), ', and tick "Add a README".'),
            h('li', {}, 'Settings → Developer settings → Fine-grained tokens → Generate. Repository access: only that repository. Permissions: ', h('strong', {}, 'Contents: Read and write'), '. Set an expiry you are happy with.'),
            h('li', {}, 'Paste the repository name and token below on each device (phone and computer).'))),
        h('div.form-grid', {},
          h('label', {}, h('span.muted.small', {}, 'Private repository'), repoIn),
          h('label', {}, h('span.muted.small', {}, 'Branch'), branchIn)),
        h('label.stack', {}, h('span.muted.small', {}, 'Fine-grained access token (stays on this device)'), tokenIn),
        h('div.row.wrap', {}, h('button.btn.small', { onclick: connect }, cfg.repo ? 'Save & test' : 'Connect'), syncBtn, disconnect),
        cloudStatus),
      h('section.panel', {},
        h('div.panel-head', {}, h('h2', {}, '✨ Claude tutor'), h('span.muted.small', {}, 'optional')),
        h('p.hint', {}, `For in-depth explanations in Chat. Uses your own Anthropic API key (console.anthropic.com → API keys) and is billed to that account, usually a few cents per question. Each question is sent with the matching passages from your books. Without a key, Chat's free Book mode quotes your books directly.`),
        h('label.stack', {}, h('span.muted.small', {}, 'Anthropic API key (stays on this device, not in backups)'), keyIn),
        h('div.row.wrap', {},
          h('button.btn.small', { onclick: () => { const k = keyIn.value.trim(); if (!/^sk-ant-/.test(k)) return toast('That doesn\'t look like an Anthropic key (sk-ant-…)'); setTutorKey(k); keyIn.value = ''; drawKey(); toast('Key saved'); } }, 'Save key'),
          h('button.btn.small.ghost', { onclick: () => { setTutorKey(''); drawKey(); } }, 'Remove')),
        keyStatus)));

  drawList(); drawCloud(); drawKey();
  if (cloudOn() && Date.now() - lastSync() > 10 * 60000) doSync();
}
