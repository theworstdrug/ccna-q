// A small Cisco IOS-like command line on top of the Net model.
// Supports abbreviations ("sh ip int br"), "?" help, Tab completion,
// "do" in config modes, and a PC prompt with ipconfig/ping/tracert.

import { normIf, shortIf, PORTS, PLATFORM } from './engine.js';
import {
  ipToInt, intToIp, isIp, maskToPrefix, network,
} from './net.js';

const pad = (s, n) => String(s ?? '').padEnd(n);
const lpad = (s, n) => String(s ?? '').padStart(n);
const INVALID = '% Invalid input detected at \'^\' marker.';

const PROMPTS = {
  user: '>', priv: '#', config: '(config)#', if: '(config-if)#', subif: '(config-subif)#',
  range: '(config-if-range)#', vlan: '(config-vlan)#', router: '(config-router)#',
  line: '(config-line)#', 'std-nacl': '(config-std-nacl)#', 'ext-nacl': '(config-ext-nacl)#',
};

const KW = {
  enable: 'Turn on privileged commands', disable: 'Turn off privileged commands',
  configure: 'Enter configuration mode', show: 'Show running system information',
  ping: 'Send echo messages', traceroute: 'Trace route to destination', exit: 'Exit from the current mode',
  end: 'Exit to privileged EXEC mode', interface: 'Select an interface to configure',
  hostname: 'Set system\'s network name', vlan: 'VLAN commands', ip: 'Global IP configuration subcommands',
  router: 'Enable a routing process', 'access-list': 'Add an access list entry', no: 'Negate a command or set its defaults',
  do: 'To run exec commands in config mode', shutdown: 'Shutdown the selected interface',
  switchport: 'Set switching mode characteristics', encapsulation: 'Set encapsulation type for an interface',
  description: 'Interface specific description', network: 'Enable routing on an IP network',
  'router-id': 'router-id for this OSPF process', 'passive-interface': 'Suppress routing updates on an interface',
  name: 'Ascii name of the VLAN', copy: 'Copy from one file to another', write: 'Write running configuration to memory',
  clear: 'Reset functions', line: 'Configure a terminal line', password: 'Set a password', login: 'Enable password checking',
  permit: 'Specify packets to forward', deny: 'Specify packets to reject', remark: 'Access list entry comment',
  'running-config': 'Current operating configuration', terminal: 'Configure from the terminal',
  brief: 'Brief summary', route: 'IP routing table', arp: 'ARP table', cdp: 'CDP information',
  'mac': 'MAC configuration', 'access-lists': 'List access lists', version: 'System hardware and software status',
  interfaces: 'Interface status and configuration', ospf: 'OSPF information', 'startup-config': 'Contents of startup configuration',
  'auto-cost': 'Calculate OSPF interface cost according to bandwidth', 'default-gateway': 'Specify default gateway',
};

// ---------- small parsers ----------

function parseVlanList(s) {
  const out = new Set();
  for (const part of s.split(',')) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) return null;
    const a = +m[1];
    const b = m[2] ? +m[2] : a;
    if (a < 1 || b > 4094 || b < a) return null;
    for (let v = a; v <= b; v++) out.add(v);
  }
  return [...out].sort((x, y) => x - y);
}

function vlanListStr(list) {
  if (!list) return '1-4094';
  if (!list.length) return 'none';
  const out = [];
  let s = list[0];
  let p = list[0];
  for (const v of list.slice(1).concat([null])) {
    if (v === p + 1) { p = v; continue; }
    out.push(s === p ? `${s}` : `${s}-${p}`);
    s = p = v;
  }
  return out.join(',');
}

function expandRange(text) {
  const out = [];
  for (const part of text.split(',')) {
    const t = part.replace(/\s+/g, '');
    const m = t.match(/^([a-zA-Z]+)((?:\d+\/)*)(\d+)(?:-(\d+))?$/);
    if (!m) return null;
    const a = +m[3];
    const b = m[4] ? +m[4] : a;
    for (let n = a; n <= b; n++) {
      const name = normIf(m[1] + m[2] + n);
      if (!name) return null;
      out.push(name);
    }
  }
  return out;
}

function parseAddr(t, i, ext) {
  const w = t[i];
  if (w === 'any') return { spec: { ip: 0, wild: 0xffffffff }, i: i + 1, text: 'any' };
  if (w === 'host' && isIp(t[i + 1])) return { spec: { ip: ipToInt(t[i + 1]), wild: 0 }, i: i + 2, text: `host ${t[i + 1]}` };
  if (isIp(w)) {
    if (isIp(t[i + 1])) {
      const wild = ipToInt(t[i + 1]);
      return { spec: { ip: ipToInt(w), wild }, i: i + 2, text: wild === 0 ? `host ${w}` : `${w} ${t[i + 1]}` };
    }
    if (!ext) return { spec: { ip: ipToInt(w), wild: 0 }, i: i + 1, text: w };
  }
  return null;
}

/** Parse "permit|deny ..." into an ACL entry, or return an error string. */
export function parseAclEntry(words, type) {
  const action = words[0];
  if (action === 'remark') return { remark: true, text: `remark ${words.slice(1).join(' ')}` };
  if (action !== 'permit' && action !== 'deny') return INVALID;
  if (type === 'standard') {
    const a = parseAddr(words, 1, false);
    if (!a) return INVALID;
    return { action, proto: 'ip', src: a.spec, dst: null, text: `${action} ${a.text}` };
  }
  const proto = words[1];
  if (!['ip', 'icmp', 'tcp', 'udp'].includes(proto)) return INVALID;
  let i = 2;
  const parts = [action, proto];
  const skipPort = () => {
    const op = words[i];
    if (['eq', 'gt', 'lt', 'neq'].includes(op) && words[i + 1]) { parts.push(op, words[i + 1]); i += 2; return true; }
    if (op === 'range' && words[i + 2]) { parts.push(op, words[i + 1], words[i + 2]); i += 3; return true; }
    return false;
  };
  const s = parseAddr(words, i, true);
  if (!s) return INVALID;
  i = s.i; parts.push(s.text);
  let port = skipPort();
  const d = parseAddr(words, i, true);
  if (!d) return INVALID;
  i = d.i; parts.push(d.text);
  port = skipPort() || port;
  let icmpType = null;
  if (proto === 'icmp' && ['echo', 'echo-reply'].includes(words[i])) { icmpType = words[i]; parts.push(words[i]); i++; }
  if (words[i] === 'log') { parts.push('log'); i++; }
  if (i < words.length) return INVALID;
  return { action, proto, src: s.spec, dst: d.spec, port, icmpType, text: parts.join(' ') };
}

// ---------- show output ----------

function ipIntBrief(net, d) {
  const rows = [`${pad('Interface', 23)}${pad('IP-Address', 16)}OK? Method ${pad('Status', 22)}Protocol`];
  const names = Object.keys(d.ifaces).sort(ifSort);
  for (const n of names) {
    const ifc = d.ifaces[n];
    const [st, pr] = net.status(d, n);
    rows.push(`${pad(n, 23)}${pad(ifc.ip || 'unassigned', 16)}YES ${pad(ifc.ip ? 'manual' : 'unset', 7)}${pad(st, 22)}${pr}`);
  }
  return rows;
}

function ifSort(a, b) {
  const rank = n => (n.startsWith('Fast') ? 1 : n.startsWith('Gig') ? 2 : n.startsWith('Loop') ? 3 : 4);
  return rank(a) - rank(b) || a.localeCompare(b, undefined, { numeric: true });
}

function routeTable(net, d) {
  const out = [
    'Codes: L - local, C - connected, S - static, O - OSPF',
    '       * - candidate default',
    '',
  ];
  const routes = net.routes(d);
  const def = routes.find(r => r.net === 0 && r.mask === 0);
  out.push(def ? `Gateway of last resort is ${def.nh || 'directly connected'} to network 0.0.0.0` : 'Gateway of last resort is not set');
  out.push('');
  for (const r of routes) {
    const code = r.type + (r.net === 0 && r.mask === 0 ? '*' : '');
    const pfx = `${intToIp(r.net)}/${maskToPrefix(r.mask)}`;
    if (r.type === 'C' || r.type === 'L') out.push(`${pad(code, 9)}${pfx} is directly connected, ${r.iface}`);
    else if (r.type === 'S') out.push(`${pad(code, 9)}${pfx} [${r.ad}/0] via ${r.nh || r.iface}`);
    else out.push(`${pad(code, 9)}${pfx} [${r.ad}/${r.metric}] via ${r.nh}, 00:00:12, ${r.iface}`);
  }
  return out;
}

function vlanBrief(d) {
  const out = [
    'VLAN Name                             Status    Ports',
    '---- -------------------------------- --------- -------------------------------',
  ];
  for (const v of Object.keys(d.vlans).map(Number).sort((a, b) => a - b)) {
    const ports = PORTS.switch.filter(p => d.ifaces[p].mode === 'access' && d.ifaces[p].vlan === v).map(shortIf);
    const chunks = [];
    for (let i = 0; i < ports.length; i += 4) chunks.push(ports.slice(i, i + 4).join(', '));
    out.push(`${pad(v, 5)}${pad(d.vlans[v], 33)}active    ${chunks[0] || ''}`);
    for (const c of chunks.slice(1)) out.push(`${' '.repeat(48)}${c}`);
  }
  for (const v of [1002, 1003, 1004, 1005]) {
    out.push(`${pad(v, 5)}${pad({ 1002: 'fddi-default', 1003: 'token-ring-default', 1004: 'fddinet-default', 1005: 'trnet-default' }[v], 33)}act/unsup`);
  }
  return out;
}

function trunks(net, d) {
  const t = PORTS.switch.filter(p => d.ifaces[p].mode === 'trunk' && net.isUp(d, p));
  if (!t.length) return [];
  const out = ['Port        Mode             Encapsulation  Status        Native vlan'];
  for (const p of t) out.push(`${pad(shortIf(p), 12)}${pad('on', 17)}${pad('802.1q', 15)}${pad('trunking', 14)}${d.ifaces[p].native}`);
  out.push('', 'Port        Vlans allowed on trunk');
  for (const p of t) out.push(`${pad(shortIf(p), 12)}${vlanListStr(d.ifaces[p].allowed)}`);
  out.push('', 'Port        Vlans allowed and active in management domain');
  for (const p of t) {
    const act = Object.keys(d.vlans).map(Number).filter(v => net.trunkAllows(d.ifaces[p], v));
    out.push(`${pad(shortIf(p), 12)}${vlanListStr(act)}`);
  }
  return out;
}

function macTable(d) {
  const out = ['          Mac Address Table', '-------------------------------------------', '',
    'Vlan    Mac Address       Type        Ports', '----    -----------       --------    -----'];
  const rows = Object.values(d.macTable).sort((a, b) => a.vlan - b.vlan);
  for (const r of rows) out.push(`${lpad(r.vlan, 4)}    ${pad(r.mac, 18)}${pad('DYNAMIC', 12)}${shortIf(r.port)}`);
  out.push(`Total Mac Addresses for this criterion: ${rows.length}`);
  return out;
}

function arpTable(net, d) {
  const out = ['Protocol  Address          Age (min)  Hardware Addr   Type   Interface'];
  for (const i of net.l3Ifaces(d)) {
    if (i.name.startsWith('Loopback')) continue;
    out.push(`Internet  ${pad(i.ip, 17)}${lpad('-', 9)}   ${pad(net.ifaceMac(d, i.name), 16)}ARPA   ${i.name}`);
  }
  for (const [ip, e] of Object.entries(d.arp)) {
    out.push(`Internet  ${pad(ip, 17)}${lpad('0', 9)}   ${pad(e.mac, 16)}ARPA   ${e.iface}`);
  }
  return out;
}

function cdp(net, d) {
  const out = ['Capability Codes: R - Router, S - Switch, H - Host, I - IGMP, P - Phone', '',
    'Device ID        Local Intrfce     Holdtme    Capability  Platform     Port ID'];
  for (const p of PORTS[d.type]) {
    const pr = net.peer(d.id, p);
    if (!pr || pr.dev.type === 'pc' || !net.isUp(d, p)) continue;
    const cap = pr.dev.type === 'router' ? 'R' : 'S I';
    out.push(`${pad(pr.dev.name, 17)}${pad(shortIf(p), 18)}${pad('163', 11)}${pad(cap, 12)}${pad(PLATFORM[pr.dev.type].slice(0, 12), 13)}${shortIf(pr.port)}`);
  }
  return out;
}

function ospfNeighborTable(net, d) {
  if (!d.ospf) return [];
  const out = ['Neighbor ID     Pri   State           Dead Time   Address         Interface'];
  for (const n of net.ospfNeighbors(d)) {
    const { dr, bdr } = net.ospfElection(d, n.myIf);
    const me = net.routerId(d);
    let role = n.rid === dr ? 'DR' : n.rid === bdr ? 'BDR' : 'DROTHER';
    const full = role !== 'DROTHER' || me === dr || me === bdr;
    if (n.pri === 0) role = 'DROTHER';
    out.push(`${pad(n.rid, 16)}${pad(n.pri, 6)}${pad(`${full ? 'FULL' : '2WAY'}/${role === 'DROTHER' ? 'DROTHER' : role}`, 16)}${pad('00:00:35', 12)}${pad(n.ip, 16)}${n.myIf}`);
  }
  return out;
}

function aclShow(d) {
  const out = [];
  for (const [name, acl] of Object.entries(d.acls || {})) {
    out.push(`${acl.type === 'standard' ? 'Standard' : 'Extended'} IP access list ${name}`);
    let seq = 10;
    for (const e of acl.entries) {
      if (e.remark) continue;
      out.push(`    ${seq} ${e.text}${e.hits ? ` (${e.hits} match${e.hits > 1 ? 'es' : ''})` : ''}`);
      seq += 10;
    }
  }
  return out;
}

function showInterface(net, d, name) {
  const ifc = d.ifaces[name];
  if (!ifc) return [INVALID];
  const [st, pr] = net.status(d, name);
  const mac = net.ifaceMac(d, name);
  const out = [`${name} is ${st}, line protocol is ${pr}`,
    `  Hardware is ${name.startsWith('Loop') ? 'Loopback' : name.startsWith('Vlan') ? 'EtherSVI' : name.startsWith('Gig') ? 'Gigabit Ethernet' : 'Fast Ethernet'}, address is ${mac} (bia ${mac})`];
  if (ifc.desc) out.push(`  Description: ${ifc.desc}`);
  if (ifc.ip) out.push(`  Internet address is ${ifc.ip}/${maskToPrefix(ipToInt(ifc.mask))}`);
  const bw = name.startsWith('Gig') ? 1000000 : name.startsWith('Loop') ? 8000000 : 100000;
  out.push(`  MTU 1500 bytes, BW ${bw} Kbit/sec, DLY 10 usec,`);
  out.push(ifc.encap ? `  Encapsulation 802.1Q Virtual LAN, Vlan ID  ${ifc.encap}.` : '  Encapsulation ARPA, loopback not set');
  if (net.isUp(d, name) && !name.startsWith('Loop') && !name.startsWith('Vlan')) out.push(`  Full-duplex, ${name.startsWith('Gig') ? '1000' : '100'}Mb/s, media type is RJ45`);
  if (d.type === 'switch' && ifc.mode) out.push(`  Switchport mode ${ifc.mode}${ifc.mode === 'access' ? `, access VLAN ${ifc.vlan}` : `, native VLAN ${ifc.native}`}`);
  return out;
}

export function runningConfig(net, d) {
  const out = ['Building configuration...', '', 'Current configuration:', '!', 'version 15.2', 'service timestamps log datetime msec', '!', `hostname ${d.name}`, '!'];
  for (const l of d.globalCfg) out.push(l);
  if (d.globalCfg.length) out.push('!');
  if (d.type === 'switch') {
    out.push('spanning-tree mode pvst', '!');
  }
  for (const n of Object.keys(d.ifaces).sort(ifSort)) {
    const i = d.ifaces[n];
    out.push(`interface ${n}`);
    if (i.desc) out.push(` description ${i.desc}`);
    if (i.encap != null) out.push(` encapsulation dot1Q ${i.encap}${i.native ? ' native' : ''}`);
    if (d.type === 'switch' && i.mode) {
      if (i.mode === 'access' && i.vlan !== 1) out.push(` switchport access vlan ${i.vlan}`);
      if (i.mode === 'trunk') {
        if (i.native !== 1) out.push(` switchport trunk native vlan ${i.native}`);
        if (i.allowed) out.push(` switchport trunk allowed vlan ${vlanListStr(i.allowed)}`);
      }
      out.push(` switchport mode ${i.mode}`);
    }
    if (i.ip) out.push(` ip address ${i.ip} ${i.mask}`);
    else if (d.type === 'router' || n.startsWith('Vlan')) out.push(' no ip address');
    if (i.aclIn) out.push(` ip access-group ${i.aclIn} in`);
    if (i.aclOut) out.push(` ip access-group ${i.aclOut} out`);
    if (i.ospfArea != null) out.push(` ip ospf ${i.ospfPid} area ${i.ospfArea}`);
    if (i.ospfCost) out.push(` ip ospf cost ${i.ospfCost}`);
    if (i.ospfPriority != null) out.push(` ip ospf priority ${i.ospfPriority}`);
    for (const x of i.extra || []) out.push(` ${x}`);
    if (i.shutdown) out.push(' shutdown');
    out.push('!');
  }
  if (d.ospf) {
    out.push(`router ospf ${d.ospf.pid}`);
    if (d.ospf.rid) out.push(` router-id ${d.ospf.rid}`);
    if (d.ospf.refBw && d.ospf.refBw !== 100) out.push(` auto-cost reference-bandwidth ${d.ospf.refBw}`);
    for (const p of d.ospf.passive) out.push(` passive-interface ${p}`);
    for (const n of d.ospf.networks) out.push(` network ${intToIp(n.net)} ${intToIp(n.wild)} area ${n.area}`);
    for (const x of d.ospf.extra || []) out.push(` ${x}`);
    out.push('!');
  }
  if (d.type === 'switch' && d.gw) out.push(`ip default-gateway ${d.gw}`, '!');
  for (const s of d.statics || []) out.push(`ip route ${intToIp(s.net)} ${intToIp(s.mask)} ${s.nh || s.iface}${s.ad !== 1 ? ` ${s.ad}` : ''}`);
  if (d.statics?.length) out.push('!');
  for (const [name, acl] of Object.entries(d.acls || {})) {
    if (/^\d+$/.test(name)) for (const e of acl.entries) out.push(`access-list ${name} ${e.text}`);
    else {
      out.push(`ip access-list ${acl.type} ${name}`);
      for (const e of acl.entries) out.push(` ${e.text}`);
    }
  }
  if (Object.keys(d.acls || {}).length) out.push('!');
  for (const [ln, cfg] of Object.entries(d.lines)) {
    out.push(`line ${ln}`);
    for (const x of cfg) out.push(` ${x}`);
  }
  out.push('!', 'end');
  return out;
}

// ---------- the IOS CLI ----------

export class IosCli {
  constructor(net, dev) {
    this.net = net;
    this.dev = dev;
    this.mode = 'user';
    this.ctx = {};
    this.pending = null;
    this.build();
  }

  get d() { return this.dev; }

  prompt() {
    if (this.pending?.type === 'password') return 'Password: ';
    return this.d.name + PROMPTS[this.mode];
  }

  build() {
    const show = [
      ['show running-config', () => runningConfig(this.net, this.d), 'priv'],
      ['show startup-config', () => (this.d.startup ? this.d.startup.split('\n') : ['startup-config is not present']), 'priv'],
      ['show ip interface brief', () => ipIntBrief(this.net, this.d)],
      ['show interfaces', () => Object.keys(this.d.ifaces).sort(ifSort).flatMap(n => showInterface(this.net, this.d, n))],
      ['show interfaces <if>', a => showInterface(this.net, this.d, a[0])],
      ['show ip route', () => routeTable(this.net, this.d)],
      ['show arp', () => arpTable(this.net, this.d)],
      ['show ip arp', () => arpTable(this.net, this.d)],
      ['show cdp neighbors', () => cdp(this.net, this.d)],
      ['show version', () => [`Cisco IOS Software, ${PLATFORM[this.d.type]} (simulated by CCNA-Q)`, `${this.d.name} uptime is 1 hour, 4 minutes`, `cisco ${PLATFORM[this.d.type]} processor with 512K bytes of memory.`, `Base ethernet MAC Address: ${this.d.mac}`]],
      ['show clock', () => [`*${new Date().toTimeString().slice(0, 8)}.000 UTC ${new Date().toDateString()}`]],
      ['show history', () => this.history || []],
    ];
    if (this.d.type === 'switch') {
      show.push(
        ['show vlan brief', () => vlanBrief(this.d)],
        ['show vlan', () => vlanBrief(this.d)],
        ['show interfaces trunk', () => trunks(this.net, this.d)],
        ['show mac address-table', () => macTable(this.d)],
      );
    }
    if (this.d.type === 'router') {
      show.push(
        ['show ip ospf neighbor', () => ospfNeighborTable(this.net, this.d)],
        ['show access-lists', () => aclShow(this.d)],
        ['show ip access-lists', () => aclShow(this.d)],
        ['show ip protocols', () => this.ipProtocols()],
      );
    }

    const exec = [
      ['ping <ip>', a => this.ping(a[0])],
      ['traceroute <ip>', a => this.trace(a[0])],
    ];

    const priv = [
      ['disable', () => { this.mode = 'user'; }],
      ['enable', () => {}],
      ['configure terminal', () => { this.mode = 'config'; return ['Enter configuration commands, one per line.  End with CNTL/Z.']; }],
      ['copy running-config startup-config', () => this.save()],
      ['write memory', () => this.save()],
      ['write', () => this.save()],
      ['clear mac address-table dynamic', () => { if (this.d.macTable) this.d.macTable = {}; }],
      ['clear arp-cache', () => { this.d.arp = {}; }],
      ['clear ip ospf process', () => ['Reset ALL OSPF processes? [no]: yes']],
      ['reload', () => this.reload()],
      ['exit', () => { this.mode = 'user'; return ['', `${this.d.name} con0 is now available`, '', 'Press RETURN to get started.']; }],
      ...exec, ...show.map(([p, f]) => [p, f]),
    ];

    const user = [
      ['enable', () => this.enable()],
      ['exit', () => ['', `${this.d.name} con0 is now available`]],
      ...exec,
      ...show.filter(s => s[2] !== 'priv').map(([p, f]) => [p, f]),
    ];

    const toPriv = () => { this.mode = 'priv'; this.ctx = {}; };
    const common = [
      ['end', toPriv],
      ['do <rest>', (a, raw) => this.runAs('priv', raw.replace(/^\s*do\s+/i, ''))],
    ];

    const r = this.d.type === 'router';
    const s = this.d.type === 'switch';

    const config = [
      ['hostname <word>', a => this.hostname(a[0])],
      ['interface range <rest>', a => this.ifRange(a[0])],
      ['interface <rest>', a => this.enterIf(a[0])],
      ['exit', toPriv],
      ['enable secret <rest>', a => this.setGlobal('enable secret', `enable secret 5 $1$mERr$${btoa(a[0]).slice(0, 12)}`, { secret: a[0] })],
      ['enable password <rest>', a => this.setGlobal('enable password', `enable password ${a[0]}`, { secret: a[0] })],
      ['service password-encryption', () => this.setGlobal('service password-encryption', 'service password-encryption')],
      ['no ip domain-lookup', () => this.setGlobal('no ip domain-lookup', 'no ip domain-lookup')],
      ['ip domain-name <word>', a => this.setGlobal('ip domain-name', `ip domain-name ${a[0]}`)],
      ['username <word> <rest>', (a, raw) => this.setGlobal(`username ${a[0]}`, raw.trim().replace(/\s+/g, ' '))],
      ['banner motd <rest>', a => this.setGlobal('banner motd', `banner motd ${a[0]}`)],
      ['crypto key generate rsa <rest>', () => this.rsa()],
      ['crypto key generate rsa', () => this.rsa()],
      ['ip ssh version <num>', a => this.setGlobal('ip ssh version', `ip ssh version ${a[0]}`)],
      ['line <rest>', a => this.enterLine(a[0])],
      ['no hostname', () => this.hostname(r ? 'Router' : 'Switch')],
      ['no enable secret', () => this.unsetGlobal('enable secret')],
      ['no service password-encryption', () => this.unsetGlobal('service password-encryption')],
      ['no banner motd', () => this.unsetGlobal('banner motd')],
      ...common,
    ];
    if (s) {
      config.push(
        ['vlan <rest>', a => this.enterVlan(a[0])],
        ['no vlan <rest>', a => this.noVlan(a[0])],
        ['ip default-gateway <ip>', a => { this.d.gw = a[0]; }],
        ['no ip default-gateway', () => { this.d.gw = null; }],
        ['spanning-tree mode <word>', () => {}],
        ['vtp mode <word>', () => {}],
      );
    }
    if (r) {
      config.push(
        ['ip route <rest>', a => this.ipRoute(a[0])],
        ['no ip route <rest>', a => this.ipRoute(a[0], true)],
        ['router ospf <num>', a => this.enterOspf(+a[0])],
        ['no router ospf <num>', () => { this.d.ospf = null; }],
        ['access-list <num> <rest>', (a, raw) => this.accessList(a[0], raw)],
        ['no access-list <num>', a => { delete this.d.acls[a[0]]; }],
        ['ip access-list standard <word>', a => this.enterNacl(a[0], 'standard')],
        ['ip access-list extended <word>', a => this.enterNacl(a[0], 'extended')],
        ['no ip access-list standard <word>', a => { delete this.d.acls[a[0]]; }],
        ['no ip access-list extended <word>', a => { delete this.d.acls[a[0]]; }],
        ['ip routing', () => {}],
      );
    }

    const ifCmds = [
      ['exit', () => { this.mode = 'config'; this.ctx = {}; }],
      ['interface range <rest>', a => this.ifRange(a[0])],
      ['interface <rest>', a => this.enterIf(a[0])],
      ['shutdown', () => this.eachIf(i => this.setShut(i, true))],
      ['no shutdown', () => this.eachIf(i => this.setShut(i, false))],
      ['description <rest>', a => this.eachIf(i => { i.desc = a[0]; })],
      ['no description', () => this.eachIf(i => { i.desc = ''; })],
      ['speed <word>', (a, raw) => this.eachIf(i => this.extra(i, 'speed', raw))],
      ['duplex <word>', (a, raw) => this.eachIf(i => this.extra(i, 'duplex', raw))],
      ...common,
    ];
    if (s) {
      ifCmds.push(
        ['switchport mode access', () => this.eachPort(i => { i.mode = 'access'; })],
        ['switchport mode trunk', () => this.eachPort(i => { i.mode = 'trunk'; })],
        ['switchport mode dynamic <word>', () => ['% Simulator: DTP is not modelled; use "switchport mode access" or "switchport mode trunk".']],
        ['switchport access vlan <num>', a => this.accessVlan(+a[0])],
        ['no switchport access vlan', () => this.eachPort(i => { i.vlan = 1; })],
        ['switchport trunk native vlan <num>', a => this.eachPort(i => { i.native = +a[0]; })],
        ['no switchport trunk native vlan', () => this.eachPort(i => { i.native = 1; })],
        ['switchport trunk allowed vlan <rest>', a => this.allowed(a[0])],
        ['no switchport trunk allowed vlan', () => this.eachPort(i => { i.allowed = null; })],
        ['switchport trunk encapsulation dot1q', () => {}],
        ['switchport nonegotiate', (a, raw) => this.eachPort(i => this.extra(i, 'switchport nonegotiate', raw))],
        ['switchport port-security <rest>', (a, raw) => this.eachPort(i => this.extra(i, raw.trim(), raw))],
        ['switchport port-security', (a, raw) => this.eachPort(i => this.extra(i, raw.trim(), raw))],
        ['spanning-tree portfast', (a, raw) => this.eachPort(i => this.extra(i, 'spanning-tree portfast', raw))],
        ['spanning-tree bpduguard enable', (a, raw) => this.eachPort(i => this.extra(i, 'spanning-tree bpduguard', raw))],
        ['ip address <ip> <ip>', a => this.ipAddr(a[0], a[1])],
        ['no ip address', () => this.eachIf(i => { i.ip = null; i.mask = null; })],
      );
    }
    if (r) {
      ifCmds.push(
        ['ip address <ip> <ip>', a => this.ipAddr(a[0], a[1])],
        ['no ip address', () => this.eachIf(i => { i.ip = null; i.mask = null; })],
        ['encapsulation dot1q <num> native', a => this.encap(+a[0], true)],
        ['encapsulation dot1q <num>', a => this.encap(+a[0], false)],
        ['ip access-group <word> <word>', a => this.accessGroup(a[0], a[1])],
        ['no ip access-group <word> <word>', a => this.accessGroup(a[0], a[1], true)],
        ['ip ospf cost <num>', a => this.eachIf(i => { i.ospfCost = +a[0]; })],
        ['no ip ospf cost', () => this.eachIf(i => { delete i.ospfCost; })],
        ['ip ospf priority <num>', a => this.eachIf(i => { i.ospfPriority = +a[0]; })],
        ['ip ospf <num> area <num>', a => this.eachIf(i => { i.ospfPid = +a[0]; i.ospfArea = +a[1]; })],
        ['no ip ospf <num> area <num>', () => this.eachIf(i => { delete i.ospfArea; delete i.ospfPid; })],
        ['ip helper-address <ip>', (a, raw) => this.eachIf(i => this.extra(i, 'ip helper-address', raw))],
        ['ip nat inside', (a, raw) => this.eachIf(i => this.extra(i, 'ip nat', raw))],
        ['ip nat outside', (a, raw) => this.eachIf(i => this.extra(i, 'ip nat', raw))],
      );
    }

    const ospf = [
      ['network <ip> <ip> area <num>', a => this.ospfNet(a[0], a[1], +a[2])],
      ['no network <ip> <ip> area <num>', a => this.ospfNet(a[0], a[1], +a[2], true)],
      ['router-id <ip>', a => { this.d.ospf.rid = a[0]; return ['% OSPF: Reload or use "clear ip ospf process" command, for this to take effect']; }],
      ['no router-id', () => { this.d.ospf.rid = null; }],
      ['passive-interface <if>', a => { if (!this.d.ospf.passive.includes(a[0])) this.d.ospf.passive.push(a[0]); }],
      ['no passive-interface <if>', a => { this.d.ospf.passive = this.d.ospf.passive.filter(p => p !== a[0]); }],
      ['auto-cost reference-bandwidth <num>', a => { this.d.ospf.refBw = +a[0]; return ['% OSPF: Reference bandwidth is changed.', '        Please ensure reference bandwidth is consistent across all routers.']; }],
      ['default-information originate', () => { this.d.ospf.extra = [...new Set([...(this.d.ospf.extra || []), 'default-information originate'])]; return ['% Simulator: default route propagation is not modelled.']; }],
      ['exit', () => { this.mode = 'config'; this.ctx = {}; }],
      ...common,
    ];

    const vlan = [
      ['name <word>', a => { this.d.vlans[this.ctx.vlan] = a[0]; }],
      ['exit', () => { this.mode = 'config'; this.ctx = {}; }],
      ...common,
    ];

    const line = [
      ['password <word>', a => this.lineCfg('password', `password ${a[0]}`)],
      ['login local', () => this.lineCfg('login', 'login local')],
      ['login', () => this.lineCfg('login', 'login')],
      ['transport input <rest>', a => this.lineCfg('transport input', `transport input ${a[0]}`)],
      ['exec-timeout <rest>', a => this.lineCfg('exec-timeout', `exec-timeout ${a[0]}`)],
      ['logging synchronous', () => this.lineCfg('logging synchronous', 'logging synchronous')],
      ['exit', () => { this.mode = 'config'; this.ctx = {}; }],
      ...common,
    ];

    const nacl = [
      ['permit <rest>', (a, raw) => this.naclEntry(raw)],
      ['deny <rest>', (a, raw) => this.naclEntry(raw)],
      ['remark <rest>', (a, raw) => this.naclEntry(raw)],
      ['exit', () => { this.mode = 'config'; this.ctx = {}; }],
      ...common,
    ];

    const compile = list => list.map(([p, f]) => ({ pt: p.split(' '), f }));
    this.table = {
      user: compile(user), priv: compile(priv), config: compile(config),
      if: compile(ifCmds), subif: compile(ifCmds), range: compile(ifCmds),
      router: compile(ospf), vlan: compile(vlan), line: compile(line),
      'std-nacl': compile(nacl), 'ext-nacl': compile(nacl),
    };
  }

  // ---------- parsing ----------

  static tokMatch(pt, tok) {
    if (pt === '<rest>' || pt === '<word>') return true;
    if (pt === '<ip>') return isIp(tok);
    if (pt === '<num>') return /^\d+$/.test(tok);
    if (pt === '<if>') return !!normIf(tok);
    return pt.startsWith(tok.toLowerCase());
  }

  /** Narrow candidate commands by the typed tokens. */
  match(tokens, mode = this.mode) {
    let cands = this.table[mode];
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const at = c => (i < c.pt.length ? c.pt[i] : (c.pt[c.pt.length - 1] === '<rest>' ? '<rest>' : null));
      let next = cands.filter(c => {
        const p = at(c);
        if (!p) return false;
        // once inside <rest>, everything matches
        if (c.pt.indexOf('<rest>') > -1 && i >= c.pt.indexOf('<rest>')) return true;
        return IosCli.tokMatch(p, tok);
      });
      const kws = new Set(next.map(at).filter(p => p && !p.startsWith('<')));
      if (kws.size) {
        // keywords beat parameters; exact keyword beats prefix
        const exact = [...kws].find(k => k === tok.toLowerCase());
        if (exact) next = next.filter(c => at(c) === exact || (c.pt.indexOf('<rest>') > -1 && i > c.pt.indexOf('<rest>')));
        else if (kws.size > 1) return { err: 'ambiguous', at: i, cands: next };
        else next = next.filter(c => !at(c).startsWith('<') || (c.pt.indexOf('<rest>') > -1 && i > c.pt.indexOf('<rest>')));
      }
      if (!next.length) return { err: 'invalid', at: i, cands };
      cands = next;
    }
    const full = cands.filter(c => {
      const ri = c.pt.indexOf('<rest>');
      return ri > -1 ? tokens.length > ri : c.pt.length === tokens.length;
    });
    if (!full.length) return { err: 'incomplete', cands };
    return { cmd: full[0], cands };
  }

  static params(cmd, tokens, raw) {
    const out = [];
    cmd.pt.forEach((p, i) => {
      if (p === '<rest>') {
        // keep original spacing after the fixed words
        const words = raw.trim().split(/\s+/);
        out.push(words.slice(i).join(' '));
      } else if (p === '<if>') out.push(normIf(tokens[i]));
      else if (p.startsWith('<')) out.push(tokens[i]);
    });
    return out;
  }

  /** Execute one line. Returns {lines, anim}. */
  exec(raw) {
    this.anim = null;
    const lines = this.execInner(raw) || [];
    return { lines, anim: this.anim };
  }

  execInner(raw) {
    if (this.pending?.type === 'password') {
      const p = this.pending;
      this.pending = null;
      if (raw === p.secret) { this.mode = 'priv'; return []; }
      return ['% Bad secrets', ''];
    }
    const line = raw.trim();
    if (!line) return [];
    if (line.startsWith('!')) return [];
    this.history = [...(this.history || []), line].slice(-20);
    if (line.endsWith('?')) return this.help(line);
    const tokens = line.split(/\s+/);
    let m = this.match(tokens);
    if (m.err && !['user', 'priv', 'config'].includes(this.mode)) {
      // IOS falls through to global config for commands the sub-mode doesn't know
      const g = this.match(tokens, 'config');
      if (!g.err) { this.mode = 'config'; this.ctx = {}; m = g; }
    }
    if (m.err === 'ambiguous') return [`% Ambiguous command:  "${line}"`];
    if (m.err === 'incomplete') return ['% Incomplete command.', ''];
    if (m.err === 'invalid') {
      const col = this.prompt().length + line.indexOf(tokens[m.at], tokens.slice(0, m.at).join(' ').length);
      return [`${' '.repeat(col)}^`, INVALID, ''];
    }
    try {
      const out = m.cmd.f(IosCli.params(m.cmd, tokens, line), line);
      return Array.isArray(out) ? out : [];
    } catch (e) {
      return [`% ${e.message}`];
    }
  }

  runAs(mode, line) {
    const keep = this.mode;
    const ctx = this.ctx;
    this.mode = mode;
    const out = this.execInner(line);
    if (this.mode === mode) { this.mode = keep; this.ctx = ctx; }
    return out;
  }

  help(line) {
    const body = line.slice(0, -1);
    const endsSpace = body === '' || /\s$/.test(body);
    const tokens = body.trim() ? body.trim().split(/\s+/) : [];
    const done = endsSpace ? tokens : tokens.slice(0, -1);
    const partial = endsSpace ? '' : tokens[tokens.length - 1];
    const m = done.length ? this.match(done) : { cands: this.table[this.mode] };
    if (m.err === 'invalid' || m.err === 'ambiguous') return [INVALID];
    const i = done.length;
    const opts = new Map();
    let canEnd = false;
    for (const c of m.cands || []) {
      if (c.pt.length === i && !c.pt.includes('<rest>')) canEnd = true;
      const p = c.pt[i];
      if (!p) continue;
      if (partial && !(p.startsWith('<') || p.startsWith(partial.toLowerCase()))) continue;
      opts.set(p, KW[p] || ({ '<ip>': 'A.B.C.D', '<num>': '<number>', '<if>': 'Interface name', '<word>': 'WORD', '<rest>': 'LINE' }[p] || ''));
    }
    const out = [...opts].sort().map(([k, v]) => `  ${pad(k.replace(/^<(.*)>$/, (_, x) => x.toUpperCase()), 22)}${v}`);
    if (canEnd && endsSpace) out.push('  <cr>');
    return out.length ? out : ['% Unrecognized command'];
  }

  complete(line) {
    const endsSpace = /\s$/.test(line);
    const tokens = line.trim() ? line.trim().split(/\s+/) : [];
    if (!tokens.length || endsSpace) return line;
    const done = tokens.slice(0, -1);
    const last = tokens[tokens.length - 1].toLowerCase();
    const m = done.length ? this.match(done) : { cands: this.table[this.mode] };
    if (m.err) return line;
    const kws = new Set((m.cands || []).map(c => c.pt[done.length]).filter(p => p && !p.startsWith('<') && p.startsWith(last)));
    if (kws.size !== 1) return line;
    return [...done, [...kws][0]].join(' ') + ' ';
  }

  // ---------- command implementations ----------

  enable() {
    const sec = this.d.globalCfg.find(l => l.startsWith('enable secret') || l.startsWith('enable password'));
    if (sec && this.d.secret) { this.pending = { type: 'password', secret: this.d.secret }; return []; }
    this.mode = 'priv';
    return [];
  }

  save() {
    this.d.startup = runningConfig(this.net, this.d).slice(2).join('\n');
    return ['Destination filename [startup-config]? ', 'Building configuration...', '[OK]'];
  }

  reload() {
    return ['% Simulator: reload is not modelled. Your running-config is kept.'];
  }

  hostname(n) {
    if (!/^[A-Za-z][\w-]{0,62}$/.test(n)) return ['% Hostname contains one or more illegal characters.'];
    this.d.name = n;
    return [];
  }

  setGlobal(key, line, extra) {
    this.d.globalCfg = this.d.globalCfg.filter(l => !l.startsWith(key));
    this.d.globalCfg.push(line);
    if (extra?.secret) this.d.secret = extra.secret;
    return [];
  }

  unsetGlobal(key) {
    this.d.globalCfg = this.d.globalCfg.filter(l => !l.startsWith(key));
    if (key === 'enable secret') this.d.secret = null;
    return [];
  }

  rsa() {
    if (!this.d.globalCfg.some(l => l.startsWith('ip domain-name'))) return ['% Please define a domain-name first.'];
    this.setGlobal('crypto key', '! crypto key generated (rsa 2048)');
    return ['The name for the keys will be: ' + this.d.name, 'How many bits in the modulus [512]: 2048',
      '% Generating 2048 bit RSA keys, keys will be non-exportable...[OK]', '*Mar 1 00:10:00.000: %SSH-5-ENABLED: SSH 1.99 has been enabled'];
  }

  enterLine(rest) {
    const t = rest.trim().split(/\s+/);
    const kind = { c: 'con', v: 'vty' }[t[0]?.[0]?.toLowerCase()];
    if (!kind || !t[1]) return [INVALID];
    const name = kind === 'con' ? `con ${t[1]}` : `vty ${t[1]} ${t[2] || t[1]}`;
    this.d.lines[name] = this.d.lines[name] || [];
    this.mode = 'line';
    this.ctx = { line: name };
    return [];
  }

  lineCfg(key, text) {
    const l = this.d.lines[this.ctx.line];
    const i = l.findIndex(x => x.startsWith(key));
    if (i > -1) l[i] = text; else l.push(text);
  }

  extra(ifc, key, raw) {
    ifc.extra = (ifc.extra || []).filter(x => !x.startsWith(key));
    ifc.extra.push(raw.trim().replace(/\s+/g, ' '));
  }

  enterIf(text) {
    const name = normIf(text);
    if (!name) return [INVALID];
    const d = this.d;
    if (!d.ifaces[name]) {
      if (name.includes('.') && d.type === 'router' && d.ifaces[name.split('.')[0]]) {
        d.ifaces[name] = { name, mac: d.ifaces[name.split('.')[0]].mac, ip: null, mask: null, desc: '', shutdown: false, encap: null, native: false, extra: [] };
      } else if (name.startsWith('Loopback') && d.type === 'router') {
        d.ifaces[name] = { name, mac: d.mac, ip: null, mask: null, desc: '', shutdown: false, extra: [] };
      } else if (name.startsWith('Vlan') && d.type === 'switch') {
        const v = +name.slice(4);
        if (!(v >= 1 && v <= 4094)) return [INVALID];
        d.ifaces[name] = { name, mac: d.mac, ip: null, mask: null, desc: '', shutdown: false, extra: [] };
      } else {
        return [INVALID];
      }
    }
    this.mode = name.includes('.') ? 'subif' : 'if';
    this.ctx = { ifs: [name] };
    return [];
  }

  ifRange(text) {
    const list = expandRange(text);
    if (!list || !list.every(n => this.d.ifaces[n] && !n.includes('.'))) return [INVALID];
    this.mode = 'range';
    this.ctx = { ifs: list };
    return [];
  }

  eachIf(fn) {
    const out = [];
    for (const n of this.ctx.ifs) {
      const r = fn(this.d.ifaces[n]);
      if (Array.isArray(r)) out.push(...r);
    }
    return out;
  }

  eachPort(fn) {
    if (this.ctx.ifs.some(n => n.startsWith('Vlan'))) return [INVALID];
    return this.eachIf(fn);
  }

  setShut(ifc, shut) {
    const was = this.net.isUp(this.d, ifc.name);
    ifc.shutdown = shut;
    const now = this.net.isUp(this.d, ifc.name);
    const out = [];
    if (shut) out.push(`%LINK-5-CHANGED: Interface ${ifc.name}, changed state to administratively down`);
    if (was !== now) {
      if (!shut && !ifc.name.startsWith('Loop')) out.push(`%LINK-5-CHANGED: Interface ${ifc.name}, changed state to up`);
      out.push(`%LINEPROTO-5-UPDOWN: Line protocol on Interface ${ifc.name}, changed state to ${now ? 'up' : 'down'}`);
    }
    return out;
  }

  ipAddr(ip, mask) {
    if (this.ctx.ifs.length > 1) return [INVALID];
    const ifc = this.d.ifaces[this.ctx.ifs[0]];
    if (this.d.type === 'switch' && !ifc.name.startsWith('Vlan')) return [INVALID];
    if (ifc.name.includes('.') && ifc.encap == null) {
      return ['% Configuring IP routing on a LAN subinterface is only allowed if that', 'subinterface is already configured as part of an IEEE 802.10, IEEE 802.1Q,', 'or ISL vLAN.'];
    }
    const m = ipToInt(mask);
    if (maskToPrefix(m) === null) return [`Bad mask 0x${m.toString(16).toUpperCase()} for address ${ip}`];
    const n = network(ipToInt(ip), m);
    if (m !== 0xffffffff && (ipToInt(ip) === n || ipToInt(ip) === ((n | (~m >>> 0)) >>> 0)) && maskToPrefix(m) < 31) {
      return [`Bad mask /${maskToPrefix(m)} for address ${ip}`];
    }
    for (const o of Object.values(this.d.ifaces)) {
      if (o === ifc || !o.ip) continue;
      const om = ipToInt(o.mask);
      const sm = om < m ? om : m;
      if (network(ipToInt(o.ip), sm) === network(ipToInt(ip), sm)) {
        return [`% ${intToIp(network(ipToInt(ip), m))} overlaps with ${o.name}`];
      }
    }
    ifc.ip = ip;
    ifc.mask = mask;
    return [];
  }

  encap(v, native) {
    const ifc = this.d.ifaces[this.ctx.ifs[0]];
    if (!ifc.name.includes('.')) return [INVALID];
    ifc.encap = v;
    ifc.native = native;
    return [];
  }

  accessVlan(v) {
    if (v < 1 || v > 4094) return ['Command rejected: Bad VLAN list'];
    const out = [];
    if (!this.d.vlans[v]) {
      this.d.vlans[v] = `VLAN${String(v).padStart(4, '0')}`;
      out.push('% Access VLAN does not exist. Creating vlan ' + v);
    }
    return [...out, ...this.eachPort(i => { i.vlan = v; })];
  }

  allowed(text) {
    const t = text.trim().split(/\s+/);
    return this.eachPort(i => {
      const cur = i.allowed ? [...i.allowed] : null;
      if (t[0] === 'all') { i.allowed = null; return; }
      if (t[0] === 'none') { i.allowed = []; return; }
      if (t[0] === 'add' || t[0] === 'remove' || t[0] === 'except') {
        const l = parseVlanList(t[1] || '');
        if (!l) return ['Command rejected: Bad VLAN list'];
        const all = cur || Array.from({ length: 4094 }, (_, k) => k + 1);
        if (t[0] === 'add') i.allowed = cur ? [...new Set([...cur, ...l])].sort((a, b) => a - b) : null;
        else if (t[0] === 'remove') i.allowed = all.filter(v => !l.includes(v));
        else i.allowed = Array.from({ length: 4094 }, (_, k) => k + 1).filter(v => !l.includes(v));
        return;
      }
      const l = parseVlanList(t[0]);
      if (!l) return ['Command rejected: Bad VLAN list'];
      i.allowed = l;
    });
  }

  enterVlan(text) {
    const l = parseVlanList(text.trim());
    if (!l) return ['Command rejected: Bad VLAN list'];
    for (const v of l) if (!this.d.vlans[v]) this.d.vlans[v] = `VLAN${String(v).padStart(4, '0')}`;
    this.mode = 'vlan';
    this.ctx = { vlan: l[0] };
    return [];
  }

  noVlan(text) {
    const l = parseVlanList(text.trim());
    if (!l) return ['Command rejected: Bad VLAN list'];
    for (const v of l) {
      if (v === 1) return ['%Default VLAN 1 may not be deleted.'];
      delete this.d.vlans[v];
    }
    return [];
  }

  ipRoute(rest, remove) {
    const t = rest.trim().split(/\s+/);
    if (!isIp(t[0]) || !isIp(t[1])) return [INVALID];
    const net = ipToInt(t[0]);
    const mask = ipToInt(t[1]);
    if (maskToPrefix(mask) === null) return ['%Inconsistent address and mask'];
    if (network(net, mask) !== net) return ['%Inconsistent address and mask'];
    if (remove) {
      this.d.statics = this.d.statics.filter(s => !(s.net === net && s.mask === mask && (!t[2] || s.nh === t[2] || s.iface === normIf(t[2]))));
      return [];
    }
    if (!t[2]) return ['% Incomplete command.'];
    let nh = null;
    let iface = null;
    let k = 2;
    if (isIp(t[k])) { nh = t[k]; k++; } else {
      iface = normIf(t[k]);
      if (!iface || !this.d.ifaces[iface]) return [INVALID];
      k++;
      if (isIp(t[k])) { nh = t[k]; k++; }
    }
    const ad = t[k] ? +t[k] : 1;
    if (!(ad >= 1 && ad <= 255)) return [INVALID];
    this.d.statics = this.d.statics.filter(s => !(s.net === net && s.mask === mask && s.nh === nh && s.iface === iface));
    this.d.statics.push({ net, mask, nh, iface, ad });
    return [];
  }

  enterOspf(pid) {
    if (!this.d.ospf) this.d.ospf = { pid, rid: null, networks: [], passive: [], refBw: 100 };
    else if (this.d.ospf.pid !== pid) return ['% Simulator: only one OSPF process per router is supported.'];
    this.mode = 'router';
    this.ctx = {};
    return [];
  }

  ospfNet(ip, wild, area, remove) {
    const w = ipToInt(wild);
    const net = (ipToInt(ip) & ~w) >>> 0;
    const nets = this.d.ospf.networks;
    const i = nets.findIndex(n => n.net === net && n.wild === w);
    if (remove) { if (i > -1) nets.splice(i, 1); return []; }
    if (i > -1) nets[i].area = area; else nets.push({ net, wild: w, area });
    const out = [];
    for (const n of this.net.ospfNeighbors(this.d)) {
      out.push(`%OSPF-5-ADJCHG: Process ${this.d.ospf.pid}, Nbr ${n.rid} on ${n.myIf} from LOADING to FULL, Loading Done`);
    }
    return out;
  }

  accessList(num, raw) {
    const n = +num;
    const type = (n >= 1 && n <= 99) || (n >= 1300 && n <= 1999) ? 'standard'
      : (n >= 100 && n <= 199) || (n >= 2000 && n <= 2699) ? 'extended' : null;
    if (!type) return [INVALID];
    const words = raw.trim().split(/\s+/).slice(2);
    const e = parseAclEntry(words, type);
    if (typeof e === 'string') return [e];
    this.d.acls[num] = this.d.acls[num] || { type, entries: [] };
    this.d.acls[num].entries.push(e);
    return [];
  }

  enterNacl(name, type) {
    this.d.acls[name] = this.d.acls[name] || { type, entries: [] };
    if (this.d.acls[name].type !== type) return ['% A named access list with this name already exists with a different type.'];
    this.mode = type === 'standard' ? 'std-nacl' : 'ext-nacl';
    this.ctx = { acl: name };
    return [];
  }

  naclEntry(raw) {
    const acl = this.d.acls[this.ctx.acl];
    const e = parseAclEntry(raw.trim().split(/\s+/), acl.type);
    if (typeof e === 'string') return [e];
    acl.entries.push(e);
    return [];
  }

  accessGroup(name, dir, remove) {
    dir = dir.toLowerCase();
    if (!['in', 'out'].includes(dir)) return [INVALID];
    return this.eachIf(i => { i[dir === 'in' ? 'aclIn' : 'aclOut'] = remove ? null : name; });
  }

  ipProtocols() {
    const o = this.d.ospf;
    if (!o) return [];
    return [`Routing Protocol is "ospf ${o.pid}"`, `  Router ID ${this.net.routerId(this.d) || '0.0.0.0'}`,
      '  Routing for Networks:', ...o.networks.map(n => `    ${intToIp(n.net)} ${intToIp(n.wild)} area ${n.area}`),
      ...(o.passive.length ? ['  Passive Interface(s):', ...o.passive.map(p => `    ${p}`)] : []),
      '  Distance: (default is 110)'];
  }

  ping(ip) {
    const r = this.net.ping(this.d, ip, 5);
    this.anim = r.steps;
    const ok = r.results.filter(x => x === '!').length;
    return ['Type escape sequence to abort.', `Sending 5, 100-byte ICMP Echos to ${ip}, timeout is 2 seconds:`,
      r.results.join(''), `Success rate is ${ok * 20} percent (${ok}/5)${ok ? ', round-trip min/avg/max = 1/2/4 ms' : ''}`];
  }

  trace(ip) {
    const t = this.net.traceroute(this.d, ip);
    const out = ['Type escape sequence to abort.', `Tracing the route to ${ip}`, ''];
    for (const h of t.hops) out.push(`  ${h.ttl} ${h.ip ? `${h.ip} 1 msec 0 msec 1 msec` : '*    *    *'}`);
    return out;
  }
}

// ---------- the PC "command prompt" ----------

export class PcCli {
  constructor(net, dev) { this.net = net; this.dev = dev; this.anim = null; }

  prompt() { return 'C:\\>'; }

  complete(l) { return l; }

  exec(raw) {
    this.anim = null;
    const t = raw.trim().split(/\s+/);
    const c = (t[0] || '').toLowerCase();
    const d = this.dev;
    const ifc = d.ifaces.FastEthernet0;
    let lines = [];
    if (!c) lines = [];
    else if (c === 'help' || c === '?') {
      lines = ['Available commands:', '  ipconfig                         show IP settings',
        '  ipconfig <ip> <mask> [gateway]   set a static address', '  ipconfig /release                clear the address',
        '  ping <ip>                        send 4 echo requests', '  tracert <ip>                     trace route',
        '  arp -a                           show ARP cache', '  arp -d                           clear ARP cache'];
    } else if (c === 'ipconfig') {
      if (t[1] === '/release') { ifc.ip = null; ifc.mask = null; d.gw = null; lines = ['IP address released.']; }
      else if (t[1] && t[1] !== '/all') {
        if (!isIp(t[1]) || !isIp(t[2] || '') || maskToPrefix(ipToInt(t[2])) === null) lines = ['Invalid IP address or subnet mask.'];
        else if (t[3] && !isIp(t[3])) lines = ['Invalid default gateway.'];
        else { ifc.ip = t[1]; ifc.mask = t[2]; d.gw = t[3] || null; lines = []; }
      } else {
        lines = ['', 'FastEthernet0 Connection:', '', `   Physical Address................: ${ifc.mac}`,
          `   IPv4 Address....................: ${ifc.ip || '0.0.0.0'}`, `   Subnet Mask.....................: ${ifc.mask || '0.0.0.0'}`,
          `   Default Gateway.................: ${d.gw || '0.0.0.0'}`, ''];
      }
    } else if (c === 'ping') {
      if (!isIp(t[1] || '')) lines = ['Ping request could not find host. Please check the name and try again.'];
      else {
        const r = this.net.ping(d, t[1], 4);
        this.anim = r.steps;
        lines = ['', `Pinging ${t[1]} with 32 bytes of data:`, ''];
        for (const x of r.results) {
          if (x === '!') lines.push(`Reply from ${t[1]}: bytes=32 time<1ms TTL=128`);
          else if (x === 'U') lines.push('Reply from a router: Destination host unreachable.');
          else lines.push('Request timed out.');
        }
        const ok = r.results.filter(x => x === '!').length;
        lines.push('', `Ping statistics for ${t[1]}:`, `    Packets: Sent = 4, Received = ${ok}, Lost = ${4 - ok} (${(4 - ok) * 25}% loss),`);
      }
    } else if (c === 'tracert' || c === 'traceroute') {
      if (!isIp(t[1] || '')) lines = ['Unable to resolve target system name.'];
      else {
        const tr = this.net.traceroute(d, t[1]);
        lines = ['', `Tracing route to ${t[1]} over a maximum of 30 hops:`, ''];
        for (const h of tr.hops) lines.push(`  ${lpad(h.ttl, 2)}   ${h.ip ? `0 ms      0 ms      0 ms      ${h.ip}` : '*         *         *         Request timed out.'}`);
        lines.push('', tr.done ? 'Trace complete.' : 'Trace stopped.');
      }
    } else if (c === 'arp') {
      if (t[1] === '-d') { d.arp = {}; lines = []; }
      else {
        const e = Object.entries(d.arp);
        lines = e.length ? ['  Internet Address      Physical Address      Type', ...e.map(([ip, x]) => `  ${pad(ip, 22)}${pad(x.mac, 22)}dynamic`)] : ['No ARP Entries Found'];
      }
    } else lines = ['Invalid Command.'];
    return { lines, anim: this.anim };
  }
}

export function cliFor(net, dev) { return dev.type === 'pc' ? new PcCli(net, dev) : new IosCli(net, dev); }
