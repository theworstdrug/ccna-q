// Reminder settings (push notifications), opened from the bell on Today.

import { h, sheet, toast } from '../ui.js';
import { pushBlocker, currentSubscription, devicePrefs, enablePush, updatePrefs, disablePush, requestTest, DEFAULT_PREFS } from '../push.js';

const hours = (sel) => Array.from({ length: 24 }, (_, hr) => h('option', { value: hr, selected: hr === sel || null }, new Date(2000, 0, 1, hr).toLocaleTimeString([], { hour: 'numeric' })));

export async function openReminders() {
  const body = h('div.reminders', {}, h('p.muted', {}, 'Checking…'));
  sheet(body, { title: '🔔 Reminders' });

  const blocker = pushBlocker();
  const sub = blocker ? null : await currentSubscription();
  let prefs = { ...DEFAULT_PREFS, ...((sub && await devicePrefs()) || {}) };
  const on = !!sub;

  const field = (key, label, hourKey) => h('div.rem-row', {},
    h('label.check-row', {}, h('input', { type: 'checkbox', checked: prefs[key] || null, onchange: e => { prefs[key] = e.target.checked; } }), h('span', {}, label)),
    hourKey ? h('select.input.rem-hour', { 'aria-label': `${label} time`, onchange: e => { prefs[hourKey] = +e.target.value; } }, hours(prefs[hourKey])) : null);

  const busy = async (btn, fn) => { btn.disabled = true; try { await fn(); } catch (e) { toast(e.message, 6000); } btn.disabled = false; };

  if (blocker) {
    body.replaceChildren(h('p', {}, blocker), h('p.muted.small', {}, 'Reminders come from your private books repo, so they work even when the app is closed.'));
    return;
  }

  const main = h('button.btn.full', {}, on ? 'Save' : 'Turn on reminders');
  main.onclick = () => busy(main, async () => {
    if (on) { await updatePrefs(prefs); toast('Saved'); } else { await enablePush(prefs); toast('Reminders are on for this device'); openReminders(); }
  });
  const test = h('button.btn.small.ghost', {
    onclick: () => busy(test, async () => {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('CCNA-Q', { body: 'Notifications work on this device ✓', icon: './icons/icon-192.png', tag: 'ccnaq-test' });
      await requestTest();
      toast('Shown now. A real push from your books repo follows within the hour.', 5000);
    }),
  }, 'Send a test');
  const off = h('button.btn.small.ghost', { onclick: () => busy(off, async () => { await disablePush(); toast('Reminders off on this device'); openReminders(); }) }, 'Turn off on this device');

  body.replaceChildren(...[
    h('p.small', {}, on ? '✓ On for this device.' : 'Get a nudge even when the app is closed.'),
    field('daily', 'Daily study reminder (cards due, what\'s next)', 'dailyHour'),
    field('nudge', 'Evening nudge if you haven\'t studied yet', 'nudgeHour'),
    field('milestones', 'Milestones (book deadline, exam countdown)'),
    main,
    on ? h('div.row.wrap', {}, test, off) : null,
    h('p.muted.small', {}, 'Sent by a scheduled job in your private books repo, at your local time (it can run up to ~15 minutes late). The app shares only your study summary there: cards coming due, streak and next chapter.'),
  ].filter(Boolean));
}
