import test from 'node:test';
import assert from 'node:assert/strict';
import { db, update, resetAll } from '../js/store.js';
import { buildOutbox, markWritten, undoWritten, addFromPaper, topicStats, weekSummary, nextFreePage, findTerm, hash } from '../js/sync.js';
import { blankCard } from '../js/srs.js';

test('app activity becomes "to write" items, and ticking them off sticks', () => {
  resetAll();
  update(s => {
    s.missed.push({ id: 'x1', topic: 'Ch 8: Routing Fundamentals & Subnets', note: 'Hosts in a /28?', pick: '16', answer: '14', ch: '8', at: Date.now(), src: 'quiz' });
    s.terms['native-vlan'] = { ...blankCard(), status: 2, lapses: 3, lesson: 'vlans' };
    s.terms['u-my-word'] = { ...blankCard(), status: 1, custom: true, term: 'my word', def: 'mine', lesson: 'ch8-routing' };
    s.drills.ports = { n: 3, ok: 1, streak: 0, best: 1, misses: [{ q: 'Port for TFTP?', a: 'UDP 69', pick: 'TCP 69', at: 1000 }] };
    s.subnet.history.push({ type: 'net', ok: false, ms: 20000, at: 2000, day: 'x', q: 'Network address of 10.1.1.77/26?', a: '10.1.1.64' });
    s.book[2] = { status: 'done', doneAt: Date.now() };
    s.notes[2] = { cues: [{ q: 'What are the 5 steps?', a: 'data → bits' }], notes: '', summary: '' };
  });
  const items = buildOutbox();
  const kinds = items.map(i => i.kind);
  for (const k of ['mistake', 'summary', 'term', 'cue', 'drill']) assert.ok(kinds.includes(k), `missing ${k}: ${kinds}`);
  const mistake = items.find(i => i.kind === 'mistake');
  assert.match(mistake.lines.join('\n'), /I said: 16/);
  assert.match(mistake.lines.join('\n'), /✓ 14/);
  assert.match(mistake.page, /154/);
  const term = items.find(i => i.termId === 'native-vlan');
  assert.equal(term.key, 'vlans');
  assert.match(term.page, /72–75/); // planned VLAN spread
  assert.equal(items.filter(i => i.kind === 'drill').length, 2); // ports → p.4, subnet → p.3
  assert.ok(items.find(i => i.drill === 'ports').where.includes('p.4'));

  // tick everything off
  for (const it of items) markWritten(it);
  assert.equal(buildOutbox().length, 0);
  assert.equal(db().terms['native-vlan'].onPaper, true);
  assert.equal(db().notes[2].cues[0].paper, true);

  // a new drill miss after the cut shows up again
  update(s => { s.drills.ports.misses.push({ q: 'Port for SSH?', a: 'TCP 22', pick: '23', at: Date.now() }); });
  const again = buildOutbox();
  assert.equal(again.length, 1);
  assert.deepEqual(again[0].lines.slice(1), ['Port for SSH → TCP 22']);

  // undo brings a term back
  undoWritten('t:native-vlan');
  assert.ok(buildOutbox().some(i => i.termId === 'native-vlan'));
  assert.equal(db().terms['native-vlan'].onPaper, false);
});

test('things written on paper land in the right place in the app', () => {
  resetAll();
  addFromPaper('mistake', '20', { source: 'Boson', wrong: 'Placed a standard ACL near the source', right: 'Standard ACL near the destination' });
  addFromPaper('cue', '20', { q: 'Where do extended ACLs go?', a: 'Near the source' });
  addFromPaper('term', '20', { term: 'implicit deny', status: 3 });
  addFromPaper('term', 'ospf', { term: 'LSA flooding', def: 'my own definition', status: 1 });
  addFromPaper('note', '20', { text: 'access-class for VTY, access-group for interfaces' });
  const s = db();
  assert.equal(s.missed.at(-1).paper, true);
  assert.equal(s.missed.at(-1).src, 'Boson');
  assert.equal(s.notes['20'].cues[0].paper, true);
  assert.match(s.notes['20'].notes, /access-class/);
  const id = findTerm('implicit deny').id;
  assert.equal(s.terms[id].status, 3);
  assert.equal(s.terms[id].onPaper, true);
  assert.ok(Object.values(s.terms).some(c => c.custom && c.term === 'LSA flooding' && c.onPaper));
  // already on paper → nothing new to write for them
  assert.equal(buildOutbox().filter(i => ['mistake', 'cue', 'term'].includes(i.kind)).length, 0);
  // but the chapter's stats count the miss as on paper
  const st = topicStats('20');
  assert.equal(st.misses, 1);
  assert.equal(st.missesOnPaper, 1);
});

test('weekly summary and page suggestions', () => {
  resetAll();
  update(s => {
    s.plan.hours.push({ date: '2026-11-10', hours: 2, kind: 'theory' }, { date: '2026-11-11', hours: 1.5, kind: 'practice' });
    s.book[1] = { status: 'done', doneAt: new Date('2026-11-12T20:00').getTime() };
    s.missed.push({ topic: 'Ch 1: Introduction to Networking', note: 'hex', at: new Date('2026-11-13T20:00').getTime() });
  });
  const w = weekSummary(1);
  assert.match(w[0], /2\.0 theory \/ 1\.5 practice \(target 60\/40\)/);
  assert.match(w[1], /Chapters done: 1/);
  assert.match(w[3], /Ch 1: Introduction to Networking/);
  assert.equal(nextFreePage(), 10);
  update(s => { s.book[1].nb = '10-11'; });
  assert.equal(nextFreePage(), 12);
  assert.equal(typeof hash('a'), 'string');
});
