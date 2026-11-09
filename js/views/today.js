import { h, sheet, closeSheet, toast, todayKey, fmtDate } from '../ui.js';
import { db, update } from '../store.js';
import { EXAM, WEEKS, DOMAINS, weekOf, weekRange, phaseOf, daysUntil, MILESTONES, parseDate } from '../data/plan.js';
import { GLOSSARY } from '../data/glossary.js';
import { LESSONS } from '../data/lessons.js';
import { isDue } from '../srs.js';
import { QTYPES } from '../subnetq.js';
import { LABS } from '../sim/labs.js';
import { getTerm } from '../terms.js';
import { CHAPTERS, BOOK_DEADLINE, readable } from '../data/book.js';
import { bookProgress, chStatus } from './book.js';
import { buildOutbox } from '../sync.js';
import { countUp } from '../motion.js';
import { openReminders } from './reminders.js';

let counted = false; // tick the countdowns up once per app launch

export function render(root) {
  const s = db();
  const now = new Date();
  const wk = weekOf(now);
  const dExam = daysUntil(EXAM.target, now);
  const dCut = daysUntil(EXAM.cutoff, now);
  const dStart = daysUntil(EXAM.start, now);
  const due = Object.entries(s.terms).filter(([id, c]) => isDue(c) && getTerm(id)).length;
  const today = todayKey();
  const daily = s.plan.daily[today] || {};

  // ---------- header + countdown ----------
  root.append(
    h('header.view-head', {}, h('div.grow', {}, h('div.muted.small', {}, now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })), h('h1', {}, 'Hey sin 👋')),
      h('button.icon-btn', { 'aria-label': 'Reminders', title: 'Reminders', onclick: () => openReminders() }, '🔔'),
      h('a.btn.ghost.small', { href: '#/plan' }, '📅 Plan')),
    h('section.countdown', {},
      h('div.cd', {}, h('div.cd-n', {}, Math.max(0, dExam)), h('div.cd-l', {}, 'days to exam', h('br'), h('span.muted', {}, fmtDate(parseDate(EXAM.target))))),
      h('div.cd.warn', {}, h('div.cd-n', {}, Math.max(0, dCut)), h('div.cd-l', {}, 'days left on v1.1', h('br'), h('span.muted', {}, `ends ${fmtDate(parseDate(EXAM.cutoff))}`))),
      h('div.cd', {}, h('div.cd-n', {}, wk === 0 ? '–' : Math.min(wk, 12)), h('div.cd-l', {}, 'plan week', h('br'), h('span.muted', {}, wk === 0 ? `starts in ${dStart}d` : (phaseOf(Math.min(wk, 12))?.name || 'Done'))))),
  );

  // ---------- today's habits ----------
  const subnetToday = s.subnet.history.filter(x => x.day === today);
  const subMin = Math.round(subnetToday.reduce((a, x) => a + Math.min(x.ms, 120000), 0) / 60000);
  const habit = (key, label, auto, sub) => {
    const done = auto ?? !!daily[key];
    return h('label.habit' + (done ? '.done' : ''), {},
      h('input', {
        type: 'checkbox', checked: done, disabled: auto !== undefined && auto,
        onchange: e => update(st => { st.plan.daily[today] = { ...(st.plan.daily[today] || {}), [key]: e.target.checked }; render2(); }),
      }),
      h('span', {}, label, sub ? h('small.muted', {}, ` ${sub}`) : null));
  };
  const streak = habitStreak(s);
  const render2 = () => { root.replaceChildren(); render(root); };
  root.append(h('section.panel', {},
    h('div.panel-head', {}, h('h2', {}, 'Tonight · 7:30 pm'), streak ? h('span.muted.small', {}, `🔥 ${streak}-day streak`) : null),
    habit('anki', 'Anki deck (JITL)', undefined),
    habit('review', 'Review due terms here', due === 0 && Object.keys(s.terms).length > 0 ? true : undefined, due ? `${due} due` : ''),
    habit('subnet', '10 min subnetting', daily.subnet || subMin >= 10 ? true : undefined, `${subMin}/10 min`),
    habit('lab', 'A lab (Packet Tracer or here)', undefined),
    h('div.quick', {},
      due ? h('a.btn.small', { href: '#/review' }, `Review ${due}`) : null,
      h('a.btn.small.ghost', { href: '#/anki' }, 'Anki decks'),
      h('a.btn.small.ghost', { href: '#/subnet' }, 'Subnet drill'),
      continueLink(s))));

  // ---------- book + notebook ----------
  root.append(bookPanel(s));
  root.append(notebookTodo());

  // ---------- this week ----------
  if (wk >= 1 && wk <= 12) {
    const w = WEEKS[wk - 1];
    const [a, b] = weekRange(wk);
    const ph = phaseOf(wk);
    root.append(h('section.panel', {},
      h('div.panel-head', {}, h('h2', {}, `Week ${wk}: ${ph.name}`), h('span.muted.small', {}, `${fmtDate(a)} – ${fmtDate(b)}`)),
      hoursBar(s, wk, ph),
      h('ul.checklist', {}, w.items.map((it, i) => checkItem(`w${wk}-${i}`, it))),
      h('a.link.small', { href: '#/plan' }, 'Full plan ›')));
  } else if (wk === 0) {
    const w = WEEKS[0];
    root.append(h('section.panel', {},
      h('div.panel-head', {}, h('h2', {}, 'Week 1 starts Monday, Nov 9'), h('span.muted.small', {}, 'Get ready')),
      h('ul.checklist', {}, w.items.map((it, i) => checkItem(`w1-${i}`, it)))));
  }

  // ---------- domain progress ----------
  root.append(h('section.panel', {},
    h('div.panel-head', {}, h('h2', {}, 'Progress by exam domain'), h('span.muted.small', {}, 'terms known · lessons')),
    ...DOMAINS.map(d => {
      const terms = GLOSSARY.filter(g => g.domain === d.id);
      const known = terms.filter(g => s.terms[g.id]?.status === 5).length;
      const learning = terms.filter(g => { const st = s.terms[g.id]?.status; return st >= 1 && st <= 4; }).length;
      const ls = LESSONS.filter(l => l.domain === d.id);
      const lDone = ls.filter(l => s.lessons[l.id]?.done).length;
      const pk = Math.round((known / terms.length) * 100);
      const pl = Math.round((learning / terms.length) * 100);
      return h('div.domain', {},
        h('div.domain-top', {}, h('span', {}, d.name), h('span.muted.small', {}, `${d.weight}% · ${known}/${terms.length} · ${lDone}/${ls.length}`)),
        h('div.bar.stacked', {}, h('span.k', { style: { width: `${pk}%` } }), h('span.l', { style: { width: `${pl}%` } })));
    })));

  // ---------- weak topics ----------
  root.append(weakPanel(s, render2));

  // ---------- milestones ----------
  const upcoming = MILESTONES.filter(m => daysUntil(m.date, now) >= 0).slice(0, 3);
  if (upcoming.length) {
    root.append(h('section.panel', {}, h('h2', {}, 'Coming up'),
      h('ul.plain', {}, upcoming.map(m => h('li' + (m.big ? '.big' : ''), {}, h('strong', {}, fmtDate(parseDate(m.date))), ` · ${m.text} `, h('span.muted.small', {}, `(${daysUntil(m.date, now)}d)`))))));
  }

  if (!counted) { counted = true; root.querySelectorAll('.cd-n').forEach(el => countUp(el, el.textContent)); }
}

function notebookTodo() {
  const items = buildOutbox();
  const by = k => items.filter(i => k.includes(i.kind)).length;
  return h('section.panel', {},
    h('div.panel-head', {}, h('h2', {}, '📓 For your notebook'), h('span.muted.small', {}, items.length ? `${items.length} to write` : 'all caught up')),
    items.length ? h('div.nb-chips', {},
      by(['mistake']) ? h('span.pill', {}, `${by(['mistake'])} mistake-log lines`) : null,
      by(['term', 'cue', 'summary']) ? h('span.pill', {}, `${by(['term', 'cue', 'summary'])} for spreads`) : null,
      by(['drill']) ? h('span.pill', {}, `${by(['drill'])} reference updates`) : null,
      by(['weekly']) ? h('span.pill', {}, `${by(['weekly'])} weekly review`) : null) : null,
    items.slice(0, 2).map(i => h('div.nb-pend', {}, h('div.grow', {}, h('div', {}, i.title), h('div.muted.small', {}, `📍 ${i.where}${i.page ? ` · ${i.page}` : ''}`)))),
    h('div.quick', {},
      h('a.btn.small' + (items.length ? '' : '.ghost'), { href: '#/notebook/write' }, items.length ? 'Open the list' : 'Notebook'),
      h('a.btn.small.ghost', { href: '#/notebook/add' }, '+ From my notebook')));
}

function bookPanel(s) {
  const { done, total, reading } = bookProgress();
  const cur = reading[0] || CHAPTERS.find(c => readable(c) && chStatus(c.n) !== 'done');
  const left = daysUntil(BOOK_DEADLINE);
  const q = cur ? s.quiz[cur.n] : null;
  return h('section.panel', {},
    h('div.panel-head', {}, h('h2', {}, '📖 The book'), h('span.muted.small', {}, `${done}/${total} chapters · ${left > 0 ? `${left}d to Dec 4` : 'deadline passed'}`)),
    h('div.bar', {}, h('span', { style: { width: `${(done / total) * 100}%` } })),
    cur ? h('a.ch-row.today-ch', { href: `#/book/${cur.n}` },
      h('span.st-dot.' + chStatus(cur.n), {}, chStatus(cur.n) === 'reading' ? '◐' : ''),
      h('div.ch-main', {}, h('div.ch-title', {}, h('span.ch-num', {}, cur.n), cur.title),
        h('div.ch-meta', {}, h('span.verdict.v-' + cur.verdict.toLowerCase(), {}, cur.verdict), s.book[cur.n]?.page ? h('span.muted.small', {}, `📖 p.${s.book[cur.n].page}`) : null, s.book[cur.n]?.nb ? h('span.muted.small', {}, `📓 p.${s.book[cur.n].nb}`) : null, q ? h('span.muted.small', {}, `quiz ${q.best}%`) : null)),
      h('span.chev', {}, '›')) : h('p', {}, 'Book finished 🎉 Try the ', h('a', { href: '#/quiz/exam' }, 'book exam'), '.'));
}

function continueLink(s) {
  const opened = LESSONS.filter(l => s.lessons[l.id]?.openedAt && !s.lessons[l.id]?.done)
    .sort((a, b) => s.lessons[b.id].openedAt - s.lessons[a.id].openedAt)[0];
  const next = opened || LESSONS.find(l => !s.lessons[l.id]?.done);
  if (!next) return null;
  return h('a.btn.small.ghost', { href: `#/read/${next.id}` }, `${opened ? 'Continue' : 'Read'}: ${next.title}`);
}

export function checkItem(key, text) {
  const done = !!db().plan.checks[key];
  return h('li', {}, h('label.check' + (done ? '.done' : ''), {},
    h('input', { type: 'checkbox', checked: done, onchange: e => { update(s => { s.plan.checks[key] = e.target.checked; }); e.target.parentElement.classList.toggle('done', e.target.checked); } }),
    h('span', {}, text)));
}

export function hoursBar(s, wk, ph) {
  const [a, b] = weekRange(wk);
  const end = new Date(b.getTime() + 86400000);
  const entries = s.plan.hours.filter(e => { const d = parseDate(e.date); return d >= a && d < end; });
  const th = entries.filter(e => e.kind === 'theory').reduce((x, e) => x + e.hours, 0);
  const pr = entries.filter(e => e.kind === 'practice').reduce((x, e) => x + e.hours, 0);
  const tot = th + pr;
  const pt = tot ? Math.round((th / tot) * 100) : 0;
  return h('div.hours', {},
    h('div.hours-top', {}, h('span', {}, `${tot.toFixed(1)} h logged`, h('span.muted', {}, ' / 10–15 h')),
      h('span.muted.small', {}, tot ? `${pt}/${100 - pt} theory/practice · target ${ph.split[0]}/${ph.split[1]}` : `target ${ph.split[0]}/${ph.split[1]} theory/practice`)),
    h('div.bar.split', {}, h('span.th', { style: { width: `${Math.min(100, (th / 15) * 100)}%` } }), h('span.pr', { style: { width: `${Math.min(100, (pr / 15) * 100)}%` } }),
      h('i.target', { style: { left: `${(10 / 15) * 100}%` } })),
    h('button.btn.ghost.small', { onclick: () => logHours(() => { location.hash = location.hash; window.dispatchEvent(new HashChangeEvent('hashchange')); }) }, '+ Log hours'));
}

export function logHours(after) {
  const date = h('input.input', { type: 'date', value: todayKey() });
  const hours = h('input.input', { type: 'number', step: '0.25', min: '0.25', value: '1', inputmode: 'decimal' });
  const note = h('input.input', { placeholder: 'What did you do? (optional)' });
  let kind = 'practice';
  const kinds = ['theory', 'practice'].map(k => h('button.chip-btn' + (k === kind ? '.on' : ''), { onclick: e => { kind = k; kinds.forEach(x => x.classList.remove('on')); e.target.classList.add('on'); } }, k));
  sheet(h('div.form', {},
    h('div.row', {}, date, hours),
    h('div.chips', {}, kinds),
    h('p.hint', {}, 'Theory = videos, reading, notes. Practice = labs, subnetting, practice questions.'),
    note,
    h('button.btn.full', {
      onclick: () => {
        const v = parseFloat(hours.value);
        if (!(v > 0)) return toast('Enter hours');
        update(s => s.plan.hours.push({ date: date.value, hours: v, kind, note: note.value.trim() }));
        closeSheet();
        toast(`Logged ${v} h ${kind}`);
        after?.();
      },
    }, 'Save')), { title: 'Log study time' });
}

function habitStreak(s) {
  let n = 0;
  const d = new Date();
  const done = k => { const x = s.plan.daily[k]; return x && (x.anki || x.subnet || x.lab || x.review); };
  if (!done(todayKey(d))) d.setDate(d.getDate() - 1);
  while (done(todayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function weakPanel(s, rerender) {
  const items = [];
  // subnet types under 70%
  const hist = s.subnet.history.slice(-150);
  const by = {};
  for (const x of hist) { by[x.type] = by[x.type] || [0, 0]; by[x.type][0]++; if (x.ok) by[x.type][1]++; }
  for (const [t, [n, ok]] of Object.entries(by)) if (n >= 4 && ok / n < 0.7) items.push({ topic: `Subnetting: ${QTYPES[t]}`, why: `${Math.round((ok / n) * 100)}% correct`, href: '#/subnet' });
  // leech terms
  for (const [id, c] of Object.entries(s.terms)) if ((c.lapses || 0) >= 3 && getTerm(id)) items.push({ topic: getTerm(id).term, why: `forgotten ${c.lapses}×`, href: '#/review' });
  // logged misses grouped by topic
  const miss = {};
  for (const m of s.missed) { const k = m.topic.trim().toLowerCase(); miss[k] = miss[k] || { topic: m.topic, n: 0, notes: [] }; miss[k].n++; if (m.note) miss[k].notes.push(m.note); }
  for (const m of Object.values(miss).sort((a, b) => b.n - a.n)) items.push({ topic: m.topic, why: `missed ${m.n}×`, notes: m.notes, key: m.topic });
  // unfinished labs
  const labsDone = Object.keys(s.labs.done || {}).length;

  return h('section.panel', {},
    h('div.panel-head', {}, h('h2', {}, 'Weak topics'), h('button.btn.ghost.small', { onclick: () => logMiss(rerender) }, '+ Log a missed question')),
    items.length ? h('ul.weak-list', {}, items.slice(0, 12).map(it => h('li', {},
      it.href ? h('a', { href: it.href }, it.topic) : h('span', {}, it.topic),
      h('span.muted.small', {}, ` · ${it.why}`),
      it.notes?.length ? h('div.muted.small', {}, it.notes.slice(-2).join(' · ')) : null,
      it.key ? h('button.icon-btn.tiny', { 'aria-label': 'Resolve', title: 'Mark resolved', onclick: () => { update(st => { st.missed = st.missed.filter(m => m.topic.trim().toLowerCase() !== it.key.trim().toLowerCase()); }); rerender(); } }, '✓') : null)))
      : h('p.muted.small', {}, 'Nothing flagged yet. Missed Boson or Anki questions, subnet types under 70% and terms you keep forgetting will collect here.'),
    h('p.muted.small', {}, `Labs completed: ${labsDone}/${LABS.length - 1}. Priority if behind: subnetting, OSPF, VLANs/STP, ACLs.`));
}

function logMiss(after) {
  const topic = h('input.input', { placeholder: 'Topic (e.g. "OSPF DR election", "HSRP preempt")', list: 'topic-list' });
  const dl = h('datalist', { id: 'topic-list' }, GLOSSARY.map(g => h('option', { value: g.term })));
  const note = h('textarea.input', { rows: 3, placeholder: 'What tripped you up? (optional)' });
  sheet(h('div.form', {}, topic, dl, note,
    h('button.btn.full', {
      onclick: () => {
        if (!topic.value.trim()) return toast('Add a topic');
        update(s => s.missed.push({ topic: topic.value.trim(), note: note.value.trim(), at: Date.now() }));
        closeSheet();
        after?.();
      },
    }, 'Save')), { title: 'Log a missed question' });
  setTimeout(() => topic.focus(), 50);
}
