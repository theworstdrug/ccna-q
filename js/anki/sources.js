// Card sources for the Anki export. Each source turns app content into notes:
//   { id (stable), deck, front, back, extra, source, tags[] }
// Stable ids mean re-importing updates cards instead of duplicating them.

import { db } from '../store.js';
import { GLOSSARY, DOMAIN_NAMES } from '../data/glossary.js';
import { CHAPTERS } from '../data/book.js';
import { LESSONS } from '../data/lessons.js';
import { PORTS, OSI, LAYER, AD, CLI_MODES, CLI_WHERE, MEM } from '../drills.js';
import { hash, topicTitle } from '../sync.js';

const ROOT = 'CCNA-Q';
const pad2 = n => String(n).padStart(2, '0');
const chDeck = c => `Ch ${pad2(c.n)} ${c.title}`;
const DOMAIN_TAG = { fund: 'fundamentals', access: 'network-access', ip: 'ip-connectivity', svc: 'ip-services', sec: 'security', auto: 'automation' };
const chapterOfLesson = id => CHAPTERS.find(c => c.lessons.includes(id));

export const SOURCES = [
  {
    id: 'glossary', title: 'Glossary terms', desc: 'The app\'s CCNA vocabulary, one deck per exam domain.',
    options: [['all', 'All terms'], ['learning', 'Not yet known in the app'], ['weak', 'Only struggling terms']], def: 'all',
    build(opt) {
      const s = db();
      return GLOSSARY.filter(t => {
        const c = s.terms[t.id];
        if (opt === 'learning') return !c || (c.status !== 5 && c.status !== -1);
        if (opt === 'weak') return c && ((c.lapses || 0) >= 2 || (c.status >= 1 && c.status <= 2));
        return true;
      }).map(t => {
        const c = s.terms[t.id];
        const weak = c && (c.lapses || 0) >= 2;
        return {
          id: `g:${t.id}`, deck: `${ROOT}::1 Glossary::${DOMAIN_NAMES[t.domain]}`, front: t.term, back: t.def,
          extra: [t.aliases.length ? `Also: ${t.aliases.slice(0, 5).join(', ')}` : '', c?.note ? `Mnemonic: ${c.note}` : ''].filter(Boolean).join('\n'),
          source: `CCNA-Q glossary · ${DOMAIN_NAMES[t.domain]}`, tags: [ROOT.toLowerCase(), 'glossary', DOMAIN_TAG[t.domain], ...(weak ? ['weak'] : [])],
        };
      });
    },
  },
  {
    id: 'quizzes', title: 'Book chapter quizzes', desc: 'Every chapter quiz question as a recall card (answer + why).',
    options: [['all', 'All chapters'], ['started', 'Chapters I\'ve started']], def: 'all',
    build(opt) {
      const b = db().book;
      return CHAPTERS.filter(c => c.quiz.length && (opt === 'all' || ['reading', 'done'].includes(b[c.n]?.status)))
        .flatMap(c => c.quiz.map(([q, a, , why]) => ({
          id: `q:${c.n}:${hash(q)}`, deck: `${ROOT}::2 Book quizzes::${chDeck(c)}`, front: q, back: a, extra: why || '',
          source: `Companion Guide ch ${c.n} quiz`, tags: [ROOT.toLowerCase(), 'quiz', `ch${pad2(c.n)}`],
        })));
    },
  },
  {
    id: 'cues', title: 'Lesson cue questions', desc: 'The Cornell-style questions at the end of every lesson.',
    options: [['all', 'All lessons'], ['book', 'Book chapters only'], ['beyond', 'Beyond the book only']], def: 'all',
    build(opt) {
      return LESSONS.filter(l => {
        const ch = chapterOfLesson(l.id);
        return opt === 'all' || (opt === 'book' ? !!ch : !ch);
      }).flatMap(l => {
        const ch = chapterOfLesson(l.id);
        const sub = ch ? chDeck(ch) : `Beyond the book::${l.title}`;
        return (l.cues || []).map(([q, a]) => ({
          id: `c:${l.id}:${hash(q)}`, deck: `${ROOT}::3 Lesson cues::${sub}`, front: q, back: a, extra: '',
          source: `Lesson: ${l.title}`, tags: [ROOT.toLowerCase(), 'cue', ch ? `ch${pad2(ch.n)}` : 'beyond-book'],
        }));
      });
    },
  },
  {
    id: 'facts', title: 'Facts to memorise', desc: 'Ports, AD values, OSI layers, masks, IOS modes, router memory.',
    options: [['all', 'All facts']], def: 'all',
    build() {
      const out = [];
      const f = (id, sub, front, back, extra = '') => out.push({ id: `f:${id}`, deck: `${ROOT}::4 Facts::${sub}`, front, back, extra, source: 'CCNA-Q facts', tags: [ROOT.toLowerCase(), 'facts', sub.toLowerCase().replace(/[^a-z]+/g, '-')] });
      for (const [p, port] of PORTS) f(`port:${hash(p)}`, 'Ports', `Port for ${p}?`, port);
      for (const [src, ad] of AD) f(`ad:${hash(src)}`, 'Administrative distance', `Default AD of ${src}?`, String(ad), 'Lower = more trusted. Only compared for the same prefix.');
      for (const [item, l] of OSI) f(`osi:${hash(item)}`, 'OSI layers', `${item}: which OSI layer?`, LAYER[l]);
      for (let p = 16; p <= 30; p++) {
        const m = (0xffffffff << (32 - p)) >>> 0;
        const o = [24, 16, 8, 0].map(s => (m >>> s) & 255);
        const k = Math.floor((p - 1) / 8);
        f(`mask:${p}`, 'Masks', `/${p}: mask, block size, usable hosts?`, `${o.join('.')} · block ${256 - o[k]} (octet ${k + 1}) · ${(2 ** (32 - p) - 2).toLocaleString()} hosts`, `Wildcard ${o.map(x => 255 - x).join('.')}`);
      }
      for (const [prompt, mode] of CLI_MODES) f(`mode:${hash(prompt)}`, 'IOS modes', `Which mode is "${prompt}"?`, mode);
      for (const [cmd, mode] of CLI_WHERE) f(`where:${hash(cmd)}`, 'IOS modes', `Which mode do you type: ${cmd}`, mode);
      for (const [item, where] of MEM) f(`mem:${hash(item)}`, 'Router memory', `Where is the ${item.toLowerCase()} stored?`, where);
      return out;
    },
  },
  {
    id: 'mine', title: 'My stuff', desc: 'Your own terms, your Cornell cues, quiz/self-test misses, drill misses, struggling terms.',
    options: [['all', 'Everything of mine'], ['weak', 'Only misses + struggling terms']], def: 'all',
    build(opt) {
      const s = db();
      const out = [];
      const mine = ROOT.toLowerCase();
      // misses with a known answer
      const seen = new Set();
      for (const m of s.missed) {
        if (!m.note || seen.has(m.note)) continue;
        seen.add(m.note);
        out.push({
          id: `m:${hash(m.note)}`, deck: `${ROOT}::5 Mine::Weak spots`, front: m.note, back: m.answer || '(check your mistake log)',
          extra: [m.pick ? `You said: ${m.pick}` : '', m.topic ? `Topic: ${m.topic}` : ''].filter(Boolean).join('\n'),
          source: `Missed · ${m.src || 'app'}`, tags: [mine, 'mine', 'weak'],
        });
      }
      for (const [d, st] of Object.entries(s.drills)) for (const m of st.misses || []) {
        if (seen.has(m.q)) continue;
        seen.add(m.q);
        out.push({ id: `dm:${hash(m.q)}`, deck: `${ROOT}::5 Mine::Weak spots`, front: m.q, back: m.a, extra: m.pick ? `You said: ${m.pick}` : '', source: `Drill miss · ${d}`, tags: [mine, 'mine', 'weak', 'drill'] });
      }
      // struggling glossary terms (same id as the glossary card → just tagged weak if both exported)
      for (const [id, c] of Object.entries(s.terms)) {
        const g = GLOSSARY.find(t => t.id === id);
        if (!g || (c.lapses || 0) < 2) continue;
        out.push({ id: `g:${id}`, deck: `${ROOT}::5 Mine::Weak spots`, front: g.term, back: g.def, extra: c.note ? `Mnemonic: ${c.note}` : '', source: 'CCNA-Q glossary · struggling', tags: [mine, 'glossary', 'weak'] });
      }
      if (opt === 'weak') return out;
      for (const [id, c] of Object.entries(s.terms)) {
        if (!c.custom) continue;
        out.push({ id: `u:${id}`, deck: `${ROOT}::5 Mine::My terms`, front: c.term, back: c.def || '(add a definition in the app)', extra: c.ctx || '', source: 'My term', tags: [mine, 'mine'] });
      }
      for (const [key, n] of Object.entries(s.notes)) for (const cue of n.cues || []) {
        if (!cue.q?.trim()) continue;
        out.push({ id: `n:${key}:${hash(cue.q)}`, deck: `${ROOT}::5 Mine::My cues`, front: cue.q, back: cue.a || '(answer is in your notebook)', extra: '', source: `My Cornell notes · ${topicTitle(key)}`, tags: [mine, 'mine', 'cue'] });
      }
      return out;
    },
  },
  {
    id: 'custom', title: 'Custom cards', desc: 'Anything you type below: one card per line, "front ; back".',
    options: [['all', 'All custom cards']], def: 'all',
    build() {
      return parseCustom(db().anki?.custom || '').map(([front, back]) => ({
        id: `x:${hash(front)}`, deck: `${ROOT}::6 Custom`, front, back, extra: '', source: 'Custom card', tags: [ROOT.toLowerCase(), 'custom'],
      }));
    },
  },
];

/** "front ; back" or "front<TAB>back", one per line. */
export function parseCustom(text) {
  return String(text).split('\n').map(l => l.trim()).filter(Boolean)
    .map(l => (l.includes('\t') ? l.split('\t') : l.split(/\s;\s|;/)))
    .filter(p => p.length >= 2 && p[0].trim() && p.slice(1).join(';').trim())
    .map(p => [p[0].trim(), p.slice(1).join(';').trim()]);
}

/** Build the selected sources and merge notes that share an id (union of tags). */
export function collectNotes(selection) {
  const byId = new Map();
  for (const src of SOURCES) {
    const sel = selection[src.id];
    if (!sel?.on) continue;
    for (const n of src.build(sel.opt || src.def)) {
      const prev = byId.get(n.id);
      if (prev) prev.tags = [...new Set([...prev.tags, ...n.tags])];
      else byId.set(n.id, { ...n, tags: [...n.tags] });
    }
  }
  return [...byId.values()];
}

/** Short content hash per note, to tell what changed since the last export. */
export const noteHash = n => hash(`${n.deck}|${n.front}|${n.back}|${n.extra}|${n.tags.join(',')}`);

export const defaultSelection = () => Object.fromEntries(SOURCES.map(s => [s.id, { on: true, opt: s.def }]));

