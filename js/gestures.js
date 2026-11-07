// Touch helpers: swipe, long-press, drag-to-dismiss, light haptics.

export const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* iOS has no vibrate */ } };

/** Horizontal/vertical swipe on an element with a follow-the-finger drag. */
export function swipe(el, { onLeft, onRight, onUp, threshold = 80, follow = true } = {}) {
  let sx = 0; let sy = 0; let id = null; let dx = 0; let dy = 0; let locked = null;
  el.style.touchAction = 'pan-y';
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('button, a, input, textarea, select')) return;
    id = e.pointerId; sx = e.clientX; sy = e.clientY; dx = dy = 0; locked = null;
  });
  el.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    if (!locked && Math.hypot(dx, dy) > 10) locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (locked === 'x' && follow) { el.style.transform = `translateX(${dx}px) rotate(${dx / 30}deg)`; el.style.transition = 'none'; }
    if (locked === 'y' && follow && onUp && dy < 0) { el.style.transform = `translateY(${dy}px)`; el.style.transition = 'none'; }
  });
  const end = e => {
    if (e.pointerId !== id) return;
    id = null;
    el.style.transition = 'transform .2s';
    el.style.transform = '';
    if (locked === 'x' && dx < -threshold && onLeft) { buzz(); onLeft(); }
    else if (locked === 'x' && dx > threshold && onRight) { buzz(); onRight(); }
    else if (locked === 'y' && dy < -threshold && onUp) { buzz(); onUp(); }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

/** Calls cb after a press held still for `ms`. Returns a function telling whether it fired. */
export function longPress(el, cb, ms = 480) {
  let t = null; let sx = 0; let sy = 0; let fired = false;
  el.addEventListener('pointerdown', e => {
    fired = false; sx = e.clientX; sy = e.clientY;
    clearTimeout(t);
    t = setTimeout(() => { fired = true; buzz(15); cb(e); }, ms);
  });
  el.addEventListener('pointermove', e => { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clearTimeout(t); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(n => el.addEventListener(n, () => clearTimeout(t)));
  el.addEventListener('contextmenu', e => e.preventDefault());
  return () => fired;
}

/** Drag a bottom sheet down by its handle to dismiss it. */
export function dragDismiss(handle, sheetEl, close) {
  let sy = 0; let id = null; let dy = 0;
  handle.style.touchAction = 'none';
  handle.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    id = e.pointerId; sy = e.clientY; dy = 0;
    handle.setPointerCapture(id);
    sheetEl.style.transition = 'none';
  });
  handle.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    dy = Math.max(0, e.clientY - sy);
    sheetEl.style.transform = `translateY(${dy}px)`;
  });
  const end = e => {
    if (e.pointerId !== id) return;
    id = null;
    sheetEl.style.transition = '';
    if (dy > 90) close(); else sheetEl.style.transform = '';
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}
