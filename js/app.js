import { h, closeSheet } from './ui.js';
import * as today from './views/today.js';
import * as book from './views/book.js';
import * as read from './views/read.js';
import * as review from './views/review.js';
import * as drill from './views/drill.js';
import * as subnet from './views/subnet.js';
import * as lab from './views/lab.js';
import * as plan from './views/plan.js';
import * as quiz from './views/quiz.js';
import * as notes from './views/notes.js';
import * as notebook from './views/notebook.js';
import * as anki from './views/anki.js';
import { db } from './store.js';
import { isDue } from './srs.js';
import { getTerm } from './terms.js';
import { outboxCount } from './sync.js';
import { EXAM, daysUntil } from './data/plan.js';

const ICON = {
  today: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  book: 'M4 5a2 2 0 012-2h5v17H6a2 2 0 01-2-2zM20 5a2 2 0 00-2-2h-5v17h5a2 2 0 002-2z',
  review: 'M4 6h16v12H4zM8 10h8M8 14h5',
  drills: 'M13 2L4 14h7l-1 8 9-12h-7z',
  lab: 'M5 4h5v5H5zM14 15h5v5h-5zM14 4h5v5h-5zM7.5 9v6.5H14M16.5 9v6',
};

// Bottom navigation (5 tabs, thumb-friendly) and which tab each route belongs to.
const TABS = [['today', 'Today'], ['book', 'Book'], ['review', 'Review'], ['drills', 'Drills'], ['lab', 'Lab']];
const ROUTES = {
  today: [today, 'today'], plan: [plan, 'today'],
  book: [book, 'book'], read: [read, 'book'], quiz: [quiz, 'book'], notes: [notes, 'book'], notebook: [notebook, 'book'],
  review: [review, 'review'], anki: [anki, 'review'],
  drills: [drill, 'drills'], subnet: [subnet, 'drills'],
  lab: [lab, 'lab'],
};

const main = document.getElementById('main');
const nav = document.getElementById('nav');
let cleanup = null;

const dueCount = () => Object.entries(db().terms).filter(([id, c]) => isDue(c) && getTerm(id)).length;

function renderNav(active) {
  const dExam = daysUntil(EXAM.target);
  const brand = h('a.nav-brand', { href: '#/today', 'aria-label': 'CCNA-Q home' },
    h('span.brand-mark', { html: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="12" r="2.2"/><circle cx="19" cy="12" r="2.2"/><circle cx="12" cy="19" r="2.2"/><path d="M10.4 6.6 6.6 10.4M13.6 6.6l3.8 3.8M6.6 13.6l3.8 3.8M17.4 13.6l-3.8 3.8"/></svg>' }),
    h('span.brand-text', {}, h('strong', {}, 'CCNA-Q'), h('small', {}, '200-301 v1.1')));
  const foot = h('div.nav-foot', {},
    h('a.nav-count', { href: '#/plan' }, h('strong', {}, Math.max(0, dExam)), h('span', {}, ' days to the exam')),
    h('div.nav-keys', {}, 'Alt/⌥ + 1–5 to switch'));
  nav.replaceChildren(brand, ...TABS.map(([id, label], k) => {
    const due = id === 'review' ? dueCount() : 0;
    const nb = id === 'book' ? outboxCount() : 0;
    return h('a.tab' + (id === active ? '.active' : ''), { href: `#/${id}`, 'aria-label': label, title: `${label} (Alt+${k + 1})`, 'aria-current': id === active ? 'page' : null },
      h('span.tab-ico', { html: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON[id]}"/></svg>` }),
      due ? h('span.badge', {}, due > 99 ? '99+' : due) : null,
      nb ? h('span.badge.soft', { title: 'Items to write in your notebook' }, nb > 99 ? '99+' : nb) : null,
      h('span.tab-label', {}, label));
  }), foot);
}

// Desktop: Alt/⌥ + 1–5 switches tabs (ignored while typing).
document.addEventListener('keydown', e => {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.target.matches?.('input, textarea, select')) return;
  const k = Number(e.code?.replace('Digit', '') || e.key);
  if (k >= 1 && k <= TABS.length) { e.preventDefault(); location.hash = `#/${TABS[k - 1][0]}`; }
});

function route() {
  const [, name = 'today', ...rest] = (location.hash || '#/today').split('/');
  const [mod, tab] = ROUTES[name] || ROUTES.today;
  closeSheet();
  cleanup?.();
  cleanup = null;
  document.body.dataset.view = ROUTES[name] ? name : 'today';
  main.replaceChildren();
  window.scrollTo(0, 0);
  cleanup = mod.render(main, rest.map(decodeURIComponent)) || null;
  renderNav(tab);
}

window.addEventListener('hashchange', route);
window.addEventListener('ccnaq:nav', () => renderNav((ROUTES[document.body.dataset.view] || ROUTES.today)[1]));
route();

// iOS doesn't resize the layout for the on-screen keyboard; track it so sheets stay above it.
if (window.visualViewport) {
  const vv = window.visualViewport;
  const onVV = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', `${kb}px`);
    document.documentElement.style.setProperty('--vvh', `${vv.height}px`);
    document.body.classList.toggle('kb-open', kb > 80);
  };
  vv.addEventListener('resize', onVV);
  vv.addEventListener('scroll', onVV);
  onVV();
}

// Offline cache + updates. A home-screen app on iOS rarely does a fresh launch, so also
// check for a new version whenever the app comes back to the foreground.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  let shown = false;
  const offerReload = () => {
    if (shown) return;
    shown = true;
    document.body.append(h('div.update', {}, 'A new version is ready. ',
      h('button.btn.small', { onclick: () => location.reload() }, 'Reload')));
  };
  // The new worker activates straight away (skipWaiting); when it takes over, offer a reload.
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) offerReload(); });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60 * 1000);
  }).catch(() => {});
}
