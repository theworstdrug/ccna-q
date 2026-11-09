import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStatus } from '../js/push.js';
import { db } from '../js/store.js';

test('study status for reminders: cards coming due by hour, streak, next chapter, dates', () => {
  const s = db();
  const now = Date.parse('2026-11-10T12:00:00Z');
  // three learning cards: one overdue, two due later today; one new card ignored
  s.terms = { ospf: { status: 2, due: now - 3600e3 }, vlan: { status: 3, due: now + 2 * 3600e3 }, stp: { status: 1, due: now + 2.5 * 3600e3 }, arp: { status: 0, due: 0 } };
  s.plan.daily = { '2026-11-09': { subnet: true } };
  const st = buildStatus(s, now);
  const total = st.due.reduce((a, [, n]) => a + n, 0);
  assert.equal(total, 3, 'new cards are not counted');
  assert.equal(st.due[0][0], Math.floor(now / 3600e3) * 3600e3, 'overdue counts as due now');
  assert.ok(st.due.every(([t], i, a) => !i || t >= a[i - 1][0]), 'sorted');
  assert.equal(st.lastStudied, '2026-11-09');
  assert.match(st.next || '', /^Ch \d+: /);
  assert.equal(st.exam, '2027-01-29');
  assert.ok(st.bookDeadline);
});
