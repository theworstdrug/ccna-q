// Quick-fire drills for book topics. Each generator returns
// { q, a, choices? (multiple choice), keypad? ('bin'|'hex'|'dec'|'ip'), why, check? }

import { randInt, intToIp, prefixToMask } from './sim/net.js';

const pick = a => a[randInt(0, a.length - 1)];
const shuffle = a => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = randInt(0, i); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const mc = (q, a, wrong, why) => ({ q, a, choices: shuffle([a, ...shuffle(wrong).slice(0, 3)]), why });
const bin8 = n => n.toString(2).padStart(8, '0');
const hex2 = n => n.toString(16).toUpperCase().padStart(2, '0');

const PORTS = [
  ['FTP data', 'TCP 20'], ['FTP control', 'TCP 21'], ['SSH', 'TCP 22'], ['Telnet', 'TCP 23'], ['SMTP', 'TCP 25'],
  ['DNS', 'UDP/TCP 53'], ['DHCP server', 'UDP 67'], ['DHCP client', 'UDP 68'], ['TFTP', 'UDP 69'], ['HTTP', 'TCP 80'],
  ['POP3', 'TCP 110'], ['NTP', 'UDP 123'], ['IMAP', 'TCP 143'], ['SNMP', 'UDP 161'], ['SNMP traps', 'UDP 162'],
  ['BGP', 'TCP 179'], ['HTTPS', 'TCP 443'], ['Syslog', 'UDP 514'],
];

const OSI = [
  ['Hub', 1], ['Repeater', 1], ['Bits', 1], ['UTP cable', 1], ['Switch', 2], ['Bridge', 2], ['Frame', 2], ['MAC address', 2],
  ['Ethernet frame header', 2], ['802.1Q tag', 2], ['Router', 3], ['Packet', 3], ['IP address', 3], ['ICMP', 3], ['OSPF', 3],
  ['Segment', 4], ['TCP', 4], ['UDP', 4], ['Port number', 4], ['Windowing', 4], ['Session setup/teardown (OSI)', 5],
  ['Encryption & compression (OSI)', 6], ['JPEG/ASCII formatting', 6], ['HTTP', 7], ['DNS', 7], ['FTP', 7], ['SMTP', 7],
];
const LAYER = ['', '1 · Physical', '2 · Data Link', '3 · Network', '4 · Transport', '5 · Session', '6 · Presentation', '7 · Application'];

const AD = [['Connected', 0], ['Static', 1], ['eBGP', 20], ['EIGRP (internal)', 90], ['OSPF', 110], ['RIP', 120], ['EIGRP (external)', 170], ['iBGP', 200], ['Unusable / unknown', 255]];

const CLI_MODES = [
  ['Router>', 'User EXEC'], ['Router#', 'Privileged EXEC'], ['Router(config)#', 'Global configuration'],
  ['Router(config-if)#', 'Interface configuration'], ['Router(config-line)#', 'Line configuration'],
  ['Router(config-router)#', 'Routing protocol configuration'], ['Router(config-subif)#', 'Subinterface configuration'],
];
const CLI_WHERE = [
  ['hostname R1', 'Global configuration'], ['ip address 10.0.0.1 255.0.0.0', 'Interface configuration'],
  ['no shutdown', 'Interface configuration'], ['show running-config', 'Privileged EXEC'], ['copy running-config startup-config', 'Privileged EXEC'],
  ['password cisco + login', 'Line configuration'], ['enable secret class', 'Global configuration'], ['network 10.0.0.0 0.255.255.255 area 0', 'Routing protocol configuration'],
  ['configure terminal', 'Privileged EXEC'], ['enable', 'User EXEC'], ['ip route 0.0.0.0 0.0.0.0 10.0.0.1', 'Global configuration'],
  ['banner motd #Hi#', 'Global configuration'], ['description Uplink', 'Interface configuration'], ['access-list 10 permit any', 'Global configuration'],
  ['ip access-group 10 in', 'Interface configuration'], ['access-class 5 in', 'Line configuration'],
];
const MEM = [
  ['Running configuration', 'RAM'], ['Routing table', 'RAM'], ['ARP cache', 'RAM'], ['Startup configuration', 'NVRAM'],
  ['IOS image', 'Flash'], ['POST', 'ROM'], ['Bootstrap program', 'ROM'], ['ROMmon', 'ROM'], ['Packet buffers', 'RAM'],
];

export const DRILLS = {
  subnet: { title: 'Subnetting', ch: 8, desc: 'Network, broadcast, hosts, masks — timed', href: '#/subnet' },
  bin: {
    title: 'Binary & hex', ch: 1, desc: 'Convert between decimal, binary and hex',
    gen() {
      const n = randInt(0, 255);
      const t = pick(['d2b', 'b2d', 'h2d', 'd2h', 'b2h']);
      if (t === 'd2b') return { q: `${n} in binary (8 bits)?`, a: bin8(n), keypad: 'bin', why: explainBin(n), check: v => /^[01]{1,8}$/.test(v) && parseInt(v, 2) === n };
      if (t === 'b2d') return { q: `${bin8(n)} in decimal?`, a: String(n), keypad: 'dec', why: explainBin(n) };
      if (t === 'h2d') return { q: `0x${hex2(n)} in decimal?`, a: String(n), keypad: 'dec', why: [`${hex2(n)[0]} × 16 + ${hex2(n)[1]} = ${parseInt(hex2(n)[0], 16) * 16} + ${parseInt(hex2(n)[1], 16)} = ${n}`] };
      if (t === 'd2h') return { q: `${n} in hex?`, a: hex2(n), keypad: 'hex', why: [`${n} ÷ 16 = ${Math.floor(n / 16)} remainder ${n % 16} → ${hex2(n)}`], check: v => /^[0-9A-F]{1,2}$/i.test(v) && parseInt(v, 16) === n };
      return { q: `${bin8(n)} in hex?`, a: hex2(n), keypad: 'hex', why: [`${bin8(n).slice(0, 4)} = ${hex2(n)[0]}, ${bin8(n).slice(4)} = ${hex2(n)[1]}`], check: v => /^[0-9A-F]{1,2}$/i.test(v) && parseInt(v, 16) === n };
    },
  },
  ports: {
    title: 'Port numbers', ch: 9, desc: 'Well-known TCP/UDP ports',
    gen() {
      const [p, port] = pick(PORTS);
      if (Math.random() < 0.5) return mc(`Port for ${p}?`, port, PORTS.filter(x => x[1] !== port).map(x => x[1]), `${p} → ${port}`);
      return mc(`Which protocol uses ${port}?`, p, PORTS.filter(x => x[1] !== port).map(x => x[0]), `${port} → ${p}`);
    },
  },
  osi: {
    title: 'OSI layers', ch: 2, desc: 'Which layer does it belong to?',
    gen() {
      const [item, l] = pick(OSI);
      return mc(`${item} → which OSI layer?`, LAYER[l], LAYER.slice(1).filter((_, i) => i + 1 !== l), `${item} works at Layer ${l}.`);
    },
  },
  ad: {
    title: 'Administrative distance', ch: 15, desc: 'Default AD of each route source',
    gen() {
      const [src, ad] = pick(AD);
      if (Math.random() < 0.6) return mc(`Default AD of ${src}?`, String(ad), AD.filter(x => x[1] !== ad).map(x => String(x[1])), `${src} = ${ad}. Lower is more trusted.`);
      const [a, b] = shuffle(AD.filter(x => x[1] !== 255)).slice(0, 2);
      const win = a[1] < b[1] ? a : b;
      return mc(`Same prefix from ${a[0]} (AD ${a[1]}) and ${b[0]} (AD ${b[1]}). Which is installed?`, win[0], [a[0] === win[0] ? b[0] : a[0], 'Both (load-balanced)', 'Neither'], 'Lower AD wins for identical prefixes.');
    },
  },
  cli: {
    title: 'CLI modes', ch: 11, desc: 'Prompts and where commands go',
    gen() {
      if (Math.random() < 0.4) {
        const [p, m] = pick(CLI_MODES);
        return mc(`Which mode is "${p}"?`, m, CLI_MODES.filter(x => x[1] !== m).map(x => x[1]), `${p} = ${m}.`);
      }
      const [c, m] = pick(CLI_WHERE);
      const modes = [...new Set(CLI_MODES.map(x => x[1]))].filter(x => x !== m && x !== 'Subinterface configuration');
      return mc(`Where do you enter: ${c}`, m, modes, `${c} → ${m}.`);
    },
  },
  mem: {
    title: 'Router memory', ch: 10, desc: 'What is stored where',
    gen() {
      const [item, where] = pick(MEM);
      return mc(`Where is the ${item.toLowerCase()} kept?`, where, ['RAM', 'NVRAM', 'Flash', 'ROM'].filter(x => x !== where), `${item} → ${where}.`);
    },
  },
  wild: {
    title: 'Wildcard masks', ch: 20, desc: 'Masks ↔ wildcards for ACLs',
    gen() {
      const p = randInt(8, 30);
      const m = prefixToMask(p);
      const w = (~m) >>> 0;
      const t = randInt(0, 2);
      if (t === 0) return { q: `Wildcard for ${intToIp(m)}?`, a: intToIp(w), keypad: 'ip', why: [`255.255.255.255 − ${intToIp(m)} = ${intToIp(w)}`] };
      if (t === 1) return { q: `Subnet mask for wildcard ${intToIp(w)}?`, a: intToIp(m), keypad: 'ip', why: [`255.255.255.255 − ${intToIp(w)} = ${intToIp(m)}`] };
      const base = (10 << 24 | randInt(0, 255) << 16 | randInt(0, 255) << 8 | randInt(0, 255)) >>> 0;
      const net = (base & m) >>> 0;
      const range = pp => { const mm = prefixToMask(pp); const n0 = (net & mm) >>> 0; return `${intToIp(n0)} – ${intToIp((n0 | (~mm >>> 0)) >>> 0)}`; };
      const right = range(p);
      const wrong = [...new Set([range(p - 1), range(Math.min(32, p + 1)), `${intToIp(net)} only`, range(Math.max(1, p - 2))])].filter(x => x !== right);
      return mc(`Which addresses does ${intToIp(net)} ${intToIp(w)} match?`, right, wrong, `0 bits must match, 1 bits are "don't care": a /${p} block.`);
    },
  },
};

function explainBin(n) {
  const parts = [128, 64, 32, 16, 8, 4, 2, 1].filter(v => n & v);
  return [`${bin8(n)} = ${parts.length ? parts.join(' + ') : '0'} = ${n}`];
}

export function checkAnswer(item, value) {
  const v = String(value).trim();
  if (item.check) return item.check(v);
  if (item.keypad === 'ip') return v.split('.').map(Number).join('.') === item.a;
  return v.toUpperCase() === String(item.a).toUpperCase();
}
