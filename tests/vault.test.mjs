import test from 'node:test';
import assert from 'node:assert/strict';
import { seal, open, makePassphrase, strengthBits, MIN_BITS } from '../js/vault.js';
import { WORDS } from '../js/data/words.js';

test('vault seals and opens the token only with the right passphrase', async () => {
  const secret = { token: 'github_pat_abc123', repo: 'me/books', branch: 'main' };
  const v = await seal(secret, 'acorn bagel cider dwell envoy', 1000); // fewer rounds just for the test
  assert.equal(v.kdf, 'PBKDF2-SHA256');
  assert.ok(!JSON.stringify(v).includes('github_pat'), 'token is not visible in the vault');
  assert.deepEqual(await open(v, 'acorn bagel cider dwell envoy'), secret);
  assert.deepEqual(await open(v, '  Acorn  Bagel-Cider dwell ENVOY '), secret, 'spacing/case/hyphens forgiven');
  await assert.rejects(open(v, 'acorn bagel cider dwell envoi'), /Wrong passphrase/);
  const tampered = { ...v, ct: v.ct.slice(0, -4) + (v.ct.endsWith('AAAA') ? 'BBBB' : 'AAAA') };
  await assert.rejects(open(tampered, 'acorn bagel cider dwell envoy'), /Wrong passphrase/, 'tampering is detected');
  const v2 = await seal(secret, 'acorn bagel cider dwell envoy', 1000);
  assert.notEqual(v2.ct, v.ct, 'fresh salt/IV every time');
});

test('generated passphrases are five list words and pass the strength check; weak ones fail', () => {
  assert.equal(WORDS.length, 1296);
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const p = makePassphrase(5);
    const ws = p.split(' ');
    assert.equal(ws.length, 5);
    assert.ok(ws.every(w => WORDS.includes(w)));
    seen.add(p);
  }
  assert.equal(seen.size, 200);
  assert.ok(strengthBits(makePassphrase(5)) >= MIN_BITS);
  for (const weak of ['password', 'ccna2027', 'acorn bagel cider', 'Summer2026!']) assert.ok(strengthBits(weak) < MIN_BITS, weak);
});
