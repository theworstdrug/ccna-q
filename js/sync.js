// Two-way bridge between the app and the paper notebook.
//
//  App → notebook: buildOutbox() turns what you do in the app (quiz misses, terms you keep
//  forgetting, drill misses, finished chapters, finished weeks) into concrete "write this
//  on page X" items. markWritten() ticks one off.
//
//  Notebook → app: addFromPaper() records things you wrote by hand (Boson/Anki mistakes,
//  cue questions, terms, notes) in the right place in the app.

import { db, update } from './store.js';
import { CHAPTERS, chapterByN, NB_PLAN } from './data/book.js';
import { LESSONS, lessonById } from './data/lessons.js';
import { getTerm, card, termsIn } from './terms.js';
import { GLOSSARY } from './data/glossary.js';
import { setStatus } from './srs.js';
import { QTYPES } from './subnetq.js';
import { DRILLS } from './drills.js';
import { weekOf, weekRange, phaseOf } from './data/plan.js';

export const NB_PAGES = 154; // sin's notebook: 77 sheets

// "12" means a two-page spread (12–13); "83-88" means through 88.
export const lastPage = v => {
  const nums = (String(v || '').match(/\d+/g) || []).map(Number);
  if (!nums.length) return 0;
  return nums.length === 1 ? nums[0] + 1 : Math.max(...nums);
};

export function allNbEntries() {
  const out = [];
  for (const c of CHAPTERS) if (db().book[c.n]?.nb) out.push(db().book[c.n].nb);
  for (const v of Object.values(db().nb || {})) if (v) out.push(v);
  return out;
}

export const highestPageUsed = () => Math.max(9, ...allNbEntries().map(lastPage).filter(Number.isFinite));

/** Next free spread after the front section (pp.1–9). Always even: spreads start on the left page. */
export function nextFreePage() {
  const n = highestPageUsed() + 1;
  return n % 2 ? n + 1 : n;
}

// ---------------------------------------------------------------- helpers

export function hash(s) {
  let x = 5381;
  for (const ch of String(s)) x = ((x * 33) ^ ch.charCodeAt(0)) >>> 0;
  return x.toString(36);
}

const sync = () => {
  const s = db();
  s.sync = s.sync || {};
  s.sync.done = s.sync.done || {};
  s.sync.cut = s.sync.cut || {};
  s.sync.log = s.sync.log || [];
  s.sync.inbox = s.sync.inbox || [];
  return s.sync;
};

const fmt = t => new Date(t).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
const inBook = new Set(CHAPTERS.flatMap(c => c.lessons));
export const chapterOfLesson = id => CHAPTERS.find(c => c.lessons.includes(id));

/** A "topic" is a book chapter number (as a string) or a beyond-the-book lesson id. */
export function topicKey(lessonOrChapter) {
  if (lessonOrChapter == null) return null;
  if (chapterByN(lessonOrChapter)) return String(chapterByN(lessonOrChapter).n);
  const ch = chapterOfLesson(lessonOrChapter);
  return ch ? String(ch.n) : String(lessonOrChapter);
}

export function topicTitle(key) {
  const c = chapterByN(key);
  if (c) return `Ch ${c.n} ${c.title}`;
  return lessonById(key)?.title || 'General';
}

/** The notebook pages for a topic: what you entered, else the planned budget. */
export function topicPages(key) {
  const c = chapterByN(key);
  const actual = c ? db().book[c.n]?.nb : db().nb?.[key];
  if (actual) return { pages: actual, planned: false };
  if (NB_PLAN[key]) return { pages: NB_PLAN[key], planned: true };
  return { pages: null, planned: false };
}

export function spreadLabel(key) {
  const { pages, planned } = topicPages(key);
  return pages ? `p.${pages}${planned ? ' (plan)' : ''}` : 'its spread';
}

/** All topics you can file things under: readable chapters, then beyond-the-book lessons. */
export function topicOptions() {
  return [
    ...CHAPTERS.filter(c => c.verdict !== 'Skip').map(c => ({ key: String(c.n), label: `Ch ${c.n} · ${c.title}` })),
    ...LESSONS.filter(l => !inBook.has(l.id) && !l.chapter).map(l => ({ key: l.id, label: l.title })),
  ];
}

/** Topic you're most likely working on: whatever you touched last (quiz, lesson), else the
 *  chapter marked "reading", else the first unfinished one. */
export function currentTopic() {
  const s = db();
  let best = null;
  let t = 0;
  for (const [k, q] of Object.entries(s.quiz)) if (k !== 'exam' && q.at > t) { t = q.at; best = String(k); }
  for (const [id, l] of Object.entries(s.lessons)) if (l.openedAt > t && !id.startsWith('imp-')) { t = l.openedAt; best = topicKey(id); }
  if (best) return best;
  const b = s.book;
  const reading = CHAPTERS.find(c => b[c.n]?.status === 'reading');
  const next = reading || CHAPTERS.find(c => c.verdict !== 'Skip' && b[c.n]?.status !== 'done');
  return next ? String(next.n) : '1';
}

let termHome = null;
/** Where a term "lives": the lesson you rated it in, else the first lesson that uses it. */
export function termTopic(id) {
  const c = db().terms[id];
  if (c?.lesson) return topicKey(c.lesson);
  if (c?.topic) return c.topic;
  if (!termHome) {
    termHome = {};
    for (const l of LESSONS) for (const t of termsIn(l.body)) if (!termHome[t]) termHome[t] = l.id;
  }
  return termHome[id] ? topicKey(termHome[id]) : null;
}

// Which reference page each drill feeds (see the notebook guide).
export const REF_PAGE = {
  subnet: [3, 'Subnetting'], bin: [3, 'Subnetting'], wild: [3, 'Subnetting'], ports: [4, 'Ports'],
  ad: [5, 'AD & route codes'], cli: [6, 'IOS modes'], mem: [6, 'IOS modes'], osi: [8, 'OSI chart'],
};

const firstSentence = s => { const t = (s || '').split(/\.\s/)[0]; return (t.endsWith('.') ? t : `${t}.`).slice(0, 140); };

// ---------------------------------------------------------------- app → notebook

const KIND_ORDER = { weekly: 0, mistake: 1, summary: 2, term: 3, cue: 4, drill: 5 };

/**
 * Everything worth writing on paper that isn't ticked off yet.
 * Item: { id, kind, title, where, page, lines[], key, at }
 */
export function buildOutbox() {
  const s = db();
  const sy = sync();
  const done = sy.done;
  const items = [];

  // 1. Misses from quizzes, self-tests and the exam → mistake log (back of the notebook).
  for (const m of s.missed) {
    const id = `m:${m.id || hash(`${m.topic}|${m.note}|${m.at}`)}`;
    if (m.paper || done[id]) continue;
    const src = { quiz: 'App quiz', exam: 'Book exam', notes: 'Self-test', 'self-test': 'Self-test' }[m.src] || 'App';
    items.push({
      id, kind: 'mistake', key: m.ch ? String(m.ch) : null, at: m.at || 0,
      title: (m.note || m.topic).slice(0, 90), sub: m.topic,
      where: 'Mistake log', page: `p.${NB_PAGES} ← next free line`,
      lines: [`${fmt(m.at || Date.now())} · ${src} · ${m.topic.replace(/^Ch \d+: /, '')}`,
        m.pick ? `✗ I said: ${m.pick}` : `✗ ${m.note}`,
        m.pick ? `Q: ${m.note}` : null,
        m.answer ? `✓ ${m.answer}` : null].filter(Boolean),
    });
  }

  // 2. Finished plan weeks → a weekly-review row.
  const wkNow = weekOf();
  for (let w = 1; w <= Math.min(12, wkNow - 1); w++) {
    const id = `w:${w}`;
    if (done[id]) continue;
    items.push({ id, kind: 'weekly', key: null, at: weekRange(w)[1].getTime(), title: `Week ${w} review`, where: 'Weekly review', page: `p.145 ← row ${w}`, lines: weekSummary(w) });
  }

  // 3. Chapters marked done → write the summary (zone 4).
  for (const c of CHAPTERS) {
    const b = s.book[c.n];
    if (b?.status !== 'done') continue;
    const id = `s:${c.n}`;
    if (done[id]) continue;
    const sum = s.notes[c.n]?.summary?.trim();
    const q = s.quiz[c.n];
    items.push({
      id, kind: 'summary', key: String(c.n), at: b.doneAt || 0,
      title: `Ch ${c.n} summary`, where: `Ch ${c.n} spread · summary box`, page: spreadLabel(String(c.n)),
      lines: [sum ? `Copy your summary: ${sum}` : '2–4 sentences in your own words, after the lab.',
        q ? `Chapter quiz: best ${q.best}%, last ${q.last}%${q.best < 80 ? ' → re-read the weak parts first' : ''}` : 'Tip: take the chapter quiz first and summarise what it exposed.'],
    });
  }

  // 4. Terms you keep forgetting, and your own saved terms → that topic's cue column.
  for (const [tid, c] of Object.entries(s.terms)) {
    if (c.onPaper || c.status === -1) continue;
    const struggling = (c.lapses || 0) >= 2;
    if (!struggling && !c.custom) continue;
    const id = `t:${tid}`;
    if (done[id]) continue;
    const t = getTerm(tid);
    if (!t) continue;
    const key = termTopic(tid);
    items.push({
      id, kind: 'term', key, at: c.due || 0,
      title: t.term, where: key ? `${topicTitle(key)} · cue column` : 'Chapter spread · cue column', page: key ? spreadLabel(key) : '',
      lines: [`Cue: What is ${t.term}?${struggling ? `  (forgotten ${c.lapses}×)` : ''}`, `Note: ${firstSentence(t.def) || '(your definition)'}`, c.note ? `Mnemonic: ${c.note}` : null].filter(Boolean),
      termId: tid,
    });
  }

  // 5. Cue questions you typed in the app → the cue column on paper.
  for (const [key, n] of Object.entries(s.notes)) {
    for (const cue of n.cues || []) {
      if (!cue.q?.trim() || cue.paper) continue;
      const id = `c:${key}:${hash(cue.q)}`;
      if (done[id]) continue;
      items.push({ id, kind: 'cue', key, at: 0, title: cue.q, where: `${topicTitle(key)} · cue column`, page: spreadLabel(key), lines: [`Cue: ${cue.q}`, cue.a ? `Note: ${cue.a}` : null].filter(Boolean) });
    }
  }

  // 6. Drill and subnetting misses since you last copied them → the matching reference page.
  const groups = {};
  const addMiss = (drill, m) => { (groups[drill] = groups[drill] || []).push(m); };
  for (const [d, st] of Object.entries(s.drills)) for (const m of st.misses || []) if (m.at > (sy.cut[d] || 0)) addMiss(d, m);
  for (const h of s.subnet.history) if (!h.ok && h.q && h.at > (sy.cut.subnet || 0)) addMiss('subnet', { q: h.q, a: h.a, at: h.at, type: h.type });
  for (const [d, ms] of Object.entries(groups)) {
    const [pg, name] = REF_PAGE[d] || [3, 'Reference'];
    const latest = Math.max(...ms.map(m => m.at));
    const uniq = [...new Map(ms.map(m => [m.a + '|' + m.q, m])).values()].slice(-6);
    items.push({
      id: `d:${d}:${latest}`, kind: 'drill', key: null, at: latest, drill: d, cutAt: latest,
      title: `${d === 'subnet' ? 'Subnetting' : DRILLS[d]?.title || d}: ${ms.length} miss${ms.length > 1 ? 'es' : ''}`,
      where: `Reference p.${pg} · ${name}`, page: `p.${pg}`,
      lines: [d === 'subnet' ? 'Add a worked example of each under the table:' : 'Star these on the page, or add them if missing:',
        ...uniq.map(m => `${m.q.replace(/\?$/, '')} → ${m.a}`)],
    });
  }

  return items.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.at - a.at);
}

export function weekSummary(w) {
  const s = db();
  const [a, b] = weekRange(w);
  const end = b.getTime() + 86400000;
  const inWk = t => t && t >= a.getTime() && t < end;
  const hrs = s.plan.hours.filter(e => { const t = new Date(`${e.date}T12:00`).getTime(); return inWk(t); });
  const th = hrs.filter(e => e.kind === 'theory').reduce((x, e) => x + e.hours, 0);
  const pr = hrs.filter(e => e.kind === 'practice').reduce((x, e) => x + e.hours, 0);
  const chs = CHAPTERS.filter(c => inWk(s.book[c.n]?.doneAt)).map(c => c.n);
  const labs = Object.entries(s.labs.done || {}).filter(([, t]) => inWk(t)).map(([id]) => id);
  const quizzes = Object.entries(s.quiz).filter(([, q]) => inWk(q.at)).map(([k, q]) => `${k === 'exam' ? 'exam' : `ch ${k}`} ${q.last}%`);
  const miss = {};
  for (const m of s.missed) if (inWk(m.at)) miss[m.topic] = (miss[m.topic] || 0) + 1;
  const sub = {};
  for (const x of s.subnet.history) if (inWk(x.at)) { sub[x.type] = sub[x.type] || [0, 0]; sub[x.type][0]++; if (x.ok) sub[x.type][1]++; }
  const weakSub = Object.entries(sub).filter(([, [n]]) => n >= 4).sort((p, q) => p[1][1] / p[1][0] - q[1][1] / q[1][0])[0];
  const weakMiss = Object.entries(miss).sort((p, q) => q[1] - p[1])[0];
  const weakest = weakMiss ? `${weakMiss[0]} (${weakMiss[1]} misses)` : weakSub ? `subnetting: ${QTYPES[weakSub[0]]}` : '—';
  const ph = phaseOf(w);
  return [
    `Wk ${w} · hours ${th.toFixed(1)} theory / ${pr.toFixed(1)} practice (target ${ph.split[0]}/${ph.split[1]})`,
    `Chapters done: ${chs.length ? chs.join(', ') : '—'}${quizzes.length ? ` · quizzes: ${quizzes.join(', ')}` : ''}`,
    `Labs: ${labs.length ? labs.join(', ') : '— (redo one from memory)'}`,
    `Weakest → next week: ${weakest}`,
  ];
}

export function outboxCount() { return buildOutbox().length; }

/** Tick an item off as written on paper (with side effects so other screens know). */
export function markWritten(item) {
  update(s => {
    const sy = sync();
    sy.done[item.id] = Date.now();
    sy.log.unshift({ id: item.id, title: item.title, where: item.where, kind: item.kind, at: Date.now() });
    sy.log = sy.log.slice(0, 40);
    if (item.kind === 'term' && s.terms[item.termId]) s.terms[item.termId].onPaper = true;
    if (item.kind === 'drill') sy.cut[item.drill] = item.cutAt;
    if (item.kind === 'cue') {
      const [, key] = item.id.split(':');
      const cue = s.notes[key]?.cues?.find(c => `c:${key}:${hash(c.q)}` === item.id);
      if (cue) cue.paper = true;
    }
  });
}

export function undoWritten(id) {
  update(s => {
    const sy = sync();
    delete sy.done[id];
    sy.log = sy.log.filter(l => l.id !== id);
    if (id.startsWith('t:') && s.terms[id.slice(2)]) s.terms[id.slice(2)].onPaper = false;
    if (id.startsWith('d:')) delete sy.cut[id.split(':')[1]];
    if (id.startsWith('c:')) {
      const [, key] = id.split(':');
      const cue = s.notes[key]?.cues?.find(c => `c:${key}:${hash(c.q)}` === id);
      if (cue) cue.paper = false;
    }
  });
}

export function recentlyWritten() { return sync().log; }

// ---------------------------------------------------------------- notebook → app

/**
 * Record something written by hand.
 * type: 'mistake' {source, wrong, right} · 'cue' {q, a} · 'term' {term, def, status} · 'note' {text}
 */
export function addFromPaper(type, key, data) {
  let summary = '';
  update(s => {
    const sy = sync();
    const k = key ? String(key) : null;
    if (type === 'mistake') {
      s.missed.push({ id: hash(`${Date.now()}|${data.wrong}`), topic: data.topic || topicTitle(k), note: data.wrong, answer: data.right || '', src: data.source || 'paper', ch: k, at: Date.now(), paper: true });
      summary = `Mistake → Weak topics (${data.topic || topicTitle(k)})`;
    } else if (type === 'cue') {
      s.notes[k] = s.notes[k] || { cues: [], notes: '', summary: '' };
      s.notes[k].cues.push({ q: data.q, a: data.a || '', paper: true });
      summary = `Cue → ${topicTitle(k)} Cornell notes`;
    } else if (type === 'term') {
      const found = findTerm(data.term);
      let id = found?.id;
      if (!id) {
        id = `u-${data.term.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
        if (!s.terms[id]?.custom) s.terms[id] = { ...card(id), custom: true, term: data.term.trim(), def: data.def || '' };
      }
      const c = card(id);
      if (data.def && c.custom) c.def = data.def;
      setStatus(c, data.status ?? 1);
      c.onPaper = true;
      if (k && !c.lesson) c.topic = k;
      summary = `Term → ${data.status === 5 ? 'Known' : 'Review'} (${found?.term || data.term})`;
    } else if (type === 'note') {
      s.notes[k] = s.notes[k] || { cues: [], notes: '', summary: '' };
      const n = s.notes[k];
      n.notes = `${n.notes ? `${n.notes}\n` : ''}[${fmt(Date.now())}] ${data.text}`;
      summary = `Note → ${topicTitle(k)} notes`;
    }
    sy.inbox.unshift({ type, key: k, text: data.wrong || data.q || data.term || data.text, summary, at: Date.now() });
    sy.inbox = sy.inbox.slice(0, 30);
  });
  return summary;
}

export function recentlyAdded() { return sync().inbox; }

/** Glossary term or one of your own saved terms, matched by name or alias. */
export function findTerm(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;
  const g = GLOSSARY.find(x => x.term.toLowerCase() === t || x.aliases.some(a => a.toLowerCase() === t));
  if (g) return g;
  const own = Object.keys(db().terms).filter(id => db().terms[id].custom).map(getTerm);
  return own.find(x => x?.term.toLowerCase() === t) || null;
}

// ---------------------------------------------------------------- per-topic picture

/** How a topic is going in the app vs what's been captured on paper. */
export function topicStats(key) {
  const s = db();
  const q = s.quiz[key];
  const misses = s.missed.filter(m => String(m.ch) === String(key) || m.topic === topicTitle(key) || m.topic?.startsWith(`Ch ${key}:`));
  const pending = buildOutbox().filter(i => String(i.key) === String(key));
  const terms = Object.entries(s.terms).filter(([id]) => termTopic(id) === String(key));
  const struggling = terms.filter(([, c]) => (c.lapses || 0) >= 2).length;
  const onPaper = terms.filter(([, c]) => c.onPaper).length;
  return { quiz: q, misses: misses.length, missesOnPaper: misses.filter(m => m.paper || s.sync?.done?.[`m:${m.id || hash(`${m.topic}|${m.note}|${m.at}`)}`]).length, pending, struggling, onPaper };
}
