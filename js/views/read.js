// LingQ-style reader: lessons with every CCNA term highlighted by status.
// Blue = new, yellow (fading 1→4) = learning, none = known. Tap to rate.
// Tap any plain word, or select a phrase, to save your own term.

import { h, sheet, closeSheet, toast, inline } from '../ui.js';
import { db, update } from '../store.js';
import { LESSONS, lessonById } from '../data/lessons.js';
import { GLOSSARY, DOMAIN_NAMES } from '../data/glossary.js';
import { tokenize, termsIn, getTerm, card, statusOf, sentenceAt, addCustom, allTerms } from '../terms.js';
import { setStatus, STATUS_LABEL } from '../srs.js';
import { CHAPTERS } from '../data/book.js';

const chapterOf = id => CHAPTERS.find(c => c.lessons.includes(id));

const DOMAIN_SHORT = { fund: 'Fundamentals', access: 'Access', ip: 'IP Conn.', svc: 'Services', sec: 'Security', auto: 'Automation', custom: 'Yours' };

const allLessons = () => [
  ...db().imports.map(i => ({ ...i, imported: true })),
  ...LESSONS,
];
const findLesson = id => lessonById(id) || db().imports.find(i => i.id === id);

const statusClass = s => (s === -1 ? 'ign' : `s${s}`);

function counts(ids) {
  const c = { new: 0, learning: 0, known: 0 };
  for (const id of ids) {
    const s = statusOf(id);
    if (s === 0) c.new++;
    else if (s >= 1 && s <= 4) c.learning++;
    else c.known++;
  }
  return c;
}

export function render(root, [id]) {
  if (id === '_glossary') return renderGlossary(root);
  if (id) return renderReader(root, id);
  location.replace('#/book');
  return null;
}

export function importSheet() {
  const title = h('input.input', { placeholder: 'Title (e.g. "JITL Day 26 notes")' });
  const text = h('textarea.input', { rows: 10, placeholder: 'Paste anything: your notes, a video transcript, a Cisco doc page… CCNA terms will be highlighted automatically.' });
  const domain = h('select.input', {}, h('option', { value: '' }, 'Domain (optional)'),
    ...Object.entries(DOMAIN_NAMES).map(([k, v]) => h('option', { value: k }, v)));
  sheet(h('div.form', {},
    title, domain, text,
    h('button.btn.full', {
      onclick: () => {
        if (!text.value.trim()) return toast('Paste some text first');
        const id = `imp-${Date.now().toString(36)}`;
        update(s => s.imports.unshift({ id, title: title.value.trim() || 'Imported text', body: text.value, domain: domain.value || null, created: Date.now() }));
        closeSheet();
        location.hash = `#/read/${id}`;
      },
    }, 'Save & read')), { title: 'Import text', tall: true });
}

// ---------- reader ----------

function renderReader(root, id) {
  const lesson = findLesson(id);
  if (!lesson) { root.append(h('p', {}, 'Lesson not found. ', h('a', { href: '#/book' }, 'Back'))); return; }
  update(s => { s.lessons[id] = { ...(s.lessons[id] || {}), openedAt: Date.now() }; });
  const body = lesson.body || '';
  const ids = termsIn(body);

  const statsEl = h('div.reader-stats', {});
  const refreshStats = () => {
    const c = counts(ids);
    statsEl.replaceChildren(h('span.pill.s0', {}, `${c.new} new`), h('span.pill.s2', {}, `${c.learning} learning`), h('span.pill', {}, `${c.known} known`));
  };
  refreshStats();

  const text = h('article.reader', { lang: 'en' });
  renderBody(text, body);

  const refreshSpans = tid => {
    text.querySelectorAll(`.t[data-id="${CSS.escape(tid)}"]`).forEach(el => { el.className = `t ${statusClass(statusOf(tid))}`; });
    refreshStats();
    window.dispatchEvent(new Event('ccnaq:nav'));
  };

  text.addEventListener('click', e => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim().split(/\s+/).length > 1) return; // phrase handled by selection button
    const t = e.target.closest('.t');
    if (t) { termSheet(t.dataset.id, body, refreshSpans); return; }
    const w = e.target.closest('.w');
    if (w) newTermSheet(w.textContent, body, () => { renderBody(text, body); refreshStats(); });
  });

  // Save a selected phrase
  const phraseBtn = h('button.btn.small.phrase-btn', { hidden: true }, '+ Save phrase');
  const onSel = () => {
    const sel = window.getSelection();
    const s = sel?.toString().trim() || '';
    const inReader = sel?.anchorNode && text.contains(sel.anchorNode);
    phraseBtn.hidden = !(inReader && s.split(/\s+/).length > 1 && s.length < 80);
  };
  document.addEventListener('selectionchange', onSel);
  phraseBtn.addEventListener('click', () => {
    const s = window.getSelection().toString().trim().replace(/\s+/g, ' ');
    phraseBtn.hidden = true;
    window.getSelection().removeAllRanges();
    newTermSheet(s, body, () => { renderBody(text, body); refreshStats(); });
  });

  const cues = (lesson.cues || []).length ? cueBlock(lesson.cues) : null;

  const ch = chapterOf(id);
  let next;
  if (ch) {
    const nid = ch.lessons[ch.lessons.indexOf(id) + 1];
    next = nid ? findLesson(nid) : null;
  } else {
    const list = allLessons().filter(l => l.imported || !chapterOf(l.id));
    next = list[list.findIndex(l => l.id === id) + 1];
  }
  const backHref = ch ? `#/book/${ch.n}` : '#/book';

  const finish = h('button.btn.full', {
    onclick: () => {
      const blue = ids.filter(t => statusOf(t) === 0);
      update(s => {
        for (const t of blue) setStatus(card(t), 5);
        s.lessons[id] = { ...(s.lessons[id] || {}), done: true, doneAt: Date.now() };
      });
      toast(blue.length ? `Lesson complete · ${blue.length} blue terms → Known` : 'Lesson complete');
      blue.forEach(refreshSpans);
      setTimeout(() => { location.hash = next ? `#/read/${encodeURIComponent(next.id)}` : backHref; }, 600);
    },
  }, 'Finish: mark remaining blue terms Known');

  const scale = () => db().settings.fontScale || 1;
  const applyScale = () => text.style.setProperty('--fs', scale());
  applyScale();
  const fontBtn = d => h('button.icon-btn.font-btn', { 'aria-label': d > 0 ? 'Larger text' : 'Smaller text', onclick: () => { update(s => { s.settings.fontScale = Math.min(1.5, Math.max(0.8, Math.round((scale() + d) * 10) / 10)); }); applyScale(); } }, d > 0 ? 'A+' : 'A−');
  const progress = h('div.read-progress', {}, h('span'));
  const onScroll = () => {
    const r = text.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (window.innerHeight - r.top) / (r.height + window.innerHeight * 0.3)));
    progress.firstChild.style.width = `${pct * 100}%`;
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  root.append(
    progress,
    h('header.view-head.reader-head', {},
      h('a.icon-btn', { href: backHref, 'aria-label': 'Back' }, '‹'),
      h('div.grow', {}, h('div.muted.small', {}, lesson.imported ? 'Imported' : ch ? `Chapter ${ch.n} · ${ch.title}` : `${DOMAIN_NAMES[lesson.domain] || ''} · beyond the book`),
        h('h1.reader-title', {}, lesson.title)),
      fontBtn(-0.1), fontBtn(0.1),
      lesson.imported ? h('button.icon-btn', {
        'aria-label': 'Delete import',
        onclick: () => { if (confirm('Delete this imported text?')) { update(s => { s.imports = s.imports.filter(i => i.id !== id); }); location.hash = '#/book'; } },
      }, '🗑') : null),
    statsEl, text, phraseBtn,
    cues,
    h('div.reader-foot', {}, finish, next ? h('a.btn.ghost.full', { href: `#/read/${encodeURIComponent(next.id)}` }, `Next: ${next.title} ›`) : h('a.btn.ghost.full', { href: backHref }, ch ? `Back to chapter ${ch.n} ›` : 'Back to Book ›')),
  );

  const onKey = e => {
    if (!document.querySelector('.scrim') || e.target.matches('input, textarea')) return;
    const map = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, k: 5, x: -1 };
    if (map[e.key] !== undefined) document.querySelector(`.status-row [data-s="${map[e.key]}"]`)?.click();
  };
  document.addEventListener('keydown', onKey);
  return () => { document.removeEventListener('selectionchange', onSel); document.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onScroll); };
}

/** Render markdown-lite body with tappable tokens. */
function renderBody(el, body) {
  el.replaceChildren();
  const lines = body.replace(/\r/g, '').split('\n');
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith('```')) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      el.append(h('pre.code', {}, buf.join('\n')));
    } else if (/^#{1,3} /.test(l)) {
      el.append(h('h2', {}, ...inlineTokens(l.replace(/^#+ /, ''))));
      i++;
    } else if (/^\s*([-*]|\d+\.) /.test(l)) {
      const ordered = /^\s*\d+\. /.test(l);
      const list = h(ordered ? 'ol' : 'ul', {});
      while (i < lines.length && /^\s*([-*]|\d+\.) /.test(lines[i])) {
        list.append(h('li', {}, ...inlineTokens(lines[i].replace(/^\s*([-*]|\d+\.) /, ''))));
        i++;
      }
      el.append(list);
    } else if (!l.trim()) {
      i++;
    } else {
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,3} |```|\s*([-*]|\d+\.) )/.test(lines[i])) buf.push(lines[i++]);
      el.append(h('p', {}, ...inlineTokens(buf.join(' '))));
    }
  }
}

function inlineTokens(text) {
  const out = [];
  // split on `code` and **bold**
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/);
  for (const p of parts) {
    if (!p) continue;
    if (p.startsWith('`')) { out.push(h('code', {}, p.slice(1, -1))); continue; }
    const bold = p.startsWith('**');
    const seg = bold ? p.slice(2, -2) : p;
    const nodes = tokenize(seg).map(s => {
      if (s.t === 'term') return h('span', { class: `t ${statusClass(statusOf(s.id))}`, 'data-id': s.id }, s.text);
      if (s.t === 'word') return h('span.w', {}, s.text);
      return document.createTextNode(s.text);
    });
    out.push(bold ? h('strong', {}, ...nodes) : nodes);
  }
  return out;
}

function cueBlock(cues) {
  let shown = false;
  const items = cues.map(([q, a]) => {
    const ans = h('div.cue-a', { hidden: true }, a);
    return h('li.cue', { onclick: () => { ans.hidden = !ans.hidden; } }, h('div.cue-q', {}, q), ans);
  });
  const toggle = h('button.btn.ghost.small', {
    onclick: () => { shown = !shown; items.forEach(i => { i.querySelector('.cue-a').hidden = !shown; }); toggle.textContent = shown ? 'Hide answers' : 'Show all'; },
  }, 'Show all');
  return h('section.cues', {},
    h('div.cues-head', {}, h('h2', {}, 'Cue questions'), toggle),
    h('p.hint', {}, 'Answer out loud first, then tap to check (Cornell self-test).'),
    h('ol', {}, items));
}

// ---------- term sheets ----------

export function termSheet(id, body, onChange) {
  const t = getTerm(id);
  if (!t) return;
  const c = db().terms[id];
  const ctx = c?.ctx || (body ? sentenceAt(body, t.term) : '');
  const note = h('textarea.input', { rows: 2, placeholder: 'Your note / mnemonic (optional)' }, t.note || '');
  let defEl;
  if (t.custom) defEl = h('textarea.input', { rows: 3, placeholder: 'Your definition' }, t.def);
  const save = s => {
    update(st => {
      const cc = card(id);
      if (s !== undefined) setStatus(cc, s);
      if (!cc.ctx && ctx) cc.ctx = ctx;
      cc.note = note.value.trim();
      if (t.custom) cc.def = defEl.value.trim();
    });
    onChange?.(id);
  };
  const cur = statusOf(id);
  const btn = (s, label, cls = '') => h('button.sbtn' + cls + (cur === s ? '.on' : ''), { 'data-s': s, onclick: () => { save(s); closeSheet(); } }, label);
  sheet(h('div.term-sheet', {},
    h('div.term-head', {}, h('h2', {}, t.term), h('span.chip.d-' + t.domain, {}, t.domainName)),
    t.custom ? defEl : h('p.def', { html: inline(t.def) }),
    t.aliases?.length ? h('p.muted.small', {}, `Also: ${t.aliases.slice(0, 6).join(', ')}`) : null,
    ctx ? h('blockquote.ctx', {}, ctx) : null,
    note,
    h('div.status-row', {},
      btn(1, '1', '.s1'), btn(2, '2', '.s2'), btn(3, '3', '.s3'), btn(4, '4', '.s4'),
      btn(5, '✓ Known', '.known'), btn(-1, 'Ignore', '.ignore')),
    h('div.sheet-foot', {},
      h('span.muted.small', {}, `Status: ${STATUS_LABEL[cur]}`),
      t.custom ? h('button.btn.ghost.small', {
        onclick: () => { if (confirm('Delete this term?')) { update(s => { delete s.terms[id]; }); closeSheet(); onChange?.(id); } },
      }, 'Delete') : h('button.btn.ghost.small', { onclick: () => { save(); closeSheet(); } }, 'Save note'))),
  { onClose: () => {} });
}

function newTermSheet(word, body, onDone) {
  const termIn = h('input.input', { value: word });
  const def = h('textarea.input', { rows: 3, placeholder: 'Definition in your own words' });
  sheet(h('div.term-sheet', {},
    h('p.muted.small', {}, 'Save this as your own term. It will be highlighted everywhere and go into Review.'),
    termIn, def,
    h('div.status-row', {}, ...[1, 2, 3, 4].map(s => h('button.sbtn.s' + s, {
      onclick: () => {
        const text = termIn.value.trim();
        if (!text) return;
        update(() => {
          const id = addCustom(text, def.value.trim());
          const c = card(id);
          c.def = def.value.trim();
          c.ctx = sentenceAt(body, text);
          setStatus(c, s);
        });
        closeSheet();
        onDone?.();
      },
    }, String(s)))),
    h('p.muted.small', {}, 'Pick a starting status (1 = brand new to you).')), { title: 'New term' });
  setTimeout(() => def.focus(), 50);
}

// ---------- glossary ----------

function renderGlossary(root) {
  let filter = 'all';
  let q = '';
  const listEl = h('div.gloss', {});
  const draw = () => {
    const items = allTerms().filter(t => {
      const s = statusOf(t.id);
      if (filter === 'new' && s !== 0) return false;
      if (filter === 'learning' && !(s >= 1 && s <= 4)) return false;
      if (filter === 'known' && s !== 5) return false;
      if (filter === 'custom' && !t.custom) return false;
      if (q && !(`${t.term} ${t.aliases?.join(' ')} ${t.def}`.toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => a.term.localeCompare(b.term));
    listEl.replaceChildren(...items.map(t => h('button.gloss-item', { onclick: () => termSheet(t.id, '', draw) },
      h('span', { class: `t ${statusClass(statusOf(t.id))}` }, t.term),
      h('span.muted.small.gloss-def', {}, t.def.slice(0, 90) + (t.def.length > 90 ? '…' : '')))));
    if (!items.length) listEl.append(h('p.muted', {}, 'Nothing here yet.'));
  };
  const chips = ['all', 'new', 'learning', 'known', 'custom'].map(f => h('button.chip-btn' + (f === filter ? '.on' : ''), {
    onclick: e => { filter = f; chips.forEach(c => c.classList.remove('on')); e.target.classList.add('on'); draw(); },
  }, f));
  root.append(
    h('header.view-head', {}, h('a.icon-btn', { href: '#/book', 'aria-label': 'Back' }, '‹'), h('h1.grow', {}, 'Glossary')),
    h('input.input.search', { type: 'search', placeholder: `Search ${allTerms().length} terms…`, oninput: e => { q = e.target.value.toLowerCase(); draw(); } }),
    h('div.chips', {}, chips),
    listEl);
  draw();
}
