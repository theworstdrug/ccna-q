// Term lookup + text tokenizer for the reader.

import { GLOSSARY, termById, slug, DOMAIN_NAMES } from './data/glossary.js';
import { db } from './store.js';
import { blankCard } from './srs.js';

const isAcronym = f => /[A-Z]/.test(f) && !/[a-z]/.test(f);
const escRe = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

export function getTerm(id) {
  const g = termById[id];
  const c = db().terms[id];
  if (g) return { ...g, note: c?.note || '' };
  if (c?.custom) return { id, term: c.term, def: c.def || '', domain: c.domain || 'custom', domainName: 'Your term', aliases: [], custom: true, note: c.note || '' };
  return null;
}

export function card(id) {
  const t = db().terms;
  if (!t[id]) t[id] = blankCard();
  return t[id];
}

export const statusOf = id => db().terms[id]?.status ?? 0;

export function customTerms() {
  return Object.entries(db().terms).filter(([, c]) => c.custom).map(([id]) => getTerm(id));
}

export function allTerms() { return [...GLOSSARY, ...customTerms()]; }

let cache = { key: null };
function matcher() {
  const customs = customTerms();
  const key = customs.map(c => c.id).join('|');
  if (cache.key === key) return cache;
  const forms = new Map(); // lower → [{id, form}]
  for (const t of [...GLOSSARY, ...customs]) {
    for (const f of [t.term, ...(t.aliases || [])]) {
      const k = f.toLowerCase();
      if (!forms.has(k)) forms.set(k, []);
      forms.get(k).push({ id: t.id, form: f });
    }
  }
  const list = [...forms.keys()].sort((a, b) => b.length - a.length).map(escRe);
  const re = new RegExp(`(^|[^A-Za-z0-9])(${list.join('|')})(?=[^A-Za-z0-9]|$)`, 'gi');
  cache = { key, re, forms };
  return cache;
}

const WORD = /[A-Za-z0-9][A-Za-z0-9'’./-]*[A-Za-z0-9]|[A-Za-z0-9]/g;

function words(text, out) {
  let last = 0;
  for (const m of text.matchAll(WORD)) {
    if (m.index > last) out.push({ t: 'sp', text: text.slice(last, m.index) });
    out.push({ t: 'word', text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: 'sp', text: text.slice(last) });
}

/** Split text into term / word / space segments. */
export function tokenize(text) {
  const { re, forms } = matcher();
  const out = [];
  let last = 0;
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text))) {
    const start = m.index + m[1].length;
    const hit = m[2];
    const cands = forms.get(hit.toLowerCase()) || [];
    const ok = cands.find(c => !isAcronym(c.form) || c.form === hit);
    if (!ok) { re.lastIndex = m.index + m[1].length + 1; continue; }
    words(text.slice(last, start), out);
    out.push({ t: 'term', id: ok.id, text: hit });
    last = start + hit.length;
    re.lastIndex = last;
  }
  words(text.slice(last), out);
  return out;
}

/** Unique term ids found in a body of text (ignores code blocks). */
export function termsIn(text) {
  const prose = text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ');
  return [...new Set(tokenize(prose).filter(s => s.t === 'term').map(s => s.id))];
}

/** The sentence around a character offset, for context. */
export function sentenceAt(text, word) {
  const parts = text.replace(/\s+/g, ' ').replace(/([.!?])\s+(?=[A-Z0-9`*])/g, '$1\u0000').split('\u0000');
  const low = word.toLowerCase();
  return (parts.find(p => p.toLowerCase().includes(low)) || '').replace(/[`*]/g, '').trim().slice(0, 300);
}

export function addCustom(text, def = '') {
  const id = `u-${slug(text)}`;
  const t = db().terms;
  if (!t[id] || !t[id].custom) t[id] = { ...blankCard(), custom: true, term: text.trim(), def };
  return id;
}

export { DOMAIN_NAMES };
