import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanQuestions, ruleCues, prose, sections } from '../js/cuegen.js';
import { LESSONS } from '../js/data/lessons.js';

test('cleanQuestions keeps questions only and strips any answer after "?"', () => {
  const raw = 'Here are six questions:\n1. Why does OSPF elect a DR? Because it cuts flooding.\n2) How do routers pick a router ID?\n- What is a passive interface? It sends no hellos.\nAnswer: the DR\n"When would you raise OSPF priority?"\nWhy does OSPF elect a DR?\nok';
  const qs = cleanQuestions(raw);
  assert.deepEqual(qs, ['Why does OSPF elect a DR?', 'How do routers pick a router ID?', 'What is a passive interface?', 'When would you raise OSPF priority?']);
  for (const q of qs) assert.ok(q.endsWith('?') && q.indexOf('?') === q.length - 1);
});

test('built-in suggestions: questions only, on-topic, varied, for every lesson', () => {
  for (const l of LESSONS) {
    const text = prose(l.body);
    const qs = ruleCues(text, 6);
    assert.ok(qs.length >= (l.id.endsWith('-summary') ? 1 : 3), `${l.id}: only ${qs.length}`);
    for (const q of qs) assert.ok(q.endsWith('?') && q.split('?').length === 2, `${l.id}: ${q}`);
    assert.equal(new Set(qs).size, qs.length);
    assert.ok(!qs.some(q => /\b(router|switch|frame|packet)\b work/i.test(q)), `${l.id}: generic question`);
  }
  const t = prose(LESSONS.find(l => l.id === 'transport').body);
  assert.ok(ruleCues(t).includes('How is TCP different from UDP?'));
  assert.notDeepEqual(ruleCues(t, 6, 0), ruleCues(t, 6, 1), '"More" gives a different set');
  assert.ok(sections(LESSONS.find(l => l.id === 'ospf').body).length >= 3);
});

test('cue prompt carries key terms and the question mix; clean-up removes the prompt showing through', async () => {
  const { cuePrompt, polishCues } = await import('../js/cuegen.js');
  const u = cuePrompt('OSPF routers elect a DR and BDR on each broadcast segment; the highest priority wins.', { background: 'Priority 0 means never DR.' }).at(-1).content;
  assert.match(u, /Key terms: .*OSPF/);
  assert.match(u, /what happens if something fails/);
  assert.ok(u.indexOf('Background facts') < u.indexOf('Text:') && u.indexOf('Text:') < u.indexOf('Write 6 questions'));
  assert.ok(!/Example/i.test(u), 'no worked example: a 360M model copies it');
  assert.deepEqual(polishCues([
    'What does the text say about the transport layer?',
    'How does the text describe a broadcast storm?',
    'What does the text say happens when a link fails?',
    'Why does the DR exist?',
    'What is the purpose of the text\'s own terms?',
    'Why does the passage mention hubs?',
  ]), ['What are the key points about the transport layer?', 'How would you describe a broadcast storm?', 'What happens when a link fails?', 'Why does the DR exist?']);
});
