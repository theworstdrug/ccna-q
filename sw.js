// Offline-first service worker. Bump VERSION when files change
// (the deploy workflow stamps it with the commit SHA automatically).
const VERSION = 'dev';
const CACHE = `ccnaq-${VERSION}`;
const FILES = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  './js/app.js', './js/store.js', './js/srs.js', './js/ui.js', './js/terms.js', './js/subnetq.js',
  './js/drills.js', './js/keypad.js', './js/gestures.js', './js/sync.js', './js/pdf.js', './js/spread.js',
  './js/data/glossary.js', './js/data/lessons.js', './js/data/booklessons.js', './js/data/book.js', './js/data/plan.js',
  './js/views/today.js', './js/views/book.js', './js/views/read.js', './js/views/review.js', './js/views/subnet.js',
  './js/views/drill.js', './js/views/quiz.js', './js/views/notes.js', './js/views/notebook.js', './js/views/spreadview.js', './js/views/lab.js', './js/views/plan.js',
  './docs/notebook-guide.pdf',
  './js/sim/net.js', './js/sim/engine.js', './js/sim/cli.js', './js/sim/labs.js',
];

self.addEventListener('install', e => {
  // cache: 'reload' bypasses the HTTP cache so a new version never precaches stale files
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('ccnaq-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match('./index.html'))),
  );
});
