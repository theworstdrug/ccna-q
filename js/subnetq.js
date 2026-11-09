// Subnetting question generator with block-size explanations.

import { ipToInt, intToIp, prefixToMask, network, broadcast, usableHosts, randInt, maskToPrefix } from './sim/net.js';

export const QTYPES = {
  net: 'Network address',
  bcast: 'Broadcast address',
  first: 'First usable host',
  last: 'Last usable host',
  hosts: 'Usable hosts',
  mask: 'Prefix → mask',
  prefix: 'Mask → prefix',
  wild: 'Wildcard mask',
  fit: 'Prefix for N hosts',
  count: 'Subnets in a block',
  same: 'Same subnet?',
  next: 'Next subnet',
  valid: 'Usable host?',
  hostbits: 'Host bits',
};

const ORD = ['1st', '2nd', '3rd', '4th'];

function randHostIp() {
  let a;
  do a = randInt(1, 223); while (a === 127);
  return ((a << 24) | (randInt(0, 255) << 16) | (randInt(0, 255) << 8) | randInt(1, 254)) >>> 0;
}

/** Explain network/broadcast with the block-size method. */
export function explain(ip, p) {
  const mask = prefixToMask(p);
  const k = Math.max(0, Math.ceil(p / 8) - 1);
  const mOct = (mask >>> (24 - 8 * k)) & 255;
  const block = 256 - mOct;
  const ipOct = (ip >>> (24 - 8 * k)) & 255;
  const start = Math.floor(ipOct / block) * block;
  const net = network(ip, mask);
  const bc = broadcast(ip, mask);
  const lines = [`/${p} = ${intToIp(mask)}`];
  if (p % 8 === 0) {
    lines.push(`Octet boundary: copy the first ${p / 8} octet(s), host octets are 0 (network) or 255 (broadcast).`);
  } else {
    lines.push(`Interesting octet: ${ORD[k]} (mask ${mOct}). Block size = 256 − ${mOct} = ${block}.`);
    lines.push(`${ipOct} sits in the ${start}–${start + block - 1} block.`);
  }
  lines.push(`Network ${intToIp(net)} · broadcast ${intToIp(bc)}`);
  if (p <= 30) lines.push(`Hosts ${intToIp(net + 1)} – ${intToIp(bc - 1)} (${usableHosts(p)} usable)`);
  return lines;
}

export function makeQuestion(types, pMin = 16, pMax = 30) {
  const type = types[randInt(0, types.length - 1)];
  const p = randInt(Math.max(1, pMin), Math.min(30, pMax));
  const ip = randHostIp();
  const mask = prefixToMask(p);
  const net = network(ip, mask);
  const bc = broadcast(ip, mask);
  const addr = `${intToIp(ip)}/${p}`;
  switch (type) {
    case 'net': return { type, q: `Network address of ${addr}?`, a: intToIp(net), kind: 'ip', why: explain(ip, p) };
    case 'bcast': return { type, q: `Broadcast address of ${addr}?`, a: intToIp(bc), kind: 'ip', why: explain(ip, p) };
    case 'first': return { type, q: `First usable host in the subnet of ${addr}?`, a: intToIp(net + 1), kind: 'ip', why: explain(ip, p) };
    case 'last': return { type, q: `Last usable host in the subnet of ${addr}?`, a: intToIp(bc - 1), kind: 'ip', why: explain(ip, p) };
    case 'hosts': return { type, q: `How many usable hosts in a /${p}?`, a: String(usableHosts(p)), kind: 'num', why: [`Host bits = 32 − ${p} = ${32 - p}`, `2^${32 - p} − 2 = ${usableHosts(p)}`] };
    case 'mask': return { type, q: `Dotted-decimal mask for /${p}?`, a: intToIp(mask), kind: 'ip', why: [`${p} ones: ${intToIp(mask)}`, 'Mask octets: 128 192 224 240 248 252 254 255'] };
    case 'prefix': return { type, q: `Prefix length of ${intToIp(mask)}?`, a: String(p), kind: 'prefix', why: [`Count the 1 bits: /${p}`] };
    case 'wild': return { type, q: `Wildcard mask for /${p}?`, a: intToIp((~mask) >>> 0), kind: 'ip', why: [`255.255.255.255 − ${intToIp(mask)} = ${intToIp((~mask) >>> 0)}`] };
    case 'fit': {
      const pp = randInt(Math.max(pMin, 17), Math.min(pMax, 30));
      const lo = usableHosts(pp + 1 > 30 ? 30 : pp + 1) + 1;
      const hi = usableHosts(pp);
      const n = pp >= 30 ? 2 : randInt(lo, hi);
      return { type, q: `Smallest subnet (longest prefix) that fits ${n} hosts?`, a: String(pp), kind: 'prefix', why: [`Need 2^h − 2 ≥ ${n} → h = ${32 - pp} (${usableHosts(pp)} hosts)`, `Prefix = 32 − ${32 - pp} = /${pp}`] };
    }
    case 'count': {
      const y = randInt(Math.max(8, pMin - 4), Math.min(28, pMax - 1));
      const x = randInt(y + 1, Math.min(30, y + 8));
      return { type, q: `How many /${x} subnets fit in a /${y}?`, a: String(2 ** (x - y)), kind: 'num', why: [`Borrowed bits = ${x} − ${y} = ${x - y}`, `2^${x - y} = ${2 ** (x - y)}`] };
    }
    case 'same': {
      const same = Math.random() < 0.5;
      const size = 2 ** (32 - p);
      let other;
      if (same) other = (net + randInt(1, Math.max(1, size - 2))) >>> 0;
      else {
        const shift = (Math.random() < 0.5 ? -1 : 1) * size;
        other = (net + shift + randInt(1, Math.max(1, size - 2))) >>> 0;
      }
      const really = network(other, mask) === net;
      return { type, q: `Are ${intToIp(ip)} and ${intToIp(other)} in the same subnet with /${p}?`, a: really ? 'yes' : 'no', kind: 'yn', why: [...explain(ip, p).slice(0, 4), `${intToIp(other)} → network ${intToIp(network(other, mask))}`] };
    }
    case 'next': {
      const size = 2 ** (32 - p);
      const nx = (net + size) >>> 0;
      return { type, q: `Network address of the NEXT subnet after ${intToIp(net)}/${p}?`, a: intToIp(nx), kind: 'ip', why: [...explain(ip, p).slice(0, 2), `Next block starts ${size} addresses later: ${intToIp(nx)}`] };
    }
    case 'valid': {
      const pick3 = Math.floor(Math.random() * 3);
      const cand = pick3 === 0 ? net : pick3 === 1 ? bc : (net + 1 + Math.floor(Math.random() * Math.max(1, bc - net - 1))) >>> 0;
      const ok = p >= 31 ? true : cand !== net && cand !== bc;
      return { type, q: `Is ${intToIp(cand)} a usable host address in a /${p}?`, a: ok ? 'yes' : 'no', kind: 'yn', why: [...explain(cand, p).slice(-2), cand === net ? 'It is the network address.' : cand === bc ? 'It is the broadcast address.' : 'It sits between them.'] };
    }
    case 'hostbits': return { type, q: `How many host bits does a /${p} leave?`, a: String(32 - p), kind: 'num', why: [`32 − ${p} = ${32 - p} host bits → ${2 ** (32 - p)} addresses`] };
    default: return makeQuestion(['net'], pMin, pMax);
  }
}

export function check(q, input) {
  const s = String(input).trim().toLowerCase();
  if (!s) return false;
  if (q.kind === 'ip') return ipToInt(s) !== null && ipToInt(s) === ipToInt(q.a);
  if (q.kind === 'prefix') {
    const v = s.replace(/^\//, '');
    if (/^\d+$/.test(v)) return v === q.a;
    const m = ipToInt(v);
    return m !== null && maskToPrefix(m) === +q.a;
  }
  if (q.kind === 'num') return s.replace(/[, ]/g, '') === q.a;
  if (q.kind === 'yn') return s[0] === q.a[0];
  return s === q.a;
}
