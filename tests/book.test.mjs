import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS } from '../js/data/book.js';
import { LESSONS, lessonById } from '../js/data/lessons.js';
import { DRILLS, checkAnswer } from '../js/drills.js';
import { LABS } from '../js/sim/labs.js';

test('book has every chapter 1-20 plus appendix A', () => {
  assert.deepEqual(CHAPTERS.map(c => String(c.n)), [...Array.from({ length: 20 }, (_, i) => String(i + 1)), 'A']);
});

test('chapter references resolve', () => {
  for (const c of CHAPTERS) {
    for (const id of c.lessons) assert.ok(lessonById(id), `ch ${c.n}: lesson ${id}`);
    for (const d of c.drills) assert.ok(DRILLS[d], `ch ${c.n}: drill ${d}`);
    for (const l of c.labs || []) assert.ok(LABS.find(x => x.id === l), `ch ${c.n}: lab ${l}`);
    assert.ok(['Read', 'Partial', 'Skim', 'Skip'].includes(c.verdict));
  }
});

test('quiz questions are well formed', () => {
  let n = 0;
  for (const c of CHAPTERS) {
    for (const [q, a, wrong, why] of c.quiz) {
      n++;
      assert.ok(q && a && why !== undefined, `ch ${c.n}: ${q}`);
      assert.ok(Array.isArray(wrong) && wrong.length >= 2, `ch ${c.n}: needs 2+ wrong answers: ${q}`);
      assert.ok(!wrong.includes(a), `ch ${c.n}: correct answer listed as wrong: ${q}`);
      assert.equal(new Set(wrong).size, wrong.length, `ch ${c.n}: duplicate choices: ${q}`);
    }
    if (c.verdict !== 'Skip' || c.n === 4 || c.n === 14) assert.ok(c.quiz.length >= 3 || c.n === 'A', `ch ${c.n} needs a quiz`);
  }
  assert.ok(n >= 140, `only ${n} questions`);
});

test('lesson ids are unique and bodies non-empty', () => {
  const ids = LESSONS.map(l => l.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const l of LESSONS) assert.ok(l.body.length > 200, l.id);
});

test('drill generators produce answerable items', () => {
  for (const [id, d] of Object.entries(DRILLS)) {
    if (!d.gen) continue;
    for (let i = 0; i < 1500; i++) {
      const it = d.gen();
      assert.ok(it.q && it.a !== undefined, id);
      if (it.choices) {
        assert.ok(it.choices.includes(it.a), `${id}: answer missing from choices: ${it.q}`);
        assert.equal(new Set(it.choices).size, it.choices.length, `${id}: duplicate choices: ${it.q} ${it.choices}`);
        const yesNo = it.choices.length === 2 && it.choices.includes('Yes') && it.choices.includes('No');
        assert.ok(yesNo || it.choices.length >= 3, `${id}: too few choices: ${it.q}`);
      }
      assert.ok(checkAnswer(it, it.a), `${id}: own answer rejected: ${it.q} -> ${it.a}`);
    }
  }
});

test('notebook page plan: covers every read chapter and beyond-the-book lesson, spreads on even pages, no overlaps', async () => {
  const { NB_PLAN } = await import('../js/data/book.js');
  const inBook = new Set(CHAPTERS.flatMap(c => c.lessons));
  const keys = [...CHAPTERS.filter(c => c.verdict !== 'Skip').map(c => String(c.n)), ...LESSONS.filter(l => !inBook.has(l.id) && !l.chapter).map(l => l.id)];
  for (const k of keys) assert.ok(NB_PLAN[k], `no planned pages for ${k}`);
  const ranges = Object.values(NB_PLAN).map(v => v.split('–').map(Number)).sort((a, b) => a[0] - b[0]);
  let prev = 9;
  for (const [a, b] of ranges) {
    assert.equal(a % 2, 0, `spread ${a}–${b} must start on an even page`);
    assert.ok(a > prev, `overlap at ${a}`);
    assert.ok(b < 136, `${a}–${b} runs into the back section`);
    prev = b;
  }
});
