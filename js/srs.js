// LingQ-style statuses + a light SM-2 scheduler.
// status: 0 new (blue), 1-4 learning (yellow, fading), 5 known, -1 ignored.

export const STATUS_LABEL = { 0: 'New', 1: '1 · New-ish', 2: '2 · Recognised', 3: '3 · Familiar', 4: '4 · Almost', 5: 'Known', '-1': 'Ignored' };

const DAY = 86400000;

export function blankCard() { return { status: 0, ease: 2.5, ivl: 0, due: 0, reps: 0, lapses: 0 }; }

/** Set a status from the reader. Learning statuses get scheduled for review. */
export function setStatus(card, status, now = Date.now()) {
  card.status = status;
  if (status >= 1 && status <= 4) {
    if (!card.reps) { card.due = now; card.ivl = 0; }
  }
  return card;
}

/** grade: 0 again, 1 hard, 2 good, 3 easy */
export function grade(card, g, now = Date.now()) {
  if (g === 0) {
    card.lapses = (card.lapses || 0) + 1;
    card.reps = 0;
    card.ivl = 0;
    card.ease = Math.max(1.3, card.ease - 0.2);
    card.due = now + 10 * 60 * 1000;
    card.status = Math.max(1, Math.min(card.status, 4) - 1);
    return card;
  }
  if (g === 1) {
    card.ivl = Math.max(1, Math.round((card.ivl || 1) * 1.2));
    card.ease = Math.max(1.3, card.ease - 0.15);
  } else {
    if (card.reps === 0) card.ivl = g === 3 ? 3 : 1;
    else if (card.reps === 1) card.ivl = g === 3 ? 6 : 3;
    else card.ivl = Math.round(card.ivl * card.ease * (g === 3 ? 1.3 : 1));
    if (g === 3) card.ease += 0.15;
    card.status = Math.min(4, (card.status || 1) + 1);
  }
  card.reps += 1;
  card.due = now + card.ivl * DAY;
  if (card.ivl >= 21) card.status = 5; // graduated → Known
  return card;
}

export function isDue(card, now = Date.now()) {
  return card.status >= 1 && card.status <= 4 && card.due <= now;
}

export function ivlLabel(card, g) {
  const c = grade({ ...card }, g, 0);
  if (c.due < DAY) return '10m';
  const d = Math.round(c.due / DAY);
  return d >= 30 ? `${Math.round(d / 30)}mo` : `${d}d`;
}
