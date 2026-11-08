// The Companion Guide, chapter by chapter: what to read/skim/skip, what's outdated,
// lessons, quiz, drills, labs, Cornell notes and key terms.

import { h, toast, fmtDate } from '../ui.js';
import { db, update } from '../store.js';
import { CHAPTERS, chapterByN, readable, BOOK_TITLE, BOOK_DEADLINE, NB_PLAN } from '../data/book.js';
import { LESSONS, lessonById } from '../data/lessons.js';
import { DOMAIN_NAMES } from '../data/glossary.js';
import { termsIn, statusOf, getTerm } from '../terms.js';
import { daysUntil, parseDate } from '../data/plan.js';
import { DRILLS } from '../drills.js';
import { labById } from '../sim/labs.js';
import { swipe, buzz } from '../gestures.js';
import { termSheet, importSheet } from './read.js';

const STATUS = ['todo', 'reading', 'done'];
const STATUS_LABEL = { todo: 'Not started', reading: 'Reading', done: 'Done' };

export const chState = n => db().book[n] || {};
export const chStatus = n => chState(n).status || (db().plan.chapters?.[n] ? 'done' : 'todo');

const inBook = new Set(CHAPTERS.flatMap(c => c.lessons));

function lessonCounts(id) {
  const l = lessonById(id);
  const ids = termsIn(l?.body || '');
  let nw = 0; let known = 0;
  for (const t of ids) { const s = statusOf(t); if (s === 0) nw++; else if (s === 5 || s === -1) known++; }
  return { total: ids.length, nw, known };
}

export function bookProgress() {
  const list = CHAPTERS.filter(readable);
  const done = list.filter(c => chStatus(c.n) === 'done').length;
  return { done, total: list.length, reading: list.filter(c => chStatus(c.n) === 'reading') };
}

export function render(root, [n]) {
  if (n === '_notebook') return renderNotebook(root);
  if (n !== undefined && chapterByN(n)) return renderChapter(root, chapterByN(n));
  return renderList(root);
}

// ---------- chapter list ----------

function renderList(root) {
  const { done, total, reading } = bookProgress();
  const left = daysUntil(BOOK_DEADLINE);
  const weeks = Math.max(1, left / 7);
  const pace = left > 0 ? ((total - done) / weeks).toFixed(1) : null;
  const next = reading[0] || CHAPTERS.find(c => readable(c) && chStatus(c.n) !== 'done');

  root.append(
    h('header.view-head', {}, h('h1', {}, 'Book'),
      h('div.head-actions', {},
        h('a.btn.ghost.small', { href: '#/book/_notebook' }, '📓 Notebook'),
        h('a.btn.ghost.small', { href: '#/read/_glossary' }, 'Glossary'))),
    h('section.panel.book-hero', {},
      h('div.muted.small', {}, BOOK_TITLE),
      h('div.hero-row', {},
        h('div', {}, h('div.hero-n', {}, `${done}/${total}`), h('div.muted.small', {}, 'chapters done')),
        h('div', {}, h('div.hero-n', {}, left > 0 ? left : '✓'), h('div.muted.small', {}, left > 0 ? `days to ${fmtDate(parseDate(BOOK_DEADLINE))}` : 'deadline passed')),
        pace ? h('div', {}, h('div.hero-n', {}, pace), h('div.muted.small', {}, 'chapters / week')) : null),
      h('div.bar', {}, h('span', { style: { width: `${(done / total) * 100}%` } })),
      h('div.quick', {},
        next ? h('a.btn.small', { href: `#/book/${next.n}` }, `${chStatus(next.n) === 'reading' ? 'Continue' : 'Start'} ch ${next.n}`) : null,
        h('a.btn.small.ghost', { href: '#/quiz/exam' }, 'Book exam (30 Q)'))),
  );

  const list = h('div.ch-list', {});
  for (const c of CHAPTERS) {
    const st = chStatus(c.n);
    const q = db().quiz[c.n];
    const notes = db().notes[c.n];
    const dot = h('button.st-dot.' + st, {
      'aria-label': `Status: ${STATUS_LABEL[st]}. Tap to change.`,
      disabled: !readable(c) || null,
      onclick: e => {
        e.preventDefault(); e.stopPropagation();
        const nx = STATUS[(STATUS.indexOf(chStatus(c.n)) + 1) % 3];
        update(s => { s.book[c.n] = { ...(s.book[c.n] || {}), status: nx }; });
        buzz();
        dot.className = `st-dot ${nx}`;
        row.classList.toggle('done', nx === 'done');
      },
    }, st === 'done' ? '✓' : st === 'reading' ? '◐' : '');
    const row = h('a.ch-row' + (st === 'done' ? '.done' : '') + (!readable(c) ? '.skip' : ''), { href: `#/book/${c.n}` },
      dot,
      h('div.ch-main', {},
        h('div.ch-title', {}, h('span.ch-num', {}, c.n), c.title),
        h('div.ch-meta', {},
          h('span.verdict.v-' + c.verdict.toLowerCase(), {}, c.verdict),
          q ? h('span.muted.small', {}, `quiz ${q.best}%`) : null,
          chState(c.n).nb ? h('span.muted.small', {}, `📓 ${chState(c.n).nb}`) : null,
          notes && (notes.cues?.length || notes.notes) ? h('span.muted.small', {}, '📝') : null,
          c.outdated.length ? h('span.muted.small', { title: 'Has outdated content' }, '⚠') : null)),
      h('span.chev', {}, '›'));
    list.append(row);
  }
  root.append(h('h2.section-title', {}, 'Chapters'), h('p.hint', {}, 'Tap the circle to cycle Not started → Reading → Done.'), list);

  // beyond the book
  const extra = LESSONS.filter(l => !inBook.has(l.id) && !l.chapter);
  const byDom = {};
  for (const l of extra) (byDom[l.domain] = byDom[l.domain] || []).push(l);
  root.append(h('h2.section-title', {}, 'Beyond the book'),
    h('p.hint', {}, 'v1.1 topics the 2003 book doesn\'t cover. Pair them with Jeremy\'s IT Lab and Packet Tracer on the PC.'),
    h('div.beyond', {}, Object.entries(byDom).map(([d, ls]) => h('div.beyond-group', {},
      h('div.muted.small.beyond-dom', {}, DOMAIN_NAMES[d]),
      ls.map(l => lessonRow(l))))));

  // imports
  const imps = db().imports;
  root.append(h('div.panel-head.section-title', {}, h('h2', {}, 'Your imports'), h('button.btn.small.ghost', { onclick: importSheet }, '+ Import text')),
    imps.length ? h('div.beyond', {}, imps.map(l => lessonRow({ ...l, imported: true }))) : h('p.hint', {}, 'Paste notes or a video transcript and read it with terms highlighted.'));
}

function lessonRow(l) {
  const c = lessonCounts(l.id);
  const done = db().lessons[l.id]?.done;
  return h('a.lesson-row' + (done ? '.done' : ''), { href: `#/read/${encodeURIComponent(l.id)}` },
    h('span.lr-title', {}, l.title),
    h('span.lr-meta', {},
      db().nb?.[l.id] ? h('span.muted.small', {}, `📓 ${db().nb[l.id]}`) : null,
      c.nw ? h('span.pill.s0', {}, c.nw) : null,
      done ? h('span.done-tick', {}, '✓') : h('span.chev', {}, '›')));
}

// ---------- notebook index (mirrors pages 1–2 of the paper notebook) ----------

const NB_PAGES = 154; // sin's notebook: 77 sheets
// "12" means a two-page spread (12–13); "83-88" means through 88.
const lastPage = v => {
  const nums = (String(v || '').match(/\d+/g) || []).map(Number);
  if (!nums.length) return 0;
  return nums.length === 1 ? nums[0] + 1 : Math.max(...nums);
};

function allNbEntries() {
  const out = [];
  for (const c of CHAPTERS) if (chState(c.n).nb) out.push(chState(c.n).nb);
  for (const v of Object.values(db().nb || {})) if (v) out.push(v);
  return out;
}

/** Next free spread: after the front section (index + reference = pages 1–9),
 *  always an even page, because odd pages are right-hand pages and spreads start on the left. */
export function nextFreePage() {
  const used = allNbEntries().map(lastPage).filter(Number.isFinite);
  const n = Math.max(9, ...used) + 1;
  return n % 2 ? n + 1 : n;
}

function renderNotebook(root) {
  const nbInput = (value, onSave, label, plan) => h('input.input.page-in.nb-in', {
    inputmode: 'numeric', placeholder: plan || '—', value: value || '', 'aria-label': `Notebook page for ${label}`,
    onchange: e => { onSave(e.target.value.trim()); drawSummary(); },
  });
  const summary = h('div', {});
  const drawSummary = () => {
    const used = Math.max(9, ...allNbEntries().map(lastPage).filter(Number.isFinite));
    summary.replaceChildren(
      h('div.panel-head', {}, h('h2', {}, `Filled up to p.${used} of ${NB_PAGES}`), h('span.muted.small', {}, `next spread: p.${nextFreePage()}`)),
      h('div.bar', {}, h('span', { style: { width: `${Math.min(100, (used / NB_PAGES) * 100)}%` } })),
      h('p.muted.small', {}, 'Pages 1–9 hold the index, reference pages and tab key. Spreads start on even (left-hand) pages. The back pages (154 down to 136) hold the mistake log and weekly reviews.'));
  };
  drawSummary();

  const row = (num, title, value, onSave, href, plan) => h('div.nb-row', {},
    h('a.nb-title', { href }, num != null ? h('span.ch-num', {}, num) : null, title),
    nbInput(value, onSave, title, plan));

  const extra = LESSONS.filter(l => !inBook.has(l.id) && !l.chapter);
  root.append(
    h('header.view-head.reader-head', {},
      h('a.icon-btn', { href: '#/book', 'aria-label': 'Back to book' }, '‹'),
      h('div.grow', {}, h('div.muted.small', {}, 'Paper notebook'), h('h1.reader-title', {}, 'Notebook index'))),
    h('section.panel', {}, summary,
      h('a.btn.ghost.small', { href: 'docs/notebook-guide.pdf', target: '_blank', rel: 'noopener' }, '📄 Notebook formatting guide (PDF)')),
    h('p.hint', {}, 'Grey numbers are the planned budget from the notebook guide. Type the pages you actually used (e.g. 12 or 12–15); the same numbers go on paper pages 1–2.'),
    h('h2.section-title', {}, 'Book chapters'),
    h('div.nb-list', {}, CHAPTERS.filter(readable).map(c => row(c.n, c.title, chState(c.n).nb,
      v => update(x => { x.book[c.n] = { ...(x.book[c.n] || {}), nb: v }; }), `#/book/${c.n}`, NB_PLAN[c.n]))),
    h('h2.section-title', {}, 'Beyond the book'),
    h('div.nb-list', {}, extra.map(l => row(null, l.title, db().nb?.[l.id],
      v => update(x => { x.nb = { ...(x.nb || {}), [l.id]: v }; if (!v) delete x.nb[l.id]; }), `#/read/${encodeURIComponent(l.id)}`, NB_PLAN[l.id]))));
}

// ---------- chapter page ----------

function renderChapter(root, c) {
  const n = c.n;
  const st = () => chState(n);
  const idx = CHAPTERS.indexOf(c);
  const prev = CHAPTERS[idx - 1];
  const next = CHAPTERS[idx + 1];

  const seg = h('div.seg.status-seg', {});
  const drawSeg = () => seg.replaceChildren(...STATUS.map(s => h('button' + (chStatus(n) === s ? '.on' : ''), {
    disabled: !readable(c) || null,
    onclick: () => { update(x => { x.book[n] = { ...(x.book[n] || {}), status: s, ...(s === 'done' ? { doneAt: Date.now() } : {}) }; }); buzz(); drawSeg(); if (s === 'done') toast(`Chapter ${n} done 🎉`); },
  }, STATUS_LABEL[s])));
  drawSeg();

  const page = h('input.input.page-in', {
    inputmode: 'numeric', placeholder: 'e.g. 214', value: st().page || '', 'aria-label': 'Book page',
    onchange: e => update(x => { x.book[n] = { ...(x.book[n] || {}), page: e.target.value.trim() }; }),
  });
  const nbPage = h('input.input.page-in', {
    inputmode: 'numeric', placeholder: NB_PLAN[n] ? `plan: ${NB_PLAN[n]}` : `next: ${nextFreePage()}`, value: st().nb || '', 'aria-label': 'Notebook page',
    onchange: e => update(x => { x.book[n] = { ...(x.book[n] || {}), nb: e.target.value.trim() }; }),
  });

  const itemList = (items, kind) => h('ul.guide.' + kind, {}, items.map((it, i) => {
    if (kind !== 'read') return h('li', {}, it);
    const key = `i${i}`;
    const on = !!st().items?.[key];
    return h('li', {}, h('label.check' + (on ? '.done' : ''), {},
      h('input', {
        type: 'checkbox', checked: on,
        onchange: e => { update(x => { const b = x.book[n] = { ...(x.book[n] || {}) }; b.items = { ...(b.items || {}), [key]: e.target.checked }; if (!b.status || b.status === 'todo') b.status = 'reading'; }); e.target.parentElement.classList.toggle('done', e.target.checked); drawSeg(); },
      }), h('span', {}, it)));
  }));

  // key terms across the chapter's lessons
  const termIds = [...new Set(c.lessons.flatMap(id => termsIn(lessonById(id)?.body || '')))];
  const termChips = h('div.key-terms', {});
  const drawTerms = () => termChips.replaceChildren(...termIds.map(id => {
    const s = statusOf(id);
    return h('button', { class: `tchip t ${s === -1 ? 'ign' : `s${s}`}`, onclick: () => termSheet(id, '', drawTerms) }, getTerm(id)?.term || id);
  }));
  drawTerms();

  const q = db().quiz[n];
  const notes = db().notes[n];
  const nCues = notes?.cues?.length || 0;

  const body = h('div.chapter', {},
    h('header.view-head.reader-head', {},
      h('a.icon-btn', { href: '#/book', 'aria-label': 'Back to book' }, '‹'),
      h('div.grow', {}, h('div.muted.small', {}, `Chapter ${n} · `, h('span.verdict.v-' + c.verdict.toLowerCase(), {}, c.verdict)), h('h1.reader-title', {}, c.title))),
    seg,
    readable(c) ? h('div.page-row', {},
      h('label.page-field', {}, h('span.muted.small', {}, '📖 Book page'), page),
      h('label.page-field', {}, h('span.muted.small', {}, '📓 Notebook page'), nbPage)) : null,

    c.outdated.length ? h('section.panel.outdated', {}, h('h2', {}, '⚠ Out of date in the book'), h('ul', {}, c.outdated.map(o => h('li', {}, o)))) : null,

    h('section.panel', {},
      h('h2', {}, 'Reading guide'),
      c.read.length ? [h('div.guide-label.read', {}, 'Read'), itemList(c.read, 'read')] : null,
      c.skim?.length ? [h('div.guide-label.skim', {}, 'Skim'), itemList(c.skim, 'skim')] : null,
      c.skip.length ? [h('div.guide-label.skip', {}, 'Skip'), itemList(c.skip, 'skip')] : null),

    c.lessons.length ? h('section.panel', {},
      h('h2', {}, 'Study in the app'),
      h('p.hint', {}, 'Read alongside the chapter. Tap terms to rate them; learning terms go to Review.'),
      h('div.beyond', {}, c.lessons.map(id => lessonById(id) && lessonRow(lessonById(id))))) : null,

    h('section.panel', {},
      h('h2', {}, 'Practice'),
      h('div.practice', {},
        c.quiz.length ? h('a.prac-card', { href: `#/quiz/${n}` }, h('div.prac-ico', {}, '❓'), h('div', {}, h('strong', {}, 'Chapter quiz'), h('div.muted.small', {}, `${c.quiz.length} questions${q ? ` · best ${q.best}%` : ''}`))) : null,
        h('a.prac-card', { href: `#/notes/${n}` }, h('div.prac-ico', {}, '📝'), h('div', {}, h('strong', {}, 'Cornell notes'), h('div.muted.small', {}, nCues ? `${nCues} cue questions` : 'Cues, notes, summary'))),
        ...(c.drills || []).map(d => DRILLS[d] && h('a.prac-card', { href: DRILLS[d].href || `#/drills/${d}` }, h('div.prac-ico', {}, '⚡'), h('div', {}, h('strong', {}, DRILLS[d].title), h('div.muted.small', {}, DRILLS[d].desc)))),
        ...(c.labs || []).map(id => labById(id) && h('a.prac-card', { href: `#/lab/${id}` }, h('div.prac-ico', {}, '🔌'), h('div', {}, h('strong', {}, labById(id).title), h('div.muted.small', {}, db().labs.done?.[id] ? 'Completed ✓' : 'Lab')))))),

    termIds.length ? h('section.panel', {}, h('h2', {}, `Key terms (${termIds.length})`), h('p.hint', {}, 'Tap to see the definition and rate it.'), termChips) : null,

    h('nav.ch-nav', {},
      prev ? h('a.btn.ghost', { href: `#/book/${prev.n}` }, `‹ Ch ${prev.n}`) : h('span'),
      next ? h('a.btn.ghost', { href: `#/book/${next.n}` }, `Ch ${next.n} ›`) : h('span')),
    h('p.hint.center', {}, 'Swipe left/right to change chapter'));

  root.append(body);
  swipe(body, {
    follow: false, threshold: 90,
    onLeft: () => { if (next) location.hash = `#/book/${next.n}`; },
    onRight: () => { if (prev) location.hash = `#/book/${prev.n}`; },
  });
}

