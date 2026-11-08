// Unlimited subnetting drill: timer, streaks, per-type accuracy, explanations.

import { h } from '../ui.js';
import { db, update } from '../store.js';
import { makeQuestion, check, QTYPES } from '../subnetq.js';
import { todayKey } from '../ui.js';
import { keypad } from '../keypad.js';
import { buzz, swipe } from '../gestures.js';

const TARGET = 30000;
const DEFAULT_TYPES = ['net', 'bcast', 'first', 'last', 'hosts', 'mask', 'wild', 'fit', 'same'];

export function render(root) {
  const st = db().subnet;
  if (!st.types) st.types = DEFAULT_TYPES;
  let q = null;
  let t0 = 0;
  let timer = null;
  let answered = false;
  let drillCard = null;

  const qEl = h('div.q-text', {});
  const clock = h('div.clock', {}, '0.0s');
  const kp = keypad({ layout: 'ip', placeholder: 'tap to answer', onSubmit: v => (answered ? next() : submit(v)) });
  const input = kp.el;
  const ynRow = h('div.yn', { hidden: true },
    h('button.btn.big', { onclick: () => submit('yes') }, 'Yes'),
    h('button.btn.big', { onclick: () => submit('no') }, 'No'));
  const submitBtn = h('button.btn.big', { onclick: () => next() }, 'Next ›');
  const feedback = h('div.feedback', {});
  const streakEl = h('div.streak', {});
  const statsEl = h('div.sub-stats', {});

  function drawStreak() {
    streakEl.replaceChildren(
      h('span', {}, '🔥 ', h('strong', {}, st.streak), ' streak'),
      h('span.muted', {}, ` · best ${st.best}`));
  }

  function drawStats() {
    const hist = st.history.slice(-100);
    const today = todayKey();
    const todays = st.history.filter(x => x.day === today);
    const mins = Math.round(todays.reduce((a, x) => a + Math.min(x.ms, 120000), 0) / 60000);
    const ok = hist.filter(x => x.ok);
    const avg = ok.length ? (ok.reduce((a, x) => a + x.ms, 0) / ok.length / 1000).toFixed(1) : '–';
    const under = ok.length ? Math.round((ok.filter(x => x.ms <= TARGET).length / ok.length) * 100) : 0;
    const byType = {};
    for (const x of hist) { byType[x.type] = byType[x.type] || { n: 0, ok: 0, ms: 0 }; byType[x.type].n++; if (x.ok) { byType[x.type].ok++; byType[x.type].ms += x.ms; } }
    const rows = Object.entries(byType).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n);
    statsEl.replaceChildren(
      h('div.stat-row', {},
        h('div.stat', {}, h('div.stat-n', {}, todays.length), h('div.stat-l', {}, `today · ${mins} min`)),
        h('div.stat', {}, h('div.stat-n', {}, hist.length ? `${Math.round((ok.length / hist.length) * 100)}%` : '–'), h('div.stat-l', {}, 'accuracy (last 100)')),
        h('div.stat', {}, h('div.stat-n', {}, `${avg}s`), h('div.stat-l', {}, `avg · ${under}% under 30s`))),
      rows.length ? h('table.mini', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Type'), h('th', {}, 'Accuracy'), h('th', {}, 'Avg'))),
        h('tbody', {}, rows.map(([t, v]) => h('tr' + (v.ok / v.n < 0.7 && v.n >= 3 ? '.weak' : ''), {},
          h('td', {}, QTYPES[t]), h('td', {}, `${Math.round((v.ok / v.n) * 100)}% (${v.n})`), h('td', {}, v.ok ? `${(v.ms / v.ok / 1000).toFixed(1)}s` : '–'))))) : null);
  }

  function next() {
    q = makeQuestion(st.types.length ? st.types : DEFAULT_TYPES, st.prefixMin, st.prefixMax);
    answered = false;
    qEl.textContent = q.q;
    kp.set('');
    kp.display.className = 'kp-display empty';
    kp.setLayout(q.kind === 'num' ? 'dec' : 'ip');
    feedback.replaceChildren();
    const yn = q.kind === 'yn';
    ynRow.hidden = !yn;
    input.hidden = yn;
    submitBtn.hidden = true;
    t0 = performance.now();
    clearInterval(timer);
    timer = setInterval(() => {
      const s = (performance.now() - t0) / 1000;
      clock.textContent = `${s.toFixed(1)}s`;
      clock.classList.toggle('over', s * 1000 > TARGET);
    }, 100);
  }

  function submit(val) {
    if (answered || !q) return;
    if (!String(val).trim()) return;
    answered = true;
    clearInterval(timer);
    const ms = Math.round(performance.now() - t0);
    const ok = check(q, val);
    update(s => {
      const x = s.subnet;
      x.history.push({ type: q.type, ok, ms, at: Date.now(), day: todayKey(), ...(ok ? {} : { q: q.q, a: q.a }) });
      if (x.history.length > 2000) x.history = x.history.slice(-2000);
      x.streak = ok ? x.streak + 1 : 0;
      x.best = Math.max(x.best, x.streak);
      const mins = x.history.filter(e => e.day === todayKey()).reduce((a, e) => a + Math.min(e.ms, 120000), 0) / 60000;
      if (mins >= 10) s.plan.daily[todayKey()] = { ...(s.plan.daily[todayKey()] || {}), subnet: true };
    });
    kp.display.classList.add(ok ? 'ok' : 'bad');
    buzz(ok ? 8 : 30);
    input.hidden = true;
    feedback.replaceChildren(
      h('div.verdict' + (ok ? '.ok' : '.bad'), {}, ok ? `✓ Correct · ${(ms / 1000).toFixed(1)}s${ms > TARGET ? ' (over 30s)' : ''}` : `✗ Answer: ${q.a}`),
      h('ul.why', {}, q.why.map(l => h('li', {}, l))));
    submitBtn.hidden = false;
    ynRow.hidden = true;
    drawStreak();
    drawStats();
    const cur = q;
    if (ok) setTimeout(() => { if (answered && q === cur && document.body.contains(qEl)) next(); }, 1100);
  }

  const onKey = e => {
    if (e.target.matches?.('input')) return;
    if (!answered && q?.kind === 'yn' && (e.key === 'y' || e.key === 'n')) submit(e.key);
  };
  document.addEventListener('keydown', onKey);

  // settings
  const typeChips = Object.entries(QTYPES).map(([k, v]) => h('button.chip-btn' + (st.types.includes(k) ? '.on' : ''), {
    onclick: e => {
      update(s => {
        const t = s.subnet.types;
        s.subnet.types = t.includes(k) ? t.filter(x => x !== k) : [...t, k];
      });
      e.target.classList.toggle('on');
    },
  }, v));
  const pMin = h('input.input.num', { type: 'number', min: 8, max: 30, value: st.prefixMin, onchange: e => update(s => { s.subnet.prefixMin = Math.max(8, Math.min(30, +e.target.value || 16)); }) });
  const pMax = h('input.input.num', { type: 'number', min: 8, max: 30, value: st.prefixMax, onchange: e => update(s => { s.subnet.prefixMax = Math.max(s.subnet.prefixMin, Math.min(30, +e.target.value || 30)); }) });

  root.append(
    h('header.view-head', {}, h('h1', {}, 'Subnetting'), streakEl),
    drillCard = h('section.drill', {},
      h('div.drill-top', {}, h('span.muted.small', {}, 'Goal: under 30 s'), clock),
      qEl, input, ynRow, submitBtn, feedback),
    statsEl,
    h('details.panel', {},
      h('summary', {}, 'Question types & prefix range'),
      h('div.chips', {}, typeChips),
      h('div.row', {}, h('label', {}, 'Prefix /', pMin), h('label', {}, ' to /', pMax))),
    h('details.panel', {},
      h('summary', {}, 'Cheat sheet'),
      h('pre.code', {}, `Bits  128 64 32 16 8 4 2 1
Mask  128 192 224 240 248 252 254 255
/25 .128  blk 128   126 hosts
/26 .192  blk 64     62 hosts
/27 .224  blk 32     30 hosts
/28 .240  blk 16     14 hosts
/29 .248  blk 8       6 hosts
/30 .252  blk 4       2 hosts
Block = 256 - mask octet
Wildcard = 255 - mask octet`)));

  drawStreak();
  drawStats();
  next();
  swipe(drillCard, { follow: false, onLeft: () => { if (answered) next(); } });
  return () => { clearInterval(timer); kp.destroy(); document.removeEventListener('keydown', onKey); };
}
