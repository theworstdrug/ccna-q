// Mini Packet Tracer, touch-first: drag devices, pinch to zoom, drag empty space to pan,
// long-press a device for its menu, cable ports, and a terminal with tappable suggestions.

import { h, sheet, closeSheet, toast, md, todayKey } from '../ui.js';
import { db, update } from '../store.js';
import { Net, PORTS, shortIf } from '../sim/engine.js';
import { cliFor } from '../sim/cli.js';
import { LABS, labById } from '../sim/labs.js';
import { CHALLENGES, instance as challengeInstance, newSeed } from '../sim/challenges.js';

// ---------- challenges (word problems) share the lab's canvas; their ids look like "ch:vlan-split" ----------
const chalState = id => db().labs.chal?.[id.slice(3)] || null;
function getLab(id) {
  if (!id?.startsWith('ch:')) return labById(id);
  const type = id.slice(3);
  if (!CHALLENGES.some(c => c.id === type)) return null;
  let st = chalState(id);
  if (!st) { st = { seed: newSeed(), hints: 0, checks: 0, started: Date.now() }; update(x => { x.labs.chal = { ...(x.labs.chal || {}), [type]: st }; }); }
  const c = challengeInstance(type, st.seed);
  return { ...c, id, challenge: true, brief: c.story, checks: c.goals };
}
const setChal = (id, patch) => update(x => { const t = id.slice(3); x.labs.chal = { ...(x.labs.chal || {}), [t]: { ...(x.labs.chal?.[t] || {}), ...patch } }; });
const stars = n => '★'.repeat(n) + '☆'.repeat(3 - n);
import { isIp, ipToInt, intToIp, maskToPrefix, prefixToMask } from '../sim/net.js';
import { buzz } from '../gestures.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const k of kids.flat()) if (k != null) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
};

const ICONS = {
  router: () => s('g', { class: 'ico router' },
    s('ellipse', { cx: 0, cy: 0, rx: 28, ry: 20 }),
    s('path', { d: 'M-14 -6 L-4 -6 M-8 -10 L-4 -6 L-8 -2 M14 6 L4 6 M8 2 L4 6 L8 10 M-6 8 L-14 8 M6 -8 L14 -8', class: 'glyph' })),
  switch: () => s('g', { class: 'ico switch' },
    s('rect', { x: -30, y: -17, width: 60, height: 34, rx: 6 }),
    s('path', { d: 'M-16 -6 H14 M10 -10 L14 -6 L10 -2 M16 6 H-14 M-10 2 L-14 6 L-10 10', class: 'glyph' })),
  pc: () => s('g', { class: 'ico pc' },
    s('rect', { x: -22, y: -20, width: 44, height: 30, rx: 3 }),
    s('rect', { x: -17, y: -15, width: 34, height: 20, rx: 1, class: 'screen' }),
    s('path', { d: 'M-8 14 H8 M0 10 V14', class: 'glyph dark' })),
};

// Common full commands per CLI mode, offered when the input is empty.
const QUICK = {
  user: ['enable', 'show ip interface brief', 'ping '],
  priv: ['configure terminal', 'show ip interface brief', 'show running-config', 'show ip route', 'show vlan brief', 'show interfaces trunk', 'show mac address-table', 'show cdp neighbors', 'show ip ospf neighbor', 'show access-lists', 'ping ', 'traceroute ', 'copy running-config startup-config'],
  config: ['interface ', 'hostname ', 'vlan ', 'router ospf 1', 'ip route ', 'access-list ', 'ip access-list extended ', 'line vty 0 4', 'line console 0', 'enable secret ', 'banner motd #', 'ip default-gateway ', 'no ip domain-lookup', 'end'],
  if: ['ip address ', 'no shutdown', 'shutdown', 'description ', 'switchport mode access', 'switchport access vlan ', 'switchport mode trunk', 'switchport trunk native vlan ', 'ip access-group ', 'ip ospf cost ', 'exit', 'end'],
  subif: ['encapsulation dot1Q ', 'ip address ', 'exit', 'end'],
  range: ['switchport mode access', 'switchport access vlan ', 'shutdown', 'no shutdown', 'exit'],
  vlan: ['name ', 'exit', 'end'],
  router: ['network ', 'router-id ', 'passive-interface ', 'auto-cost reference-bandwidth ', 'exit', 'end'],
  line: ['password ', 'login', 'login local', 'transport input ssh', 'exit'],
  'std-nacl': ['permit ', 'deny ', 'exit'],
  'ext-nacl': ['permit ', 'deny ', 'exit'],
};
const PC_QUICK = ['ipconfig', 'ipconfig ', 'ping ', 'tracert ', 'arp -a', 'help'];

let terms = new Map(); // devId -> { cli, lines, hist, hi }

export function render(root, [param]) {
  const st = db();
  let labId = param && getLab(param) ? param : (st.labs.current && getLab(st.labs.current) ? st.labs.current : 'hello');
  let net = load(labId);
  let mode = 'select'; // select | cable | delete
  let cableFrom = null;
  let showLabels = true;
  let lastChecks = null;
  let view = { x: 0, y: 0, w: 520, h: 380 };

  terms = new Map();
  if (param && getLab(param)) update(x => { x.labs.current = param; });

  function load(id) {
    const saved = db().labs.topos[id];
    return saved ? new Net(saved) : getLab(id).make();
  }

  let saveT = null;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => update(x => { x.labs.topos[labId] = net.toJSON(); x.labs.current = labId; }), 200);
  }

  // ---------- layout ----------
  const svg = s('svg', { class: 'canvas', role: 'img', 'aria-label': 'Network topology', preserveAspectRatio: 'xMidYMid meet' });
  const linkG = s('g');
  const devG = s('g');
  const animG = s('g');
  svg.append(linkG, devG, animG);

  const chalLabel = c => `${db().labs.chalDone?.[c.id] ? '✓ ' : ''}${c.kind === 'ticket' ? '🎫' : '🧩'} ${c.title} ${stars(c.level)}`;
  const labSel = h('select.input.lab-select', { onchange: e => switchLab(e.target.value), 'aria-label': 'Choose lab or challenge' },
    h('optgroup', { label: 'Guided labs' }, LABS.map(l => h('option', { value: l.id, selected: l.id === labId }, `${db().labs.done?.[l.id] ? '✓ ' : ''}${l.title}`))),
    h('optgroup', { label: 'Challenges: figure it out' }, CHALLENGES.map(c => h('option', { value: `ch:${c.id}`, selected: `ch:${c.id}` === labId }, chalLabel(c)))));

  const modeBtns = {};
  const tool = (id, icon, label) => {
    modeBtns[id] = h('button.tool' + (mode === id ? '.on' : ''), { onclick: () => setMode(mode === id ? 'select' : id) }, h('span.tool-i', {}, icon), h('span.tool-l', {}, label));
    return modeBtns[id];
  };
  const statusLine = h('div.lab-status', {}, '');

  const toolbar = h('div.toolbar', {},
    h('button.tool', { onclick: () => add('pc') }, h('span.tool-i', {}, '🖥'), h('span.tool-l', {}, 'PC')),
    h('button.tool', { onclick: () => add('switch') }, h('span.tool-i', {}, '⇄'), h('span.tool-l', {}, 'Switch')),
    h('button.tool', { onclick: () => add('router') }, h('span.tool-i', {}, '◎'), h('span.tool-l', {}, 'Router')),
    tool('cable', '🔌', 'Cable'),
    tool('delete', '🗑', 'Delete'),
    h('button.tool', { onclick: () => { showLabels = !showLabels; draw(); } }, h('span.tool-i', {}, 'Aa'), h('span.tool-l', {}, 'Labels')));

  const zoomBox = h('div.zoom', {},
    h('button', { 'aria-label': 'Zoom in', onclick: () => zoomBy(0.8) }, '+'),
    h('button', { 'aria-label': 'Zoom out', onclick: () => zoomBy(1.25) }, '−'),
    h('button', { 'aria-label': 'Fit', onclick: () => fit() }, '⤢'));

  const objBody = h('div.obj-body', {});
  const objCount = h('span.obj-count', {});
  const obj = h('details.objectives', { open: labId !== 'sandbox' && !db().labs.done?.[labId] },
    h('summary', {}, h('span', {}, 'Brief & objectives '), objCount),
    objBody);

  root.append(
    h('header.view-head.lab-head', {},
      labSel,
      h('button.btn.small', { onclick: runChecks }, 'Check'),
      h('button.icon-btn', { title: 'Reset lab', 'aria-label': 'Reset lab', onclick: resetLab }, '↺')),
    toolbar,
    h('div.canvas-wrap', {}, svg, zoomBox, statusLine),
    obj);

  const HINT = 'Tap: CLI · hold: menu · drag: move · pinch/drag space: zoom/pan';
  function setMode(m) {
    mode = m;
    cableFrom = null;
    for (const [k, b] of Object.entries(modeBtns)) b.classList.toggle('on', k === mode);
    statusLine.textContent = m === 'cable' ? 'Cable: tap the first device.' : m === 'delete' ? 'Delete: tap a device or a cable.' : HINT;
    svg.classList.toggle('mode-delete', m === 'delete');
    svg.classList.toggle('mode-cable', m === 'cable');
    draw();
  }

  function switchLab(id) {
    save();
    labId = id;
    net = load(id);
    terms = new Map();
    lastChecks = null;
    update(x => { x.labs.current = id; });
    history.replaceState(null, '', `#/lab/${id}`);
    obj.open = id !== 'sandbox';
    setMode('select');
    drawObjectives();
    fit();
  }

  function resetLab() {
    if (!confirm('Reset this lab to its starting state? Your config on it will be lost.')) return;
    net = getLab(labId).make();
    terms = new Map();
    lastChecks = null;
    save();
    drawObjectives();
    fit();
  }

  function add(type) {
    const d = net.addDevice(type, Math.round(view.x + view.w / 2 + (Math.random() - 0.5) * 60), Math.round(view.y + view.h / 2 + (Math.random() - 0.5) * 60));
    save();
    draw();
    buzz();
    toast(`${d.name} added. Use 🔌 Cable to connect it.`);
  }

  // ---------- view (zoom/pan) ----------
  const applyView = () => svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
  function fit() {
    if (!net.devices.length) { view = { x: 0, y: 0, w: 520, h: 380 }; applyView(); draw(); return; }
    const xs = net.devices.map(d => d.x);
    const ys = net.devices.map(d => d.y);
    let x0 = Math.min(...xs) - 70; let x1 = Math.max(...xs) + 70;
    let y0 = Math.min(...ys) - 50; let y1 = Math.max(...ys) + 75;
    const minW = 340; const minH = 280;
    if (x1 - x0 < minW) { const c = (x0 + x1) / 2; x0 = c - minW / 2; x1 = c + minW / 2; }
    if (y1 - y0 < minH) { const c = (y0 + y1) / 2; y0 = c - minH / 2; y1 = c + minH / 2; }
    view = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    applyView();
    draw();
  }
  function zoomBy(f, cx = view.x + view.w / 2, cy = view.y + view.h / 2) {
    const w = Math.min(4000, Math.max(160, view.w * f));
    const k = w / view.w;
    view = { x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k, w, h: view.h * k };
    applyView();
  }
  const unitsPerPx = () => {
    const r = svg.getBoundingClientRect();
    return Math.max(view.w / r.width, view.h / r.height);
  };

  // ---------- drawing ----------
  function draw() {
    linkG.replaceChildren();
    devG.replaceChildren();
    for (const l of net.links) {
      const a = net.dev(l.a.dev);
      const b = net.dev(l.b.dev);
      if (!a || !b) continue;
      const upA = net.isUp(a, l.a.port);
      const upB = net.isUp(b, l.b.port);
      const g = s('g', { class: 'link', 'data-link': l.id });
      g.append(s('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'hit' }));
      g.append(s('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'wire' + (upA && upB ? ' up' : '') }));
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const t = Math.min(0.42, 50 / len);
      for (const [d, o, up, port] of [[a, b, upA, l.a.port], [b, a, upB, l.b.port]]) {
        const x = d.x + (o.x - d.x) * t;
        const y = d.y + (o.y - d.y) * t;
        g.append(s('circle', { cx: x, cy: y, r: 4.5, class: 'pdot ' + (up ? 'up' : 'down') }));
        if (showLabels) {
          // beside the dot on steep links (so it clears the device name), above it otherwise
          const steep = Math.abs(o.y - d.y) > Math.abs(o.x - d.x);
          g.append(s('text', steep ? { x: x + 8, y: y + 4, class: 'plabel', 'text-anchor': 'start' } : { x, y: y - 8, class: 'plabel', 'text-anchor': 'middle' }, shortIf(port)));
        }
      }
      linkG.append(g);
    }
    for (const d of net.devices) {
      const g = s('g', { class: `dev ${d.type}${cableFrom?.dev === d.id ? ' picked' : ''}`, transform: `translate(${d.x} ${d.y})`, 'data-dev': d.id });
      g.append(s('circle', { r: 36, class: 'halo' }));
      g.append(ICONS[d.type]());
      g.append(s('text', { y: 36, class: 'dlabel', 'text-anchor': 'middle' }, d.name));
      const ip = d.type === 'pc' ? d.ifaces.FastEthernet0.ip : null;
      if (ip) g.append(s('text', { y: 50, class: 'dsub', 'text-anchor': 'middle' }, ip));
      devG.append(g);
    }
  }

  // ---------- pointer handling: drag, tap, long-press, pan, pinch ----------
  const toSvg = (cx, cy) => {
    const pt = svg.createSVGPoint();
    pt.x = cx; pt.y = cy;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };
  const pointers = new Map();
  let gesture = null; // { kind: 'drag'|'pan'|'pinch', ... }
  let pressTimer = null;

  svg.addEventListener('pointerdown', e => {
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    clearTimeout(pressTimer);
    if (pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      const mid = toSvg((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      gesture = { kind: 'pinch', dist: Math.hypot(p1.x - p2.x, p1.y - p2.y), view: { ...view }, mid };
      return;
    }
    const g = e.target.closest('[data-dev]');
    if (g) {
      const d = net.dev(g.dataset.dev);
      const p = toSvg(e.clientX, e.clientY);
      gesture = { kind: 'drag', d, ox: p.x - d.x, oy: p.y - d.y, sx: e.clientX, sy: e.clientY, moved: false };
      pressTimer = setTimeout(() => { if (gesture?.kind === 'drag' && !gesture.moved) { gesture = null; buzz(15); deviceMenu(d); } }, 480);
      return;
    }
    const l = e.target.closest('[data-link]');
    gesture = { kind: 'pan', sx: e.clientX, sy: e.clientY, view: { ...view }, moved: false, link: l?.dataset.link };
  });

  svg.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) return;
    if (gesture.kind === 'pinch' && pointers.size >= 2) {
      const [p1, p2] = [...pointers.values()];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
      const k = Math.min(4000 / gesture.view.w, Math.max(160 / gesture.view.w, gesture.dist / dist));
      const { mid } = gesture;
      view = { x: mid.x - (mid.x - gesture.view.x) * k, y: mid.y - (mid.y - gesture.view.y) * k, w: gesture.view.w * k, h: gesture.view.h * k };
      applyView();
    } else if (gesture.kind === 'drag') {
      if (!gesture.moved && Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy) < 8) return;
      gesture.moved = true;
      clearTimeout(pressTimer);
      const p = toSvg(e.clientX, e.clientY);
      gesture.d.x = Math.round(p.x - gesture.ox);
      gesture.d.y = Math.round(p.y - gesture.oy);
      draw();
    } else if (gesture.kind === 'pan') {
      const dx = e.clientX - gesture.sx;
      const dy = e.clientY - gesture.sy;
      if (!gesture.moved && Math.hypot(dx, dy) < 8) return;
      gesture.moved = true;
      const u = unitsPerPx();
      view = { ...gesture.view, x: gesture.view.x - dx * u, y: gesture.view.y - dy * u };
      applyView();
    }
  });

  const end = e => {
    pointers.delete(e.pointerId);
    clearTimeout(pressTimer);
    const g = gesture;
    if (g?.kind === 'pinch') { if (pointers.size === 0) gesture = null; return; }
    gesture = null;
    if (!g || e.type === 'pointercancel') return;
    if (g.kind === 'drag') { if (g.moved) save(); else devTap(g.d); }
    else if (g.kind === 'pan' && !g.moved && g.link) linkTap(g.link);
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const p = toSvg(e.clientX, e.clientY);
    zoomBy(e.deltaY > 0 ? 1.1 : 0.9, p.x, p.y);
  }, { passive: false });
  svg.addEventListener('contextmenu', e => e.preventDefault());

  function devTap(d) {
    if (mode === 'delete') {
      if (confirm(`Delete ${d.name} and its cables?`)) { net.removeDevice(d.id); terms.delete(d.id); save(); draw(); }
      return;
    }
    if (mode === 'cable') { cableTap(d); return; }
    openDevice(d, 'cli');
  }

  function deviceMenu(d) {
    const act = (label, fn, cls = '') => h('button.menu-item' + cls, { onclick: () => { closeSheet(); fn(); } }, label);
    sheet(h('div.menu', {},
      act('⌨  Open CLI', () => openDevice(d, 'cli')),
      d.type === 'pc' ? act('⚙  IP configuration', () => openDevice(d, 'ip')) : null,
      act('🔌  Ports', () => openDevice(d, 'ports')),
      act('🧵  Cable from here', () => { setMode('cable'); cableTap(d); }),
      act('✎  Rename', () => {
        const nm = prompt('New name', d.name)?.trim();
        if (!nm) return;
        if (!/^[A-Za-z][\w-]{0,30}$/.test(nm)) { toast('Letters, digits, - and _ only'); return; }
        if (net.devices.some(x => x !== d && x.name.toLowerCase() === nm.toLowerCase())) { toast('Name in use'); return; }
        d.name = nm; save(); draw();
      }),
      act('🗑  Delete', () => { if (confirm(`Delete ${d.name}?`)) { net.removeDevice(d.id); terms.delete(d.id); save(); draw(); } }, '.danger')),
    { title: d.name });
  }

  function linkTap(id) {
    const l = net.links.find(x => x.id === id);
    if (!l) return;
    const a = net.dev(l.a.dev);
    const b = net.dev(l.b.dev);
    if (mode === 'delete') { net.removeLink(id); save(); draw(); buzz(); return; }
    toast(`${a.name} ${shortIf(l.a.port)} ↔ ${b.name} ${shortIf(l.b.port)}`);
  }

  function cableTap(d) {
    const free = net.freePorts(d);
    if (!free.length) { toast(`${d.name} has no free ports`); return; }
    pickPort(d, free, port => {
      if (!cableFrom) {
        cableFrom = { dev: d.id, port };
        statusLine.textContent = `From ${d.name} ${shortIf(port)}: now tap the other device.`;
        draw();
      } else {
        if (cableFrom.dev === d.id) { toast('Pick a different device'); return; }
        try {
          net.connect(cableFrom.dev, cableFrom.port, d.id, port);
          buzz();
          toast(`Connected ${net.dev(cableFrom.dev).name} ${shortIf(cableFrom.port)} ↔ ${d.name} ${shortIf(port)}`);
          save();
        } catch (err) { toast(err.message); }
        cableFrom = null;
        statusLine.textContent = 'Cable: tap the next device, or tap 🔌 to stop.';
        draw();
      }
    });
  }

  function pickPort(d, free, cb) {
    if (free.length === 1) { cb(free[0]); return; }
    sheet(h('div.port-pick', {},
      free.map(p => h('button.btn.ghost', { onclick: () => { closeSheet(); cb(p); } }, shortIf(p)))), { title: `${d.name}: choose a port` });
  }

  // ---------- device panel ----------
  function openDevice(d, tab = 'cli') {
    const body = h('div.dev-body', {});
    const tabs = h('div.seg', {});
    const title = h('span', {}, d.name);
    const drawTabs = () => {
      const opts = d.type === 'pc' ? [['cli', 'Terminal'], ['ip', 'IP Config'], ['ports', 'Ports']] : [['cli', 'CLI'], ['ports', 'Ports']];
      tabs.replaceChildren(...opts.map(([k, v]) => h('button' + (tab === k ? '.on' : ''), { onclick: () => { tab = k; drawTabs(); show(); } }, v)));
    };
    const show = () => {
      body.replaceChildren(tab === 'cli' ? terminal(d, () => { title.textContent = d.name; }) : tab === 'ip' ? pcConfig(d) : portsView(d));
    };
    drawTabs();
    show();
    sheet(h('div.dev-panel', {}, tabs, body), { title: h('span', {}, title, h('span.muted.small', {}, ` · ${d.type === 'pc' ? 'PC' : d.type === 'switch' ? '2960 switch' : '4331 router'}`)), tall: true, onClose: () => { draw(); } });
    document.querySelector('.scrim')?.classList.add('lab-scrim');
  }

  function terminal(d, onRename) {
    if (!terms.has(d.id)) {
      const cli = cliFor(net, d);
      const intro = d.type === 'pc'
        ? ['PC command line. Type help, or tap a suggestion below.', '']
        : ['', `${d.name}: simulated IOS. Tap suggestions, use ? for help.`, ''];
      terms.set(d.id, { cli, lines: intro, hist: [], hi: 0 });
    }
    const t = terms.get(d.id);
    t.cli.net = net;
    const out = h('pre.term-out', {});
    const promptEl = h('span.term-prompt', {});
    const input = h('input.term-in', { autocapitalize: 'off', autocorrect: 'off', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'send', 'aria-label': 'Command' });
    const chips = h('div.term-chips', {});

    const drawChips = () => {
      const val = input.value;
      const items = [];
      if (d.type === 'pc') {
        for (const q of PC_QUICK) if (!val || q.startsWith(val)) items.push({ label: q.trim() || q, insert: q, full: !q.endsWith(' ') });
      } else if (!val.trim()) {
        for (const q of QUICK[t.cli.mode] || []) {
          const m = t.cli.match(q.trim().split(/\s+/));
          if (m.err === 'invalid' || m.err === 'ambiguous') continue;
          items.push({ label: q.trim(), insert: q, full: !q.endsWith(' ') && !m.err });
        }
      } else {
        const sg = t.cli.suggest(val);
        if (sg.canEnd && /\s$/.test(val)) items.push({ label: '⏎ run', run: true });
        for (const w of sg.words) items.push(w.param ? { label: w.w, hint: true } : { label: w.w, insert: `${sg.base}${w.w} ` });
      }
      chips.replaceChildren(...items.slice(0, 30).map(it => h('button.chip-cmd' + (it.hint ? '.hint' : '') + (it.full ? '.full' : '') + (it.run ? '.run' : ''), {
        type: 'button',
        disabled: it.hint || null,
        onpointerdown: e => e.preventDefault(), // keep keyboard focus
        onclick: () => {
          buzz(4);
          if (it.run) { run(input.value); input.value = ''; }
          else if (it.full) { run(it.insert); input.value = ''; }
          else input.value = it.insert;
          drawChips();
          // Only pop the keyboard when the next word has to be typed (an IP, a number…)
          if (!it.full && !it.run && !chips.querySelector('.chip-cmd:not(.hint)')) input.focus({ preventScroll: true });
        },
      }, it.label)));
      if (!items.length) chips.append(h('span.muted.small.chip-empty', {}, 'type a value, then ⏎'));
    };

    const paint = () => {
      out.textContent = t.lines.slice(-500).join('\n');
      promptEl.textContent = t.cli.prompt();
      input.type = t.cli.pending?.type === 'password' ? 'password' : 'text';
      requestAnimationFrame(() => { out.scrollTop = out.scrollHeight; });
      drawChips();
    };
    const run = line => {
      const echo = t.cli.pending?.type === 'password' ? t.cli.prompt() : t.cli.prompt() + line;
      t.lines.push(echo);
      if (line.trim() && t.cli.pending?.type !== 'password') { t.hist.push(line); t.hi = t.hist.length; }
      const r = t.cli.exec(line);
      t.lines.push(...r.lines);
      paint();
      save();
      draw();
      onRename?.();
      if (r.anim?.length) animate(r.anim);
    };
    const help = () => {
      const line = input.value;
      t.lines.push(t.cli.prompt() + line + '?');
      const r = t.cli.exec(line + '?');
      t.lines.push(...r.lines);
      paint();
    };
    const complete = () => { input.value = t.cli.complete(input.value); drawChips(); };
    const hist = dir => {
      if (!t.hist.length) return;
      t.hi = Math.max(0, Math.min(t.hist.length, t.hi + dir));
      input.value = t.hist[t.hi] || '';
      drawChips();
    };
    input.addEventListener('input', drawChips);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); run(input.value); input.value = ''; drawChips(); }
      else if (e.key === 'Tab') { e.preventDefault(); complete(); }
      else if (e.key === '?' && d.type !== 'pc') { e.preventDefault(); help(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); hist(-1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); hist(1); }
      else if (e.key === 'z' && e.ctrlKey) { e.preventDefault(); run('end'); }
      else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); t.lines = []; paint(); }
    });
    const key = (label, fn, aria) => h('button', { type: 'button', 'aria-label': aria || label, onpointerdown: e => e.preventDefault(), onclick: () => { buzz(4); fn(); } }, label);
    const keys = h('div.term-keys', {},
      key('⏎', () => { run(input.value); input.value = ''; drawChips(); }, 'Run'),
      key('⌫ word', () => { input.value = input.value.replace(/\s*\S+\s*$/, ''); if (input.value) input.value += ' '; drawChips(); }, 'Delete word'),
      key('⌨', () => input.focus({ preventScroll: true }), 'Show keyboard'),
      key('Tab', complete),
      d.type !== 'pc' ? key('?', help, 'Help') : null,
      key('↑', () => hist(-1), 'Previous command'),
      key('↓', () => hist(1), 'Next command'),
      d.type !== 'pc' ? key('end', () => run('end'), 'End (Ctrl-Z)') : null,
      key('Clear', () => { t.lines = []; paint(); }));
    const wrap = h('div.term', { onclick: e => { if (e.target === out) input.focus({ preventScroll: true }); } },
      out, h('label.term-line', {}, promptEl, input), chips, keys);
    paint();
    if (matchMedia('(pointer: fine)').matches) setTimeout(() => input.focus({ preventScroll: true }), 80);
    return wrap;
  }

  function pcConfig(d) {
    const ifc = d.ifaces.FastEthernet0;
    const ip = h('input.input', { value: ifc.ip || '', inputmode: 'decimal', placeholder: '192.168.1.10' });
    const mask = h('input.input', { value: ifc.mask || '', inputmode: 'decimal', placeholder: '255.255.255.0 or /24' });
    const gw = h('input.input', { value: d.gw || '', inputmode: 'decimal', placeholder: '192.168.1.1' });
    return h('div.form', {},
      h('label.field', {}, 'IPv4 address', ip),
      h('label.field', {}, 'Subnet mask', mask),
      h('label.field', {}, 'Default gateway', gw),
      h('p.muted.small', {}, `MAC ${ifc.mac}`),
      h('button.btn.full', {
        onclick: () => {
          let m = mask.value.trim();
          if (/^\/?\d{1,2}$/.test(m) && +m.replace('/', '') <= 32) m = intToIp(prefixToMask(+m.replace('/', '')));
          if (ip.value && (!isIp(ip.value) || !isIp(m) || maskToPrefix(ipToInt(m)) === null)) { toast('Invalid IP or mask'); return; }
          if (gw.value && !isIp(gw.value)) { toast('Invalid gateway'); return; }
          ifc.ip = ip.value.trim() || null;
          ifc.mask = ip.value.trim() ? m : null;
          d.gw = gw.value.trim() || null;
          mask.value = ifc.mask || '';
          save();
          draw();
          buzz();
          toast('Saved');
        },
      }, 'Save'));
  }

  function portsView(d) {
    const rows = Object.keys(d.ifaces).filter(n => PORTS[d.type].includes(n) || d.ifaces[n].ip).map(n => {
      const i = d.ifaces[n];
      const p = net.peer(d.id, n);
      const up = net.isUp(d, n);
      const info = d.type === 'switch' && i.mode ? (i.mode === 'trunk' ? 'trunk' : `vlan ${i.vlan}`) : (i.ip ? `${i.ip}/${maskToPrefix(ipToInt(i.mask))}` : '');
      return h('tr', {},
        h('td', {}, h('span.pdot-i.' + (up ? 'up' : 'down'), {}), shortIf(n)),
        h('td', {}, p ? `${p.dev.name} ${shortIf(p.port)}` : h('span.muted', {}, '—')),
        h('td.muted', {}, i.shutdown ? 'shutdown' : info),
        h('td', {}, p ? h('button.icon-btn.tiny', { 'aria-label': 'Unplug', onclick: e => { net.removeLink(p.link.id); save(); draw(); e.target.closest('tr').children[1].textContent = '—'; e.target.remove(); } }, '✕') : null));
    });
    return h('div', {}, h('table.mini.ports', {}, h('tbody', {}, rows)),
      h('p.muted.small', {}, d.type === 'router' ? 'Router interfaces start shut down: use no shutdown.' : d.type === 'switch' ? 'Switch ports come up as soon as they are cabled.' : ''));
  }

  // ---------- packet animation ----------
  function animate(steps) {
    animG.replaceChildren();
    const per = steps.length > 12 ? 140 : 220;
    let i = 0;
    const dot = s('g', { class: 'pkt' }, s('rect', { x: -9, y: -6, width: 18, height: 12, rx: 2 }), s('path', { d: 'M-9 -6 L0 1 L9 -6' }));
    animG.append(dot);
    const stepOnce = () => {
      if (i >= steps.length) { setTimeout(() => animG.replaceChildren(), 300); return; }
      const st2 = steps[i++];
      const a = net.dev(st2.from);
      const b = net.dev(st2.to);
      if (!a || !b) { stepOnce(); return; }
      dot.classList.toggle('back', !!st2.back);
      const t0 = performance.now();
      const frame = now => {
        const k = Math.min(1, (now - t0) / per);
        dot.setAttribute('transform', `translate(${a.x + (b.x - a.x) * k} ${a.y + (b.y - a.y) * k})`);
        if (k < 1) requestAnimationFrame(frame); else stepOnce();
      };
      requestAnimationFrame(frame);
    };
    stepOnce();
  }

  // ---------- objectives ----------
  function drawObjectives() {
    const lab = getLab(labId);
    const done = lastChecks ? lastChecks.filter(Boolean).length : null;
    objCount.textContent = lab.checks.length ? (done === null ? `${lab.checks.length} ${lab.challenge ? 'goals' : 'objectives'}` : `${done}/${lab.checks.length} ✓`) : '';
    if (lab.challenge) return drawChallenge(lab);
    objBody.replaceChildren(
      h('div.brief', { html: md(lab.brief) }),
      lab.checks.length ? h('ul.objs', {}, lab.checks.map(([text], i) => h('li' + (lastChecks ? (lastChecks[i] ? '.pass' : '.fail') : ''), {},
        h('span.oi', {}, lastChecks ? (lastChecks[i] ? '✓' : '✗') : '○'), text))) : null,
      lab.checks.length ? h('button.btn.small', { onclick: runChecks }, 'Check objectives') : null);
  }

  // A word problem: the story and goals, but no commands. Hints unlock one at a time; the model
  // solution (and, for tickets, what was broken) only after solving or giving up.
  function drawChallenge(lab) {
    const st = chalState(labId) || {};
    const solved = !!st.solvedAt, gaveUp = !!st.gaveUp;
    const shown = Math.min(st.hints || 0, lab.hints.length);
    const mins = Math.max(1, Math.round(((st.solvedAt || Date.now()) - (st.started || Date.now())) / 60000));
    const solution = h('details.ch-solution', { open: gaveUp || null }, h('summary', {}, 'Model solution'),
      h('pre.code', {}, Object.entries(lab.solution).map(([dev, cmds]) => `! ${dev}\n${cmds.filter(c => !['en', 'conf t', 'end'].includes(c)).join('\n')}`).join('\n\n')));
    objBody.replaceChildren(...[
      h('div.ch-meta', {}, h('span.ch-kind', {}, lab.kind === 'ticket' ? '🎫 Troubleshooting ticket' : '🧩 Build challenge'), h('span.muted.small', {}, ` · ${lab.domain} · ${stars(lab.level)}`)),
      h('div.brief', { html: md(lab.story) }),
      h('div.muted.small', {}, 'Goals (how you get there is up to you):'),
      h('ul.objs', {}, lab.checks.map(([text], i) => h('li' + (lastChecks ? (lastChecks[i] ? '.pass' : '.fail') : ''), {}, h('span.oi', {}, lastChecks ? (lastChecks[i] ? '✓' : '✗') : '○'), text))),
      shown ? h('ol.ch-hints', {}, lab.hints.slice(0, shown).map(t => h('li', { html: md(t) }))) : null,
      (solved || gaveUp) ? h('div.ch-done', {},
        h('p', {}, solved ? `🎉 Solved in ${st.checks || 1} check${st.checks === 1 ? '' : 's'}, ${shown} hint${shown === 1 ? '' : 's'}, ~${mins} min.` : 'Here\'s how it was meant to go:'),
        h('div', { html: md(lab.explain) }), solution) : null,
      h('div.row.wrap.ch-actions', {},
        h('button.btn.small', { onclick: runChecks }, 'Check my work'),
        !(solved || gaveUp) && shown < lab.hints.length ? h('button.btn.small.ghost', { onclick: () => { setChal(labId, { hints: shown + 1 }); drawObjectives(); } }, `💡 Hint ${shown + 1}/${lab.hints.length}`) : null,
        h('button.btn.small.ghost', { onclick: newVariant }, '🎲 New variant'),
        !(solved || gaveUp) ? h('button.btn.small.ghost', { onclick: () => { if (!confirm('Show the model solution? This counts as giving up on this variant.')) return; setChal(labId, { gaveUp: true }); drawObjectives(); } }, 'Give up') : null),
    ].filter(Boolean));
  }

  function newVariant() {
    const st = chalState(labId);
    if (st && !st.solvedAt && !st.gaveUp && st.checks && !confirm('Start a new variant? Your work on this one will be lost.')) return;
    update(x => { delete x.labs.topos[labId]; });
    setChal(labId, { seed: newSeed(), hints: 0, checks: 0, started: Date.now(), solvedAt: null, gaveUp: false });
    net = getLab(labId).make();
    terms = new Map();
    lastChecks = null;
    save();
    drawObjectives();
    fit();
    toast('New variant: different names, numbers' + (getLab(labId).kind === 'ticket' ? ' and faults' : ''));
  }

  function runChecks() {
    const lab = getLab(labId);
    if (!lab.checks.length) { toast('Sandbox has no objectives'); return; }
    lastChecks = lab.checks.map(([, f]) => { try { return !!f(net); } catch { return false; } });
    obj.open = true;
    const n = lastChecks.filter(Boolean).length;
    const all = n === lastChecks.length;
    if (lab.challenge) {
      const st = chalState(labId) || {};
      setChal(labId, { checks: (st.checks || 0) + 1, ...(all && !st.solvedAt && !st.gaveUp ? { solvedAt: Date.now() } : {}) });
      if (all && !st.solvedAt && !st.gaveUp) {
        update(x => { x.labs.chalDone = { ...(x.labs.chalDone || {}), [labId.slice(3)]: (x.labs.chalDone?.[labId.slice(3)] || 0) + 1 }; x.plan.daily[todayKey()] = { ...(x.plan.daily[todayKey()] || {}), lab: true }; });
        const c = CHALLENGES.find(x => `ch:${x.id}` === labId);
        labSel.querySelector(`option[value="${labId}"]`).textContent = chalLabel(c);
      }
    }
    drawObjectives();
    draw();
    save();
    if (all) {
      buzz(30);
      if (!lab.challenge) {
        update(x => { x.labs.done = { ...(x.labs.done || {}), [labId]: Date.now() }; x.plan.daily[todayKey()] = { ...(x.plan.daily[todayKey()] || {}), lab: true }; });
        labSel.querySelector(`option[value="${labId}"]`).textContent = `✓ ${lab.title}`;
      }
      toast(lab.challenge ? '🎉 Solved! See what was going on below.' : '🎉 Lab complete!');
    } else toast(`${n}/${lastChecks.length} ${lab.challenge ? 'goals' : 'objectives'} met${lab.challenge ? '. Keep going' : ''}`);
  }

  setMode('select');
  drawObjectives();
  requestAnimationFrame(fit);
  const onResize = () => draw();
  window.addEventListener('resize', onResize);
  return () => { save(); window.removeEventListener('resize', onResize); };
}
