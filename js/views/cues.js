// Cue lab: suggested cues for any topic or any of your reference PDFs, your reference
// library, and the bank of every cue ever suggested.

import { h, toast } from '../ui.js';
import { db, update } from '../store.js';
import { listDocs, importPdf, deleteDoc } from '../refs.js';
import { bankList } from '../cuebank.js';
import { topicOptions, topicTitle, topicKey, currentTopic } from '../sync.js';
import { cuePanel, topicSources, pdfSources, bankRow } from './cuepanel.js';
import { sections } from '../cuegen.js';

const fmtKB = n => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);

export function render(root, [arg]) {
  const opts = topicOptions();
  let topic = topicKey(arg) || db().settings.cueLab?.topic || currentTopic() || opts[0]?.key;
  if (!opts.some(o => o.key === topic)) topic = opts[0]?.key;
  let source = { kind: 'topic' }; // or { kind: 'pdf', doc }

  // ---------- generate ----------
  const panelSlot = h('div', {});
  const srcSel = h('select.input', { 'aria-label': 'Ask about' });
  const topicSel = h('select.input', {
    'aria-label': 'File under',
    onchange: e => { topic = e.target.value; update(s => { s.settings.cueLab = { topic }; }); drawPanel(); drawBank(); },
  }, opts.map(o => h('option', { value: o.key, selected: o.key === topic || null }, o.label)));

  const drawSrcSel = async () => {
    const docs = await listDocs().catch(() => []);
    srcSel.replaceChildren(
      h('option', { value: '' }, 'This topic (lessons, notes, matching PDF pages)'),
      ...docs.map(d => h('option', { value: d.id, selected: source.doc?.id === d.id || null }, `PDF: ${d.name}`)),
      ...db().imports.map(m => h('option', { value: `imp:${m.id}`, selected: source.imp?.id === m.id || null }, `Imported: ${m.title}`)));
    srcSel.onchange = () => {
      const d = docs.find(x => x.id === srcSel.value);
      const m = db().imports.find(x => `imp:${x.id}` === srcSel.value);
      source = d ? { kind: 'pdf', doc: d } : m ? { kind: 'imp', imp: m } : { kind: 'topic' };
      drawPanel();
    };
  };

  const drawPanel = () => {
    const p = cuePanel({
      topic,
      heading: source.kind === 'pdf' ? `✨ Cues from ${source.doc.name}` : source.kind === 'imp' ? `✨ Cues from ${source.imp.title}` : '✨ Suggested cues',
      sources: source.kind === 'pdf' ? async () => pdfSources(source.doc)
        : source.kind === 'imp' ? async () => sections(source.imp.text).map(t => ({ label: source.imp.title, text: t }))
          : () => topicSources(topic),
      onAdded: () => drawBank(),
      autoQuick: true,
    });
    panelSlot.replaceChildren(p);
  };

  // ---------- reference library ----------
  const libList = h('div.ref-list', {});
  const libStatus = h('div.muted.small', {});
  const libBar = h('div.bar', { hidden: true }, h('span', { style: { width: '0%' } }));
  const file = h('input', {
    type: 'file', accept: 'application/pdf,.pdf', multiple: true, hidden: true,
    onchange: async e => {
      const files = [...e.target.files];
      e.target.value = '';
      for (const f of files) {
        libBar.hidden = false;
        try {
          const doc = await importPdf(f, (p, label) => { libStatus.textContent = `${f.name}: ${label}`; libBar.firstChild.style.width = `${Math.round(p * 100)}%`; });
          toast(`Added ${doc.name}: ${doc.pages} pages`);
        } catch (err) {
          toast(`${f.name}: ${err.message || err}`, 4500);
        }
      }
      libBar.hidden = true;
      libStatus.textContent = '';
      drawLib(); drawSrcSel(); drawPanel();
    },
  });
  const drawLib = async () => {
    let docs = [];
    try { docs = await listDocs(); } catch { libList.replaceChildren(h('p.muted.small', {}, 'This browser blocks local storage for files (private mode?).')); return; }
    libList.replaceChildren(...(docs.length ? docs.map(d => h('div.ref-row', {},
      h('div.ref-ico', {}, 'PDF'),
      h('div.grow', {}, h('div.ref-name', {}, d.name), h('div.muted.small', {}, `${d.pages} pages · ${d.chunks.length} passages · ${fmtKB(d.size)} · ${new Date(d.added).toLocaleDateString()}`)),
      h('button.btn.small.ghost', { onclick: () => { source = { kind: 'pdf', doc: d }; drawSrcSel(); drawPanel(); panelSlot.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, 'Cues'),
      h('button.icon-btn.tiny', { 'aria-label': `Remove ${d.name}`, onclick: async () => { if (!confirm(`Remove "${d.name}" from your references?`)) return; await deleteDoc(d.id); if (source.doc?.id === d.id) source = { kind: 'topic' }; drawLib(); drawSrcSel(); drawPanel(); } }, '✕')))
      : [h('p.muted.small', {}, 'No PDFs yet.')]));
  };

  // ---------- bank ----------
  let bankTopic = 'all';
  let unusedOnly = true;
  const bankBody = h('div.sug-list', {});
  const bankCount = h('span.muted.small', {});
  const drawBank = () => {
    const items = bankList({ topic: bankTopic === 'all' ? null : bankTopic, unused: unusedOnly });
    bankCount.textContent = `${items.length} saved`;
    bankBody.replaceChildren(...(items.length ? items.slice(0, 150).map(x => bankRow(x, null, () => drawBank())) : [h('p.muted.small', {}, 'Nothing here yet. Every cue you generate lands here automatically.')]));
  };
  const usedTopics = () => [...new Set(db().cueBank.map(x => x.topic))];
  const bankSel = h('select.input', {
    'aria-label': 'Filter by topic', onchange: e => { bankTopic = e.target.value; drawBank(); },
  }, h('option', { value: 'all' }, 'All topics'), usedTopics().map(t => h('option', { value: t }, topicTitle(t))));

  root.append(
    h('header.view-head', {}, h('a.icon-btn', { href: '#/book', 'aria-label': 'Back' }, '‹'), h('h1.grow', {}, 'Cue lab')),
    h('p.hint', {}, 'Leading questions for your Cornell cue column, from any topic or any PDF you add. Nothing you generate is lost: it all stays in the bank below.'),
    h('div.cue-lab', {},
      h('section.panel.cue-gen', {},
        h('div.form-grid', {},
          h('label', {}, h('span.muted.small', {}, 'Ask about'), srcSel),
          h('label', {}, h('span.muted.small', {}, 'File cues under'), topicSel)),
        panelSlot,
        h('button.btn.small.ghost', { onclick: () => { location.hash = `#/notes/${encodeURIComponent(topic)}`; } }, 'Open these Cornell notes ›')),
      h('section.panel', {},
        h('div.panel-head', {}, h('h2', {}, '📚 Reference PDFs'), h('span.muted.small', {}, 'stay on this device')),
        h('p.hint', {}, 'Add PDFs with real text (official guides, cheat sheets, exported notes). The cue generator reads the most relevant pages as background, and you can ask for cues straight from a PDF. Scanned image-only PDFs need OCR first.'),
        h('button.btn', { onclick: () => file.click() }, '+ Add PDFs'), file, libStatus, libBar, libList,
        h('p.muted.small', {}, 'PDFs aren\'t in the JSON backup; the cues made from them are.')),
      h('section.panel.cue-bank', {},
        h('div.panel-head', {}, h('h2', {}, '🗂 Saved cues'), bankCount),
        h('div.row.wrap', {}, bankSel,
          h('label.check-row.small', {}, h('input', { type: 'checkbox', checked: true, onchange: e => { unusedOnly = e.target.checked; drawBank(); } }), h('span', {}, 'Not added yet'))),
        bankBody)));

  drawSrcSel(); drawPanel(); drawLib(); drawBank();
}
