// Library & AI: your reference books (synced through your private books repo) and, on computers,
// the on-device AI model. On phones the AI settings are hidden: the small model is always used.

import { h, toast, sheet } from '../ui.js';
import { listDocs, importPdf, bookLabel } from '../refs.js';
import { cloudConfig, setCloudConfig, cloudOn, parseRepo, testCloud, syncLibrary, uploadDoc, removeDoc, lastSync, DEFAULT_REPO } from '../cloud.js';
import { fetchVault, unlock, publishVault, removeVault, makePassphrase, strengthBits, MIN_BITS, APP_REPO } from '../vault.js';
import { LOCAL_MODELS, localKey, setLocalKey, loadLocal, localReady, hasWebGPU, defaultLocalKey, isPhone, modelStored } from '../localllm.js';

const fmtKB = n => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
const ago = t => { if (!t) return 'never'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

export function render(root) {
  const phone = isPhone();
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
      h('div.grow', {}, h('div.ref-name', {}, bookLabel(d.name)),
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

  // ---------- cloud (defaults to your private books repo) ----------
  const cfg = cloudConfig();
  const repoIn = h('input.input', { placeholder: DEFAULT_REPO, value: cfg.repo === DEFAULT_REPO ? '' : cfg.repo, autocapitalize: 'off', autocorrect: 'off', spellcheck: false });
  const branchIn = h('input.input', { placeholder: 'main', value: cfg.branch === 'main' ? '' : cfg.branch });
  const tokenIn = h('input.input', { type: 'password', placeholder: 'github_pat_…', autocomplete: 'off' });
  const cloudStatus = h('div.small.cloud-status', {});
  const connectBox = h('div.connect-box', {});
  const syncBtn = h('button.btn.small.ghost', { onclick: () => doSync() }, '↻ Sync');
  const drawCloud = () => {
    const on = cloudOn();
    if (phone) { phoneVault.hidden = !on; phoneVault.replaceChildren(vaultStatus, h('div.row.wrap', {}, rememberBtn)); }
    cloudStatus.replaceChildren(on ? h('span', {}, `☁ Synced with your books repo · ${ago(lastSync())} `, syncBtn) : '');
    connectBox.hidden = on;
    disconnect.hidden = !on;
  };
  const doSync = async () => {
    syncBtn.disabled = true;
    try {
      const r = await syncLibrary(l => { cloudStatus.textContent = l; });
      if (r.down || r.up || r.gone) toast(`Synced: ${r.down} downloaded, ${r.up} uploaded${r.gone ? `, ${r.gone} removed` : ''}`);
    } catch (err) { toast(err.message, 6000); }
    syncBtn.disabled = false;
    drawCloud(); drawList();
  };
  const connect = async () => {
    const repo = repoIn.value.trim() ? parseRepo(repoIn.value) : DEFAULT_REPO;
    if (!repo) return toast('Enter the repository as owner/name');
    const next = { repo, branch: branchIn.value.trim() || 'main', token: tokenIn.value.trim() || cfg.token };
    if (!next.token) return toast('Paste the access token');
    cloudStatus.textContent = 'Checking…';
    try {
      await testCloud(next);
      setCloudConfig(next);
      tokenIn.value = '';
      toast('Connected to your books');
      await doSync();
      if (!vaultInfo) rememberSheet(); // set up the other devices right away, phone or computer
    } catch (err) { cloudStatus.replaceChildren(h('span.bad-text', {}, err.message)); }
  };
  const disconnect = h('button.btn.small.ghost', { onclick: () => { if (confirm('Disconnect this device from your books repo? Books already here stay.')) { setCloudConfig({ ...cloudConfig(), token: '' }); drawCloud(); } } }, 'Disconnect this device');
  // ---------- connecting: passphrase (vault) or token ----------
  const passIn = h('input.input', { type: 'password', placeholder: 'your five-word passphrase', autocomplete: 'current-password', autocapitalize: 'off', spellcheck: false, onkeydown: e => { if (e.key === 'Enter') doUnlock(); } });
  const doUnlock = async () => {
    if (!passIn.value.trim()) return;
    cloudStatus.textContent = 'Unlocking…';
    try { await unlock(passIn.value); passIn.value = ''; toast('Unlocked: connected to your books'); await doSync(); }
    catch (err) { cloudStatus.replaceChildren(h('span.bad-text', {}, err.message)); }
  };
  const tokenHelp = h('details.panel-sub.small', {}, h('summary', {}, 'Where do I get a token?'),
    h('ol', {},
      h('li', {}, 'GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token.'),
      h('li', {}, 'Repository access: ', h('code', {}, DEFAULT_REPO), ' and ', h('code', {}, APP_REPO), '. Permissions: ', h('strong', {}, 'Contents: Read and write'), '. (The app repo is only needed to save the passphrase vault.)'),
      h('li', {}, 'Paste it here once, then choose "Remember on my other devices" so the others only need a passphrase.')));
  const drawConnect = vault => connectBox.replaceChildren(...(vault ? [
    h('p.small', {}, h('strong', {}, 'Unlock your books'), ' — enter your passphrase once on this device.'),
    h('div.row.wrap.token-row', {}, passIn, h('button.btn.small', { onclick: doUnlock }, 'Unlock')),
    h('details.panel-sub.small', {}, h('summary', {}, 'Use a token instead'), h('div.row.wrap.token-row', {}, tokenIn, h('button.btn.small', { onclick: connect }, 'Connect')), tokenHelp),
  ] : [
    h('p.small', {}, h('strong', {}, 'Connect your books'), ' — paste your access token once to get your books (and the AI model) from your private repo.'),
    h('div.row.wrap.token-row', {}, tokenIn, h('button.btn.small', { onclick: connect }, 'Connect')),
    tokenHelp,
  ]));
  drawConnect(null);
  fetchVault().then(v => { vaultInfo = v; drawConnect(v); drawVault(); });

  // ---------- remembering the token for other devices ----------
  let vaultInfo = null;
  const vaultStatus = h('div.small', {});
  const drawVault = () => { rememberBtn.textContent = vaultInfo ? 'Change passphrase' : 'Remember on my other devices'; vaultStatus.replaceChildren(vaultInfo
    ? h('span', {}, `🔐 Other devices can unlock with your passphrase (vault saved ${vaultInfo.at}). `)
    : h('span.muted', {}, 'Other devices need the token pasted, unless you save a passphrase vault.')); };
  const rememberSheet = () => {
    let pass = makePassphrase(5);
    const shown = h('div.passphrase', {}, pass);
    const own = h('input.input', { placeholder: 'or type your own (long!)', autocapitalize: 'off', spellcheck: false, oninput: e => { pass = e.target.value || shown.textContent; meter(); } });
    const bits = h('div.small', {});
    const meter = () => { const b = strengthBits(pass); bits.replaceChildren(b >= MIN_BITS ? h('span', {}, `✓ about ${b} bits: fine`) : h('span.bad-text', {}, `about ${b} bits: too easy to guess`)); save.disabled = b < MIN_BITS || !ok.checked; };
    const ok = h('input', { type: 'checkbox', onchange: () => meter() });
    const save = h('button.btn.full', {
      disabled: true,
      onclick: async () => {
        save.disabled = true; save.textContent = 'Encrypting & saving…';
        try { vaultInfo = await publishVault(pass); drawVault(); close(); toast('Saved: other devices can now unlock with the passphrase'); }
        catch (err) { toast(err.message, 7000); save.textContent = 'Save vault'; meter(); }
      },
    }, 'Save vault');
    const close = sheet(h('div.vault-sheet', {},
      h('p', {}, 'Your token will be encrypted with this passphrase and saved in the app repo. On each other device you type the passphrase once instead of the token.'),
      shown,
      h('div.row.wrap', {}, h('button.btn.small.ghost', { onclick: () => { pass = makePassphrase(5); shown.textContent = pass; own.value = ''; meter(); } }, '↻ New words'),
        h('button.btn.small.ghost', { onclick: () => navigator.clipboard?.writeText(pass).then(() => toast('Copied')) }, 'Copy')),
      own, bits,
      h('p.muted.small', {}, 'The vault is public, so its safety is the passphrase: five random words would take thousands of years to guess even with dedicated hardware. A short or familiar phrase would not. Save it in your password manager.'),
      h('label.check-row.small', {}, ok, h('span', {}, 'I\'ve saved the passphrase somewhere safe')),
      save), { title: 'Remember on my other devices' });
    meter();
  };
  // phones: no Advanced section, just the passphrase vault (shown once connected)
  const phoneVault = h('div.phone-vault', {});
  const rememberBtn = h('button.btn.small', { onclick: () => (cloudOn() ? rememberSheet() : toast('Connect with a token first')) }, 'Remember on my other devices');
  const advanced = h('details.panel-sub.small.advanced', {},
    h('summary', {}, 'Advanced'),
    vaultStatus,
    h('div.row.wrap', {},
      rememberBtn,
      h('button.btn.small.ghost', { onclick: async () => { if (!confirm('Delete the saved vault? Other devices that are already connected stay connected.')) return; try { await removeVault(); vaultInfo = null; drawVault(); toast('Vault deleted'); } catch (err) { toast(err.message, 6000); } } }, 'Delete vault')),
    h('div.form-grid', {},
      h('label', {}, h('span.muted.small', {}, 'Books repository'), repoIn),
      h('label', {}, h('span.muted.small', {}, 'Branch'), branchIn)),
    h('label.stack', {}, h('span.muted.small', {}, 'New access token'), h('input.input', { type: 'password', placeholder: 'github_pat_…', autocomplete: 'off', oninput: e => { tokenIn.value = e.target.value; } })),
    h('div.row.wrap', {}, h('button.btn.small', { onclick: connect }, 'Save & test'), disconnect));

  // ---------- on-device model (computers only) ----------
  const gpuNote = h('div.small', {});
  const localStatus = h('div.muted.small', {});
  const localBar = h('div.bar', { hidden: true }, h('span', { style: { width: '0%' } }));
  const modelList = h('div.model-list', {});
  const drawModels = async () => {
    const stored = Object.fromEntries(await Promise.all(Object.keys(LOCAL_MODELS).map(async k => [k, await modelStored(k)])));
    modelList.replaceChildren(...Object.entries(LOCAL_MODELS).filter(([, m]) => !m.mirrorOnly).map(([k, m]) => h('label.model-row' + (localKey() === k ? '.on' : ''), {},
      h('input', { type: 'radio', name: 'localmodel', checked: localKey() === k || null, onchange: () => { setLocalKey(k); drawModels(); } }),
      h('div.grow', {}, h('div.ref-name', {}, m.name, k === defaultLocalKey() ? h('span.cite', {}, ' default') : null),
        h('div.muted.small', {}, `${stored[k] ? '✓ stored on this device' : `${(m.size / 1000).toFixed(1)} GB download, once`}${m.mirror && cloudOn() ? ' · from your books repo' : ''} · ${m.note}${localReady(k) ? ' · loaded' : ''}`)))));
  };
  hasWebGPU().then(ok => gpuNote.replaceChildren(ok ? h('span', {}, '✓ WebGPU available') : h('span.bad-text', {}, 'No WebGPU in this browser: the AI tutor needs Chrome/Edge on a computer or Safari on iOS 26+.')));
  const preload = h('button.btn.small', {
    onclick: async () => {
      preload.disabled = true; localBar.hidden = false;
      try { await loadLocal(localKey(), (p, l) => { localStatus.textContent = l; localBar.firstChild.style.width = `${Math.round(p * 100)}%`; }); toast(`${LOCAL_MODELS[localKey()].name} is ready`); } catch (err) { localStatus.replaceChildren(h('span.bad-text', {}, err.message)); }
      preload.disabled = false; localBar.hidden = true; drawModels();
    },
  }, 'Download & load now');

  root.append(
    h('header.view-head', {}, h('a.icon-btn', { href: '#/chat', 'aria-label': 'Back' }, '‹'), h('h1.grow', {}, phone ? 'Your books' : 'Library & AI')),
    h('div.lib-grid', {},
      h('section.panel', {},
        h('div.panel-head', {}, phone ? h('span') : h('h2', {}, '📚 Your books'), cloudStatus),
        connectBox,
        listEl,
        h('div.row.wrap', {}, h('button.btn.small', { onclick: () => file.click() }, '+ Add a PDF'),
          h('label.check-row.small', {}, backupPdf, h('span', {}, 'Also keep the PDF file'))),
        h('p.muted.small', {}, 'PDFs with real text (scanned, image-only PDFs need OCR first). Chat, cues and backgrounds search these.'),
        file, status, bar,
        phone ? phoneVault : advanced),
      phone ? null : h('section.panel', {},
        h('div.panel-head', {}, h('h2', {}, '🧠 AI tutor model'), h('span.muted.small', {}, 'free · private · offline once stored')),
        h('p.hint', {}, 'Open-weight models that run inside the browser on your GPU, for the chat\'s AI tutor and AI cues. Phones always use Granite. Small models still make mistakes: check anything surprising against the passages under each answer.'),
        gpuNote, modelList,
        h('div.row.wrap', {}, preload), localStatus, localBar)));

  drawList(); drawCloud(); drawModels();
  if (cloudOn() && Date.now() - lastSync() > 10 * 60000) doSync();
}
