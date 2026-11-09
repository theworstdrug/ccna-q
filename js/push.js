// Push notifications (study reminders) without a server of our own:
//  • this device subscribes with Web Push (on iPhone: iOS 16.4+, app added to the Home Screen)
//  • the subscription + your reminder settings go to your private books repo (push/devices/)
//  • a small study status (cards coming due, streak, what's next) goes there too (push/status.json),
//    refreshed whenever you leave the app
//  • a scheduled GitHub Actions workflow in the books repo sends the reminders at your local time
//
// Only the public half of the VAPID key pair is here; the private half lives in the books repo.

import { db } from './store.js';
import { cloudOn, writeFiles, readJson } from './cloud.js';
import { isDue } from './srs.js';
import { getTerm } from './terms.js';
import { todayKey } from './ui.js';
import { CHAPTERS, readable, BOOK_DEADLINE } from './data/book.js';
import { EXAM } from './data/plan.js';

export const VAPID_PUBLIC = 'BLqXmbSGok4SEtC36-KP8fWr5BUFhFplOQdGhTMcyKAWvoaeYuvGXRUeS-zcOrxiKIC_n1YgHbzUbfxpEPS58Y4';
const DEV_KEY = 'ccnaq.push.device';
const LAST_KEY = 'ccnaq.push.status';

export const DEFAULT_PREFS = { daily: true, dailyHour: 18, nudge: true, nudgeHour: 21, milestones: true };

const deviceId = () => {
  try {
    let id = localStorage.getItem(DEV_KEY);
    if (!id) { id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; localStorage.setItem(DEV_KEY, id); }
    return id;
  } catch { return 'unknown'; }
};

export const isStandalone = () => !!(globalThis.matchMedia?.('(display-mode: standalone)').matches || globalThis.navigator?.standalone);
export const isIOS = () => /iPhone|iPad|iPod/.test(globalThis.navigator?.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** What stands between this device and notifications, or null if it can have them. */
export function pushBlocker() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIOS() && !isStandalone()
      ? 'On iPhone, notifications only work in the installed app: tap Share → Add to Home Screen, then open CCNA-Q from the Home Screen.'
      : 'This browser does not support push notifications.';
  }
  if (Notification.permission === 'denied') return 'Notifications are blocked for this app. Allow them in your device settings, then come back.';
  if (!cloudOn()) return 'Connect your books first (Chat → ⚙): reminders are sent through your private books repo.';
  return null;
}

const b64urlToBytes = s => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); };

export async function currentSubscription() {
  try { return await (await navigator.serviceWorker.ready).pushManager.getSubscription(); } catch { return null; }
}

/** This device's saved reminder settings (from the repo), or null when not subscribed. */
export async function devicePrefs() {
  if (!cloudOn() || !(await currentSubscription())) return null;
  try { return (await readJson(`push/devices/${deviceId()}.json`))?.prefs || null; } catch { return null; }
}

/** Ask for permission (must run from a tap), subscribe, and save to the books repo. */
export async function enablePush(prefs = DEFAULT_PREFS) {
  const blocker = pushBlocker();
  if (blocker) throw new Error(blocker);
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications were not allowed.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(VAPID_PUBLIC) });
  await saveDevice(sub, prefs);
  await publishStatus(true);
  return sub;
}

export async function saveDevice(sub, prefs) {
  const device = {
    id: deviceId(), subscription: sub.toJSON(), prefs: { ...DEFAULT_PREFS, ...prefs },
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    label: isIOS() ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : /Linux/.test(navigator.userAgent) ? 'Linux' : 'Computer',
    updated: new Date().toISOString(),
  };
  await writeFiles(`Reminders: ${device.label} settings`, { [`push/devices/${device.id}.json`]: JSON.stringify(device, null, 1) });
}

export async function updatePrefs(prefs) {
  const sub = await currentSubscription();
  if (!sub) throw new Error('Reminders are off on this device.');
  await saveDevice(sub, prefs);
}

export async function disablePush() {
  const sub = await currentSubscription();
  await sub?.unsubscribe();
  if (cloudOn()) await writeFiles('Reminders: device removed', {}, [`push/devices/${deviceId()}.json`]).catch(() => {});
}

/** Send a test through the real path (the workflow), by asking for one in the status file. */
export async function requestTest() {
  await publishStatus(true, { test: new Date().toISOString() });
}

// ---------------------------------------------------------------- study status

function activityDays(s) {
  const days = new Set(Object.entries(s.plan.daily || {}).filter(([, v]) => v && Object.values(v).some(Boolean)).map(([k]) => k));
  for (const x of s.subnet.history.slice(-300)) if (x.day) days.add(x.day);
  return days;
}

function streak(days) {
  let n = 0;
  const d = new Date();
  if (!days.has(todayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(todayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/** What the reminder sender needs to write a useful message. Pure: no network. */
export function buildStatus(s = db(), now = Date.now()) {
  // cards coming due, bucketed by hour, so the sender can count what is due at send time
  const buckets = {};
  for (const [id, c] of Object.entries(s.terms)) {
    if (!(c.status >= 1 && c.status <= 4) || !getTerm(id)) continue;
    const at = isDue(c, now) ? now : c.due;
    if (!at || at > now + 8 * 86400000) continue;
    const hr = Math.floor(at / 3600000) * 3600000;
    buckets[hr] = (buckets[hr] || 0) + 1;
  }
  const days = activityDays(s);
  const nextCh = CHAPTERS.find(c => readable(c) && (s.book[c.n]?.status || 'todo') !== 'done');
  return {
    v: 1,
    updated: new Date(now).toISOString(),
    lastStudied: [...days].sort().at(-1) || null, // local date YYYY-MM-DD
    streak: streak(days),
    due: Object.entries(buckets).map(([t, n]) => [+t, n]).sort((a, b) => a[0] - b[0]),
    next: nextCh ? `Ch ${nextCh.n}: ${nextCh.title}` : null,
    exam: s.settings.examDate || EXAM.target,
    cutoff: s.settings.cutoff || EXAM.cutoff,
    bookDeadline: BOOK_DEADLINE,
  };
}

/** Upload the status if reminders are on and it changed (at most every 10 minutes unless forced). */
export async function publishStatus(force = false, extra = {}) {
  if (!cloudOn() || !(await currentSubscription())) return false;
  const st = { ...buildStatus(), ...extra };
  const key = JSON.stringify({ ...st, updated: 0 });
  let last = null;
  try { last = JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); } catch { /* ignore */ }
  if (!force && last && last.key === key) return false;
  if (!force && last && Date.now() - last.at < 10 * 60000) return false;
  await writeFiles('Reminders: study status', { 'push/status.json': JSON.stringify(st, null, 1) });
  try { localStorage.setItem(LAST_KEY, JSON.stringify({ key, at: Date.now() })); } catch { /* ignore */ }
  return true;
}

// keep the status fresh: when the app goes to the background (iOS may cut that short), shortly
// after it opens (catches anything the last background save missed) and every 15 minutes in use
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') publishStatus().catch(() => {}); });
  setTimeout(() => publishStatus().catch(() => {}), 8000);
  setInterval(() => { if (document.visibilityState === 'visible') publishStatus().catch(() => {}); }, 15 * 60000);
}
