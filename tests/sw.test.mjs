import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('service worker precaches every JS/CSS file', () => {
  const sw = fs.readFileSync('sw.js', 'utf8');
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  // the vendored AI engine is cached on first use (see AI_CACHE in sw.js), not precached
  for (const f of [...walk('js'), ...walk('css')].filter(f => !f.includes('vendor/transformers-'))) assert.ok(sw.includes(`'./${f}'`), `${f} missing from sw.js FILES`);
  assert.ok(sw.includes("'/js/vendor/transformers-'"), 'AI engine has its own cache rule');
});
