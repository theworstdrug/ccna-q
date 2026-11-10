// Offline-first service worker. Bump VERSION when files change
// (the deploy workflow stamps it with the commit SHA automatically).
const VERSION = 'dev';
const CACHE = `ccnaq-${VERSION}`;
const FILES = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  './js/app.js', './js/store.js', './js/srs.js', './js/ui.js', './js/motion.js', './js/terms.js', './js/subnetq.js',
  './js/drills.js', './js/keypad.js', './js/gestures.js', './js/sync.js', './js/pdf.js', './js/spread.js', './js/cuegen.js', './js/cuebank.js', './js/refs.js', './js/cloud.js', './js/localllm.js', './js/vault.js', './js/push.js', './js/guard.js',
  './js/anki/zip.js', './js/anki/apkg.js', './js/anki/sources.js', './js/anki/connect.js',
  './js/vendor/sql-wasm.js', './js/vendor/sql-wasm.wasm',
  './js/data/glossary.js', './js/data/words.js', './js/data/lessons.js', './js/data/booklessons.js', './js/data/book.js', './js/data/plan.js',
  './js/views/today.js', './js/views/book.js', './js/views/read.js', './js/views/review.js', './js/views/subnet.js',
  './js/views/drill.js', './js/views/quiz.js', './js/views/notes.js', './js/views/notebook.js', './js/views/spreadview.js', './js/views/anki.js', './js/views/cues.js', './js/views/cuepanel.js', './js/views/chat.js', './js/views/reminders.js', './js/views/library.js', './js/views/lab.js', './js/views/plan.js',
  './docs/notebook-guide.pdf',
  './js/sim/net.js', './js/sim/engine.js', './js/sim/cli.js', './js/sim/labs.js',
];

self.addEventListener('install', e => {
  // cache: 'reload' bypasses the HTTP cache so a new version never precaches stale files
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('ccnaq-') && k !== CACHE && k !== CDN_CACHE && k !== AI_CACHE && k !== 'ccnaq-pdf').map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const CDN_CACHE = 'ccnaq-cdn'; // kept across versions: the PDF reader from jsDelivr
// kept across versions: the vendored AI engine (28 MB), fetched on first use rather than precached
// so app updates don't re-download it. Its folder name carries the version. (Model weights are
// cached by transformers.js itself, in 'transformers-cache'.)
const AI_CACHE = 'ccnaq-ai';

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'GET' && url.origin === location.origin && url.pathname.includes('/js/vendor/transformers-')) {
    e.respondWith(caches.open(AI_CACHE).then(c => c.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }))));
    return;
  }
  if (req.method === 'GET' && url.host === 'cdn.jsdelivr.net' && url.pathname.startsWith('/npm/pdfjs-dist@')) {
    e.respondWith(caches.open(CDN_CACHE).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }))));
    return;
  }
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match('./index.html'))),
  );
});

// ---------- push notifications (study reminders sent by the books repo's workflow) ----------
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'CCNA-Q', {
    body: d.body || '', tag: d.tag || 'ccnaq', renotify: !!d.tag,
    icon: './icons/icon-192.png', badge: './icons/icon-192.png',
    data: { url: d.url || './#/today' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './#/today', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async list => {
    for (const c of list) {
      if (!c.url.startsWith(self.registration.scope)) continue;
      try { await c.navigate(url); } catch { /* not controlled yet: focusing is enough */ }
      return c.focus();
    }
    return self.clients.openWindow(url);
  }));
});
