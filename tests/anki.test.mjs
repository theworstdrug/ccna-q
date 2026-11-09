import test from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import { update, resetAll } from '../js/store.js';
import { buildApkg, deckId } from '../js/anki/apkg.js';
import { SOURCES, collectNotes, defaultSelection, parseCustom } from '../js/anki/sources.js';
import { crc32 } from '../js/anki/zip.js';
import { blankCard } from '../js/srs.js';

// read our own stored zip back
function unzip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = {};
  let p = 0;
  while (v.getUint32(p, true) === 0x04034b50) {
    const crc = v.getUint32(p + 14, true);
    const size = v.getUint32(p + 18, true);
    const nlen = v.getUint16(p + 26, true);
    const name = new TextDecoder().decode(bytes.slice(p + 30, p + 30 + nlen));
    const data = bytes.slice(p + 30 + nlen, p + 30 + nlen + size);
    assert.equal(crc32(data), crc, `crc of ${name}`);
    files[name] = data;
    p += 30 + nlen + size;
  }
  return files;
}

test('every source builds well-formed notes with unique, stable ids', () => {
  resetAll();
  update(s => {
    s.terms.ospf = { ...blankCard(), status: 2, lapses: 3 };
    s.terms['u-trunk-port'] = { ...blankCard(), status: 1, custom: true, term: 'trunk port', def: 'carries many VLANs' };
    s.missed.push({ note: 'Hosts in a /28?', answer: '14', pick: '16', topic: 'Ch 8', src: 'quiz' });
    s.notes[8] = { cues: [{ q: 'Why rebuild the frame at each hop?', a: 'MACs are per link' }], notes: '', summary: '' };
    s.anki = { custom: 'What is PoE? ; Power over Ethernet\nbad line without separator\nTFTP\tUDP 69' };
  });
  for (const src of SOURCES) {
    const notes = src.build(src.def);
    for (const n of notes) {
      assert.ok(n.id && n.deck.startsWith('CCNA-Q::') && n.front && n.back !== undefined, `${src.id}: ${JSON.stringify(n).slice(0, 80)}`);
      assert.ok(Array.isArray(n.tags) && n.tags.every(t => !/\s/.test(t)), `${src.id} tags`);
    }
    assert.equal(new Set(notes.map(n => n.id)).size, notes.length, `${src.id} ids unique`);
  }
  assert.equal(parseCustom('a ; b\nno separator\nc\td').length, 2);
  const all = collectNotes(defaultSelection());
  assert.ok(all.length > 600, `only ${all.length} notes`);
  const ospf = all.find(n => n.id === 'g:ospf');
  assert.ok(ospf.tags.includes('weak'), 'struggling term is tagged weak once merged');
  assert.equal(all.filter(n => n.id === 'g:ospf').length, 1);
  assert.equal(collectNotes(defaultSelection()).map(n => n.id).join(), all.map(n => n.id).join(), 'stable between runs');
});

test('apkg: zip + SQLite collection that Anki can read', async () => {
  resetAll();
  const SQL = await initSqlJs();
  const notes = collectNotes({ ...defaultSelection(), glossary: { on: true, opt: 'all' } }).slice(0, 50);
  const files = unzip(await buildApkg(SQL, notes, { now: 1767225600000 }));
  assert.deepEqual(Object.keys(files).sort(), ['collection.anki2', 'media']);
  assert.equal(new TextDecoder().decode(files.media), '{}');
  const db = new SQL.Database(files['collection.anki2']);
  const one = q => db.exec(q)[0].values;
  assert.equal(one('select count(*) from notes')[0][0], 50);
  assert.equal(one('select count(*) from cards')[0][0], 50);
  assert.equal(one('select ver from col')[0][0], 11);
  const decks = JSON.parse(one('select decks from col')[0][0]);
  for (const n of notes) assert.ok(decks[deckId(n.deck)], `deck ${n.deck}`);
  const guids = one('select guid from notes').map(r => r[0]);
  assert.equal(new Set(guids).size, 50);
  const again = new SQL.Database(unzip(await buildApkg(SQL, notes, { now: 1767312000000 }))['collection.anki2']);
  assert.deepEqual(again.exec('select guid from notes')[0].values.map(r => r[0]), guids, 'same GUIDs on re-export → Anki updates instead of duplicating');
  const flds = one('select flds from notes')[0][0].split('\x1f');
  assert.equal(flds.length, 5);
  assert.equal(flds[4], notes[0].id);
});
