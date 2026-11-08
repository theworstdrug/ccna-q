// Notebook screen: the bridge between the app and the paper notebook.
//   #/notebook/write   App → paper: what to write, where (tick when done)
//   #/notebook/add/:k  Paper → app: quick capture of what you wrote by hand
//   #/notebook/index   Notebook page numbers per chapter/topic (mirrors paper pp.1–2)

import { h, toast } from '../ui.js';
import { db, update } from '../store.js';
import { CHAPTERS, NB_PLAN, readable } from '../data/book.js';
import { LESSONS } from '../data/lessons.js';
import { GLOSSARY } from '../data/glossary.js';
import { buzz, swipe } from '../gestures.js';
import {
  buildOutbox, markWritten, undoWritten, recentlyWritten, addFromPaper, recentlyAdded, topicOptions, currentTopic,
  NB_PAGES, highestPageUsed, nextFreePage,
} from '../sync.js';

const KIND = {
  mistake: ['✗', 'Mistake log'], weekly: ['🗓', 'Weekly review'], summary: ['✍', 'Summary'],
  term: ['Aa', 'Term'], cue: ['?', 'Cue'], drill: ['⚡', 'Reference'],
};
const FILTERS = [['all', 'All'], ['back', 'Back pages'], ['spread', 'Spreads'], ['ref', 'Reference']];
const inFilter = (f, it) => f === 'all' || (f === 'back' && (it.kind === 'mistake' || it.kind === 'weekly'))
  || (f === 'spread' && ['summary', 'term', 'cue'].includes(it.kind)) || (f === 'ref' && it.kind === 'drill');

export function render(root, [tab = 'write', arg]) {
  const tabs = [['write', 'To write'], ['add', 'From notebook'], ['index', 'Index']];
  const count = buildOutbox().length;
  root.append(
    h('header.view-head.reader-head', {},
      h('a.icon-btn', { href: '#/book', 'aria-label': 'Back to book' }, '‹'),
      h('div.grow', {}, h('div.muted.small', {}, 'Paper notebook ⇄ app'), h('h1.reader-title', {}, 'Notebook'))),
    h('div.seg.nb-tabs', {}, tabs.map(([k, v]) => h('a' + (k === tab ? '.on' : ''), { href: `#/notebook/${k}`, role: 'tab' },
      v, k === 'write' && count ? h('span.seg-badge', {}, count) : null))));
  const body = h('div', {});
  root.append(body);
  if (tab === 'add') renderAdd(body, arg);
  else if (tab === 'index') renderIndex(body);
  else renderWrite(body);
}

// ---------------------------------------------------------------- app → paper

function renderWrite(root) {
  let filter = 'all';
  const list = h('div.outbox', {});
  const chips = h('div.chips', {});
  const recent = h('details.panel.recent', {});

  const draw = () => {
    const items = buildOutbox();
    chips.replaceChildren(...FILTERS.map(([k, v]) => {
      const n = items.filter(it => inFilter(k, it)).length;
      return h('button.chip-btn' + (filter === k ? '.on' : ''), { onclick: () => { filter = k; draw(); } }, `${v}${n ? ` · ${n}` : ''}`);
    }));
    const shown = items.filter(it => inFilter(filter, it));
    list.replaceChildren(...(shown.length ? shown.map(card) : [h('div.empty', {}, h('div.big-emoji', {}, '📓'),
      h('p', {}, items.length ? 'Nothing in this filter.' : 'All caught up: your notebook has everything the app knows about.'),
      h('p.muted.small', {}, 'New items appear when you miss quiz questions, keep forgetting a term, finish a chapter or a week, or miss drill questions.'))]));
    const log = recentlyWritten().slice(0, 10);
    recent.replaceChildren(h('summary', {}, h('strong', {}, 'Recently written'), h('span.muted.small', {}, ` · ${log.length}`)),
      log.length ? h('ul.plain', {}, log.map(l => h('li.recent-row', {},
        h('span', {}, `${KIND[l.kind]?.[0] || '•'}  ${l.title}`, h('span.muted.small', {}, ` · ${l.where}`)),
        h('button.btn.ghost.small', { onclick: () => { undoWritten(l.id); draw(); window.dispatchEvent(new Event('ccnaq:nav')); } }, 'Undo')))) : h('p.muted.small', {}, 'Nothing yet.'));
  };

  const card = it => {
    const [ico, label] = KIND[it.kind];
    const el = h('article.ob-card.k-' + it.kind, {},
      h('div.ob-head', {}, h('span.ob-ico', {}, ico), h('div.grow', {}, h('div.ob-title', {}, it.title), h('div.muted.small', {}, it.sub ? `${label} · ${it.sub}` : label))),
      h('div.ob-where', {}, '📍 ', h('strong', {}, it.where), it.page ? ` · ${it.page}` : ''),
      h('div.ob-lines', {}, it.lines.map(l => h('div', {}, l))),
      h('div.ob-actions', {},
        it.key && /^\d+$/.test(it.key) ? h('a.btn.ghost.small', { href: `#/book/${it.key}` }, 'Chapter') : null,
        h('button.btn.small.ob-done', { onclick: () => done() }, '✓ Written')));
    const done = () => {
      markWritten(it);
      buzz(10);
      el.classList.add('gone');
      setTimeout(draw, 180);
      window.dispatchEvent(new Event('ccnaq:nav'));
      toast(`Ticked off: ${it.title.slice(0, 40)}`);
    };
    swipe(el, { onRight: done, threshold: 110 });
    return el;
  };

  root.append(
    h('p.hint', {}, 'Built from how you use the app. Write each item where it says, then tap ✓ Written (or swipe it right).'),
    chips, list, recent);
  draw();
}

// ---------------------------------------------------------------- paper → app

function renderAdd(root, preset) {
  let type = 'mistake';
  const opts = topicOptions();
  const topic = h('select.input', { 'aria-label': 'Topic' }, opts.map(o => h('option', { value: o.key }, o.label)), h('option', { value: '' }, 'General / no topic'));
  topic.value = preset && opts.some(o => o.key === preset) ? preset : currentTopic();
  const seg = h('div.seg', {});
  const fields = h('div.form', {});
  const recent = h('section.panel', {});
  const SOURCES = ['Boson', 'Anki', 'Packet Tracer', 'JITL quiz', 'Paper self-test', 'Other'];

  const drawRecent = () => {
    const r = recentlyAdded().slice(0, 8);
    recent.replaceChildren(h('h2', {}, 'Added from your notebook'),
      r.length ? h('ul.plain', {}, r.map(x => h('li', {}, h('span', {}, x.text?.slice(0, 60) || ''), h('div.muted.small', {}, `→ ${x.summary}`))))
        : h('p.muted.small', {}, 'Nothing yet. Mistakes you add here show up in Today → Weak topics; cues go into that chapter\'s Cornell notes and self-test; terms go into Review.'));
  };

  const drawFields = () => {
    seg.replaceChildren(...[['mistake', 'Mistake'], ['cue', 'Cue'], ['term', 'Term'], ['note', 'Note']].map(([k, v]) =>
      h('button' + (type === k ? '.on' : ''), { onclick: () => { type = k; drawFields(); } }, v)));
    let get;
    if (type === 'mistake') {
      let src = 'Boson';
      const srcChips = h('div.chips', {}, SOURCES.map(sx => h('button.chip-btn' + (sx === src ? '.on' : ''), {
        onclick: e => { src = sx; srcChips.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.target)); },
      }, sx)));
      const wrong = h('textarea.input', { rows: 2, placeholder: 'What I got wrong (or the question)' });
      const right = h('textarea.input', { rows: 2, placeholder: 'The right idea' });
      fields.replaceChildren(h('label.field', {}, 'Where it came from'), srcChips, wrong, right,
        h('p.hint', {}, 'Same line as your mistake log on p.154. It feeds Weak topics on Today.'));
      get = () => (wrong.value.trim() ? { source: src, wrong: wrong.value.trim(), right: right.value.trim() } : null);
    } else if (type === 'cue') {
      const q = h('input.input', { placeholder: 'Cue question, as written in the cue column' });
      const a = h('textarea.input', { rows: 3, placeholder: 'Answer / the notes beside it (optional)' });
      fields.replaceChildren(q, a, h('p.hint', {}, 'Goes into this topic\'s Cornell notes, so you can self-test on the phone.'));
      get = () => (q.value.trim() ? { q: q.value.trim(), a: a.value.trim() } : null);
    } else if (type === 'term') {
      const term = h('input.input', { placeholder: 'Term (e.g. "native VLAN")', list: 'nb-terms', autocapitalize: 'off' });
      const dl = h('datalist', { id: 'nb-terms' }, GLOSSARY.map(g => h('option', { value: g.term })));
      const def = h('textarea.input', { rows: 2, placeholder: 'Definition (only needed for your own terms)' });
      let status = 1;
      const st = h('div.status-row.four', {}, [[1, '1 · new'], [3, '3 · familiar'], [5, '✓ known']].map(([v, l]) =>
        h('button.sbtn' + (v === 5 ? '.known' : `.s${v}`) + (v === status ? '.on' : ''), { onclick: e => { status = v; st.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); } }, l)));
      fields.replaceChildren(term, dl, def, h('label.field', {}, 'How well do you know it?'), st,
        h('p.hint', {}, 'Marks the term as "in my notebook". 1 or 3 puts it into Review; ✓ marks it known.'));
      get = () => (term.value.trim() ? { term: term.value.trim(), def: def.value.trim(), status } : null);
    } else {
      const text = h('textarea.input', { rows: 4, placeholder: 'Something from your notes worth having on the phone too' });
      fields.replaceChildren(text, h('p.hint', {}, 'Appended (with today\'s date) to this topic\'s notes in Cornell notes.'));
      get = () => (text.value.trim() ? { text: text.value.trim() } : null);
    }
    fields.append(h('button.btn.full', {
      onclick: () => {
        const data = get();
        if (!data) { toast('Fill in the first box'); return; }
        const msg = addFromPaper(type, topic.value || null, data);
        buzz(10);
        toast(`Saved · ${msg}`);
        drawFields();
        drawRecent();
        window.dispatchEvent(new Event('ccnaq:nav'));
      },
    }, 'Add to app'));
  };

  root.append(
    h('p.hint', {}, 'Wrote something by hand? Capture it here so the app knows (quiz weak spots, review, self-test).'),
    h('label.field', {}, 'Topic', topic), seg, fields, recent);
  drawFields();
  drawRecent();
}

// ---------------------------------------------------------------- page index

function renderIndex(root) {
  const summary = h('div', {});
  const drawSummary = () => {
    const used = highestPageUsed();
    summary.replaceChildren(
      h('div.panel-head', {}, h('h2', {}, `Filled up to p.${used} of ${NB_PAGES}`), h('span.muted.small', {}, `next spread: p.${nextFreePage()}`)),
      h('div.bar', {}, h('span', { style: { width: `${Math.min(100, (used / NB_PAGES) * 100)}%` } })),
      h('p.muted.small', {}, 'Pages 1–9 hold the index, reference pages and tab key. Spreads start on even (left-hand) pages. The back pages (154 down to 136) hold the mistake log and weekly reviews.'));
  };
  drawSummary();
  const input = (value, onSave, label, plan) => h('input.input.page-in.nb-in', {
    inputmode: 'numeric', placeholder: plan || '—', value: value || '', 'aria-label': `Notebook page for ${label}`,
    onchange: e => { onSave(e.target.value.trim()); drawSummary(); },
  });
  const row = (num, title, value, onSave, href, plan) => h('div.nb-row', {},
    h('a.nb-title', { href }, num != null ? h('span.ch-num', {}, num) : null, title),
    input(value, onSave, title, plan));
  const inBook = new Set(CHAPTERS.flatMap(c => c.lessons));
  const extra = LESSONS.filter(l => !inBook.has(l.id) && !l.chapter);
  root.append(
    h('section.panel', {}, summary,
      h('a.btn.ghost.small', { href: 'docs/notebook-guide.pdf', target: '_blank', rel: 'noopener' }, '📄 Notebook formatting guide (PDF)')),
    h('p.hint', {}, 'Grey numbers are the planned budget from the notebook guide. Type the pages you actually used (e.g. 12 or 12–15); the same numbers go on paper pages 1–2.'),
    h('h2.section-title', {}, 'Book chapters'),
    h('div.nb-list', {}, CHAPTERS.filter(readable).map(c => row(c.n, c.title, db().book[c.n]?.nb,
      v => update(x => { x.book[c.n] = { ...(x.book[c.n] || {}), nb: v }; }), `#/book/${c.n}`, NB_PLAN[c.n]))),
    h('h2.section-title', {}, 'Beyond the book'),
    h('div.nb-list', {}, extra.map(l => row(null, l.title, db().nb?.[l.id],
      v => update(x => { x.nb = { ...(x.nb || {}), [l.id]: v }; if (!v) delete x.nb[l.id]; }), `#/read/${encodeURIComponent(l.id)}`, NB_PLAN[l.id]))));
}

