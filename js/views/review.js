// Spaced-repetition review of terms marked 1–4 in the reader.

import { h, inline, toast } from '../ui.js';
import { db, update } from '../store.js';
import { getTerm, card } from '../terms.js';
import { grade, isDue, ivlLabel } from '../srs.js';
import { DOMAIN_NAMES } from '../data/glossary.js';

function cloze(ctx, term) {
  if (!ctx) return null;
  const forms = [term.term, ...(term.aliases || [])].sort((a, b) => b.length - a.length);
  for (const f of forms) {
    const re = new RegExp(f.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'i');
    if (re.test(ctx)) return ctx.replace(re, '_____');
  }
  return null;
}

export function render(root) {
  const now = Date.now();
  const all = Object.entries(db().terms).filter(([id]) => getTerm(id));
  const due = all.filter(([, c]) => isDue(c, now)).map(([id]) => id);
  const learning = all.filter(([, c]) => c.status >= 1 && c.status <= 4).map(([id]) => id);
  const known = all.filter(([, c]) => c.status === 5).map(([id]) => id);

  root.append(h('header.view-head', {}, h('h1', {}, 'Review')));

  if (!learning.length && !due.length) {
    root.append(h('div.empty', {},
      h('p', {}, 'No terms in review yet.'),
      h('p.muted', {}, 'Open a lesson in Read and rate terms 1–4. They will show up here on a spaced schedule.'),
      h('a.btn', { href: '#/read' }, 'Go to Read')));
    return;
  }

  const startSession = (queue, label) => session(root, shuffle(queue), label);

  root.append(
    h('section.stat-row', {},
      h('div.stat.due', {}, h('div.stat-n', {}, due.length), h('div.stat-l', {}, 'due now')),
      h('div.stat.learning', {}, h('div.stat-n', {}, learning.length), h('div.stat-l', {}, 'learning')),
      h('div.stat.known', {}, h('div.stat-n', {}, known.length), h('div.stat-l', {}, 'known'))),
    h('div.stack', {},
      due.length ? h('button.btn.full.big', { onclick: () => startSession(due, 'Due') }, `Review ${due.length} due`) : h('p.muted', {}, 'Nothing due right now 🎉'),
      learning.length ? h('button.btn.ghost.full', { onclick: () => startSession(learning, 'Practice') }, `Practice all ${learning.length} learning terms (doesn't affect schedule much)`) : null,
      known.length >= 5 ? h('button.btn.ghost.full', { onclick: () => startSession(shuffle(known).slice(0, 20), 'Known check') }, 'Spot-check 20 known terms') : null),
    leeches(all));
}

function leeches(all) {
  const l = all.filter(([, c]) => (c.lapses || 0) >= 3).sort((a, b) => b[1].lapses - a[1].lapses).slice(0, 10);
  if (!l.length) return null;
  return h('section.panel', {}, h('h2', {}, 'Leeches'), h('p.hint', {}, 'Terms you keep forgetting. Write them in your Cornell notes with a diagram.'),
    h('ul.plain', {}, l.map(([id, c]) => h('li', {}, h('strong', {}, getTerm(id).term), h('span.muted.small', {}, ` · forgotten ${c.lapses}×`)))));
}

function shuffle(a) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}

function session(root, queue, label) {
  const practice = label !== 'Due';
  let done = 0;
  let again = 0;
  const box = h('div.review', {});
  root.replaceChildren(h('header.view-head', {},
    h('button.icon-btn', { 'aria-label': 'End', onclick: () => { root.replaceChildren(); render(root); } }, '‹'),
    h('h1.grow', {}, `${label}`), h('span.muted.small.counter', {}, '')), box);
  const counter = root.querySelector('.counter');

  const next = () => {
    counter.textContent = `${done} done · ${queue.length} left`;
    if (!queue.length) {
      box.replaceChildren(h('div.empty', {},
        h('div.big-emoji', {}, '✅'),
        h('p', {}, `Session done: ${done} cards, ${again} forgotten.`),
        h('button.btn', { onclick: () => { root.replaceChildren(); render(root); } }, 'Back')));
      window.dispatchEvent(new Event('ccnaq:nav'));
      return;
    }
    const id = queue.shift();
    const t = getTerm(id);
    const c = card(id);
    const cl = cloze(c.ctx, t);
    const useCloze = cl && Math.random() < 0.5;
    const back = h('div.card-back', { hidden: true },
      useCloze ? h('h2', {}, t.term) : null,
      t.def ? h('p.def', { html: inline(t.def) }) : h('p.muted', {}, '(no definition yet: add one from the Glossary)'),
      c.note ? h('p.note', {}, '📝 ', c.note) : null,
      !useCloze && c.ctx ? h('blockquote.ctx', {}, c.ctx) : null);
    const grades = h('div.grades', { hidden: true },
      ...[['Again', 0, 'again'], ['Hard', 1, 'hard'], ['Good', 2, 'good'], ['Easy', 3, 'easy']].map(([lab, g, cls]) =>
        h('button.gbtn.' + cls, {
          onclick: () => {
            if (practice && label === 'Known check') {
              if (g === 0) { update(() => { c.status = 3; c.due = Date.now(); c.reps = 0; }); toast(`${t.term} moved back to learning`); }
            } else if (practice) {
              if (g === 0) { again++; queue.push(id); }
            } else {
              update(() => grade(c, g));
              if (g === 0) { again++; queue.push(id); }
            }
            done++;
            next();
          },
        }, h('span', {}, lab), practice ? null : h('small', {}, ivlLabel(c, g)))));
    const show = h('button.btn.full.big', {
      onclick: () => { back.hidden = false; grades.hidden = false; show.hidden = true; },
    }, 'Show answer');
    box.replaceChildren(h('div.flash', {},
      h('div.muted.small', {}, `${DOMAIN_NAMES[t.domain] || 'Your term'} · status ${c.status === 5 ? 'known' : c.status}`),
      useCloze ? h('p.cloze', {}, cl) : h('h2.flash-term', {}, t.term),
      useCloze ? h('p.muted.small', {}, 'Which term fills the blank?') : h('p.muted.small', {}, 'What does it mean? Say it out loud.'),
      back), show, grades);
  };

  const onKey = e => {
    if (e.target.matches('input, textarea')) return;
    if (e.key === ' ' || e.key === 'Enter') { const s = box.querySelector('.btn.big:not([hidden])'); if (s) { e.preventDefault(); s.click(); } }
    const g = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' }[e.key];
    if (g) box.querySelector(`.grades:not([hidden]) .gbtn.${g}`)?.click();
  };
  document.addEventListener('keydown', onKey);
  const obs = new MutationObserver(() => { if (!root.contains(box)) { document.removeEventListener('keydown', onKey); obs.disconnect(); } });
  obs.observe(root, { childList: true });
  next();
}
