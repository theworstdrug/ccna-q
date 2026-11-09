// Quick-fire drills for book topics. Each generator returns
// { q, a, choices? (multiple choice), keypad? ('bin'|'hex'|'dec'|'ip'), why, check? }

import { randInt, intToIp, prefixToMask } from './sim/net.js';

const pick = a => a[randInt(0, a.length - 1)];
const shuffle = a => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = randInt(0, i); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const mc = (q, a, wrong, why) => ({ q, a, choices: shuffle([a, ...shuffle([...new Set(wrong)].filter(x => x !== a)).slice(0, 3)]), why });
const bin8 = n => n.toString(2).padStart(8, '0');
const hex2 = n => n.toString(16).toUpperCase().padStart(2, '0');

export const PORTS = [
  ['FTP data', 'TCP 20'], ['FTP control', 'TCP 21'], ['SSH', 'TCP 22'], ['Telnet', 'TCP 23'], ['SMTP', 'TCP 25'],
  ['DNS', 'UDP/TCP 53'], ['DHCP server', 'UDP 67'], ['DHCP client', 'UDP 68'], ['TFTP', 'UDP 69'], ['HTTP', 'TCP 80'],
  ['POP3', 'TCP 110'], ['NTP', 'UDP 123'], ['IMAP', 'TCP 143'], ['SNMP', 'UDP 161'], ['SNMP traps', 'UDP 162'],
  ['BGP', 'TCP 179'], ['HTTPS', 'TCP 443'], ['Syslog', 'UDP 514'],
];

export const OSI = [
  ['Hub', 1], ['Repeater', 1], ['Bits', 1], ['UTP cable', 1], ['Switch', 2], ['Bridge', 2], ['Frame', 2], ['MAC address', 2],
  ['Ethernet frame header', 2], ['802.1Q tag', 2], ['Router', 3], ['Packet', 3], ['IP address', 3], ['ICMP', 3], ['OSPF', 3],
  ['Segment', 4], ['TCP', 4], ['UDP', 4], ['Port number', 4], ['Windowing', 4], ['Session setup/teardown (OSI)', 5],
  ['Encryption & compression (OSI)', 6], ['JPEG/ASCII formatting', 6], ['HTTP', 7], ['DNS', 7], ['FTP', 7], ['SMTP', 7],
];
export const LAYER = ['', '1 · Physical', '2 · Data Link', '3 · Network', '4 · Transport', '5 · Session', '6 · Presentation', '7 · Application'];

export const AD = [['Connected', 0], ['Static', 1], ['eBGP', 20], ['EIGRP (internal)', 90], ['OSPF', 110], ['RIP', 120], ['EIGRP (external)', 170], ['iBGP', 200], ['Unusable / unknown', 255]];

export const CLI_MODES = [
  ['Router>', 'User EXEC'], ['Router#', 'Privileged EXEC'], ['Router(config)#', 'Global configuration'],
  ['Router(config-if)#', 'Interface configuration'], ['Router(config-line)#', 'Line configuration'],
  ['Router(config-router)#', 'Routing protocol configuration'], ['Router(config-subif)#', 'Subinterface configuration'],
];
export const CLI_WHERE = [
  ['hostname R1', 'Global configuration'], ['ip address 10.0.0.1 255.0.0.0', 'Interface configuration'],
  ['no shutdown', 'Interface configuration'], ['show running-config', 'Privileged EXEC'], ['copy running-config startup-config', 'Privileged EXEC'],
  ['password cisco + login', 'Line configuration'], ['enable secret class', 'Global configuration'], ['network 10.0.0.0 0.255.255.255 area 0', 'Routing protocol configuration'],
  ['configure terminal', 'Privileged EXEC'], ['enable', 'User EXEC'], ['ip route 0.0.0.0 0.0.0.0 10.0.0.1', 'Global configuration'],
  ['banner motd #Hi#', 'Global configuration'], ['description Uplink', 'Interface configuration'], ['access-list 10 permit any', 'Global configuration'],
  ['ip access-group 10 in', 'Interface configuration'], ['access-class 5 in', 'Line configuration'],
];
export const MEM = [
  ['Running configuration', 'RAM'], ['Routing table', 'RAM'], ['ARP cache', 'RAM'], ['Startup configuration', 'NVRAM'],
  ['IOS image', 'Flash'], ['POST', 'ROM'], ['Bootstrap program', 'ROM'], ['ROMmon', 'ROM'], ['Packet buffers', 'RAM'],
];

// ---------- extra fact tables used by the richer drills ----------
export const IP_PROTO = [['ICMP', 1], ['TCP', 6], ['UDP', 17], ['GRE', 47], ['ESP (IPsec)', 50], ['AH (IPsec)', 51], ['EIGRP', 88], ['OSPF', 89]];
const SECURE = [['Telnet', 'SSH'], ['HTTP', 'HTTPS'], ['TFTP', 'SCP'], ['SNMPv2c', 'SNMPv3'], ['WEP', 'WPA3'], ['enable password', 'enable secret']];
const ROUTE_CODES = [['C', 'Directly connected network'], ['L', 'Local /32 (the interface\'s own IP)'], ['S', 'Static route'], ['S*', 'Static default route'], ['O', 'OSPF'], ['D', 'EIGRP'], ['R', 'RIP'], ['B', 'BGP']];
const TCPIP = { 7: 'Application', 6: 'Application', 5: 'Application', 4: 'Transport', 3: 'Internet', 2: 'Link (Network Access)', 1: 'Link (Network Access)' };
const PDU = { 4: 'Segment', 3: 'Packet', 2: 'Frame', 1: 'Bits' };
const NEXT_PROMPT = [
  ['R1>', 'enable', 'R1#'], ['R1#', 'configure terminal', 'R1(config)#'], ['R1(config)#', 'interface g0/0', 'R1(config-if)#'],
  ['R1(config)#', 'line vty 0 4', 'R1(config-line)#'], ['R1(config)#', 'router ospf 1', 'R1(config-router)#'], ['R1(config-if)#', 'exit', 'R1(config)#'],
  ['R1(config-if)#', 'end', 'R1#'], ['R1(config)#', 'interface g0/0.10', 'R1(config-subif)#'], ['S1(config)#', 'vlan 10', 'S1(config-vlan)#'],
  ['R1#', 'disable', 'R1>'], ['R1(config-router)#', 'exit', 'R1(config)#'], ['S1(config)#', 'interface range f0/1 - 4', 'S1(config-if-range)#'],
];
const ABBREV = [['sh ip int br', 'show ip interface brief'], ['conf t', 'configure terminal'], ['int g0/0', 'interface GigabitEthernet0/0'],
  ['wr', 'write memory'], ['no sh', 'no shutdown'], ['sh run', 'show running-config'], ['copy run start', 'copy running-config startup-config'],
  ['sw mode acc', 'switchport mode access'], ['sh ip ro', 'show ip route'], ['sh vl br', 'show vlan brief'], ['sh cdp nei', 'show cdp neighbors']];
const SHOW_TASK = [['See every interface\'s IP and up/down status on one line each', 'show ip interface brief'], ['See the routing table', 'show ip route'],
  ['See the active configuration', 'show running-config'], ['See which access ports are in which VLAN', 'show vlan brief'], ['See which links are trunking', 'show interfaces trunk'],
  ['See which MAC address was learned on which port', 'show mac address-table'], ['See directly connected Cisco neighbours', 'show cdp neighbors'],
  ['See OSPF adjacencies', 'show ip ospf neighbor'], ['See ACL lines and their hit counts', 'show access-lists'], ['See the IP → MAC mappings a router learned', 'show arp'],
  ['See the configuration saved in NVRAM', 'show startup-config'], ['See IOS version, uptime and config register', 'show version']];
const CLI_ERRORS = [['% Ambiguous command', 'Too few letters to identify one command'], ['% Incomplete command', 'Required keywords or values are missing'],
  ['% Invalid input detected at \'^\' marker', 'The word under the ^ is wrong or not allowed in this mode'], ['% Unrecognized command', 'No command starts like that in this mode']];
const BOOT = [['What runs first when a router powers on?', 'POST (from ROM)'], ['After POST, what runs next?', 'The bootstrap program (ROM)'],
  ['Where is IOS normally loaded from?', 'Flash'], ['After IOS loads, what does it load next?', 'The startup-config from NVRAM'],
  ['What happens if no startup-config is found?', 'It offers the setup dialog'], ['Config register for a normal boot?', '0x2102'],
  ['Config register that ignores NVRAM (password recovery)?', '0x2142']];
const MEM_OPTS = ['RAM', 'NVRAM', 'Flash', 'ROM'];
const MEM_MORE = [
  ['copy running-config startup-config copies from…', 'RAM to NVRAM'], ['copy startup-config running-config copies from…', 'NVRAM to RAM'],
  ['erase startup-config clears…', 'The saved config in NVRAM'], ['Reloading without saving loses…', 'Unsaved changes in the running-config'],
  ['Command to list the files in flash?', 'show flash'], ['Where does a switch keep its VLAN database (vlan.dat)?', 'Flash'],
  ['Where is the MAC address table kept?', 'RAM'], ['Command that shows the config register value?', 'show version'],
  ['Which memory holds the bootstrap and ROMmon?', 'ROM'], ['write memory is the same as…', 'copy running-config startup-config'],
];
const V6_TYPES = [['FE80::1', 'Link-local'], ['FE80::A1B2:3CFF:FE4D:5E6F', 'Link-local'], ['FF02::1', 'Multicast (all nodes)'], ['FF02::2', 'Multicast (all routers)'],
  ['FF02::5', 'Multicast (OSPFv3 routers)'], ['2001:DB8:ACAD:1::10', 'Global unicast'], ['2600:1F18::25', 'Global unicast'], ['FD12:3456:789A::1', 'Unique local'],
  ['::1', 'Loopback'], ['::', 'Unspecified'], ['FF02::1:FF4D:5E6F', 'Multicast (solicited-node)']];
const V6_KINDS = ['Link-local', 'Global unicast', 'Unique local', 'Loopback', 'Unspecified', 'Multicast (all nodes)', 'Multicast (all routers)', 'Multicast (solicited-node)', 'Multicast (OSPFv3 routers)'];
const SPECIAL_V4 = [['127.0.0.1', 'Loopback'], ['169.254.20.7', 'APIPA (link-local, DHCP failed)'], ['224.0.0.5', 'Multicast'], ['255.255.255.255', 'Limited broadcast'],
  ['0.0.0.0', 'Unspecified / default route'], ['10.20.30.40', 'Private (RFC 1918)'], ['172.20.1.1', 'Private (RFC 1918)'], ['192.168.50.1', 'Private (RFC 1918)'], ['8.8.8.8', 'Public']];

const yn = (q, yes, why) => ({ q, a: yes ? 'Yes' : 'No', choices: ['Yes', 'No'], why });
const ipRand = (a = randInt(1, 223)) => ((a << 24) | (randInt(0, 255) << 16) | (randInt(0, 255) << 8) | randInt(0, 255)) >>> 0;

// IPv6 helpers
const v6Expand = hx => hx.map(x => x.padStart(4, '0')).join(':');
function v6Compress(hx) {
  const h = hx.map(x => x.replace(/^0+(?=.)/, '').toLowerCase());
  let best = [-1, 0];
  for (let i = 0; i < 8; i++) { let j = i; while (j < 8 && h[j] === '0') j++; if (j - i > best[1] && j - i >= 2) best = [i, j - i]; i = j > i ? j - 1 : i; }
  if (best[0] < 0) return h.join(':');
  const left = h.slice(0, best[0]).join(':');
  const right = h.slice(best[0] + best[1]).join(':');
  return `${left}::${right}`;
}
function randV6() {
  const hx = ['2001', 'db8', randInt(0, 0xffff).toString(16), ...Array(5).fill('0')];
  const k = randInt(3, 6);
  for (let i = 3; i < 8; i++) if (i !== k && Math.random() < 0.35) hx[i] = randInt(1, 0xfff).toString(16);
  hx[7] = randInt(1, 0xff).toString(16);
  return hx;
}

export const DRILLS = {
  subnet: { title: 'Subnetting', ch: 8, desc: 'Network, broadcast, hosts, masks — timed', href: '#/subnet' },
  bin: {
    title: 'Binary & hex', ch: 1, desc: 'Decimal ↔ binary ↔ hex, bits and masks',
    gen() {
      const n = randInt(0, 255);
      const H = hex2(n);
      return pick([
        () => ({ q: `${n} in binary (8 bits)?`, a: bin8(n), keypad: 'bin', why: explainBin(n), check: v => /^[01]{1,8}$/.test(v) && parseInt(v, 2) === n }),
        () => ({ q: `${bin8(n)} in decimal?`, a: String(n), keypad: 'dec', why: explainBin(n) }),
        () => ({ q: `0x${H} in decimal?`, a: String(n), keypad: 'dec', why: [`${H[0]} × 16 + ${H[1]} = ${parseInt(H[0], 16) * 16} + ${parseInt(H[1], 16)} = ${n}`] }),
        () => ({ q: `${n} in hex?`, a: H, keypad: 'hex', why: [`${n} ÷ 16 = ${Math.floor(n / 16)} r ${n % 16} → ${H}`], check: v => /^[0-9A-F]{1,2}$/i.test(v) && parseInt(v, 16) === n }),
        () => ({ q: `${bin8(n)} in hex?`, a: H, keypad: 'hex', why: [`${bin8(n).slice(0, 4)} = ${H[0]}, ${bin8(n).slice(4)} = ${H[1]}`], check: v => /^[0-9A-F]{1,2}$/i.test(v) && parseInt(v, 16) === n }),
        () => ({ q: `0x${H} in binary (8 bits)?`, a: bin8(n), keypad: 'bin', why: [`${H[0]} = ${bin8(n).slice(0, 4)}, ${H[1]} = ${bin8(n).slice(4)}`], check: v => /^[01]{1,8}$/.test(v) && parseInt(v, 2) === n }),
        () => ({ q: `How many 1 bits are in ${n}?`, a: String(bin8(n).split('').filter(b => b === '1').length), keypad: 'dec', why: explainBin(n) }),
        () => { const k = randInt(1, 8); const v = 256 - 2 ** (8 - k); return { q: `Mask octet with ${k} one-bit${k > 1 ? 's' : ''} (from the left)?`, a: String(v), keypad: 'dec', why: [`${'1'.repeat(k)}${'0'.repeat(8 - k)} = ${v}`] }; },
        () => { const k = randInt(2, 8); return { q: `Largest value you can store in ${k} bits?`, a: String(2 ** k - 1), keypad: 'dec', why: [`2^${k} − 1 = ${2 ** k - 1}`] }; },
        () => { const ip = [randInt(1, 223), randInt(0, 255), n, randInt(0, 255)]; return { q: `Third octet of ${ip.join('.')} in binary?`, a: bin8(n), keypad: 'bin', why: explainBin(n), check: v => /^[01]{1,8}$/.test(v) && parseInt(v, 2) === n }; },
      ])();
    },
  },
  ports: {
    title: 'Ports & protocols', ch: 9, desc: 'Ports, TCP vs UDP, IP protocol numbers, secure versions',
    gen() {
      const [p, port] = pick(PORTS);
      return pick([
        () => mc(`Port for ${p}?`, port, PORTS.filter(x => x[1] !== port).map(x => x[1]), `${p} → ${port}`),
        () => mc(`Which protocol uses ${port}?`, p, PORTS.filter(x => x[1] !== port).map(x => x[0]), `${port} → ${p}`),
        () => { const t = port.startsWith('UDP/TCP') ? 'Both' : port.startsWith('TCP') ? 'TCP' : 'UDP'; return { q: `Does ${p} use TCP or UDP?`, a: t, choices: ['TCP', 'UDP', 'Both'], why: `${p} → ${port}` }; },
        () => { const [name, num] = pick(IP_PROTO); return mc(`IP protocol number for ${name}?`, String(num), IP_PROTO.filter(x => x[1] !== num).map(x => String(x[1])), `${name} = protocol ${num} in the IPv4 header (not a port).`); },
        () => { const [old, sec] = pick(SECURE); return mc(`Secure replacement for ${old}?`, sec, SECURE.map(x => x[1]).filter(x => x !== sec), `${old} → ${sec}`); },
        () => { const r = pick([[22, 'Well-known (0–1023)'], [1812, 'Registered (1024–49151)'], [51515, 'Dynamic / ephemeral (49152–65535)'], [443, 'Well-known (0–1023)'], [8080, 'Registered (1024–49151)']]); return mc(`Port ${r[0]} is in which range?`, r[1], ['Well-known (0–1023)', 'Registered (1024–49151)', 'Dynamic / ephemeral (49152–65535)'].filter(x => x !== r[1]), 'IANA ranges.'); },
      ])();
    },
  },
  osi: {
    title: 'OSI & TCP/IP', ch: 2, desc: 'Layers, PDUs, devices, TCP/IP mapping',
    gen() {
      return pick([
        () => { const [item, l] = pick(OSI); return mc(`${item}: which OSI layer?`, LAYER[l], LAYER.slice(1).filter((_, i) => i + 1 !== l), `${item} works at Layer ${l}.`); },
        () => { const l = randInt(1, 7); const right = pick(OSI.filter(x => x[1] === l))[0]; const wrong = shuffle(OSI.filter(x => x[1] !== l)).map(x => x[0]); return mc(`Which of these works at ${LAYER[l]}?`, right, wrong, `${right} → Layer ${l}.`); },
        () => { const l = randInt(1, 4); return mc(`PDU at OSI Layer ${l} (${LAYER[l].slice(4)})?`, PDU[l], Object.values(PDU).concat('Data').filter(x => x !== PDU[l]), 'Data → Segment → Packet → Frame → Bits.'); },
        () => { const l = randInt(1, 7); return mc(`OSI ${LAYER[l]} maps to which TCP/IP layer?`, TCPIP[l], [...new Set(Object.values(TCPIP))].filter(x => x !== TCPIP[l]), 'OSI 5–7 → Application, 4 → Transport, 3 → Internet, 1–2 → Link.'); },
        () => { const order = ['Data', 'Segment', 'Packet', 'Frame', 'Bits']; const k = randInt(0, 3); return mc(`Encapsulating: what comes after "${order[k]}"?`, order[k + 1], order.filter((_, i) => i !== k + 1), order.join(' → ')); },
        () => { const pairs = [['Router', 3], ['Switch', 2], ['Hub', 1], ['Firewall (stateful)', 4], ['Access point', 2], ['Repeater', 1]]; const [d, l] = pick(pairs); return mc(`${d}: highest layer it makes decisions at?`, LAYER[l], LAYER.slice(1).filter((_, i) => i + 1 !== l), `${d} → Layer ${l}.`); },
      ])();
    },
  },
  ad: {
    title: 'Routing table', ch: 15, desc: 'AD values, route codes, longest match, floating statics',
    gen() {
      return pick([
        () => { const [src, ad] = pick(AD); return mc(`Default AD of ${src}?`, String(ad), AD.filter(x => x[1] !== ad).map(x => String(x[1])), `${src} = ${ad}. Lower is more trusted.`); },
        () => { const [a, b] = shuffle(AD.filter(x => x[1] !== 255)).slice(0, 2); const win = a[1] < b[1] ? a : b; return mc(`Same prefix from ${a[0]} and ${b[0]}. Which is installed?`, win[0], [a[0] === win[0] ? b[0] : a[0], 'Both (load-balanced)', 'Neither'], `${a[0]} ${a[1]} vs ${b[0]} ${b[1]}: lower AD wins.`); },
        () => { const [code, mean] = pick(ROUTE_CODES); return mc(`In show ip route, what does "${code}" mean?`, mean, ROUTE_CODES.map(x => x[1]).filter(x => x !== mean), `${code} = ${mean}`); },
        () => { const ad = pick([110, 90, 120]); const m = randInt(2, 60); const which = Math.random() < 0.5; return mc(`"[${ad}/${m}]": what is ${which ? ad : m}?`, which ? 'Administrative distance' : 'Metric', ['Administrative distance', 'Metric', 'Hop count limit', 'Route age'].filter(x => x !== (which ? 'Administrative distance' : 'Metric')), '[AD/metric]'); },
        () => { const fl = pick([130, 150, 200, 250]); const prim = pick([['OSPF', 110], ['EIGRP', 90], ['RIP', 120]]); return mc(`Static route with AD ${fl} and the same prefix from ${prim[0]} (AD ${prim[1]}). Which is in the table while ${prim[0]} is up?`, `The ${prim[0]} route`, ['The static route', 'Both', 'Neither'], `${fl} > ${prim[1]}: the static floats, only appearing if ${prim[0]} loses the route.`); },
        () => {
          const o2 = randInt(0, 255); const o3 = randInt(0, 255);
          const dst = `10.${o2}.${o3}.${randInt(1, 254)}`;
          const routes = [[`10.0.0.0/8`, 'R2'], [`10.${o2}.0.0/16`, 'R3'], [`10.${o2}.${o3}.0/24`, 'R4']];
          const used = Math.random() < 0.7 ? routes : routes.slice(0, 2);
          const best = used[used.length - 1];
          return mc(`Routes: ${used.map(r => `${r[0]} via ${r[1]}`).join(', ')}. A packet to ${dst} goes to?`, best[1], ['R2', 'R3', 'R4', 'Dropped'].filter(x => x !== best[1]), `Longest prefix match: ${best[0]} is the most specific match.`);
        },
      ])();
    },
  },
  cli: {
    title: 'IOS CLI', ch: 11, desc: 'Modes, prompts, shortcuts, show commands, errors',
    gen() {
      return pick([
        () => { const [p, m] = pick(CLI_MODES); return mc(`Which mode is "${p}"?`, m, CLI_MODES.filter(x => x[1] !== m).map(x => x[1]), `${p} = ${m}.`); },
        () => { const [c, m] = pick(CLI_WHERE); const modes = [...new Set(CLI_MODES.map(x => x[1]))].filter(x => x !== m && x !== 'Subinterface configuration'); return mc(`Where do you type: ${c}`, m, modes, `${c} → ${m}.`); },
        () => { const [from, cmd, to] = pick(NEXT_PROMPT); return mc(`At ${from} you type "${cmd}". New prompt?`, to, [...new Set(NEXT_PROMPT.map(x => x[2]).filter(x => x !== to))], `${cmd} → ${to}`); },
        () => { const [ab, full] = pick(ABBREV); return mc(`"${ab}" is short for?`, full, ABBREV.map(x => x[1]).filter(x => x !== full), `IOS accepts any unique prefix: ${ab} = ${full}.`); },
        () => { const [task, cmd] = pick(SHOW_TASK); return mc(`${task}?`, cmd, SHOW_TASK.map(x => x[1]).filter(x => x !== cmd), cmd); },
        () => { const [err, mean] = pick(CLI_ERRORS); return mc(`"${err}" means?`, mean, CLI_ERRORS.map(x => x[1]).filter(x => x !== mean), mean); },
      ])();
    },
  },
  mem: {
    title: 'Router memory & boot', ch: 10, desc: 'What is stored where, boot order, config register',
    gen() {
      return pick([
        () => { const [item, where] = pick(MEM); return mc(`Where is the ${item.toLowerCase()} kept?`, where, MEM_OPTS.filter(x => x !== where), `${item} → ${where}.`); },
        () => { const where = pick(MEM_OPTS); const right = pick(MEM.filter(x => x[1] === where))[0]; return mc(`Which of these lives in ${where}?`, right, MEM.filter(x => x[1] !== where).map(x => x[0]), `${right} → ${where}.`); },
        () => mc('Which memory is wiped when the router loses power?', 'RAM', ['NVRAM', 'Flash', 'ROM'], 'RAM is volatile: running-config, routing table and ARP cache vanish.'),
        () => { const [q, a] = pick(BOOT); return mc(q, a, BOOT.map(x => x[1]).filter(x => x !== a), a); },
        () => { const [q, a] = pick(MEM_MORE); return mc(q, a, MEM_MORE.map(x => x[1]).filter(x => x !== a), a); },
      ])();
    },
  },
  wild: {
    title: 'Wildcard masks', ch: 20, desc: 'Masks ↔ wildcards, ranges, ACL matches',
    gen() {
      const p = randInt(8, 30);
      const m = prefixToMask(p);
      const w = (~m) >>> 0;
      const net = (ipRand(10) & m) >>> 0;
      const range = pp => { const mm = prefixToMask(pp); const n0 = (net & mm) >>> 0; return `${intToIp(n0)} – ${intToIp((n0 | (~mm >>> 0)) >>> 0)}`; };
      return pick([
        () => ({ q: `Wildcard for ${intToIp(m)}?`, a: intToIp(w), keypad: 'ip', why: [`255.255.255.255 − ${intToIp(m)} = ${intToIp(w)}`] }),
        () => ({ q: `Subnet mask for wildcard ${intToIp(w)}?`, a: intToIp(m), keypad: 'ip', why: [`255.255.255.255 − ${intToIp(w)} = ${intToIp(m)}`] }),
        () => { const right = range(p); const wrong = [...new Set([range(p - 1), range(Math.min(32, p + 1)), `${intToIp(net)} only`, range(Math.max(1, p - 2))])].filter(x => x !== right); return mc(`Which addresses does ${intToIp(net)} ${intToIp(w)} match?`, right, wrong, `0 bits must match, 1 bits are "don't care": a /${p} block.`); },
        () => { const inside = Math.random() < 0.5; const size = 2 ** (32 - p); const host = (inside ? net + randInt(0, size - 1) : net + size + randInt(0, Math.min(size, 1000))) >>> 0; return yn(`Does ${intToIp(host)} match ${intToIp(net)} ${intToIp(w)}?`, ((host & m) >>> 0) === net, `${intToIp(net)}–${intToIp((net | w) >>> 0)}`); },
        () => ({ q: `Wildcard to match exactly ${range(p)}?`, a: intToIp(w), keypad: 'ip', why: [`That block is a /${p} → wildcard ${intToIp(w)}`] }),
        () => pick([mc('Wildcard 0.0.0.0 can be replaced by which keyword?', 'host', ['any', 'all', 'none'], 'host 10.1.1.1 = 10.1.1.1 0.0.0.0'), mc('"any" is the same as which address/wildcard?', '0.0.0.0 255.255.255.255', ['255.255.255.255 0.0.0.0', '0.0.0.0 0.0.0.0', '0.0.0.0 0.0.0.255'], 'Every bit is "don\'t care".')]),
      ])();
    },
  },
  ipv6: {
    title: 'IPv6', ch: 7, desc: 'Abbreviation, address types, EUI-64, prefixes',
    gen() {
      return pick([
        () => { const hx = randV6(); const right = v6Compress(hx); const wrong = [right.replace('::', ':0:'), right.replace(/:([0-9a-f])([0-9a-f]{2})(?=:|$)/, ':$1'), v6Expand(hx).toLowerCase().replace(/:0000/, '::')].filter(x => x !== right); return mc(`Shortest correct form of ${v6Expand(hx)}?`, right, [...new Set(wrong.concat(`${right}::0`))], 'Drop leading zeros; replace ONE run of all-zero hextets with ::.'); },
        () => { const hx = randV6(); const c = v6Compress(hx); const zeros = c.includes('::') ? 8 - c.replace('::', ':').split(':').filter(Boolean).length : 0; return { q: `In ${c}, how many all-zero hextets does "::" stand for?`, a: String(zeros), keypad: 'dec', why: [`8 hextets total − ${8 - zeros} written = ${zeros}`, v6Expand(hx)] }; },
        () => { const [addr, kind] = pick(V6_TYPES); return mc(`What type of address is ${addr}?`, kind, V6_KINDS.filter(x => x !== kind), `${addr} → ${kind}`); },
        () => { const mac = [0x00, 0x50, 0x56, randInt(0, 255), randInt(0, 255), randInt(0, 255)]; const h = x => x.toString(16).padStart(2, '0'); const flip = [...mac]; flip[0] ^= 0x02; const id = `${h(flip[0])}${h(flip[1])}:${h(flip[2])}ff:fe${h(flip[3])}:${h(flip[4])}${h(flip[5])}`; const noflip = `${h(mac[0])}${h(mac[1])}:${h(mac[2])}ff:fe${h(mac[3])}:${h(mac[4])}${h(mac[5])}`; const badpos = `${h(flip[0])}${h(flip[1])}:fffe:${h(flip[2])}${h(flip[3])}:${h(flip[4])}${h(flip[5])}`; return mc(`EUI-64 interface ID for MAC ${h(mac[0])}${h(mac[1])}.${h(mac[2])}${h(mac[3])}.${h(mac[4])}${h(mac[5])}?`, id, [noflip, badpos, `${h(flip[0])}${h(flip[1])}:${h(flip[2])}${h(flip[3])}:${h(flip[4])}${h(flip[5])}:fffe`], 'Split the MAC, insert FFFE in the middle, flip the 7th bit (0x02 of the first byte).'); },
        () => pick([
          mc('How many bits in an IPv6 address?', '128', ['32', '64', '48'], '8 hextets × 16 bits.'),
          mc('Typical prefix length of an IPv6 LAN subnet?', '/64', ['/48', '/56', '/128'], '64-bit network part, 64-bit interface ID.'),
          mc('Which IPv4 feature does IPv6 NOT have?', 'Broadcast', ['Multicast', 'Unicast', 'Anycast'], 'IPv6 uses multicast (e.g. FF02::1) instead.'),
          mc('What replaces ARP in IPv6?', 'NDP (neighbor solicitation/advertisement)', ['DHCPv6', 'ICMPv4', 'RARP'], 'Neighbor Discovery Protocol, part of ICMPv6.'),
          mc('Global command needed before a router forwards IPv6?', 'ipv6 unicast-routing', ['ipv6 enable', 'ip routing', 'ipv6 router'], 'Without it the router won\'t route IPv6 or send RAs.'),
        ]),
      ])();
    },
  },
  addr: {
    title: 'IPv4 address types', ch: 7, desc: 'Classes, private vs public, special ranges, host/network/broadcast',
    gen() {
      return pick([
        () => { const o = pick([randInt(1, 126), randInt(128, 191), randInt(192, 223), randInt(224, 239), randInt(240, 254)]); const cls = o < 127 ? 'A' : o < 192 ? 'B' : o < 224 ? 'C' : o < 240 ? 'D (multicast)' : 'E (experimental)'; return mc(`Class of ${o}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}?`, cls, ['A', 'B', 'C', 'D (multicast)', 'E (experimental)'].filter(x => x !== cls), 'A 1–126, B 128–191, C 192–223, D 224–239, E 240–255.'); },
        () => { const c = pick([['A', '255.0.0.0'], ['B', '255.255.0.0'], ['C', '255.255.255.0']]); return mc(`Default mask of a class ${c[0]} network?`, c[1], ['255.0.0.0', '255.255.0.0', '255.255.255.0', '255.255.255.252'].filter(x => x !== c[1]), `Class ${c[0]} → ${c[1]}`); },
        () => { const cands = [[`172.${randInt(16, 31)}.${randInt(0, 255)}.${randInt(1, 254)}`, true], [`172.${pick([15, 32, 33])}.${randInt(0, 255)}.1`, false], [`192.168.${randInt(0, 255)}.${randInt(1, 254)}`, true], [`192.169.${randInt(0, 255)}.1`, false], [`10.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`, true], [`11.${randInt(0, 255)}.0.1`, false]]; const [ip, priv] = pick(cands); return yn(`Is ${ip} a private (RFC 1918) address?`, priv, 'Private: 10/8, 172.16–172.31, 192.168/16.'); },
        () => { const [ip, kind] = pick(SPECIAL_V4); return mc(`What is ${ip}?`, kind, [...new Set(SPECIAL_V4.map(x => x[1]))].filter(x => x !== kind), `${ip} → ${kind}`); },
        () => { const p = randInt(24, 29); const m = prefixToMask(p); const net = (ipRand(randInt(1, 223)) & m) >>> 0; const bc = (net | (~m >>> 0)) >>> 0; const which = randInt(0, 2); const ip = which === 0 ? net : which === 1 ? bc : net + randInt(1, (bc - net) - 1); const kind = ['Network address', 'Broadcast address', 'Usable host'][which]; return mc(`With /${p}, what is ${intToIp(ip)}?`, kind, ['Network address', 'Broadcast address', 'Usable host'].filter(x => x !== kind), `Block ${2 ** (32 - p)}: ${intToIp(net)} – ${intToIp(bc)}`); },
      ])();
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
