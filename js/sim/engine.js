// Mini network simulator: devices, cables, L2 switching with VLANs/trunks,
// L3 routing (connected, static, OSPF), ACLs, ARP, ping and traceroute.
// Logical model only: no timers, no STP, no real frames. Good enough to lab
// CCNA configs on a phone and see whether they would work.

import {
  ipToInt, intToIp, prefixToMask, maskToPrefix, network, sameSubnet,
} from './net.js';

export const PLATFORM = { pc: 'PC', switch: 'WS-C2960-24TT', router: 'ISR4331' };

const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));
export const PORTS = {
  pc: ['FastEthernet0'],
  switch: [...range(8, i => `FastEthernet0/${i + 1}`), 'GigabitEthernet0/1', 'GigabitEthernet0/2'],
  router: ['GigabitEthernet0/0', 'GigabitEthernet0/1', 'GigabitEthernet0/2'],
};

const IF_TYPES = ['GigabitEthernet', 'FastEthernet', 'Loopback', 'Vlan'];

/** Normalise "g0/0", "gi 0/0.10", "fa0/1", "lo0", "vlan 10" to canonical names. */
export function normIf(str) {
  if (!str) return null;
  const m = String(str).replace(/\s+/g, '').match(/^([a-zA-Z]+)(\d[\d/.]*)$/);
  if (!m) return null;
  const t = IF_TYPES.find(full => full.toLowerCase().startsWith(m[1].toLowerCase()));
  return t ? t + m[2] : null;
}

export function shortIf(name) {
  return name
    .replace('GigabitEthernet', 'Gi').replace('FastEthernet', 'Fa')
    .replace('Loopback', 'Lo').replace('Vlan', 'Vl');
}

let uidN = 0;
const uid = p => `${p}${Date.now().toString(36)}${(uidN++).toString(36)}`;

function randMac() {
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `00${Math.floor(Math.random() * 256).toString(16).padStart(2, '0')}.${h()}.${h()}`;
}

function newIface(type, name) {
  const i = { name, mac: randMac(), ip: null, mask: null, desc: '', shutdown: type === 'router', extra: [] };
  if (type === 'switch' && !name.startsWith('Vlan')) {
    Object.assign(i, { mode: 'access', vlan: 1, native: 1, allowed: null });
  }
  return i;
}

export function createDevice(type, name, x = 100, y = 100) {
  const d = {
    id: uid('d'), type, name, x, y, mac: randMac(), ifaces: {}, arp: {}, globalCfg: [], lines: {},
  };
  for (const p of PORTS[type]) d.ifaces[p] = newIface(type, p);
  if (type === 'pc') d.gw = null;
  if (type === 'switch') {
    d.vlans = { 1: 'default' };
    d.macTable = {};
    d.gw = null;
    d.ifaces.Vlan1 = newIface('switch', 'Vlan1');
    d.ifaces.Vlan1.shutdown = true;
  }
  if (type === 'router') {
    d.statics = [];
    d.ospf = null;
    d.acls = {};
  }
  return d;
}

const isPhysical = name => /^(GigabitEthernet|FastEthernet)\d+(\/\d+)*$/.test(name);
const parentOf = name => name.split('.')[0];

function aclMatch(spec, ip) {
  if (!spec) return true;
  const keep = (~spec.wild) >>> 0;
  return ((ip & keep) >>> 0) === ((spec.ip & keep) >>> 0);
}

export class Net {
  constructor(data) {
    this.devices = data?.devices ? JSON.parse(JSON.stringify(data.devices)) : [];
    this.links = data?.links ? JSON.parse(JSON.stringify(data.links)) : [];
  }

  toJSON() { return { devices: this.devices, links: this.links }; }

  dev(id) { return this.devices.find(d => d.id === id); }
  byName(n) { return this.devices.find(d => d.name.toLowerCase() === String(n).toLowerCase()); }

  addDevice(type, x, y, name) {
    if (!name) {
      const pre = { pc: 'PC', switch: 'S', router: 'R' }[type];
      let n = 1;
      while (this.byName(pre + n)) n++;
      name = pre + n;
    }
    const d = createDevice(type, name, x, y);
    this.devices.push(d);
    return d;
  }

  removeDevice(id) {
    this.devices = this.devices.filter(d => d.id !== id);
    this.links = this.links.filter(l => l.a.dev !== id && l.b.dev !== id);
  }

  linkOf(devId, port) {
    return this.links.find(l => (l.a.dev === devId && l.a.port === port) || (l.b.dev === devId && l.b.port === port));
  }

  peer(devId, port) {
    const l = this.linkOf(devId, port);
    if (!l) return null;
    const o = l.a.dev === devId && l.a.port === port ? l.b : l.a;
    return { dev: this.dev(o.dev), port: o.port, link: l };
  }

  freePorts(dev) { return PORTS[dev.type].filter(p => !this.linkOf(dev.id, p)); }

  connect(aId, aPort, bId, bPort) {
    if (aId === bId) throw new Error('Cannot cable a device to itself');
    if (this.linkOf(aId, aPort) || this.linkOf(bId, bPort)) throw new Error('Port already in use');
    const l = { id: uid('l'), a: { dev: aId, port: aPort }, b: { dev: bId, port: bPort } };
    this.links.push(l);
    return l;
  }

  removeLink(id) { this.links = this.links.filter(l => l.id !== id); }

  // ---------- interface state ----------

  /** Is the interface up/up? */
  isUp(dev, name) {
    const ifc = dev.ifaces[name];
    if (!ifc || ifc.shutdown) return false;
    if (name.startsWith('Loopback')) return true;
    if (name.includes('.')) return this.isUp(dev, parentOf(name));
    if (name.startsWith('Vlan')) {
      const v = +name.slice(4);
      if (!dev.vlans?.[v]) return false;
      return PORTS.switch.some(p => {
        const pi = dev.ifaces[p];
        if (!this.isUp(dev, p)) return false;
        return pi.mode === 'trunk' ? this.trunkAllows(pi, v) : pi.vlan === v;
      });
    }
    const p = this.peer(dev.id, name);
    if (!p) return false;
    return !p.dev.ifaces[p.port].shutdown;
  }

  /** "up", "down" or "administratively down" for show commands. */
  status(dev, name) {
    const ifc = dev.ifaces[name];
    if (ifc.shutdown) return ['administratively down', 'down'];
    return this.isUp(dev, name) ? ['up', 'up'] : ['down', 'down'];
  }

  trunkAllows(ifc, v) { return !ifc.allowed || ifc.allowed.includes(v); }

  ifaceMac(dev, name) {
    if (name.startsWith('Vlan')) return dev.mac;
    return dev.ifaces[parentOf(name)]?.mac || dev.mac;
  }

  ipOf(dev, name) { return dev.ifaces[name]?.ip ?? null; }

  ownsIp(dev, ip) {
    return Object.values(dev.ifaces).some(i => i.ip === ip && this.isUp(dev, i.name));
  }

  /** Interfaces that have an IP and are up. */
  l3Ifaces(dev) { return Object.values(dev.ifaces).filter(i => i.ip !== null && this.isUp(dev, i.name)); }

  // ---------- layer 2 ----------

  /**
   * Every L3 endpoint in the same broadcast domain as dev/ifName.
   * Each result carries the cable path (link steps) the frame took.
   */
  reachableL3(dev, ifName) {
    const results = [];
    const visited = new Set();
    const ifc = dev.ifaces[ifName];

    const emit = (d, port, tag, path) => {
      if (!this.isUp(d, port)) return;
      const p = this.peer(d.id, port);
      if (!p) return;
      arrive(p.dev, p.port, tag, [...path, { link: p.link.id, from: d.id, fromPort: port, to: p.dev.id, toPort: p.port }]);
    };

    const arrive = (d, port, tag, path) => {
      const pi = d.ifaces[port];
      if (pi.shutdown) return;
      if (d.type === 'switch') {
        let vlan;
        if (pi.mode === 'trunk') {
          vlan = tag == null ? pi.native : tag;
          if (!this.trunkAllows(pi, vlan)) return;
        } else {
          if (tag != null) return;
          vlan = pi.vlan;
        }
        if (!d.vlans[vlan]) return;
        path[path.length - 1].vlan = vlan;
        inSwitch(d, vlan, port, path);
      } else if (d.type === 'router') {
        const cand = Object.values(d.ifaces).find(i => {
          if (tag == null) {
            if (i.name === port) return i.ip !== null;
            return parentOf(i.name) === port && i.name !== port && i.encap != null && i.native;
          }
          return parentOf(i.name) === port && i.name !== port && i.encap === tag;
        });
        if (cand && cand.ip !== null && this.isUp(d, cand.name)) results.push({ dev: d, ifName: cand.name, path });
      } else if (tag == null) {
        results.push({ dev: d, ifName: port, path });
      }
    };

    const inSwitch = (d, vlan, inPort, path) => {
      const key = `${d.id}|${vlan}`;
      if (visited.has(key)) return;
      visited.add(key);
      const svi = d.ifaces[`Vlan${vlan}`];
      if (svi && svi.ip && svi.name !== inPort && this.isUp(d, svi.name)) results.push({ dev: d, ifName: svi.name, path });
      for (const p of PORTS.switch) {
        if (p === inPort) continue;
        const pi = d.ifaces[p];
        if (pi.mode === 'trunk') {
          if (this.trunkAllows(pi, vlan)) emit(d, p, vlan === pi.native ? null : vlan, path);
        } else if (pi.vlan === vlan) {
          emit(d, p, null, path);
        }
      }
    };

    if (dev.type === 'switch' && ifName.startsWith('Vlan')) {
      inSwitch(dev, +ifName.slice(4), ifName, []);
    } else if (ifName.includes('.')) {
      if (ifc.encap == null) return results;
      emit(dev, parentOf(ifName), ifc.native ? null : ifc.encap, []);
    } else {
      emit(dev, ifName, null, []);
    }
    return results;
  }

  learnMacs(path, srcMac, dstMac) {
    path.forEach((s, i) => {
      const sw = this.dev(s.to);
      if (sw?.type !== 'switch' || s.vlan == null) return;
      sw.macTable[`${s.vlan}|${srcMac}`] = { vlan: s.vlan, mac: srcMac, port: s.toPort };
      const next = path[i + 1];
      if (next && dstMac) sw.macTable[`${s.vlan}|${dstMac}`] = { vlan: s.vlan, mac: dstMac, port: next.fromPort };
    });
  }

  // ---------- layer 3 ----------

  routerId(dev) {
    if (dev.ospf?.rid) return dev.ospf.rid;
    const ups = this.l3Ifaces(dev);
    const lo = ups.filter(i => i.name.startsWith('Loopback'));
    const pool = lo.length ? lo : ups;
    if (!pool.length) return null;
    return intToIp(Math.max(...pool.map(i => ipToInt(i.ip))));
  }

  ifCost(dev, ifc) {
    if (ifc.ospfCost) return ifc.ospfCost;
    const ref = dev.ospf?.refBw || 100;
    const bw = ifc.name.startsWith('GigabitEthernet') ? 1000 : ifc.name.startsWith('Loopback') ? 8000000 : 100;
    return Math.max(1, Math.floor(ref / bw));
  }

  /** OSPF-enabled interfaces of a router. */
  ospfIfaces(dev) {
    if (!dev.ospf) return [];
    return this.l3Ifaces(dev).map(ifc => {
      const ip = ipToInt(ifc.ip);
      let area = ifc.ospfArea ?? null;
      if (area === null) {
        const n = dev.ospf.networks.find(s => {
          const keep = (~s.wild) >>> 0;
          return ((ip & keep) >>> 0) === ((s.net & keep) >>> 0);
        });
        if (n) area = n.area;
      }
      if (area === null) return null;
      const loop = ifc.name.startsWith('Loopback');
      return {
        ifc, area, ip,
        mask: loop ? 0xffffffff : ipToInt(ifc.mask),
        passive: loop || dev.ospf.passive.includes(ifc.name),
        cost: this.ifCost(dev, ifc),
        pri: ifc.ospfPriority ?? 1,
      };
    }).filter(Boolean);
  }

  /** Neighbours of a router: [{dev, rid, ip, myIf, theirIf, pri}] */
  ospfNeighbors(dev) {
    const out = [];
    for (const oi of this.ospfIfaces(dev)) {
      if (oi.passive) continue;
      for (const e of this.reachableL3(dev, oi.ifc.name)) {
        if (e.dev.type !== 'router' || e.dev === dev) continue;
        const theirs = this.ospfIfaces(e.dev).find(x => x.ifc.name === e.ifName);
        if (!theirs || theirs.passive || theirs.area !== oi.area) continue;
        if (ipToInt(e.dev.ifaces[e.ifName].mask) !== oi.mask || !sameSubnet(oi.ip, theirs.ip, oi.mask)) continue;
        out.push({ dev: e.dev, rid: this.routerId(e.dev), ip: e.dev.ifaces[e.ifName].ip, myIf: oi.ifc.name, theirIf: e.ifName, pri: theirs.pri, cost: oi.cost });
      }
    }
    return out;
  }

  /** DR/BDR on the segment of dev/ifName: returns {dr, bdr} router IDs. */
  ospfElection(dev, ifName) {
    const mine = this.ospfIfaces(dev).find(x => x.ifc.name === ifName);
    if (!mine) return {};
    const parts = [{ rid: this.routerId(dev), pri: mine.pri }];
    for (const n of this.ospfNeighbors(dev)) if (n.myIf === ifName) parts.push({ rid: n.rid, pri: n.pri });
    const elig = parts.filter(p => p.pri > 0)
      .sort((a, b) => b.pri - a.pri || ipToInt(b.rid) - ipToInt(a.rid));
    return { dr: elig[0]?.rid, bdr: elig[1]?.rid };
  }

  ospfRoutes(dev) {
    if (!dev.ospf) return [];
    const routers = this.devices.filter(d => d.type === 'router' && d.ospf);
    const dist = new Map([[dev.id, 0]]);
    const first = new Map();
    const done = new Set();
    while (true) {
      let u = null;
      for (const [id, d] of dist) if (!done.has(id) && (u === null || d < dist.get(u))) u = id;
      if (u === null) break;
      done.add(u);
      const ud = this.dev(u);
      for (const n of this.ospfNeighbors(ud)) {
        const nd = dist.get(u) + n.cost;
        if (!dist.has(n.dev.id) || nd < dist.get(n.dev.id)) {
          dist.set(n.dev.id, nd);
          first.set(n.dev.id, u === dev.id ? { nh: n.ip, iface: n.myIf } : first.get(u));
        }
      }
    }
    const connected = this.l3Ifaces(dev).map(i => `${network(ipToInt(i.ip), ipToInt(i.mask))}/${i.mask}`);
    const best = new Map();
    for (const r of routers) {
      if (r === dev || !dist.has(r.id)) continue;
      for (const oi of this.ospfIfaces(r)) {
        const net = network(oi.ip, oi.mask);
        const maskStr = intToIp(oi.mask);
        const key = `${net}/${maskStr}`;
        if (connected.includes(key)) continue;
        const metric = dist.get(r.id) + oi.cost;
        const cur = best.get(key);
        if (!cur || metric < cur.metric) {
          best.set(key, { type: 'O', net, mask: oi.mask, ad: 110, metric, nh: first.get(r.id).nh, iface: first.get(r.id).iface });
        }
      }
    }
    return [...best.values()];
  }

  /** Full routing table (best routes) for a router. */
  routes(dev) {
    const all = [];
    for (const i of this.l3Ifaces(dev)) {
      const ip = ipToInt(i.ip);
      const mask = ipToInt(i.mask);
      if (mask !== 0xffffffff) all.push({ type: 'C', net: network(ip, mask), mask, ad: 0, metric: 0, iface: i.name });
      all.push({ type: 'L', net: ip, mask: 0xffffffff, ad: 0, metric: 0, iface: i.name });
    }
    const connected = all.slice();
    for (const s of dev.statics || []) {
      let iface = s.iface;
      if (iface) {
        if (!this.isUp(dev, iface)) continue;
      } else {
        const nh = ipToInt(s.nh);
        const via = connected.filter(r => r.type === 'C' && network(nh, r.mask) === r.net);
        if (!via.length) continue;
        iface = via[0].iface;
      }
      all.push({ type: 'S', net: s.net, mask: s.mask, ad: s.ad, metric: 0, nh: s.nh, iface });
    }
    if (dev.type === 'router') all.push(...this.ospfRoutes(dev));
    const best = new Map();
    for (const r of all) {
      const k = `${r.net}/${r.mask}/${r.type === 'L' ? 'L' : ''}`;
      const cur = best.get(k);
      if (!cur || r.ad < cur.ad) best.set(k, r);
    }
    return [...best.values()].sort((a, b) => a.net - b.net || a.mask - b.mask);
  }

  /** Forwarding decision: {iface, nh} or null. */
  lookup(dev, dstIp) {
    const dst = ipToInt(dstIp);
    if (dev.type !== 'router') {
      // hosts and L2 switches: own subnet, else default gateway
      for (const i of this.l3Ifaces(dev)) {
        const m = ipToInt(i.mask);
        if (sameSubnet(dst, ipToInt(i.ip), m)) return { iface: i.name, nh: dstIp };
      }
      if (!dev.gw) return null;
      for (const i of this.l3Ifaces(dev)) {
        if (sameSubnet(ipToInt(dev.gw), ipToInt(i.ip), ipToInt(i.mask))) return { iface: i.name, nh: dev.gw };
      }
      return null;
    }
    let best = null;
    for (const r of this.routes(dev)) {
      if (r.type === 'L') continue;
      if (network(dst, r.mask) !== r.net) continue;
      if (!best || r.mask > best.mask || (r.mask === best.mask && r.ad < best.ad)) best = r;
    }
    if (!best) return null;
    return { iface: best.iface, nh: best.type === 'C' ? dstIp : (best.nh || dstIp), route: best };
  }

  aclPermit(dev, ifName, dir, src, dst, proto, icmpType = 'echo') {
    const ifc = dev.ifaces[ifName];
    const name = dir === 'in' ? ifc?.aclIn : ifc?.aclOut;
    if (!name) return true;
    const acl = dev.acls?.[name];
    if (!acl || !acl.entries.length) return true; // missing/empty ACL permits
    const s = ipToInt(src);
    const d = ipToInt(dst);
    for (const e of acl.entries) {
      if (e.remark) continue;
      if (e.proto !== 'ip' && e.proto !== proto) continue;
      if (!aclMatch(e.src, s)) continue;
      if (e.dst && !aclMatch(e.dst, d)) continue;
      if (e.proto === 'icmp' && e.icmpType && e.icmpType !== icmpType) continue;
      e.hits = (e.hits || 0) + 1;
      return e.action === 'permit';
    }
    return false; // implicit deny any
  }

  /**
   * Walk one IP packet hop by hop.
   * @returns {ok, reason, at, inIface, steps, hops, srcIp, arpMiss}
   */
  forward(src, dstIp, opts = {}) {
    let ttl = opts.ttl ?? 255;
    let cur = src;
    let inIface = null;
    let srcIp = opts.srcIp || null;
    const steps = [];
    const hops = [];
    let arpMiss = false;
    const icmp = opts.icmp || 'echo';
    const res = (ok, reason) => ({ ok, reason, at: cur, inIface, steps, hops, srcIp, arpMiss });
    for (let guard = 0; guard < 64; guard++) {
      if (this.ownsIp(cur, dstIp)) return res(true);
      if (cur !== src) {
        if (cur.type !== 'router') return res(false, 'unreachable');
        ttl--;
        if (ttl <= 0) return res(false, 'ttl');
      }
      const r = this.lookup(cur, dstIp);
      if (!r) return res(false, cur === src ? 'noroute' : 'unreachable');
      if (!srcIp) srcIp = this.ipOf(cur, r.iface);
      if (cur.type === 'router' && cur !== src && !this.aclPermit(cur, r.iface, 'out', srcIp, dstIp, 'icmp', icmp)) return res(false, 'acl');
      const end = this.reachableL3(cur, r.iface).find(e => this.ipOf(e.dev, e.ifName) === r.nh);
      if (!end) return res(false, 'arp');
      if (!cur.arp[r.nh]) arpMiss = true;
      const myIp = this.ipOf(cur, r.iface);
      cur.arp[r.nh] = { mac: this.ifaceMac(end.dev, end.ifName), iface: r.iface };
      end.dev.arp[myIp] = { mac: this.ifaceMac(cur, r.iface), iface: end.ifName };
      this.learnMacs(end.path, this.ifaceMac(cur, r.iface), this.ifaceMac(end.dev, end.ifName));
      steps.push(...end.path);
      cur = end.dev;
      inIface = end.ifName;
      hops.push({ dev: cur.id, ip: this.ipOf(cur, inIface) });
      if (cur.type === 'router' && !this.aclPermit(cur, inIface, 'in', srcIp, dstIp, 'icmp', icmp)) return res(false, 'acl');
    }
    return res(false, 'loop');
  }

  /** ICMP echo. Returns {results:['!'|'.'|'U'], steps, reason}. */
  ping(src, dstIp, count = 5) {
    const results = [];
    let steps = [];
    let reason = null;
    let srcIp = null;
    for (let n = 0; n < count; n++) {
      const f = this.forward(src, dstIp);
      srcIp = f.srcIp;
      if (n === 0) steps = f.steps.slice();
      if (!f.ok) {
        reason = f.reason;
        results.push(f.reason === 'acl' || f.reason === 'unreachable' ? 'U' : '.');
        continue;
      }
      const back = this.forward(f.at, f.srcIp, { srcIp: dstIp, icmp: 'echo-reply' });
      if (n === 0) steps.push(...back.steps.map(s => ({ ...s, back: true })));
      if (!back.ok) { reason = back.reason; results.push('.'); continue; }
      results.push(n === 0 && src.type === 'router' && (f.arpMiss || back.arpMiss) ? '.' : '!');
    }
    return { results, steps, reason, srcIp };
  }

  /** Returns [{ttl, ip|null}] and whether the destination was reached. */
  traceroute(src, dstIp, max = 30) {
    const hops = [];
    let misses = 0;
    for (let ttl = 1; ttl <= max; ttl++) {
      const f = this.forward(src, dstIp, { ttl });
      if (f.ok) { hops.push({ ttl, ip: dstIp }); return { hops, done: true }; }
      if (f.reason === 'ttl') {
        const back = this.forward(f.at, f.srcIp, { icmp: 'time-exceeded' });
        hops.push({ ttl, ip: back.ok ? this.ipOf(f.at, f.inIface) : null });
      } else {
        hops.push({ ttl, ip: null });
        if (++misses >= 3) break;
      }
    }
    return { hops, done: false };
  }

  /** Quick boolean reachability used by lab checks (doesn't need to look realistic). */
  canPing(srcName, dstIp) {
    const s = this.byName(srcName);
    if (!s) return false;
    const r = this.ping(s, dstIp, 2);
    return r.results.includes('!');
  }
}

export { maskToPrefix, prefixToMask, ipToInt, intToIp };
