// All user data lives in one localStorage record. Export/import gives a backup
// (iOS can evict storage for home-screen apps that go unused for weeks).

const KEY = 'ccnaq.v1';

const defaults = () => ({
  version: 1,
  terms: {},        // termId -> { status 0..5 | -1, ease, ivl, due, reps, lapses, ctx, lesson, def, term, custom }
  lessons: {},      // lessonId -> { done, openedAt }
  imports: [],      // user-imported texts { id, title, text, domain, created }
  subnet: { streak: 0, best: 0, history: [], types: null, prefixMin: 16, prefixMax: 30 },
  plan: { checks: {}, chapters: {}, hours: [], daily: {} },
  labs: { current: 'hello', topos: {} },
  missed: [],       // weak-topic log { topic, note, at }
  book: {},         // chapter -> { status: todo|reading|done, page, items }
  notes: {},        // chapter -> { cues: [{q, a}], notes, summary }
  quiz: {},         // chapter|'exam' -> { best, last, attempts, at }
  drills: {},       // drillId -> { n, ok, streak, best }
  nb: {},           // lessonId -> paper notebook page (topics beyond the book)
  settings: { examDate: '2027-01-29', cutoff: '2027-02-02', fontScale: 1 },
});

let state = load();
const subs = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    return merge(defaults(), JSON.parse(raw));
  } catch {
    return defaults();
  }
}

function merge(base, over) {
  for (const k of Object.keys(over || {})) {
    if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) && over[k] && typeof over[k] === 'object' && !Array.isArray(over[k])) {
      base[k] = merge(base[k], over[k]);
    } else base[k] = over[k];
  }
  return base;
}

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('save failed', e); }
  }, 150);
  subs.forEach(f => f(state));
}

export const db = () => state;
export function update(fn) { fn(state); save(); }
export function onChange(f) { subs.add(f); return () => subs.delete(f); }

export function exportJson() { return JSON.stringify(state, null, 1); }
export function importJson(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !parsed.terms) throw new Error('Not a CCNA-Q backup file');
  state = merge(defaults(), parsed);
  save();
}
export function resetAll() { state = defaults(); save(); }

// ask the browser not to evict our data
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
