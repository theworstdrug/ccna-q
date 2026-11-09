// The "Suggested cues" panel, shared by Cornell notes and the Cue lab.
// Questions only: you write the answers. Every suggestion goes straight into the cue bank.

import { h } from '../ui.js';
import { db, update } from '../store.js';
import { buzz } from '../gestures.js';
import { ruleCues, modelCues, sections, prose } from '../cuegen.js';
import { LOCAL_MODELS, localKey, localReady, isPhone } from '../localllm.js';
import { backgroundFor, asBackground, cite, listDocs, libraryIndex, search } from '../refs.js';
import { bankAdd, bankList, bankMark, addToNotes, inNotes } from '../cuebank.js';
import { chapterByN } from '../data/book.js';
import { lessonById } from '../data/lessons.js';
import { topicTitle } from '../sync.js';

const ai = () => db().settings.cueAI || {};
const setAi = patch => update(s => { s.settings.cueAI = { ...ai(), ...patch }; });
export const useRefs = () => ai().refs !== false;

/** Passages for a topic: its lesson sections, your notes, then matching pages from your PDFs. */
export async function topicSources(topic) {
  const c = chapterByN(topic);
  const ids = c ? c.lessons : [topic];
  const out = ids.flatMap(id => { const l = lessonById(id); return l ? sections(l.body).map(t => ({ label: l.title, text: t })) : []; });
  const own = prose(db().notes[topic]?.notes || '');
  if (own.length > 60) out.push({ label: 'your notes', text: own });
  if (useRefs()) {
    try {
      const idx = await libraryIndex();
      const all = [topicTitle(topic), ...out.map(x => x.text)].join('\n');
      for (const x of search(idx, all, { k: 4, terms: 30 })) out.push({ label: `${x.name} p.${x.p}`, text: x.text, ref: { doc: x.doc, i: x.i } });
    } catch { /* no library */ }
  }
  return out;
}

/** Passages from one PDF, in page order. */
export const pdfSources = doc => doc.chunks.filter(c => c.text.length > 200).map(c => ({ label: `${doc.name} p.${c.p}`, text: c.text, ref: { doc: doc.id, i: c.i } }));

function bankRow(x, topic, after) {
  const btn = h('button.btn.small', {
    onclick: () => { addToNotes(topic ?? x.topic, x.q); buzz(6); btn.textContent = 'Added ✓'; btn.disabled = true; btn.classList.add('ghost'); after?.(x.q); },
  }, '+ Add');
  const row = h('div.sug-row', {},
    h('div.grow', {}, h('div.sug-q', {}, x.q), h('div.muted.small', {}, [topic == null ? topicTitle(x.topic) : null, x.src, x.engine === 'ai' ? 'AI' : null].filter(Boolean).join(' · '))),
    btn,
    h('button.icon-btn.tiny', { 'aria-label': 'Dismiss', title: 'Dismiss', onclick: () => { bankMark(x.q, { hidden: true }); row.remove(); } }, '✕'));
  return row;
}
export { bankRow };

/**
 * topic: notes key cues are filed under. sources: async () => [{ label, text, ref? }].
 * onAdded(q): called after a cue goes into the notes.
 */
export function cuePanel({ topic, sources, onAdded, heading = '✨ Suggested cues', autoQuick = false }) {
  let engine = ai().on ? 'ai' : 'quick';
  let round = 0;
  let pool = null;

  const seg = h('div.seg.small-seg', {});
  const status = h('div.muted.small', {});
  const bar = h('div.bar', { hidden: true }, h('span', { style: { width: '0%' } }));
  const list = h('div.sug-list', {});
  const from = h('div.muted.small', {});
  const more = h('button.btn.small.ghost', { onclick: () => run() }, '✨ Suggest');
  const refBox = h('label.check-row.small', {},
    h('input', { type: 'checkbox', checked: useRefs() || null, onchange: e => { setAi({ refs: e.target.checked }); pool = null; drawRefs(); } }),
    h('span', {}));
  const drawRefs = async () => {
    const n = (await listDocs().catch(() => [])).length;
    refBox.lastChild.replaceChildren(n ? `Use my ${n} reference PDF${n > 1 ? 's' : ''}` : 'Use my reference PDFs (none yet)', ' · ', h('a', { href: '#/library' }, 'manage'));
  };
  const aiInfo = h('div.ai-info', {},
    h('p.muted.small', {}, `${LOCAL_MODELS[localKey()].name} runs on this device: free, no account, nothing sent anywhere. It is the same model as the chat's AI tutor, downloaded once.`),
    h('p.muted.small', {}, 'With reference PDFs on, it reads the most relevant pages first. Small models still slip: keep the questions that make you think.'));

  const savedBox = h('details.sug-saved', {});
  const drawSaved = () => {
    const items = bankList({ topic, unused: true }).filter(x => !inNotes(topic, x.q));
    savedBox.hidden = !items.length;
    savedBox.replaceChildren(
      h('summary', {}, `Saved suggestions not used yet (${items.length})`),
      h('div.sug-list', {}, items.slice(0, 40).map(x => bankRow(x, topic, q => { onAdded?.(q); }))),
      items.length > 40 ? h('a.muted.small', { href: '#/cues' }, `All ${items.length} in the Cue lab ›`) : null);
  };

  const drawSeg = () => {
    seg.replaceChildren(...[['quick', 'Quick (built-in)'], ['ai', 'AI model']].map(([k, l]) => h('button' + (engine === k ? '.on' : ''), {
      onclick: () => { engine = k; setAi({ on: k === 'ai' }); drawSeg(); },
    }, l)));
    aiInfo.hidden = engine !== 'ai';
  };

  const show = (qs, label) => {
    from.textContent = label ? `From: ${label}` : '';
    list.replaceChildren(...(qs.length ? qs.map(q => {
      const added = inNotes(topic, q);
      const btn = h('button.btn.small' + (added ? '.ghost' : ''), {
        disabled: added || null,
        onclick: () => { addToNotes(topic, q); buzz(6); btn.textContent = 'Added ✓'; btn.disabled = true; btn.classList.add('ghost'); onAdded?.(q); drawSaved(); },
      }, added ? 'Added ✓' : '+ Add');
      return h('div.sug-row', {}, h('div.grow.sug-q', {}, q), btn);
    }) : [h('p.muted.small', {}, 'No suggestions for this part. Tap More.')]));
  };

  async function run() {
    panel.dataset.started = '1';
    more.textContent = '↻ More';
    more.disabled = true;
    try {
      if (!pool) { list.replaceChildren(h('p.muted.small', {}, 'Gathering passages…')); pool = await sources(); }
      if (!pool.length) { show([], ''); return; }
      const src = pool[round % pool.length];
      const seed = Math.floor(round / pool.length);
      round++;
      const hits = useRefs() ? await backgroundFor(src.text, { k: 2, exclude: src.ref }) : [];
      let qs;
      let used = engine;
      if (engine === 'quick') { qs = ruleCues(src.text, 6, seed); status.textContent = ''; } else {
        list.replaceChildren(h('p.muted.small', {}, localReady(localKey()) ? 'Thinking…' : 'Getting the model ready…'));
        try {
          qs = await modelCues(src.text, {
            max: 6, background: asBackground(hits, src.text),
            onProgress: (p, label) => { status.textContent = label; bar.hidden = p >= 1; bar.firstChild.style.width = `${Math.round(p * 100)}%`; },
          });
          status.textContent = `${LOCAL_MODELS[localKey()].name} · on this device`;
          if (!qs.length) { qs = ruleCues(src.text, 6, seed); used = 'quick'; }
        } catch (e) {
          status.textContent = `The AI model couldn't run here (${e.message || e}). Showing built-in suggestions instead.`;
          bar.hidden = true;
          qs = ruleCues(src.text, 6, seed);
          used = 'quick';
        }
      }
      bankAdd(qs, { topic, src: src.label, engine: used });
      show(qs, `${src.label}${used === 'quick' ? ' (built-in)' : ''}${used === 'ai' && hits.length ? ` · background: ${cite(hits)}` : ''}`);
      drawSaved();
    } finally { more.disabled = false; }
  }

  const panel = h('div.sug-panel', {},
    h('div.panel-head', {}, h('strong', {}, heading), h('span.muted.small', {}, 'questions only: you write the answers')),
    seg, aiInfo, refBox, status, bar, from, list,
    h('div.row', {}, more),
    savedBox);
  panel.run = run;
  panel.reset = () => { pool = null; round = 0; };
  drawSeg();
  drawRefs();
  drawSaved();
  if (autoQuick && engine === 'quick') queueMicrotask(run);
  return panel;
}
