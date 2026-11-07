// Drills hub + generic drill session (multiple choice or on-screen keypad).

import { h } from '../ui.js';
import { db, update } from '../store.js';
import { DRILLS, checkAnswer } from '../drills.js';
import { keypad } from '../keypad.js';
import { buzz, swipe } from '../gestures.js';

export function render(root, [id]) {
  if (id && DRILLS[id] && DRILLS[id].gen) return session(root, id);
  return hub(root);
}

function statFor(id) {
  if (id === 'subnet') {
    const st = db().subnet;
    const hist = st.history.slice(-100);
    const ok = hist.filter(x => x.ok).length;
    return { n: st.history.length, acc: hist.length ? Math.round((ok / hist.length) * 100) : null, best: st.best };
  }
  const d = db().drills[id];
  return d ? { n: d.n, acc: d.n ? Math.round((d.ok / d.n) * 100) : null, best: d.best } : { n: 0, acc: null, best: 0 };
}

function hub(root) {
  root.append(
    h('header.view-head', {}, h('h1', {}, 'Drills')),
    h('p.hint', {}, 'Short, tap-only practice for the facts the book expects you to know cold. Aim for streaks.'),
    h('div.drill-grid', {}, Object.entries(DRILLS).map(([id, d]) => {
      const s = statFor(id);
      return h('a.drill-card', { href: d.href || `#/drills/${id}` },
        h('div.drill-ch', {}, `Ch ${d.ch}`),
        h('div.drill-title', {}, d.title),
        h('div.muted.small', {}, d.desc),
        h('div.drill-stat', {}, s.n ? `${s.acc}% · best 🔥${s.best}` : 'Not tried'));
    })));
}

function session(root, id) {
  const d = DRILLS[id];
  const st = () => db().drills[id] || { n: 0, ok: 0, streak: 0, best: 0 };
  let item = null;
  let answered = false;
  let kp = null;

  const streakEl = h('span.streak', {});
  const qEl = h('div.q-text', {});
  const area = h('div.drill-area', {});
  const fb = h('div.feedback', {});
  const nextBtn = h('button.btn.big.full', { hidden: true, onclick: () => next() }, 'Next ›');
  const card = h('section.drill', {}, qEl, area, fb);

  const paintStreak = () => { const s = st(); streakEl.replaceChildren('🔥 ', h('strong', {}, s.streak), h('span.muted', {}, ` · best ${s.best}`)); };

  const record = ok => {
    update(x => {
      const s = x.drills[id] = { ...st() };
      s.n++; if (ok) s.ok++;
      s.streak = ok ? s.streak + 1 : 0;
      s.best = Math.max(s.best, s.streak);
    });
    paintStreak();
  };

  const answer = val => {
    if (answered) return;
    if (!String(val).trim()) return;
    answered = true;
    const ok = checkAnswer(item, val);
    buzz(ok ? 8 : 30);
    record(ok);
    fb.replaceChildren(
      h('div.verdict' + (ok ? '.ok' : '.bad'), {}, ok ? '✓ Correct' : `✗ Answer: ${item.a}`),
      item.why ? h('ul.why', {}, [].concat(item.why).map(l => h('li', {}, l))) : null);
    if (item.choices) area.querySelectorAll('.choice').forEach(b => { b.disabled = true; if (b.textContent === item.a) b.classList.add('right'); else if (b.textContent === val) b.classList.add('wrong'); });
    if (kp) kp.display.classList.add(ok ? 'ok' : 'bad');
    nextBtn.hidden = false;
    const cur = item;
    if (ok) setTimeout(() => { if (answered && document.body.contains(card) && item === cur) next(); }, 900);
  };

  const next = () => {
    item = d.gen();
    answered = false;
    qEl.textContent = item.q;
    fb.replaceChildren();
    nextBtn.hidden = true;
    kp?.destroy();
    kp = null;
    if (item.choices) {
      area.replaceChildren(h('div.choices', {}, item.choices.map(ch => h('button.choice', { onclick: () => answer(ch) }, ch))));
    } else {
      kp = keypad({ layout: item.keypad || 'dec', onSubmit: v => (answered ? next() : answer(v)) });
      area.replaceChildren(kp.el);
    }
  };

  swipe(card, { follow: false, onLeft: () => { if (answered) next(); } });
  paintStreak();
  root.append(h('header.view-head', {}, h('a.icon-btn', { href: '#/drills', 'aria-label': 'Back' }, '‹'), h('h1.grow', {}, d.title), streakEl), card, nextBtn);
  next();
  return () => kp?.destroy();
}
