import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('service worker precaches every JS/CSS file', () => {
  const sw = fs.readFileSync('sw.js', 'utf8');
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of [...walk('js'), ...walk('css')]) assert.ok(sw.includes(`'./${f}'`), `${f} missing from sw.js FILES`);
});
