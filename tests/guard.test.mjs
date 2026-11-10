import test from 'node:test';
import assert from 'node:assert/strict';
import { review, sentences, answerable } from '../js/guard.js';

const src = [
  { name: 'OCG', p: 504, text: 'Routers elect the DR based on the highest OSPF interface priority. If priorities tie, the highest router ID wins. If the DR fails, the BDR becomes the DR, and a new BDR is elected.' },
  { name: 'OCG', p: 60, text: 'Place extended ACLs as close as possible to the source of the packet. Place standard ACLs as close as possible to the destination of the packet.' },
];

test('supported sentences are kept with citations; invented, flipped and off-topic ones are removed', () => {
  const draft = `Here's how it works:
1. The DR is elected based on the highest OSPF interface priority.
2. If the DR fails, the BDR becomes the DR.
3. If priorities tie, the lowest router ID wins.
4. The DR election uses priority 255 by default.
5. OSPF also uses EIGRP feasible successors to pick the DR.
6. The excerpts explain how the DR is chosen.
7. Place standard ACLs as close as possible to the source of the packet.`;
  const r = review(draft, src);
  assert.deepEqual(r.kept.map(k => k.s), ['The DR is elected based on the highest OSPF interface priority.', 'If the DR fails, the BDR becomes the DR.']);
  assert.deepEqual(r.kept.map(k => k.cite.p), [504, 504]);
  const why = Object.fromEntries(r.dropped.map(d => [d.s.slice(0, 22), d.why]));
  assert.match(why['If priorities tie, the'], /contradicts.*lowest ≠ highest/);
  assert.match(why['The DR election uses p'], /number|supported/);
  assert.match(why['OSPF also uses EIGRP f'], /term|supported/);
  assert.match(why['The excerpts explain h'], /not about the topic/);
  assert.match(why['Place standard ACLs as'], /contradicts.*(source ≠ destination|standard ≠ extended)/);
  assert.equal(r.ok, false, '2 of 7 is not enough: show the book instead');
  assert.equal(review('Place extended ACLs as close as possible to the source of the packet. Place standard ACLs as close as possible to the destination of the packet.', src).ok, true);
});

test('sentence splitting copes with copied excerpt markers, lists and headings', () => {
  assert.deepEqual(sentences('[1] First fact here. [2] Second fact here.\n- Third one.'), ['First fact here.', 'Second fact here.', 'Third one.']);
  assert.equal(review('Mismatched Native VLAN on a Trunk', src).kept.length, 0);
});

test('off-topic questions never reach the model', () => {
  assert.equal(answerable([{ score: 10, cover: 0.5 }], 'Who won the world cup in 2022?'), false);
  assert.equal(answerable([{ score: 10, cover: 1 }], 'What is PortFast?'), true);
  assert.equal(answerable([], 'What is OSPF?'), false);
});
