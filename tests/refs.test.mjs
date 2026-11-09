import test from 'node:test';
import assert from 'node:assert/strict';
import { chunk, tidy, makeIndex, search } from '../js/refs.js';
import { onTopic, cuePrompt, cleanQuestions } from '../js/cuegen.js';
import { bankAdd, bankList, addToNotes, inNotes } from '../js/cuebank.js';
import { db } from '../js/store.js';

const pages = [
  { p: 1, text: 'Spanning Tree Protocol prevents layer 2 loops. Switches elect a root bridge using the lowest bridge ID. The bridge ID is the priority plus the MAC address.' },
  { p: 2, text: 'OSPF is a link-state routing protocol. Routers exchange LSAs and run the SPF algorithm. On multiaccess segments OSPF elects a DR and BDR to reduce flooding.' },
  { p: 3, text: 'Extended ACLs filter on source, destination, protocol and port. Place extended ACLs close to the source. Every ACL ends with an implicit deny any.' },
  { p: 4, text: 'Hyphen-\nated words are joined.   Spaces   collapse.' },
];

test('PDF text is tidied and chunked with page numbers', () => {
  assert.equal(tidy('Hyphen-\nated  x'), 'Hyphenated x');
  const cs = chunk(pages, 120);
  assert.ok(cs.length >= 4);
  assert.deepEqual([...new Set(cs.map(c => c.p))], [1, 2, 3, 4]);
  for (const c of cs) assert.ok(c.text.length <= 200, c.text);
  assert.ok(cs.some(c => c.text.includes('Hyphenated words')));
  assert.deepEqual(cs.map(c => c.i), cs.map((_, i) => i));
  // one giant run-on page still gets split
  assert.ok(chunk([{ p: 9, text: 'x'.repeat(3000) }], 700).length >= 4);
});

test('library search finds the relevant pages and skips unrelated ones', () => {
  const idx = makeIndex([{ id: 'd1', name: 'Guide', chunks: chunk(pages, 400) }]);
  const ospf = search(idx, 'How does OSPF pick a DR on an Ethernet segment, and why does it flood LSAs?', { k: 2 });
  assert.equal(ospf[0].p, 2);
  assert.equal(ospf[0].name, 'Guide');
  assert.equal(search(idx, 'root bridge election and bridge priority', { k: 1 })[0].p, 1);
  assert.deepEqual(search(idx, 'wireless WLC lightweight access points'), []);
  // a passage never gets itself back as background
  const self = search(idx, pages[2].text, { k: 3, exclude: { doc: 'd1', i: 2 } });
  assert.ok(!self.some(x => x.i === 2));
  assert.deepEqual(search(makeIndex([]), 'anything'), []);
});

test('off-topic model questions are dropped', () => {
  const text = 'OSPF routers flood LSAs and every router runs SPF. On Ethernet segments a DR is elected.';
  const qs = cleanQuestions('1. Why does OSPF flood LSAs?\n2. What is the difference between RIPv2 and EIGRP?\n3. How is the DR elected?\n4. What is a sandwich?');
  assert.deepEqual(onTopic(qs, text), ['Why does OSPF flood LSAs?', 'How is the DR elected?']);
  // background text counts as on topic
  assert.equal(onTopic(['How does EIGRP differ from OSPF?'], `${text}\nEIGRP is an advanced distance-vector protocol.`).length, 1);
});

test('prompt puts instructions after the text and keeps background short', () => {
  const m = cuePrompt('T'.repeat(5000), { background: 'B'.repeat(5000) });
  const u = m.at(-1).content;
  assert.ok(u.indexOf('Background') < u.indexOf('Text:') && u.indexOf('Text:') < u.indexOf('Write 6 questions'));
  assert.ok(u.length < 2700);
  assert.ok(!cuePrompt('abc').at(-1).content.includes('Background'));
});

test('every suggestion is saved to the bank, once', () => {
  assert.equal(bankAdd(['Why does OSPF elect a DR?', 'How is the root bridge chosen?'], { topic: '9', src: 'lesson', engine: 'ai' }), 2);
  assert.equal(bankAdd(['why does OSPF elect a DR?', 'What does PortFast skip?'], { topic: '9' }), 1);
  assert.equal(bankList({ topic: '9' }).length, 3);
  assert.equal(bankList({ topic: '9' })[0].q, 'What does PortFast skip?', 'newest first');
  addToNotes('9', 'How is the root bridge chosen?');
  assert.ok(inNotes('9', 'How is the root bridge chosen?'));
  assert.equal(db().notes['9'].cues.at(-1).a, '');
  assert.equal(bankList({ topic: '9', unused: true }).length, 2);
  addToNotes('9', 'How is the root bridge chosen?');
  assert.equal(db().notes['9'].cues.filter(c => c.q === 'How is the root bridge chosen?').length, 1, 'no duplicate cue');
});

test('background keeps only the sentences that match the passage', async () => {
  const { asBackground } = await import('../js/refs.js');
  const hits = [{ text: 'OSPF elects a DR on multiaccess segments. The cafeteria opens at noon. The DR priority defaults to 1 and the highest wins.' }];
  const bg = asBackground(hits, 'How does OSPF choose the DR and what does priority do?');
  assert.ok(bg.includes('elects a DR') && bg.includes('priority defaults'));
  assert.ok(!bg.includes('cafeteria'));
  assert.ok(bg.indexOf('elects') < bg.indexOf('priority'), 'reading order kept');
  assert.equal(asBackground([], 'x'), '');
  assert.ok(asBackground([{ text: 'Spanning tree blocks redundant ports. '.repeat(40) }], 'spanning tree ports').length <= 480);
});
