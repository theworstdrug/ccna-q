// Reference library: PDFs you upload (vendor guides, cheat sheets, chapter scans with text).
// Text is pulled out on the device, split into page-tagged chunks and kept in IndexedDB;
// the PDF itself is not stored. The cue generator searches the chunks (BM25) for background
// on the passage it is working on, and any chunk can also be a source of cues itself.

import { words } from './cuegen.js';

export const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.min.mjs';
export const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.worker.min.mjs';

// ---------------------------------------------------------------- text → chunks (pure)

/** Tidy text pulled from a PDF page: join hyphenated line breaks, collapse whitespace. */
export const tidy = s => String(s).replace(/(\w)-\s*\n\s*(\w)/g, '$1$2').replace(/[ \t\f\v ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

/**
 * Split pages into ~size-character chunks on sentence boundaries, each tagged with its page.
 * pages: [{ p, text }] → [{ i, p, text }]
 */
export function chunk(pages, size = 700) {
  const out = [];
  for (const { p, text } of pages) {
    const sentences = tidy(text).replace(/\n/g, ' ').replace(/([.!?:;])\s+(?=[A-Z0-9(•-])/g, '$1\u0001').split('\u0001');
    let buf = '';
    for (const s of sentences) {
      if (buf && buf.length + s.length > size) { out.push({ p, text: buf.trim() }); buf = ''; }
      buf += (buf ? ' ' : '') + s;
      while (buf.length > size * 1.6) { out.push({ p, text: buf.slice(0, size).trim() }); buf = buf.slice(size); }
    }
    if (buf.trim().length > 40) out.push({ p, text: buf.trim() });
  }
  return out.map((c, i) => ({ i, ...c }));
}

/** A BM25 index over chunks from any number of documents. */
export function makeIndex(docs) {
  const items = [];
  for (const d of docs) for (const c of d.chunks) items.push({ doc: d.id, name: d.name, p: c.p, i: c.i, text: c.text, w: words(c.text) });
  const df = new Map();
  for (const it of items) for (const w of new Set(it.w)) df.set(w, (df.get(w) || 0) + 1);
  const avg = items.reduce((a, it) => a + it.w.length, 0) / Math.max(1, items.length);
  return { items, df, avg, N: items.length };
}

/**
 * Chunks most relevant to `text`. The query is the passage's most distinctive words
 * (tf·idf), so a long passage still makes a focused search.
 */
export function search(index, text, { k = 2, exclude = null, terms = 24, minCover = 0 } = {}) {
  const { items, df, avg, N } = index;
  if (!N) return [];
  const idf = w => Math.log(1 + (N - (df.get(w) || 0) + 0.5) / ((df.get(w) || 0) + 0.5));
  const tf = new Map();
  for (const w of words(text)) tf.set(w, (tf.get(w) || 0) + 1);
  const q = [...tf].filter(([w]) => df.has(w)).sort((a, b) => b[1] * idf(b[0]) - a[1] * idf(a[0])).slice(0, terms);
  if (!q.length) return [];
  const k1 = 1.2, b = 0.75;
  const scored = items.map(it => {
    if (exclude && it.doc === exclude.doc && it.i === exclude.i) return { it, s: 0 };
    const c = new Map();
    for (const w of it.w) c.set(w, (c.get(w) || 0) + 1);
    let s = 0;
    for (const [w, qtf] of q) {
      const f = c.get(w);
      if (f) s += Math.min(qtf, 3) * idf(w) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * it.w.length / avg));
    }
    return { it, s };
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  // relevant = at least two query words matched, covering enough of the query's weight
  const total = q.reduce((a, [w]) => a + idf(w), 0);
  const cover = it => { const set = new Set(it.w); return q.reduce((a, [w]) => a + (set.has(w) ? idf(w) : 0), 0) / total; };
  const strong = scored.filter(x => q.filter(([w]) => x.it.w.includes(w)).length >= 2 && (x.cover = cover(x.it)) >= minCover);
  return strong.slice(0, k).map(x => ({ doc: x.it.doc, name: x.it.name, p: x.it.p, i: x.it.i, text: x.it.text, score: x.s, cover: x.cover }));
}

/**
 * Background for the prompt: only the sentences from the hits that share the most key words
 * with the passage (a tiny model drifts toward whatever else it is shown), in reading order.
 */
export function asBackground(hits, text = '', max = 480) {
  if (!hits.length) return '';
  const key = new Set(words(text));
  const sents = hits.flatMap((x, h) => x.text.replace(/([.!?])\s+(?=[A-Z0-9(])/g, '$1\u0001').split('\u0001').map((s, k) => ({ s: s.trim(), h, k })));
  const score = o => { const ws = words(o.s); return ws.length ? ws.filter(w => key.has(w)).length / Math.sqrt(ws.length) : 0; };
  const ranked = sents.filter(o => o.s.length > 25).map(o => ({ ...o, sc: key.size ? score(o) : 1 })).filter(o => o.sc > 0).sort((a, b) => b.sc - a.sc);
  const pick = [];
  let n = 0;
  for (const o of ranked) { if (n + o.s.length > max) continue; pick.push(o); n += o.s.length + 1; }
  return pick.sort((a, b) => a.h - b.h || a.k - b.k).map(o => o.s).join(' ');
}
export const cite = hits => [...new Set(hits.map(x => `${x.name} p.${x.p}`))].join(', ');

// ---------------------------------------------------------------- IndexedDB

const DB = 'ccnaq-refs';
let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('docs', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  });
  return dbp;
}
const tx = async (mode, fn) => {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction('docs', mode);
    const out = fn(t.objectStore('docs'));
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
  });
};

let cache = null; // docs + index, rebuilt when the library changes
export async function listDocs() {
  if (!cache) {
    const docs = await tx('readonly', s => s.getAll());
    cache = { docs: docs.sort((a, b) => b.added - a.added), index: makeIndex(docs) };
  }
  return cache.docs;
}
export async function libraryIndex() { await listDocs(); return cache.index; }
export async function saveDoc(doc) { cache = null; await tx('readwrite', s => s.put(doc)); }
export async function deleteDoc(id) { cache = null; await tx('readwrite', s => s.delete(id)); }

/** Background excerpts from the library for a passage ('' when there are no PDFs or no good match). */
export async function backgroundFor(text, opts) {
  try {
    const idx = await libraryIndex();
    return search(idx, text, opts);
  } catch { return []; }
}

// ---------------------------------------------------------------- PDF → doc

let pdfjs = null;
async function lib() {
  if (!pdfjs) {
    pdfjs = await import(PDFJS_URL);
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  }
  return pdfjs;
}

/** Read a PDF File on the device. onProgress(0..1, label). Throws if it has no text layer. */
export async function importPdf(file, onProgress = () => {}) {
  onProgress(0, 'Loading the PDF reader…');
  const { getDocument } = await lib();
  const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const tc = await page.getTextContent();
    let text = '';
    for (const it of tc.items) text += it.str + (it.hasEOL ? '\n' : (it.str && !it.str.endsWith(' ') ? ' ' : ''));
    pages.push({ p: n, text });
    page.cleanup();
    if (n % 5 === 0 || n === pdf.numPages) onProgress(n / pdf.numPages, `Reading page ${n} of ${pdf.numPages}…`);
  }
  pdf.destroy();
  const chunks = chunk(pages);
  if (!chunks.length) throw new Error('No text found. This looks like a scanned PDF (images only); run it through OCR first.');
  const doc = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: file.name.replace(/\.pdf$/i, ''), pages: pages.length, size: file.size, added: Date.now(), chunks };
  await saveDoc(doc);
  return doc;
}
