import test from 'node:test';
import assert from 'node:assert/strict';
import { fitHistory, LOCAL_MODELS } from '../js/localllm.js';

test('long conversations keep the newest complete exchanges within the budget', () => {
  const hist = [];
  for (let i = 0; i < 40; i++) hist.push({ role: 'user', content: `question ${i} ${'x'.repeat(400)}` }, { role: 'assistant', content: `answer ${i} ${'y'.repeat(1200)}` });
  const kept = fitHistory(hist, 'e'.repeat(4000), 3000);
  assert.ok(kept.length >= 2 && kept.length % 2 === 0, 'whole pairs only');
  assert.equal(kept[0].role, 'user');
  assert.match(kept.at(-1).content, /^answer 39/, 'newest exchange kept');
  const chars = kept.reduce((a, m) => a + m.content.length, 0);
  assert.ok(chars / 4 + 1000 + 450 <= 3000 + 200, 'fits the budget');
  assert.deepEqual(fitHistory(hist, 'e'.repeat(20000), 3000), [], 'no room → no history');
  for (const m of Object.values(LOCAL_MODELS)) assert.ok(m.id.startsWith('onnx-community/') && m.size > 0 && m.ctx >= 2000);
});
