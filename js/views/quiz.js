// Chapter quizzes and the mixed "book exam". Tap an answer, see why, move on.

import { h, toast } from '../ui.js';
import { db, update } from '../store.js';
import { CHAPTERS, chapterByN, readable } from '../data/book.js';
import { buzz, swipe } from '../gestures.js';
import { chStatus } from './book.js';
import { hash } from '../sync.js';
import { shake, pop } from '../motion.js';

const shuffle = a => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

function build(qs, ch) {
  return qs.map(([q, a, wrong, why]) => ({ q, a, choices: shuffle([a, ...wrong]), why, ch }));
}

export function render(root, [which]) {
  const exam = which === 'exam';
  const c = exam ? null : chapterByN(which);
  if (!exam && !c) { root.append(h('p', {}, 'Quiz not found. ', h('a', { href: '#/book' }, 'Back'))); return; }

  let pool;
  if (exam) {
    const started = CHAPTERS.filter(x => readable(x) && x.quiz.length && chStatus(x.n) !== 'todo');
    const src = started.length >= 3 ? started : CHAPTERS.filter(x => readable(x) && x.quiz.length);
    pool = shuffle(src.flatMap(x => build(x.quiz, x.n))).slice(0, 30);
  } else pool = shuffle(build(c.quiz, c.n));

  start(root, pool, exam, c);
}

function start(root, pool, exam, c) {
  let i = 0;
  const answers = [];
  const t0 = Date.now();
  let timer = null;
  const back = exam ? '#/book' : `#/book/${c.n}`;
  const title = exam ? 'Book exam' : `Ch ${c.n} quiz`;

  const bar = h('div.bar.qbar', {}, h('span', { style: { width: '0%' } }));
  const counter = h('span.muted.small', {});
  const clock = exam ? h('span.clock', {}, '0:00') : null;
  const box = h('div.quiz', {});
  root.replaceChildren(
    h('header.view-head', {}, h('a.icon-btn', { href: back, 'aria-label': 'Quit' }, '✕'), h('h1.grow', {}, title), clock, counter),
    bar, box);
  if (exam) timer = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if (!document.body.contains(clock)) clearInterval(timer); }, 1000);

  const show = () => {
    if (i >= pool.length) { clearInterval(timer); return finish(); }
    const item = pool[i];
    counter.textContent = `${i + 1}/${pool.length}`;
    bar.firstChild.style.width = `${(i / pool.length) * 100}%`;
    let answered = false;
    const why = h('div.q-why', { hidden: true });
    const nextBtn = h('button.btn.big.full.q-next', { hidden: true, onclick: () => { i++; show(); } }, i + 1 < pool.length ? 'Next ›' : 'See results');
    const btns = item.choices.map(ch => h('button.choice', {
      onclick: e => {
        if (answered) return;
        answered = true;
        const ok = ch === item.a;
        answers.push({ item, pick: ch, ok });
        buzz(ok ? 8 : 30);
        btns.forEach(b => { b.disabled = true; if (b.textContent === item.a) b.classList.add('right'); });
        if (!ok) { e.currentTarget.classList.add('wrong'); shake(e.currentTarget); }
        pop(btns.find(b => b.textContent === item.a));
        why.replaceChildren(h('strong', {}, ok ? '✓ Correct. ' : '✗ Not quite. '), item.why || '');
        why.hidden = false;
        nextBtn.hidden = false;
        if (ok && !exam) setTimeout(() => { if (box.contains(nextBtn) && i < pool.length && answers.length === i + 1) nextBtn.focus({ preventScroll: true }); }, 0);
      },
    }, ch));
    const card = h('div.q-card', {},
      exam ? h('div.muted.small', {}, `Chapter ${item.ch}`) : null,
      h('div.q-text', {}, item.q),
      h('div.choices', {}, btns), why);
    box.replaceChildren(card, nextBtn);
    swipe(card, { follow: false, onLeft: () => { if (answered) { i++; show(); } } });
  };

  const finish = () => {
    const right = answers.filter(a => a.ok).length;
    const pct = Math.round((right / answers.length) * 100);
    const missed = answers.filter(a => !a.ok);
    const key = exam ? 'exam' : c.n;
    update(s => {
      const prev = s.quiz[key] || { best: 0, attempts: 0 };
      s.quiz[key] = { best: Math.max(prev.best, pct), last: pct, attempts: prev.attempts + 1, at: Date.now() };
      for (const m of missed) {
        const ch = chapterByN(m.item.ch);
        s.missed.push({ id: hash(`${Date.now()}|${m.item.q}`), topic: `Ch ${ch.n}: ${ch.title}`, note: m.item.q, pick: m.pick, answer: m.item.a, ch: String(ch.n), at: Date.now(), src: exam ? 'exam' : 'quiz' });
      }
      if (s.missed.length > 400) s.missed = s.missed.slice(-400);
    });
    bar.firstChild.style.width = '100%';
    const byCh = {};
    if (exam) for (const a of answers) { byCh[a.item.ch] = byCh[a.item.ch] || [0, 0]; byCh[a.item.ch][1]++; if (a.ok) byCh[a.item.ch][0]++; }
    box.replaceChildren(
      h('div.q-result', {},
        h('div.q-score' + (pct >= 82 ? '.pass' : ''), {}, `${pct}%`),
        h('p', {}, `${right} of ${answers.length} correct${exam ? ` in ${Math.round((Date.now() - t0) / 60000)} min` : ''}.`),
        h('p.muted.small', {}, pct >= 82 ? 'Solid. Mark the chapter done if you haven\'t.' : 'Missed questions were added to Weak topics on Today.'),
        missed.length ? h('a.btn.ghost.small', { href: '#/notebook/write' }, `📓 ${missed.length} added to your mistake-log list`) : null),
      exam ? h('section.panel', {}, h('h2', {}, 'By chapter'), h('table.mini', {}, h('tbody', {},
        Object.entries(byCh).sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1]).map(([n, [r, t]]) => h('tr' + (r / t < 0.7 ? '.weak' : ''), {},
          h('td', {}, h('a', { href: `#/book/${n}` }, `Ch ${n} ${chapterByN(n).title}`)), h('td', {}, `${r}/${t}`)))))) : null,
      missed.length ? h('section.panel', {}, h('h2', {}, 'Review your misses'),
        h('ol.missed', {}, missed.map(m => h('li', {}, h('div', {}, m.item.q), h('div.muted.small', {}, `You: ${m.pick}`), h('div.ok-text.small', {}, `Answer: ${m.item.a}`), m.item.why ? h('div.muted.small', {}, m.item.why) : null)))) : null,
      h('div.stack', {},
        missed.length ? h('button.btn.full', { onclick: () => start(root, shuffle(missed.map(m => ({ ...m.item, choices: shuffle(m.item.choices) }))), exam, c) }, `Retry ${missed.length} missed`) : null,
        h('button.btn.ghost.full', { onclick: () => { root.replaceChildren(); render(root, [exam ? 'exam' : String(c.n)]); } }, 'Start over'),
        h('a.btn.ghost.full', { href: back }, exam ? 'Back to book' : `Back to chapter ${c.n}`)));
    if (pct === 100) toast('💯 Perfect');
  };

  show();
}
