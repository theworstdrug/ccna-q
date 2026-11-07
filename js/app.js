import { h, closeSheet } from './ui.js';
import * as today from './views/today.js';
import * as read from './views/read.js';
import * as review from './views/review.js';
import * as subnet from './views/subnet.js';
import * as lab from './views/lab.js';
import * as plan from './views/plan.js';
import { db } from './store.js';
import { isDue } from './srs.js';

const ICON = {
  today: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  read: 'M4 5a2 2 0 012-2h5v17H6a2 2 0 01-2-2zM20 5a2 2 0 00-2-2h-5v17h5a2 2 0 002-2z',
  review: 'M4 6h16v12H4zM8 10h8M8 14h5',
  subnet: 'M12 3v4M12 17v4M3 12h4M17 12h4M7 7l2 2M15 15l2 2M17 7l-2 2M9 15l-2 2',
  lab: 'M5 4h5v5H5zM14 15h5v5h-5zM14 4h5v5h-5zM7.5 9v6.5H14M16.5 9v6',
  plan: 'M4 5h16v15H4zM4 9h16M9 3v4M15 3v4M8 13h3M8 16h6',
};

const VIEWS = {
  today: { mod: today, label: 'Today' },
  read: { mod: read, label: 'Read' },
  review: { mod: review, label: 'Review' },
  subnet: { mod: subnet, label: 'Subnet' },
  lab: { mod: lab, label: 'Lab' },
  plan: { mod: plan, label: 'Plan' },
};

const main = document.getElementById('main');
const nav = document.getElementById('nav');
let cleanup = null;

function navBadge() {
  const due = Object.values(db().terms).filter(c => isDue(c)).length;
  return due;
}

function renderNav(active) {
  nav.replaceChildren(...Object.entries(VIEWS).map(([id, v]) => {
    const due = id === 'review' ? navBadge() : 0;
    return h('a.tab' + (id === active ? '.active' : ''), { href: `#/${id}`, 'aria-label': v.label, 'aria-current': id === active ? 'page' : null },
      h('span.tab-ico', { html: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON[id]}"/></svg>` }),
      due ? h('span.badge', {}, due > 99 ? '99+' : due) : null,
      h('span.tab-label', {}, v.label));
  }));
}

function route() {
  const [, name = 'today', ...rest] = (location.hash || '#/today').split('/');
  const v = VIEWS[name] || VIEWS.today;
  const key = VIEWS[name] ? name : 'today';
  closeSheet();
  cleanup?.();
  cleanup = null;
  document.body.dataset.view = key;
  main.replaceChildren();
  main.scrollTo?.(0, 0);
  window.scrollTo(0, 0);
  cleanup = v.mod.render(main, rest.map(decodeURIComponent)) || null;
  renderNav(key);
}

window.addEventListener('hashchange', route);
window.addEventListener('ccnaq:nav', () => renderNav(document.body.dataset.view));
route();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          const bar = h('div.update', {}, 'A new version is ready. ',
            h('button.btn.small', { onclick: () => location.reload() }, 'Reload'));
          document.body.append(bar);
        }
      });
    });
  }).catch(() => {});
}
