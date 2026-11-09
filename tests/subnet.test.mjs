import test from 'node:test';
import assert from 'node:assert/strict';
import { makeQuestion, check, explain, QTYPES } from '../js/subnetq.js';
import { ipToInt } from '../js/sim/net.js';

test('known example from the lesson', () => {
  const e = explain(ipToInt('172.16.45.200'), 27).join('\n');
  assert.match(e, /Block size = 256 − 224 = 32/);
  assert.match(e, /Network 172\.16\.45\.192 · broadcast 172\.16\.45\.223/);
  const e2 = explain(ipToInt('10.20.77.9'), 20).join('\n');
  assert.match(e2, /Network 10\.20\.64\.0 · broadcast 10\.20\.79\.255/);
});

test('every type generates self-consistent answers', () => {
  for (const t of Object.keys(QTYPES)) {
    for (let i = 0; i < 300; i++) {
      const q = makeQuestion([t], 8, 30);
      assert.ok(q.q && q.a !== undefined, t);
      assert.ok(check(q, q.a), `${t}: ${q.q} -> ${q.a}`);
    }
  }
});

test('answer normalisation', () => {
  const q = { kind: 'prefix', a: '26' };
  assert.ok(check(q, '/26'));
  assert.ok(check(q, '255.255.255.192'));
  assert.ok(!check(q, '25'));
  assert.ok(check({ kind: 'yn', a: 'yes' }, 'Y'));
  assert.ok(check({ kind: 'ip', a: '10.0.0.0' }, ' 10.0.0.0 '));
});

test('new subnet types: next subnet, usable host, host bits', () => {
  for (let i = 0; i < 400; i++) {
    for (const t of ['next', 'valid', 'hostbits']) {
      const q = makeQuestion([t], 16, 30);
      assert.ok(check(q, q.a), `${t}: ${q.q} -> ${q.a}`);
    }
  }
  // spot-check maths
  const n = makeQuestion(['next'], 26, 26);
  const [ip] = n.q.match(/\d+\.\d+\.\d+\.\d+/);
  const last = Number(ip.split('.')[3]);
  assert.equal(Number(n.a.split('.')[3]), (last + 64) % 256);
});
