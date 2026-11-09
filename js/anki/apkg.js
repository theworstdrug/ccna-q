// Build an Anki .apkg (legacy collection.anki2, schema 11 — the format genanki produces,
// which every current Anki desktop/AnkiMobile/AnkiDroid imports).
//
// Notes carry a stable GUID derived from their CCNA-Q id, so importing a newer export
// UPDATES existing notes instead of duplicating them, and your review history is kept.

import { zipStore } from './zip.js';

export const MODEL_ID = 1731180000123;           // fixed, so re-imports reuse the same note type
export const MODEL_NAME = 'CCNA-Q Basic';
export const FIELDS = ['Front', 'Back', 'Extra', 'Source', 'Id'];
export const CSS = `.card { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; font-size: 20px; text-align: center; color: #14171c; background: #fff; line-height: 1.45; }
.card.nightMode { color: #e5e8ed; background: #16191e; }
.back { margin-top: 6px; }
.extra { margin-top: 14px; font-size: 15px; color: #677180; }
.src { margin-top: 18px; font-size: 12px; color: #9aa3ae; }
code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: .9em; }`;
export const QFMT = '{{Front}}';
export const AFMT = '{{FrontSide}}<hr id="answer"><div class="back">{{Back}}</div>{{#Extra}}<div class="extra">{{Extra}}</div>{{/Extra}}<div class="src">{{Source}}</div>';

const SCHEMA = `
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);`;

const DCONF = {
  1: {
    autoplay: true, id: 1, lapse: { delays: [10], leechAction: 0, leechFails: 8, minInt: 1, mult: 0 }, maxTaken: 60, mod: 0, name: 'Default',
    new: { bury: true, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 7], order: 1, perDay: 20, separate: true },
    replayq: true, rev: { bury: true, ease4: 1.3, fuzz: 0.05, ivlFct: 1, maxIvl: 36500, minSpace: 1, perDay: 200 }, timer: 0, usn: 0,
  },
};

/** Stable positive deck id from its name. */
export function deckId(name) {
  let h = 2166136261;
  for (const ch of name) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return 1500000000000 + (h % 400000000);
}

const deckJson = (id, name, now) => ({
  collapsed: false, conf: 1, desc: '', dyn: 0, extendNew: 0, extendRev: 50, id, lrnToday: [0, 0], mod: now,
  name, newToday: [0, 0], revToday: [0, 0], timeToday: [0, 0], usn: -1,
});

const strip = s => String(s).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

async function sha1Hex(text) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Escape plain text for an Anki field; keeps line breaks and `code`. */
export function field(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    .replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\n/g, '<br>');
}

/**
 * notes: [{ id, deck, front, back, extra?, source?, tags?[] }]  (front/back are plain text)
 * SQL: an initialised sql.js module.  Returns the .apkg bytes.
 */
export async function buildApkg(SQL, notes, { now = Date.now() } = {}) {
  const db = new SQL.Database();
  db.run(SCHEMA);
  const nowSec = Math.floor(now / 1000);
  const deckNames = [...new Set(notes.map(n => n.deck))];
  const decks = { 1: deckJson(1, 'Default', nowSec) };
  for (const name of deckNames) decks[deckId(name)] = deckJson(deckId(name), name, nowSec);
  const firstDeck = deckId(deckNames[0] || 'CCNA-Q');
  const model = {
    css: CSS, did: firstDeck,
    flds: FIELDS.map((name, ord) => ({ name, ord, font: 'Arial', media: [], rtl: false, size: 20, sticky: false })),
    id: String(MODEL_ID),
    latexPost: '\\end{document}',
    latexPre: '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n',
    latexsvg: false, mod: nowSec, name: MODEL_NAME, req: [[0, 'any', [0]]], sortf: 0, tags: [],
    tmpls: [{ afmt: AFMT, bafmt: '', bqfmt: '', did: null, name: 'Card 1', ord: 0, qfmt: QFMT }],
    type: 0, usn: -1, vers: [],
  };
  const conf = {
    activeDecks: [1], addToCur: true, collapseTime: 1200, curDeck: 1, curModel: String(MODEL_ID), dueCounts: true, estTimes: true,
    newBury: true, newSpread: 0, nextPos: notes.length + 1, sortBackwards: false, sortType: 'noteFld', timeLim: 0,
  };
  db.run('INSERT INTO col VALUES (1,?,?,?,11,0,0,0,?,?,?,?,?)', [
    nowSec, now, now, JSON.stringify(conf), JSON.stringify({ [MODEL_ID]: model }), JSON.stringify(decks), JSON.stringify(DCONF), '{}',
  ]);
  const insNote = db.prepare('INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const insCard = db.prepare('INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  let id = now;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    const flds = [field(n.front), field(n.back), field(n.extra), field(n.source), n.id];
    const sort = strip(flds[0]);
    const guid = `cq${(await sha1Hex(`ccna-q:${n.id}`)).slice(0, 14)}`;
    const csum = parseInt((await sha1Hex(sort)).slice(0, 8), 16);
    const tags = (n.tags || []).map(t => String(t).replace(/\s+/g, '_')).filter(Boolean);
    const nid = id++;
    insNote.run([nid, guid, MODEL_ID, nowSec, -1, tags.length ? ` ${tags.join(' ')} ` : '', flds.join('\x1f'), sort, csum, 0, '']);
    insCard.run([id++, nid, deckId(n.deck), 0, nowSec, -1, 0, 0, i + 1, 0, 0, 0, 0, 0, 0, 0, 0, '']);
  }
  insNote.free();
  insCard.free();
  const collection = db.export();
  db.close();
  return zipStore([{ name: 'collection.anki2', data: collection }, { name: 'media', data: '{}' }]);
}

// ---------------------------------------------------------------- loading sql.js in the browser

let sqlPromise = null;
/** Load the vendored sql.js (WASM) on first use. */
export function loadSql(base = 'js/vendor/') {
  if (!sqlPromise) {
    sqlPromise = new Promise((resolve, reject) => {
      const init = () => window.initSqlJs({ locateFile: f => `${base}${f}` }).then(resolve, reject);
      if (window.initSqlJs) { init(); return; }
      const s = document.createElement('script');
      s.src = `${base}sql-wasm.js`;
      s.onload = init;
      s.onerror = () => { sqlPromise = null; reject(new Error('Could not load the deck builder (sql.js)')); };
      document.head.append(s);
    });
  }
  return sqlPromise;
}
