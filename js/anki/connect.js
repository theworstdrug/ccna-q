// AnkiConnect client: talks to the Anki desktop add-on on this computer (127.0.0.1:8765).
// One click adds new cards, updates changed ones in place and can pull review stats back.

import { MODEL_NAME, FIELDS, CSS, QFMT, AFMT, field } from './apkg.js';

export const ANKICONNECT_CODE = '2055492159';
const URL = 'http://127.0.0.1:8765';

export async function invoke(action, params = {}) {
  let res;
  try {
    res = await fetch(URL, { method: 'POST', body: JSON.stringify({ action, version: 6, params }) });
  } catch {
    throw new Error('Can\'t reach Anki. Is Anki desktop open with AnkiConnect installed, and this site in its webCorsOriginList?');
  }
  const j = await res.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

export const ping = () => invoke('version');

const toFields = n => ({ Front: field(n.front), Back: field(n.back), Extra: field(n.extra), Source: field(n.source), Id: n.id });

async function ensureModel() {
  const names = await invoke('modelNames');
  if (names.includes(MODEL_NAME)) return;
  await invoke('createModel', {
    modelName: MODEL_NAME, inOrderFields: FIELDS, css: CSS, isCloze: false,
    cardTemplates: [{ Name: 'Card 1', Front: QFMT, Back: AFMT }],
  });
}

/** Add or update notes. onProgress(text) gets status lines. Returns {added, updated, unchanged}. */
export async function pushNotes(notes, onProgress = () => {}) {
  onProgress('Checking note type…');
  await ensureModel();
  for (const d of [...new Set(notes.map(n => n.deck))]) await invoke('createDeck', { deck: d });
  onProgress('Looking for cards already in Anki…');
  const ids = await invoke('findNotes', { query: `"note:${MODEL_NAME}"` });
  const existing = new Map();
  for (let i = 0; i < ids.length; i += 500) {
    for (const info of await invoke('notesInfo', { notes: ids.slice(i, i + 500) })) existing.set(info.fields.Id?.value, info);
  }
  const toAdd = [];
  const toUpdate = [];
  let unchanged = 0;
  for (const n of notes) {
    const have = existing.get(n.id);
    if (!have) { toAdd.push(n); continue; }
    const f = toFields(n);
    if (Object.keys(f).some(k => (have.fields[k]?.value ?? '') !== f[k])) toUpdate.push({ id: have.noteId, fields: f, tags: n.tags });
    else unchanged++;
  }
  for (let i = 0; i < toAdd.length; i += 100) {
    onProgress(`Adding cards ${i + 1}–${Math.min(i + 100, toAdd.length)} of ${toAdd.length}…`);
    await invoke('addNotes', {
      notes: toAdd.slice(i, i + 100).map(n => ({ deckName: n.deck, modelName: MODEL_NAME, fields: toFields(n), tags: n.tags, options: { allowDuplicate: true } })),
    });
  }
  for (let i = 0; i < toUpdate.length; i += 50) {
    onProgress(`Updating cards ${i + 1}–${Math.min(i + 50, toUpdate.length)} of ${toUpdate.length}…`);
    await invoke('multi', { actions: toUpdate.slice(i, i + 50).map(u => ({ action: 'updateNoteFields', params: { note: { id: u.id, fields: u.fields } } })) });
  }
  return { added: toAdd.length, updated: toUpdate.length, unchanged };
}

/** Review stats per CCNA-Q card id: { id: { ivl, lapses, reps } } */
export async function pullStats() {
  const cards = await invoke('findCards', { query: `"note:${MODEL_NAME}"` });
  const out = {};
  for (let i = 0; i < cards.length; i += 500) {
    for (const c of await invoke('cardsInfo', { cards: cards.slice(i, i + 500) })) {
      const id = c.fields?.Id?.value;
      if (id) out[id] = { ivl: c.interval || 0, lapses: c.lapses || 0, reps: c.reps || 0 };
    }
  }
  return out;
}
