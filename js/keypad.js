// On-screen keypad so drills never summon the phone keyboard.
// Physical keyboard input works too (desktop).

import { h } from './ui.js';
import { buzz } from './gestures.js';

const LAYOUTS = {
  ip: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '/'],
  dec: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', ''],
  bin: ['0', '1'],
  hex: ['1', '2', '3', 'A', '4', '5', '6', 'B', '7', '8', '9', 'C', 'D', '0', 'E', 'F'],
};

/**
 * Returns { el, display, get(), set(v), setLayout(name), destroy() }.
 * onSubmit(value) fires on ✓ / Enter.
 */
export function keypad({ layout = 'ip', placeholder = 'answer', onSubmit, maxLen = 18 }) {
  let value = '';
  let current = layout;
  const display = h('div.kp-display', { role: 'textbox', 'aria-live': 'polite' });
  const grid = h('div.kp-grid', {});
  const paint = () => {
    display.textContent = value || placeholder;
    display.classList.toggle('empty', !value);
  };
  const press = k => {
    buzz(5);
    if (k === '⌫') value = value.slice(0, -1);
    else if (k === '✓') { onSubmit?.(value); return; }
    else if (value.length < maxLen) value += k;
    paint();
  };
  const build = () => {
    const keys = LAYOUTS[current];
    grid.className = `kp-grid kp-${current}`;
    grid.replaceChildren(...keys.map(k => (k ? h('button.kp-key', { type: 'button', onpointerdown: e => { e.preventDefault(); press(k); } }, k) : h('span'))),
      h('button.kp-key.kp-back', { type: 'button', 'aria-label': 'Backspace', onpointerdown: e => { e.preventDefault(); press('⌫'); } }, '⌫'),
      h('button.kp-key.kp-ok', { type: 'button', 'aria-label': 'Submit', onpointerdown: e => { e.preventDefault(); press('✓'); } }, '✓'));
  };
  const onKey = e => {
    if (e.target.matches?.('input, textarea, select')) return;
    if (e.key === 'Enter') { e.preventDefault(); press('✓'); return; }
    if (e.key === 'Backspace') { e.preventDefault(); press('⌫'); return; }
    const k = e.key.length === 1 ? e.key.toUpperCase() : '';
    if (k && LAYOUTS[current].includes(k)) press(k);
  };
  document.addEventListener('keydown', onKey);
  build();
  paint();
  const el = h('div.keypad', {}, display, grid);
  return {
    el, display,
    get: () => value,
    set: v => { value = v; paint(); },
    setLayout: l => { current = l; build(); },
    destroy: () => document.removeEventListener('keydown', onKey),
  };
}
