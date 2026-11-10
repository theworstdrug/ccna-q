// Reference library: PDFs you upload (vendor guides, cheat sheets, chapter scans with text).
// Text is pulled out on the device, split into page-tagged chunks and kept in IndexedDB;
// the PDF itself is not stored. The cue generator searches the chunks (BM25) for background
// on the passage it is working on, and any chunk can also be a source of cues itself.

import { words } from './cuegen.js';

export const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.min.mjs';
export const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.worker.min.mjs';

// ---------------------------------------------------------------- text → chunks (pure)

/** Tidy text pulled from a PDF page: join hyphenated line breaks, collapse whitespace. */
export const tidy = s => String(s).replace(/\b(?:[A-Za-z] ){3,}[A-Za-z]\b/g, m => m.replace(/ /g, '')).replace(/(\w)-\s*\n\s*(\w)/g, '$1$2').replace(/[ \t\f\v ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

/**
 * Split pages into ~size-character chunks on sentence boundaries, each tagged with its page.
 * pages: [{ p, text }] → [{ i, p, text }]
 */
export function chunk(pages, size = 700) {
  const out = [];
  for (const { p, pp, text, chapter } of pages) {
    const tag = { p, ...(pp && pp !== p ? { pp } : {}), ...(chapter ? { ch: chapter } : {}) };
    const sentences = tidy(text).replace(/\n/g, ' ').replace(/([.!?:;])\s+(?=[A-Z0-9(•-])/g, '$1\u0001').split('\u0001');
    let buf = '';
    for (const s of sentences) {
      if (buf && buf.length + s.length > size) { out.push({ ...tag, text: buf.trim() }); buf = ''; }
      buf += (buf ? ' ' : '') + s;
      while (buf.length > size * 1.6) { out.push({ ...tag, text: buf.slice(0, size).trim() }); buf = buf.slice(size); }
    }
    if (buf.trim().length > 40) out.push({ ...tag, text: buf.trim() });
  }
  return out.map((c, i) => ({ i, ...c }));
}

/**
 * Book clean-up before chunking. pages: [{ p (PDF page), text }] →
 * [{ p (printed page number when the book has them, else PDF page), chapter, text }].
 *  • running headers/footers (lines repeated on many pages, digits ignored) are removed
 *  • printed page numbers are read from the first/last line when they track the PDF page
 *  • table-of-contents/index pages (mostly bare numbers) are dropped
 */
export function cleanBook(pages) {
  const lines = pages.map(pg => tidy(pg.text).split('\n').map(l => l.trim()).filter(Boolean));
  const shape = l => l.replace(/\d+/g, '#').replace(/\s+/g, ' ').toLowerCase();
  const freq = new Map();
  for (const ls of lines) for (const k of new Set([...ls.slice(0, 3), ...ls.slice(-3)].map(shape))) freq.set(k, (freq.get(k) || 0) + 1);
  const minRep = Math.max(4, pages.length * 0.04);
  // printed page numbers: the offset between a number on the edge lines and the PDF page, if consistent
  const offs = new Map();
  pages.forEach((pg, k) => {
    for (const l of [...lines[k].slice(0, 2), ...lines[k].slice(-2)]) {
      const m = l.match(/^(\d{1,4})\b|\b(\d{1,4})$/);
      if (m) { const o = pg.p - +(m[1] || m[2]); offs.set(o, (offs.get(o) || 0) + 1); }
    }
  });
  const [bestOff, hits] = [...offs].sort((a, b) => b[1] - a[1])[0] || [0, 0];
  const printed = hits >= pages.length * 0.3;
  let chapter = '';
  const out = [];
  pages.forEach((pg, k) => {
    const ls = lines[k];
    // chapter opener pages: "Chapter" / "11" / "VLANs and Inter-VLAN Routing"
    const o = ls.slice(0, 6).findIndex((l, i) => /^chapter$/i.test(l) && /^\d{1,2}$/.test(ls[i + 1] || ''));
    if (o >= 0 && ls[o + 2]) chapter = `Chapter ${ls[o + 1]} ${ls[o + 2]}`;
    else for (const l of [...ls.slice(0, 3), ...ls.slice(-3)]) {
      const m = l.match(/^(?:\d+\s+)?(Chapter\s+\d+)\s*[■•|]\s*(.{3,80}?)(?:\s+\d+)?$/i);
      if (m) { chapter = `${m[1]} ${m[2]}`.trim(); break; }
    }
    const body = ls.filter((l, i) => {
      const edge = i < 3 || i >= ls.length - 3;
      if (!edge) return true;
      if (l.length < 80 && freq.get(shape(l)) >= minRep) return false;
      if (/^\d{1,4}$/.test(l)) return false;
      if (/^(\d+\s+)?Chapter\s+\d+\s*■/.test(l)) return false;
      return true;
    });
    const numeric = body.filter(l => /^[\divxlc.\s]+$/i.test(l)).length;
    if (!body.length || numeric / body.length > 0.35) return;
    out.push({ p: printed && pg.p - bestOff > 0 ? pg.p - bestOff : pg.p, pp: pg.p, chapter, text: body.join('\n') });
  });
  return out;
}

/**
 * Quiz pages, answer keys and review questions: their option lines read like facts but are often
 * deliberately wrong ("learned based on the destination MAC address"). Lammle uses "A. B. C.",
 * the Cisco Press guides "a. b. c." under "Which of the following…".
 */
export function isQuiz(text) {
  const t = String(text);
  return (t.match(/(?:^|\s)[A-F]\.\s/g) || []).length >= 3
    || (t.match(/(?:^|\s)[a-f]\.\s+[A-Z]/g) || []).length >= 3
    || (t.match(/(?:^|\s)\d{1,2}\.\s[A-F](?:,\s?[A-F])*\.?\s/g) || []).length >= 2
    || /Which of the following|Do I Know This Already|Answers to (the )?(Review|“Do I Know|"Do I Know)|Review Questions|is (true|false|correct|incorrect) because/i.test(t);
}

/** A readable book name from a file name: "12381imguf_CiscoPress-CCNA-200-301-Official-Cert-Guide-Volume-1"
 *  → "CCNA 200-301 Official Cert Guide Vol. 1". */
export function bookLabel(name) {
  let s = String(name || '').replace(/\.pdf$/i, '').replace(/^\d+[a-z0-9]*_/i, '').replace(/^(CiscoPress|Cisco Press|Pearson|Sybex|Wiley)[-_ ]+/i, '');
  s = s.replace(/[_]+/g, ' ').replace(/([A-Za-z])-|-([A-Za-z])/g, (m, a, b) => (a ? `${a} ` : ` ${b}`)).replace(/\s+/g, ' ').trim();
  s = s.replace(/\bvol(?:ume)?[\s.\-]*(\d+)/i, 'Vol. $1').replace(/\bccna\b/i, 'CCNA');
  return s.length > 48 ? `${s.slice(0, 46).trim()}…` : s || 'Book';
}

/** A BM25 index over chunks from any number of documents. */
export function makeIndex(docs) {
  const items = [];
  for (const d of docs) for (const c of d.chunks) {
    const w = words(c.text);
    const tf = new Map();
    for (const x of w) tf.set(x, (tf.get(x) || 0) + 1);
    // quiz pages and answer keys (lots of "A." "B." options or numbered answers) rank lower
    const quiz = isQuiz(c.text);
    // table-of-contents / index text: "Topic 623 Next Topic 625 …"
    const toc = (c.text.match(/[A-Za-z)]\s\d{1,4}\s(?=[A-Z])/g) || []).length >= 5;
    items.push({ doc: d.id, name: bookLabel(d.name), p: c.p, pp: c.pp, ch: c.ch, i: c.i, text: c.text, len: w.length, tf, quiz, boost: toc ? 0.3 : quiz ? 0.4 : 1 });
  }
  const df = new Map();
  for (const it of items) for (const w of it.tf.keys()) df.set(w, (df.get(w) || 0) + 1);
  const avg = items.reduce((a, it) => a + it.len, 0) / Math.max(1, items.length);
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
  const scored = [];
  for (const it of items) {
    if (exclude && it.doc === exclude.doc && it.i === exclude.i) continue;
    let sc = 0, matched = 0, cov = 0;
    for (const [w, qtf] of q) {
      const f = it.tf.get(w);
      if (!f) continue;
      matched++;
      cov += idf(w);
      sc += Math.min(qtf, 3) * idf(w) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * it.len / avg));
    }
    if (sc > 0 && matched >= Math.min(2, q.length)) scored.push({ it, s: sc * it.boost, cover: cov });
  }
  // relevant = at least two query words matched, covering enough of the query's weight
  const total = q.reduce((a, [w]) => a + idf(w), 0);
  const strong = scored.filter(x => (x.cover /= total) >= minCover).sort((a, b) => b.s - a.s);
  return strong.slice(0, k).map(x => ({ doc: x.it.doc, name: x.it.name, p: x.it.p, pp: x.it.pp, ch: x.it.ch, quiz: x.it.quiz, i: x.it.i, text: x.it.text, score: x.s, cover: x.cover }));
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
/**
 * Book-mode answer: the sentences across the hits that best match the question, each with
 * where it came from, in a sensible reading order (best passage first, then page order).
 */
export function keyPoints(hits, query, max = 6) {
  const key = new Set(words(query));
  const out = [];
  hits.forEach((x, h) => {
    if (x.quiz || isQuiz(x.text)) return; // never state a quiz option as a fact
    const sents = x.text.replace(/([.!?])\s+(?=[A-Z0-9(])/g, '$1\u0001').split('\u0001').map(t => t.replace(/^Fi\s?gure\s[\d\s.]+\s*/i, '').trim());
    sents.forEach((t, k) => {
      if (t.length < 40 || t.length > 420) return;
      if (/^(A|B|C|D|E)\.\s/.test(t) || /\?\s*$/.test(t)) return; // quiz options and questions
      if ((t.match(/[#(]/g) || []).length > 3 || /\(config[-a-z]*\)#|^\S+#/.test(t)) return; // CLI dumps
      if (/^\d{1,2}\.\s/.test(t)) return; // numbered review answers
      if (/\s!\s/.test(t) || (t.match(/\d+\.\d+\.\d+\.\d+/g) || []).length >= 3 || (t.match(/[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}/g) || []).length >= 2) return; // config / table output
      const ws = words(t);
      const hit = ws.filter(w => key.has(w)).length;
      if (!hit) return;
      out.push({ s: t, h, k, sc: hit / Math.sqrt(ws.length) + (hits.length - h) * 0.05, name: x.name, p: x.p, pp: x.pp, doc: x.doc });
    });
  });
  const seen = new Set();
  const top = out.sort((a, b) => b.sc - a.sc).filter(o => { const k = o.s.slice(0, 60).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, max);
  return top.sort((a, b) => a.h - b.h || a.k - b.k);
}

export const cite = hits => [...new Set(hits.map(x => (typeof x.p === "number" ? `${x.name} p.${x.p}` : `${x.name}: ${x.p}`)))].join(', ');

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

/** The app's own lessons as a searchable "book", so chat works before any PDF is added. */
let lessonIdx = null;
export async function lessonsDoc() {
  const { LESSONS } = await import('./data/lessons.js');
  const { sections } = await import('./cuegen.js');
  let i = 0;
  return { id: 'app-lessons', name: 'CCNA-Q lessons', chunks: LESSONS.flatMap(l => sections(l.body).map(text => ({ i: i++, p: l.title, lesson: l.id, text }))) };
}
/** Library + lessons in one index (rebuilt when the library changes). */
export async function fullIndex() {
  const docs = await listDocs().catch(() => []);
  if (!lessonIdx || lessonIdx.docs !== docs) lessonIdx = { docs, index: makeIndex([...docs, await lessonsDoc()]) };
  return lessonIdx.index;
}
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
  const chunks = chunk(cleanBook(pages));
  if (!chunks.length) throw new Error('No text found. This looks like a scanned PDF (images only); run it through OCR first.');
  const doc = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: file.name.replace(/\.pdf$/i, ''), pages: pages.length, size: file.size, added: Date.now(), chunks };
  await saveDoc(doc);
  return doc;
}
