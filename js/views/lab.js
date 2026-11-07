// Mini Packet Tracer: drag devices, cable ports, open a CLI, ping, check objectives.

import { h, sheet, closeSheet, toast, md, todayKey } from '../ui.js';
import { db, update } from '../store.js';
import { Net, PORTS, shortIf } from '../sim/engine.js';
import { cliFor } from '../sim/cli.js';
import { LABS, labById } from '../sim/labs.js';
import { isIp, ipToInt, intToIp, maskToPrefix, prefixToMask } from '../sim/net.js';

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

let terms = new Map(); // devId -> { cli, lines: [], hist: [], hi }

export function render(root) {
  const st = db();
  let labId = st.labs.current && labById(st.labs.current) ? st.labs.current : 'hello';
  let net = load(labId);
  let mode = 'select'; // select | cable | delete
  let cableFrom = null;
  let showLabels = true;
  let drag = null;
  let lastChecks = null;

  terms = new Map();

  function load(id) {
    const saved = db().labs.topos[id];
    return saved ? new Net(saved) : labById(id).make();
  }

  let saveT = null;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => update(x => { x.labs.topos[labId] = net.toJSON(); x.labs.current = labId; }), 200);
  }

  // ---------- layout ----------
  const svg = s('svg', { class: 'canvas', role: 'img', 'aria-label': 'Network topology' });
  const linkG = s('g');
  const devG = s('g');
  const animG = s('g');
  svg.append(linkG, devG, animG);

  const labSel = h('select.input.lab-select', { onchange: e => switchLab(e.target.value), 'aria-label': 'Choose lab' },
    LABS.map(l => h('option', { value: l.id, selected: l.id === labId }, `${db().labs.done?.[l.id] ? '✓ ' : ''}${l.title}`)));

  const modeBtns = {};
  const tool = (id, label, title) => {
    modeBtns[id] = h('button.tool' + (mode === id ? '.on' : ''), { title, onclick: () => setMode(mode === id ? 'select' : id) }, label);
    return modeBtns[id];
  };
  const statusLine = h('div.lab-status', {}, 'Tap a device to open its CLI. Drag to move.');

  const toolbar = h('div.toolbar', {},
    h('button.tool', { title: 'Add PC', onclick: () => add('pc') }, '+ PC'),
    h('button.tool', { title: 'Add switch', onclick: () => add('switch') }, '+ Switch'),
    h('button.tool', { title: 'Add router', onclick: () => add('router') }, '+ Router'),
    tool('cable', '🔌 Cable', 'Connect two devices'),
    tool('delete', '🗑', 'Delete devices or cables'),
    h('button.tool', { title: 'Toggle port labels', onclick: () => { showLabels = !showLabels; draw(); } }, 'Aa'),
  );

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
    h('div.canvas-wrap', {}, svg, statusLine),
    obj);

  function setMode(m) {
    mode = m;
    cableFrom = null;
    for (const [k, b] of Object.entries(modeBtns)) b.classList.toggle('on', k === mode);
    statusLine.textContent = m === 'cable' ? 'Cable: tap the first device.' : m === 'delete' ? 'Delete: tap a device or a cable.' : 'Tap a device to open its CLI. Drag to move.';
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
    obj.open = id !== 'sandbox';
    setMode('select');
    drawObjectives();
    fit();
  }

  function resetLab() {
    if (!confirm('Reset this lab to its starting state? Your config on it will be lost.')) return;
    net = labById(labId).make();
    terms = new Map();
    lastChecks = null;
    save();
    drawObjectives();
    fit();
  }

  function add(type) {
    const vb = svg.viewBox.baseVal;
    const cx = vb && vb.width ? vb.x + vb.width / 2 : 250;
    const cy = vb && vb.height ? vb.y + vb.height / 2 : 200;
    const d = net.addDevice(type, Math.round(cx + (Math.random() - 0.5) * 80), Math.round(cy + (Math.random() - 0.5) * 80));
    save();
    draw();
    toast(`${d.name} added. Use 🔌 Cable to connect it.`);
  }

  // ---------- drawing ----------
  function fit() {
    if (!net.devices.length) { svg.setAttribute('viewBox', '0 0 520 380'); draw(); return; }
    const xs = net.devices.map(d => d.x);
    const ys = net.devices.map(d => d.y);
    let x0 = Math.min(...xs) - 70;
    let x1 = Math.max(...xs) + 70;
    let y0 = Math.min(...ys) - 50;
    let y1 = Math.max(...ys) + 75;
    const minW = 360;
    const minH = 300;
    if (x1 - x0 < minW) { const c = (x0 + x1) / 2; x0 = c - minW / 2; x1 = c + minW / 2; }
    if (y1 - y0 < minH) { const c = (y0 + y1) / 2; y0 = c - minH / 2; y1 = c + minH / 2; }
    svg.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);
    draw();
  }

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
      const dot = (d, o, up, port, t) => {
        const x = d.x + (o.x - d.x) * t;
        const y = d.y + (o.y - d.y) * t;
        g.append(s('circle', { cx: x, cy: y, r: 4.5, class: 'pdot ' + (up ? 'up' : 'down') }));
        if (showLabels) g.append(s('text', { x, y: y - 8, class: 'plabel', 'text-anchor': 'middle' }, shortIf(port)));
      };
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const t = Math.min(0.4, 46 / len);
      dot(a, b, upA, l.a.port, t);
      dot(b, a, upB, l.b.port, t);
      linkG.append(g);
    }
    for (const d of net.devices) {
      const g = s('g', { class: `dev ${d.type}${cableFrom?.dev === d.id ? ' picked' : ''}`, transform: `translate(${d.x} ${d.y})`, 'data-dev': d.id });
      g.append(s('circle', { r: 34, class: 'halo' }));
      g.append(ICONS[d.type]());
      g.append(s('text', { y: 36, class: 'dlabel', 'text-anchor': 'middle' }, d.name));
      const ip = d.type === 'pc' ? d.ifaces.FastEthernet0.ip : null;
      if (ip) g.append(s('text', { y: 50, class: 'dsub', 'text-anchor': 'middle' }, ip));
      devG.append(g);
    }
  }

  // ---------- pointer handling ----------
  const toSvg = e => {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };

  svg.addEventListener('pointerdown', e => {
    const g = e.target.closest('[data-dev]');
    if (g) {
      const d = net.dev(g.dataset.dev);
      const p = toSvg(e);
      drag = { d, ox: p.x - d.x, oy: p.y - d.y, sx: e.clientX, sy: e.clientY, moved: false, g };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    const l = e.target.closest('[data-link]');
    if (l) linkTap(l.dataset.link);
  });
  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 8) return;
    drag.moved = true;
    const p = toSvg(e);
    drag.d.x = Math.round(p.x - drag.ox);
    drag.d.y = Math.round(p.y - drag.oy);
    draw();
  });
  const end = () => {
    if (!drag) return;
    const { d, moved } = drag;
    drag = null;
    if (moved) { save(); fit(); return; }
    devTap(d);
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', () => { drag = null; });

  function devTap(d) {
    if (mode === 'delete') {
      if (confirm(`Delete ${d.name} and its cables?`)) { net.removeDevice(d.id); terms.delete(d.id); save(); fit(); }
      return;
    }
    if (mode === 'cable') return cableTap(d);
    openDevice(d);
  }

  function linkTap(id) {
    const l = net.links.find(x => x.id === id);
    if (!l) return;
    const a = net.dev(l.a.dev);
    const b = net.dev(l.b.dev);
    if (mode === 'delete') { net.removeLink(id); save(); draw(); return; }
    toast(`${a.name} ${shortIf(l.a.port)} ↔ ${b.name} ${shortIf(l.b.port)}`);
  }

  function cableTap(d) {
    const free = net.freePorts(d);
    if (!free.length) return toast(`${d.name} has no free ports`);
    pickPort(d, free, port => {
      if (!cableFrom) {
        cableFrom = { dev: d.id, port };
        statusLine.textContent = `Cable from ${d.name} ${shortIf(port)}: now tap the other device.`;
        draw();
      } else {
        if (cableFrom.dev === d.id) { toast('Pick a different device'); return; }
        try {
          net.connect(cableFrom.dev, cableFrom.port, d.id, port);
          toast(`Connected ${net.dev(cableFrom.dev).name} ${shortIf(cableFrom.port)} ↔ ${d.name} ${shortIf(port)}`);
          save();
        } catch (err) { toast(err.message); }
        cableFrom = null;
        statusLine.textContent = 'Cable: tap the first device (or tap 🔌 again to stop).';
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
  function openDevice(d) {
    let tab = 'cli';
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
        ? ['Packet Tracer-style PC Command Line 1.0', 'Type help for commands.', '']
        : ['', `${d.name} simulated IOS. Use ? for help, Tab to complete.`, 'Press RETURN to get started.', ''];
      terms.set(d.id, { cli, lines: intro, hist: [], hi: 0 });
    }
    const t = terms.get(d.id);
    t.cli.net = net;
    const out = h('pre.term-out', {});
    const promptEl = h('span.term-prompt', {});
    const input = h('input.term-in', { autocapitalize: 'off', autocorrect: 'off', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'send', 'aria-label': 'Command' });
    const paint = () => {
      out.textContent = t.lines.slice(-500).join('\n');
      promptEl.textContent = t.cli.prompt();
      input.type = t.cli.pending?.type === 'password' ? 'password' : 'text';
      requestAnimationFrame(() => { out.scrollTop = out.scrollHeight; });
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
      input.focus();
    };
    const complete = () => { input.value = t.cli.complete(input.value); input.focus(); };
    const hist = dir => {
      if (!t.hist.length) return;
      t.hi = Math.max(0, Math.min(t.hist.length, t.hi + dir));
      input.value = t.hist[t.hi] || '';
      input.focus();
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); run(input.value); input.value = ''; }
      else if (e.key === 'Tab') { e.preventDefault(); complete(); }
      else if (e.key === '?' && d.type !== 'pc') { e.preventDefault(); help(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); hist(-1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); hist(1); }
      else if (e.key === 'z' && e.ctrlKey) { e.preventDefault(); run('end'); }
      else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); t.lines = []; paint(); }
    });
    const keys = h('div.term-keys', {},
      h('button', { onclick: complete }, 'Tab'),
      d.type !== 'pc' ? h('button', { onclick: help }, '?') : null,
      h('button', { onclick: () => hist(-1) }, '↑'),
      h('button', { onclick: () => hist(1) }, '↓'),
      d.type !== 'pc' ? h('button', { onclick: () => { run('end'); input.focus(); } }, '^Z') : null,
      d.type !== 'pc' ? h('button', { onclick: () => { input.value = 'show '; input.focus(); } }, 'show') : null,
      h('button', { onclick: () => { t.lines = []; paint(); input.focus(); } }, 'Clear'));
    const wrap = h('div.term', { onclick: e => { if (e.target === out || e.target === wrap) input.focus(); } },
      out, h('label.term-line', {}, promptEl, input), keys);
    paint();
    setTimeout(() => input.focus({ preventScroll: true }), 80);
    return wrap;
  }

  function pcConfig(d) {
    const ifc = d.ifaces.FastEthernet0;
    const ip = h('input.input', { value: ifc.ip || '', inputmode: 'decimal', placeholder: '192.168.1.10' });
    const mask = h('input.input', { value: ifc.mask || '', inputmode: 'decimal', placeholder: '255.255.255.0' });
    const gw = h('input.input', { value: d.gw || '', inputmode: 'decimal', placeholder: '192.168.1.1' });
    const nm = h('input.input', { value: d.name });
    return h('div.form', {},
      h('label.field', {}, 'Display name', nm),
      h('label.field', {}, 'IPv4 address', ip),
      h('label.field', {}, 'Subnet mask (or /prefix)', mask),
      h('label.field', {}, 'Default gateway', gw),
      h('p.muted.small', {}, `MAC ${ifc.mac}`),
      h('button.btn.full', {
        onclick: () => {
          let m = mask.value.trim();
          if (/^\/?\d{1,2}$/.test(m) && +m.replace('/', '') <= 32) m = intToIp(prefixToMask(+m.replace('/', '')));
          if (ip.value && (!isIp(ip.value) || !isIp(m) || maskToPrefix(ipToInt(m)) === null)) return toast('Invalid IP or mask');
          if (gw.value && !isIp(gw.value)) return toast('Invalid gateway');
          if (nm.value.trim() && !net.devices.some(x => x !== d && x.name.toLowerCase() === nm.value.trim().toLowerCase())) d.name = nm.value.trim();
          ifc.ip = ip.value.trim() || null;
          ifc.mask = ip.value.trim() ? m : null;
          d.gw = gw.value.trim() || null;
          mask.value = ifc.mask || '';
          save();
          draw();
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
        h('td', {}, p ? h('button.icon-btn.tiny', { 'aria-label': 'Unplug', title: 'Unplug', onclick: e => { net.removeLink(p.link.id); save(); draw(); e.target.closest('tr').querySelector('td:nth-child(2)').textContent = '—'; e.target.remove(); } }, '✕') : null));
    });
    return h('div', {}, h('table.mini.ports', {}, h('tbody', {}, rows)),
      h('p.muted.small', {}, d.type === 'router' ? 'Router interfaces start shut down: use no shutdown.' : d.type === 'switch' ? 'Switch ports are up as soon as they are cabled.' : ''));
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
      if (!a || !b) return stepOnce();
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
    const lab = labById(labId);
    const done = lastChecks ? lastChecks.filter(Boolean).length : null;
    objCount.textContent = lab.checks.length ? (done === null ? `${lab.checks.length} objectives` : `${done}/${lab.checks.length} ✓`) : '';
    objBody.replaceChildren(
      h('div.brief', { html: md(lab.brief) }),
      lab.checks.length ? h('ul.objs', {}, lab.checks.map(([text], i) => h('li' + (lastChecks ? (lastChecks[i] ? '.pass' : '.fail') : ''), {},
        h('span.oi', {}, lastChecks ? (lastChecks[i] ? '✓' : '✗') : '○'), text))) : null,
      lab.checks.length ? h('button.btn.small', { onclick: runChecks }, 'Check objectives') : null);
  }

  function runChecks() {
    const lab = labById(labId);
    if (!lab.checks.length) { toast('Sandbox has no objectives'); return; }
    lastChecks = lab.checks.map(([, f]) => { try { return !!f(net); } catch { return false; } });
    obj.open = true;
    drawObjectives();
    draw();
    save();
    const n = lastChecks.filter(Boolean).length;
    if (n === lastChecks.length) {
      update(x => { x.labs.done = { ...(x.labs.done || {}), [labId]: Date.now() }; x.plan.daily[todayKey()] = { ...(x.plan.daily[todayKey()] || {}), lab: true }; });
      toast('🎉 Lab complete!');
      labSel.querySelector(`option[value="${labId}"]`).textContent = `✓ ${lab.title}`;
    } else toast(`${n}/${lastChecks.length} objectives met`);
  }

  drawObjectives();
  fit();
  const onResize = () => draw();
  window.addEventListener('resize', onResize);
  return () => { save(); window.removeEventListener('resize', onResize); };
}
