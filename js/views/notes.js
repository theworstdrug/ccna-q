// Cornell notes per chapter: cue questions (left column), notes, summary.
// Self-test hides the answers and shows only the cues.

import { h, toast } from '../ui.js';
import { db, update } from '../store.js';
import { chapterByN } from '../data/book.js';
import { hash } from '../sync.js';
import { lessonById } from '../data/lessons.js';
import { swipe, buzz } from '../gestures.js';

const blank = () => ({ cues: [], notes: '', summary: '' });

function autosize(el) {
  const fit = () => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; };
  el.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return el;
}

export function render(root, [n]) {
  // A book chapter, or a beyond-the-book lesson (cues captured from paper can be filed under either).
  const lesson = lessonById(n);
  const c = chapterByN(n) || (lesson && { n: lesson.id, title: lesson.title, lessons: [lesson.id], isLesson: true });
  if (!c) { root.append(h('p', {}, 'Topic not found.')); return; }
  const key = c.n;
  const label = c.isLesson ? c.title : `Ch ${c.n}: ${c.title}`;
  const get = () => db().notes[key] || blank();
  const save = fn => update(s => { s.notes[key] = s.notes[key] || blank(); fn(s.notes[key]); });

  let tab = 'write';
  const seg = h('div.seg', {});
  const body = h('div', {});
  const drawSeg = () => seg.replaceChildren(...[['write', 'Write'], ['test', 'Self-test']].map(([k, v]) =>
    h('button' + (tab === k ? '.on' : ''), { onclick: () => { tab = k; drawSeg(); draw(); } }, v)));

  const draw = () => body.replaceChildren(tab === 'write' ? writeView() : testView());

  function writeView() {
    const nts = get();
    const list = h('div.cues-edit', {});
    const drawCues = () => list.replaceChildren(...get().cues.map((cue, i) => {
      const q = autosize(h('textarea.input.cue-q-in', { rows: 1, placeholder: 'Question (cue)…', oninput: e => save(x => { x.cues[i].q = e.target.value; }) }, cue.q));
      const a = autosize(h('textarea.input.cue-a-in', { rows: 2, placeholder: 'Answer / notes for this cue…', oninput: e => save(x => { x.cues[i].a = e.target.value; }) }, cue.a));
      return h('div.cue-edit', {},
        h('div.cue-edit-head', {}, h('span.cue-n', {}, i + 1),
          h('button.icon-btn.tiny', { 'aria-label': 'Delete cue', onclick: () => { save(x => x.cues.splice(i, 1)); drawCues(); } }, '✕')),
        q, a);
    }));
    drawCues();
    const addCue = () => { save(x => x.cues.push({ q: '', a: '' })); drawCues(); list.lastChild?.querySelector('textarea')?.focus(); };
    const lessonCues = c.lessons.flatMap(id => lessonById(id)?.cues || []);
    const importCues = () => {
      const have = new Set(get().cues.map(x => x.q.trim()));
      const add = lessonCues.filter(([q]) => !have.has(q));
      if (!add.length) return toast('All lesson cues already added');
      save(x => { for (const [q, a] of add) x.cues.push({ q, a }); });
      drawCues();
      toast(`Added ${add.length} cues`);
    };
    return h('div.cornell', {},
      h('section.panel', {},
        h('div.panel-head', {}, h('h2', {}, 'Cues'), h('span.muted.small', {}, 'questions, not facts')),
        list,
        h('div.row.wrap', {},
          h('button.btn.small', { onclick: addCue }, '+ Cue'),
          lessonCues.length ? h('button.btn.small.ghost', { onclick: importCues }, 'Add the lesson\'s cue questions') : null)),
      h('section.panel', {},
        h('h2', {}, 'Notes'),
        h('p.hint', {}, 'Diagrams go in the paper notebook. Put commands here with what they do.'),
        autosize(h('textarea.input.notes-in', { rows: 6, placeholder: 'Free-form notes…', oninput: e => save(x => { x.notes = e.target.value; }) }, nts.notes))),
      h('section.panel', {},
        h('h2', {}, 'Summary'),
        h('p.hint', {}, 'Write it after the lab, not after the video. 2–4 sentences, in your own words.'),
        autosize(h('textarea.input', { rows: 3, placeholder: 'This chapter in a nutshell…', oninput: e => save(x => { x.summary = e.target.value; }) }, nts.summary))));
  }

  function testView() {
    const cues = get().cues.filter(x => x.q.trim());
    if (!cues.length) return h('div.empty', {}, h('p', {}, 'No cue questions yet.'), h('button.btn', { onclick: () => { tab = 'write'; drawSeg(); draw(); } }, 'Write some'));
    const order = [...cues].sort(() => Math.random() - 0.5);
    let i = 0; let got = 0;
    const wrap = h('div.selftest', {});
    const step = () => {
      if (i >= order.length) {
        wrap.replaceChildren(h('div.empty', {}, h('div.big-emoji', {}, got === order.length ? '🎯' : '📘'),
          h('p', {}, `${got} of ${order.length} recalled.`),
          h('button.btn', { onclick: () => draw() }, 'Again')));
        return;
      }
      const cue = order[i];
      const ans = h('div.st-a', { hidden: true }, cue.a || h('span.muted', {}, '(no answer written)'));
      const grade = ok => {
        buzz(ok ? 8 : 25);
        if (ok) got++;
        else update(s => s.missed.push({ id: hash(`${Date.now()}|${cue.q}`), topic: label, note: cue.q, answer: cue.a || '', ch: String(key), at: Date.now(), src: 'self-test' }));
        i++; step();
      };
      const btns = h('div.grades.two', { hidden: true },
        h('button.gbtn.again', { onclick: () => grade(false) }, 'Missed'),
        h('button.gbtn.good', { onclick: () => grade(true) }, 'Got it'));
      const card = h('div.flash.tap', { onclick: () => { ans.hidden = false; btns.hidden = false; } },
        h('div.muted.small', {}, `Cue ${i + 1} of ${order.length} · tap to reveal`),
        h('div.st-q', {}, cue.q), ans);
      swipe(card, { onLeft: () => { if (!btns.hidden) grade(false); }, onRight: () => { if (!btns.hidden) grade(true); } });
      wrap.replaceChildren(card, btns, h('p.hint.center', {}, 'Answer out loud, reveal, then swipe → got it / ← missed'));
    };
    step();
    return wrap;
  }

  drawSeg();
  draw();
  root.append(
    h('header.view-head.reader-head', {},
      h('a.icon-btn', { href: c.isLesson ? `#/read/${encodeURIComponent(c.n)}` : `#/book/${c.n}`, 'aria-label': 'Back' }, '‹'),
      h('div.grow', {}, h('div.muted.small', {}, c.isLesson ? 'Beyond the book · Cornell notes' : `Chapter ${c.n} · Cornell notes`), h('h1.reader-title', {}, c.title))),
    seg, body);
}
