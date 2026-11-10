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
  for (const m of Object.values(LOCAL_MODELS)) assert.ok(/^[\w-]+\/[\w.-]+$/.test(m.id) && (!m.mirrorOnly || m.mirror) && m.size > 0 && m.ctx >= 2000, m.id);
});

test('mirror fetch serves split model files from the books repo, else falls back', async () => {
  const { mirrorFetch } = await import('../js/localllm.js');
  const model = { id: 'org/model', mirror: 'models/m' };
  const parts = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5]), new Uint8Array([6])];
  const manifest = { files: { 'config.json': { size: 2 }, 'onnx/w.onnx_data': { size: 6, parts: ['w.onnx_data.part00', 'w.onnx_data.part01', 'w.onnx_data.part02'] } } };
  const asked = [];
  const raw = async path => {
    asked.push(path);
    if (path === 'models/m/config.json') return new Response('{}');
    const k = +path.slice(-2);
    return new Response(parts[k]);
  };
  const fallback = [];
  const base = async url => { fallback.push(String(url)); return new Response('hf'); };
  const f = mirrorFetch(model, manifest, raw, base);
  const pre = 'https://huggingface.co/org/model/resolve/main/';
  const whole = new Uint8Array(await (await f(`${pre}onnx/w.onnx_data`)).arrayBuffer());
  assert.deepEqual([...whole], [1, 2, 3, 4, 5, 6], 'parts streamed back together in order');
  assert.deepEqual(asked, ['models/m/onnx/w.onnx_data.part00', 'models/m/onnx/w.onnx_data.part01', 'models/m/onnx/w.onnx_data.part02']);
  const probe = await f(`${pre}onnx/w.onnx_data`, { headers: { Range: 'bytes=0-0' } });
  assert.equal(probe.status, 206);
  assert.equal(probe.headers.get('content-range'), 'bytes 0-0/6');
  assert.equal(await (await f(`${pre}config.json`)).text(), '{}');
  assert.equal(await (await f(`${pre}onnx/model_q4.onnx`)).text(), 'hf', 'files not in the mirror come from Hugging Face');
  assert.equal(await (await f('http://localhost/app.js')).text(), 'hf');
  assert.deepEqual(fallback, [`${pre}onnx/model_q4.onnx`, 'http://localhost/app.js']);
});

test('mirror-only models never fall back to Hugging Face', async () => {
  const { mirrorFetch } = await import('../js/localllm.js');
  const model = { id: 'ccnaq/x', mirror: 'models/x', mirrorOnly: true };
  const f = mirrorFetch(model, { files: { 'config.json': { size: 2 } } }, async () => new Response('{}'), async () => { throw new Error('should not reach Hugging Face'); });
  assert.equal((await f('https://huggingface.co/ccnaq/x/resolve/main/preprocessor_config.json')).status, 404);
  assert.equal(await (await f('https://huggingface.co/ccnaq/x/resolve/main/config.json')).text(), '{}');
});

test('mirror streams big files to disk while delivering them, then serves them from the cache', async () => {
  const { mirrorFetch } = await import('../js/localllm.js');
  const store = new Map();
  const cache = { match: async u => store.get(u)?.clone(), put: async (u, r) => { const b = new Uint8Array(await r.arrayBuffer()); store.set(u, new Response(b, { headers: r.headers })); } };
  let fetched = 0;
  const raw = async p => { fetched++; return new Response(new Uint8Array(p.endsWith('0') ? [1, 2] : [3])); };
  const model = { id: 'ccnaq/x', mirror: 'm', mirrorOnly: true };
  const f = mirrorFetch(model, { files: { 'onnx/w': { size: 3, parts: ['w.part0', 'w.part1'] } } }, raw, null, cache);
  const url = 'https://huggingface.co/ccnaq/x/resolve/main/onnx/w';
  assert.deepEqual([...new Uint8Array(await (await f(url)).arrayBuffer())], [1, 2, 3]);
  await new Promise(r => setTimeout(r, 20)); // let the disk branch finish
  assert.equal(fetched, 2);
  assert.deepEqual([...new Uint8Array(await (await f(url)).arrayBuffer())], [1, 2, 3], 'second time from the cache');
  assert.equal(fetched, 2, 'no new download');
});
