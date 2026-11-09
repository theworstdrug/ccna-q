// The cue bank: every suggested cue is saved the moment it's generated, so nothing is lost
// when you close the panel, tap More, or the app is killed. Lives in the main store, so it
// is part of the JSON backup too.

import { db, update } from './store.js';

const MAX = 3000;
export const normQ = q => String(q).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Save new suggestions (duplicates of anything already in the bank are skipped). */
export function bankAdd(qs, { topic, src = '', engine = 'quick' }) {
  const have = new Set(db().cueBank.map(x => normQ(x.q)));
  const fresh = qs.filter(q => { const k = normQ(q); if (have.has(k)) return false; have.add(k); return true; });
  if (!fresh.length) return 0;
  update(s => {
    const at = Date.now();
    s.cueBank.push(...fresh.map(q => ({ q, topic: String(topic), src, engine, at, used: false, hidden: false })));
    if (s.cueBank.length > MAX) {
      // trim the oldest dismissed/used ones first
      const drop = s.cueBank.length - MAX;
      const idle = s.cueBank.filter(x => x.used || x.hidden).slice(0, drop);
      const gone = new Set(idle);
      s.cueBank = s.cueBank.filter(x => !gone.has(x));
      if (s.cueBank.length > MAX) s.cueBank = s.cueBank.slice(-MAX);
    }
  });
  return fresh.length;
}

/** Saved suggestions, newest first. */
export function bankList({ topic = null, unused = false } = {}) {
  return db().cueBank.filter(x => !x.hidden && (topic == null || x.topic === String(topic)) && (!unused || !x.used)).reverse();
}

export function bankMark(q, patch) {
  const k = normQ(q);
  update(s => { for (const x of s.cueBank) if (normQ(x.q) === k) Object.assign(x, patch); });
}

/** Put a cue into a topic's Cornell notes (blank answer for you to fill in). */
export function addToNotes(topic, q) {
  update(s => {
    const n = s.notes[topic] = s.notes[topic] || { cues: [], notes: '', summary: '' };
    if (!n.cues.some(c => normQ(c.q) === normQ(q))) n.cues.push({ q, a: '' });
  });
  bankMark(q, { used: true });
}

export const inNotes = (topic, q) => (db().notes[topic]?.cues || []).some(c => normQ(c.q) === normQ(q));
