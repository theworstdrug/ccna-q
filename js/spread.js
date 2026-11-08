// Chapter spread previews: the chapter's notebook pages drawn like the notebook guide
// (ruled lines, cue column, summary box, corner page numbers), filled with live app data.
// Rendered to SVG for the in-app preview and to PDF for saving/printing.

import { db } from './store.js';
import { chapterByN } from './data/book.js';
import { lessonById } from './data/lessons.js';
import { getTerm, termsIn } from './terms.js';
import { labById } from './sim/labs.js';
import { DRILLS } from './drills.js';
import { topicPages, NB_PAGES } from './sync.js';
import { SvgDoc, PdfDoc, wrap } from './pdf.js';

export const W = 792;
export const H = 612; // US Letter, landscape
const PW = 356;
const PH = 520;
const X0 = 34;
const Y0 = 62;
const GAP = 12;
const LINES = 28;
const TOP = PH * 0.075;
const SP = (PH - TOP - PH * 0.03) / LINES;
const CUE = PW * 0.30;
const MARG = PW * 0.11;
const SUM_LINES = 6;

const C = { pen: '#1d3f8f', cue: '#6b3fa0', red: '#c0392b', rule: '#a9c6e8', margin: '#e7a3a3', muted: '#5f6b7a', ink: '#14171c', edge: '#9aa5b1', hole: '#e9edf2' };
const CUE_SIZE = 7;
const NOTE_SIZE = 8;

const geom = side => {
  const x = side === 'L' ? X0 : X0 + PW + GAP;
  const ys = Array.from({ length: LINES }, (_, i) => Y0 + TOP + i * SP);
  const cueX = x + MARG + 4;
  const noteX = x + CUE + 6;
  const right = x + PW - (side === 'L' ? PW * 0.09 : 8);
  return { x, ys, cueX, cueW: x + CUE - 4 - cueX, noteX, noteW: right - noteX, fullW: right - cueX };
};

// ---------------------------------------------------------------- content

/** Everything the app knows about a chapter, shaped for its notebook spread. */
export function spreadContent(key) {
  const c = chapterByN(key);
  const s = db();
  const n = c.n;
  const notes = s.notes[n] || { cues: [], notes: '', summary: '' };
  const left = [];
  const right = [];

  let cues = (notes.cues || []).filter(q => q.q?.trim()).map(q => ({ q: q.q, a: q.a }));
  const cueSource = cues.length ? 'yours' : 'lesson';
  if (!cues.length) cues = c.lessons.flatMap(id => lessonById(id)?.cues || []).map(([q, a]) => ({ q, a }));
  for (const q of cues) left.push({ cue: q.q, note: q.a || '' });

  // terms: forgotten ones first, then the ones still being learned
  const ids = [...new Set(c.lessons.flatMap(id => termsIn(lessonById(id)?.body || '')))];
  const termCards = ids.map(id => [id, s.terms[id]]).filter(([, cd]) => cd && ((cd.lapses || 0) >= 2 || (cd.status >= 1 && cd.status <= 2)));
  termCards.sort((a, b) => (b[1].lapses || 0) - (a[1].lapses || 0));
  for (const [id, cd] of termCards.slice(0, 8)) {
    const t = getTerm(id);
    left.push({ cue: `What is ${t.term}?`, note: `${t.def.split('. ')[0].replace(/\.$/, '')}.${(cd.lapses || 0) >= 2 ? `  (forgot ${cd.lapses}×)` : ''}` });
  }
  for (const cd of Object.values(s.terms)) if (cd.custom && cd.lesson && c.lessons.includes(cd.lesson)) left.push({ cue: `What is ${cd.term}?`, note: cd.def || '' });
  if (notes.notes?.trim()) left.push({ cue: 'My notes', note: notes.notes.trim() });

  // right page: labs, drills, quiz, misses
  for (const id of c.labs || []) {
    const lab = labById(id);
    if (!lab) continue;
    right.push({ cue: 'Lab', note: `${lab.title}${s.labs.done?.[id] ? '  ✓ done' : ''}`, bold: true });
    for (const [t] of lab.checks.slice(0, 5)) right.push({ cue: '', note: `☐ ${t}`, tight: true });
  }
  if (!(c.labs || []).length && c.read.length) right.push({ cue: 'Lab idea', note: `Packet Tracer: try ${c.read[0].toLowerCase()}. Draw the topology here first.` });
  for (const d of c.drills || []) if (DRILLS[d]) right.push({ cue: 'Drill', note: `${DRILLS[d].title}: ${DRILLS[d].desc}`, tight: true });
  const q = s.quiz[n];
  right.push({ cue: 'Quiz', note: q ? `best ${q.best}%, last ${q.last}% (${q.attempts} attempt${q.attempts > 1 ? 's' : ''})` : 'not taken yet' });
  const misses = s.missed.filter(m => String(m.ch) === String(n) || m.topic?.startsWith(`Ch ${n}:`));
  for (const m of misses.slice(-8)) right.push({ cue: 'Missed', note: `${m.note}${m.answer ? ` → ${m.answer}` : ''}${m.pick ? `  (I said ${m.pick})` : ''}` });

  const pages = topicPages(String(n));
  const start = parseInt(String(pages.pages || '').match(/\d+/)?.[0] || '10', 10);
  return {
    n, title: c.title, week: lessonById(c.lessons[0])?.week, bookPage: s.book[n]?.page || '',
    left, right, summary: notes.summary?.trim() || '', misses, cueSource,
    start: start % 2 ? start - 1 : start, planned: pages.planned, pagesLabel: pages.pages,
  };
}

/** Blocks → ruled rows (cue column + note column), with a blank line between blocks. */
function rows(blocks, g) {
  const out = [];
  for (const b of blocks) {
    const cl = b.cue ? wrap(b.cue, g.cueW, CUE_SIZE, 'hand') : [];
    const nl = wrap(b.note, g.noteW, NOTE_SIZE, 'hand');
    const k = Math.max(cl.length, nl.length, 1);
    for (let i = 0; i < k; i++) out.push({ cue: cl[i] || '', note: nl[i] || '', bold: b.bold && i === 0 });
    if (!b.tight) out.push({ cue: '', note: '' });
  }
  while (out.length && !out[out.length - 1].cue && !out[out.length - 1].note) out.pop();
  return out;
}

/** Split content over as many spreads as it needs. */
export function layout(content) {
  const lrows = rows(content.left, geom('L'));
  const rrows = rows(content.right, geom('R'));
  const cap = LINES - 1;
  const lastRightCap = LINES - 1 - SUM_LINES - 1;
  let count = Math.max(1, Math.ceil(lrows.length / cap));
  while ((count - 1) * cap + lastRightCap < rrows.length) count++;
  const spreads = [];
  for (let i = 0; i < count; i++) {
    const rcap = i === count - 1 ? lastRightCap : cap;
    const rStart = i * cap;
    spreads.push({ left: lrows.slice(i * cap, (i + 1) * cap), right: rrows.slice(rStart, rStart + rcap), last: i === count - 1 });
  }
  return spreads;
}

// ---------------------------------------------------------------- drawing

function page(doc, side, num) {
  const { x, ys } = geom(side);
  doc.rect(x, Y0, PW, PH, { stroke: C.edge, fill: '#ffffff', width: 0.8 });
  for (const y of ys) doc.line(x + 2, y, x + PW - 2, y, C.rule, 0.45);
  doc.line(x + MARG, Y0 + 2, x + MARG, Y0 + PH - 2, C.margin, 0.6);
  const hx = side === 'R' ? x + PW * 0.045 : x + PW * 0.955;
  for (const fr of [0.15, 0.5, 0.85]) doc.circle(hx, Y0 + PH * fr, PW * 0.018, { stroke: '#b8c1cc', fill: C.hole, width: 0.8 });
  const bw = PW * 0.13;
  const bh = TOP * 0.62;
  const bx = side === 'R' ? x + PW - bw - 5 : x + 5;
  const by = Y0 + (TOP - bh) / 2;
  doc.rect(bx, by, bw, bh, { stroke: '#7d8896', fill: '#ffffff', width: 0.8 });
  doc.text(bx + bw / 2, by + bh / 2 + 3.5, String(num), { font: 'hand', size: 10, color: C.pen, anchor: 'middle' });
  doc.line(x + 2, ys[0], x + PW - 2, ys[0], C.red, 1.1);
  return { bx, bw };
}

function drawRows(doc, g, list, from = 1) {
  list.forEach((r, i) => {
    const y = g.ys[from + i] - 2.2;
    if (!y) return;
    if (r.cue) doc.text(g.cueX, y, r.cue, { font: 'hand', size: CUE_SIZE, color: C.cue });
    if (r.note) doc.text(g.noteX, y, r.note, { font: r.bold ? 'bold' : 'hand', size: NOTE_SIZE, color: C.pen });
  });
}

/** Draw spread i of a chapter. */
export function drawSpread(doc, content, spreads, i) {
  const sp = spreads[i];
  const lnum = content.start + i * 2;
  doc.text(X0, 30, `Ch ${content.n} · ${content.title}`, { font: 'bold', size: 14, color: C.ink });
  doc.text(X0, 46, `Spread ${i + 1} of ${spreads.length} · notebook pp.${lnum}–${lnum + 1}${content.planned ? ' (planned)' : ''} · purple = cues (write last), blue = notes, red = lines you draw`, { font: 'sans', size: 8, color: C.muted });

  // left page
  const L = geom('L');
  const lb = page(doc, 'L', lnum);
  doc.text(lb.bx + lb.bw + 8, Y0 + TOP - 9, `Ch ${content.n} · ${content.title}${content.week ? ` · wk ${content.week}` : ''}`.slice(0, 60), { font: 'bold', size: 8.5, color: C.pen });
  doc.text(L.x + PW - PW * 0.09, Y0 + TOP - 9, content.bookPage ? `book p.${content.bookPage}` : 'book p.__', { font: 'hand', size: 7.5, color: C.pen, anchor: 'end' });
  doc.line(L.x + CUE, L.ys[0], L.x + CUE, Y0 + PH - 2, C.red, 1.4);
  drawRows(doc, L, sp.left);
  if (i === 0 && content.cueSource === 'lesson' && sp.left.length) doc.text(L.cueX, Y0 + PH - 6, "cues from the app lesson. Rewrite them in your own words", { font: 'sans', size: 6, color: C.muted });

  // right page
  const R = geom('R');
  page(doc, 'R', lnum + 1);
  doc.text(R.cueX, Y0 + TOP - 9, `Lab · quiz · misses${i ? ' (cont.)' : ''}`, { font: 'bold', size: 8.5, color: C.pen });
  const sumTop = R.ys[LINES - SUM_LINES - 1];
  doc.line(R.x + CUE, R.ys[0], R.x + CUE, sp.last ? sumTop : Y0 + PH - 2, C.red, 1.4);
  drawRows(doc, R, sp.right);
  if (sp.last) {
    doc.line(R.x + 2, sumTop, R.x + PW - 2, sumTop, C.red, 1.4);
    doc.text(R.x + PW - 10, sumTop + 9, 'SUMMARY', { font: 'bold', size: 6.5, color: C.red, anchor: 'end' });
    const lines = content.summary ? wrap(content.summary, R.fullW, NOTE_SIZE, 'hand') : [];
    lines.slice(0, SUM_LINES - 1).forEach((l, k) => doc.text(R.cueX, R.ys[LINES - SUM_LINES + k] - 2.2, l, { font: 'hand', size: NOTE_SIZE, color: C.pen }));
    if (!lines.length) doc.text(R.cueX, R.ys[LINES - SUM_LINES] - 2.2, '(write after the lab: 2–4 sentences, your own words)', { font: 'hand', size: 7.5, color: C.muted });
  }
}

/** Mistake-log page for this chapter's misses (back of the notebook). */
export function drawMistakes(doc, content) {
  doc.text(X0, 30, `Ch ${content.n} · mistake-log lines`, { font: 'bold', size: 14, color: C.ink });
  doc.text(X0, 46, `Copy onto the mistake log (p.${NB_PAGES}, working backwards). One line each: date · source · what I said → the right idea.`, { font: 'sans', size: 8, color: C.muted });
  const L = geom('L');
  page(doc, 'L', NB_PAGES);
  doc.text(L.x + PW * 0.18, Y0 + TOP - 9, 'MISTAKE LOG', { font: 'bold', size: 9, color: C.pen });
  let row = 1;
  for (const m of content.misses) {
    const d = new Date(m.at || Date.now());
    const head = `${d.getMonth() + 1}/${d.getDate()} · ${m.src === 'quiz' ? 'App quiz' : m.src === 'exam' ? 'Book exam' : m.src || 'App'} · ${m.note}`;
    const tail = `${m.pick ? `said ${m.pick} → ` : '→ '}${m.answer || '?'}`;
    for (const l of [...wrap(head, L.fullW, NOTE_SIZE), `     ${tail}`]) {
      if (row >= LINES) return;
      doc.text(L.cueX, L.ys[row] - 2.2, l, { font: 'hand', size: NOTE_SIZE, color: C.pen });
      row++;
    }
  }
}

// ---------------------------------------------------------------- outputs

export function spreadSvg(key, i = 0) {
  const content = spreadContent(key);
  const spreads = layout(content);
  const doc = new SvgDoc(W, H);
  drawSpread(doc, content, spreads, Math.min(i, spreads.length - 1));
  return { svg: doc.svg(), count: spreads.length, content };
}

export function mistakesSvg(key) {
  const doc = new SvgDoc(W, H);
  drawMistakes(doc, spreadContent(key));
  return doc.svg();
}

/** All spreads (plus mistake-log lines if any) as a PDF. */
export function chapterPdf(key) {
  const content = spreadContent(key);
  const spreads = layout(content);
  const doc = new PdfDoc(W, H);
  spreads.forEach((_, i) => { if (i) doc.page(); drawSpread(doc, content, spreads, i); });
  if (content.misses.length) { doc.page(); drawMistakes(doc, content); }
  return doc.bytes(`Ch ${content.n} ${content.title} · notebook spread`);
}
