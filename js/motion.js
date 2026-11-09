// iOS-style motion: push/pop page transitions, staggered entrances, spring feedback.
// Everything is skipped when the user prefers reduced motion.

export const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Run a DOM update as a page transition.
 * dir: 'forward' (push, slides in from the right), 'back' (pop), 'fade' (tab switch), 'none'.
 */
export function pageTransition(dir, updateDom) {
  const root = document.documentElement;
  if (dir === 'none' || reducedMotion()) { updateDom(); return; }
  root.dataset.nav = dir;
  if (document.startViewTransition) {
    const t = document.startViewTransition(updateDom);
    t.finished.finally(() => { delete root.dataset.nav; });
    return;
  }
  // Fallback: animate the content area only.
  updateDom();
  const main = document.getElementById('main');
  main.classList.remove('page-forward', 'page-back', 'page-fade');
  void main.offsetWidth; // restart the animation
  main.classList.add(`page-${dir}`);
  setTimeout(() => { main.classList.remove(`page-${dir}`); delete root.dataset.nav; }, 500);
}

/** Cards and list rows rise in one after another. */
export function stagger(root = document.getElementById('main')) {
  if (reducedMotion() || !root) return;
  const groups = [root, ...root.querySelectorAll('.ch-list, .cards, .outbox, .drill-grid, .beyond, .nb-list, .src-list, .choices, .practice, .countdown, .stat-row')];
  for (const g of groups) {
    let i = 0;
    for (const el of g.children) {
      if (i > 14) break;
      el.style.setProperty('--i', i++);
      el.classList.add('rise');
    }
  }
  setTimeout(() => root.querySelectorAll('.rise').forEach(el => el.classList.remove('rise')), 1200);
}

function once(el, cls) {
  if (!el || reducedMotion()) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

/** Wrong answer: the iOS "nope" shake. */
export const shake = el => once(el, 'fx-shake');
/** Right answer / completed: a springy pop. */
export const pop = el => once(el, 'fx-pop');
/** Small bump for counters and badges. */
export const bump = el => once(el, 'fx-bump');

/** Numbers tick up to their value (e.g. countdowns). */
export function countUp(el, to, ms = 700) {
  if (!el) return;
  const target = Number(to);
  if (reducedMotion() || !Number.isFinite(target) || target <= 0) { el.textContent = String(to); return; }
  const t0 = performance.now();
  const ease = t => 1 - (1 - t) ** 3;
  const step = now => {
    const k = Math.min(1, (now - t0) / ms);
    el.textContent = String(Math.round(target * ease(k)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
