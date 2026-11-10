// Challenges: word problems for the lab. Each one is a story (a business need or a help-desk
// ticket) with goals checked against the live simulation, but no commands: you work it out by
// trial and error, with hints that unlock one at a time. Every variant is randomised from a
// seed (VLAN numbers, addresses, names, ports, and for tickets which faults are hidden), so the
// answer can't be memorised.
//
// A challenge type: { id, title, kind: 'build' | 'ticket', domain, level, gen(seed) → instance }
// An instance: { story, make() → Net, goals: [[text, net => bool]], hints: [string],
//                solution: { device: [commands] }, explain }

import { build, script } from './labs.js';
import { ipToInt, intToIp, prefixToMask, usableHosts } from './net.js';

// ---------------------------------------------------------------- seeded randomness

export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const shuffle = (r, arr) => { const x = [...arr]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const distinct = (r, n, a, b) => { const s = new Set(); while (s.size < n) s.add(int(r, a, b)); return [...s]; };

const C = ['en', 'conf t'];
const TEAMS = [['PAYROLL', 'Payroll'], ['SHIPPING', 'Shipping'], ['SALES', 'Sales'], ['ENG', 'Engineering'], ['HR', 'HR'], ['LEGAL', 'Legal'], ['MARKETING', 'Marketing'], ['SUPPORT', 'Support'], ['FINANCE', 'Finance'], ['LAB', 'Lab']];
const COMPANIES = ['Northwind Bikes', 'Blue Heron Dental', 'Copperline Studio', 'Maple & Main Bakery', 'Riverside Clinic', 'Atlas Freight', 'Kestrel Robotics', 'Juniper Books'];
const PEOPLE = ['Dana', 'Sam', 'Priya', 'Luis', 'Mei', 'Omar', 'Grace', 'Theo', 'Ana', 'Kofi', 'Hana', 'Ravi'];
const short = ifc => ifc.replace('FastEthernet', 'Fa').replace('GigabitEthernet', 'Gi');
const ip = (n, k) => intToIp(ipToInt(n) + k);
const maskOf = p => intToIp(prefixToMask(p));
const ifc = (net, dev, i) => net.byName(dev)?.ifaces[i];
const routesOf = (net, dev) => { const d = net.byName(dev); return d ? net.routes(d) : []; };

// ---------------------------------------------------------------- build challenges

function vlanSplit(seed) {
  const r = rng(seed);
  const [[ta, Ta], [tb, Tb]] = shuffle(r, TEAMS).slice(0, 2);
  const [va, vb] = [int(r, 10, 49), int(r, 50, 99)];
  const subnet = `10.${int(r, 1, 250)}.${int(r, 1, 250)}.0`;
  const ports = shuffle(r, [1, 2, 3, 4].map(i => `FastEthernet0/${i}`));
  const pcs = [[`${ta.slice(0, 3)}-1`, ta, va, ports[0]], [`${ta.slice(0, 3)}-2`, ta, va, ports[1]], [`${tb.slice(0, 3)}-1`, tb, vb, ports[2]], [`${tb.slice(0, 3)}-2`, tb, vb, ports[3]]];
  const company = pick(r, COMPANIES);
  return {
    story: `**${company}** has one switch, **S1**, shared by two teams. ${Ta} works with confidential data, so **the two teams must not be able to reach each other at all**, but colleagues on the same team must still reach each other.

The network plan reserves **VLAN ${va}** (named **${ta}**) for ${Ta} and **VLAN ${vb}** (named **${tb}**) for ${Tb}. Everyone already has an IP address in ${subnet}/24, and nobody wants to re-address their PC.

| PC | Team | Plugged into |
|---|---|---|
${pcs.map(([n, t, , p]) => `| ${n} | ${t === ta ? Ta : Tb} | S1 ${short(p)} |`).join('\n')}`,
    make: () => build({
      devices: [['switch', 'S1', 260, 110], ...pcs.map(([n], i) => ['pc', n, 70 + i * 130, 300])],
      links: pcs.map(([n, , , p]) => [n, 'FastEthernet0', 'S1', p]),
      setup: Object.fromEntries(pcs.map(([n], i) => [n, [`ipconfig ${ip(subnet, 11 + i)} 255.255.255.0`]])),
    }),
    goals: [
      [`VLAN ${va} exists on S1, named ${ta}`, n => n.byName('S1')?.vlans[va] === ta],
      [`VLAN ${vb} exists on S1, named ${tb}`, n => n.byName('S1')?.vlans[vb] === tb],
      [`${pcs[0][0]} can reach ${pcs[1][0]}`, n => n.canPing(pcs[0][0], ip(subnet, 12))],
      [`${pcs[2][0]} can reach ${pcs[3][0]}`, n => n.canPing(pcs[2][0], ip(subnet, 14))],
      [`${Ta} and ${Tb} can't reach each other`, n => !n.canPing(pcs[0][0], ip(subnet, 13)) && !n.canPing(pcs[1][0], ip(subnet, 14))],
    ],
    hints: [
      'Every switch port starts in the same VLAN, so right now all four PCs share one broadcast domain. What splits one switch into separate LANs?',
      'Create both VLANs on S1 and give them their names, then make each desk\'s port an access port in its team\'s VLAN. `show vlan brief` shows where every port is.',
      `On S1: \`vlan ${va}\` → \`name ${ta}\`, \`vlan ${vb}\` → \`name ${tb}\`; then for each port \`interface ${short(ports[0])}\` → \`switchport mode access\` → \`switchport access vlan ${va}\` (and so on).`,
    ],
    solution: { S1: [...C, `vlan ${va}`, `name ${ta}`, `vlan ${vb}`, `name ${tb}`, ...pcs.flatMap(([, , v, p]) => [`interface ${p}`, 'switchport mode access', `switchport access vlan ${v}`]), 'end'] },
    explain: 'Ports in different VLANs are different broadcast domains: frames never cross between them without a router, even though the PCs share a subnet.',
  };
}

function trunk(seed) {
  const r = rng(seed);
  const [[ta, Ta], [tb, Tb]] = shuffle(r, TEAMS).slice(0, 2);
  const [va, vb] = distinct(r, 2, 10, 99);
  const [sa, sb] = [`172.16.${int(r, 1, 120)}.0`, `172.16.${int(r, 130, 250)}.0`];
  const pcs = [[`${ta.slice(0, 3)}-1`, 'S1', 'FastEthernet0/1', va, ip(sa, 11)], [`${tb.slice(0, 3)}-1`, 'S1', 'FastEthernet0/2', vb, ip(sb, 11)], [`${ta.slice(0, 3)}-2`, 'S2', 'FastEthernet0/1', va, ip(sa, 12)], [`${tb.slice(0, 3)}-2`, 'S2', 'FastEthernet0/2', vb, ip(sb, 12)]];
  return {
    story: `Two floors, two switches. **S1** is downstairs and **S2** upstairs, joined by one cable between their **Gi0/1** ports. ${Ta} and ${Tb} each have someone on both floors.

${Ta} uses **VLAN ${va}** (name **${ta}**, subnet ${sa}/24) and ${Tb} uses **VLAN ${vb}** (name **${tb}**, subnet ${sb}/24). The PCs are addressed already. Each team must reach its own people on the other floor, over that single cable.

| PC | Team | Plugged into |
|---|---|---|
${pcs.map(([n, s, p, v]) => `| ${n} | ${v === va ? Ta : Tb} | ${s} ${short(p)} |`).join('\n')}`,
    make: () => build({
      devices: [['switch', 'S1', 140, 120], ['switch', 'S2', 400, 120], ...pcs.map(([n], i) => ['pc', n, 60 + i * 140, 300])],
      links: [['S1', 'GigabitEthernet0/1', 'S2', 'GigabitEthernet0/1'], ...pcs.map(([n, s, p]) => [n, 'FastEthernet0', s, p])],
      setup: Object.fromEntries(pcs.map(([n, , , , a]) => [n, [`ipconfig ${a} 255.255.255.0`]])),
    }),
    goals: [
      [`VLANs ${va} and ${vb} exist on both switches`, n => ['S1', 'S2'].every(s => n.byName(s)?.vlans[va] && n.byName(s)?.vlans[vb])],
      ['The link between the switches is a trunk', n => ['S1', 'S2'].every(s => ifc(n, s, 'GigabitEthernet0/1')?.mode === 'trunk')],
      [`${pcs[0][0]} reaches ${pcs[2][0]} upstairs`, n => n.canPing(pcs[0][0], pcs[2][4])],
      [`${pcs[1][0]} reaches ${pcs[3][0]} upstairs`, n => n.canPing(pcs[1][0], pcs[3][4])],
    ],
    hints: [
      'A VLAN only exists on a switch where it has been created, and an ordinary access link carries just one VLAN. What kind of link carries several?',
      'Create and name both VLANs on S1 **and** S2, put each PC port in its VLAN, and turn Gi0/1 into a trunk on both ends. `show interfaces trunk` confirms it.',
      `On both switches: \`vlan ${va}\` → \`name ${ta}\`, \`vlan ${vb}\` → \`name ${tb}\`, access ports with \`switchport access vlan …\`, then \`interface gi0/1\` → \`switchport mode trunk\`.`,
    ],
    solution: Object.fromEntries(['S1', 'S2'].map(s => [s, [...C, `vlan ${va}`, `name ${ta}`, `vlan ${vb}`, `name ${tb}`, ...pcs.filter(p => p[1] === s).flatMap(([, , p, v]) => [`interface ${p}`, 'switchport mode access', `switchport access vlan ${v}`]), 'interface GigabitEthernet0/1', 'switchport mode trunk', 'end']])),
    explain: 'An 802.1Q trunk tags each frame with its VLAN so one cable can carry many VLANs, and each switch needs the VLAN created locally to forward it.',
  };
}

function roas(seed) {
  const r = rng(seed);
  const [[ta, Ta], [tb, Tb]] = shuffle(r, TEAMS).slice(0, 2);
  const [va, vb] = distinct(r, 2, 10, 99);
  const [na, nb] = distinct(r, 2, 1, 250).map(x => `10.${x}.0.0`);
  return {
    story: `${Ta} (**VLAN ${va}**, ${na}/24) and ${Tb} (**VLAN ${vb}**, ${nb}/24) are on switch **S1**, which is already set up with both VLANs. Now they need to share files, which means routing between the VLANs.

The only router, **R1**, has a **single cable** to S1 (R1 Gi0/0 to S1 Gi0/1). Both teams' PCs already use the **.1** address of their subnet as the default gateway.`,
    make: () => build({
      devices: [['router', 'R1', 260, 60], ['switch', 'S1', 260, 200], ['pc', 'A-PC', 140, 350], ['pc', 'B-PC', 380, 350]],
      links: [['R1', 'GigabitEthernet0/0', 'S1', 'GigabitEthernet0/1'], ['A-PC', 'FastEthernet0', 'S1', 'FastEthernet0/1'], ['B-PC', 'FastEthernet0', 'S1', 'FastEthernet0/2']],
      setup: {
        S1: [...C, `vlan ${va}`, `name ${ta}`, `vlan ${vb}`, `name ${tb}`, 'int f0/1', 'sw mode access', `sw access vlan ${va}`, 'int f0/2', 'sw mode access', `sw access vlan ${vb}`, 'end'],
        'A-PC': [`ipconfig ${ip(na, 10)} 255.255.255.0 ${ip(na, 1)}`], 'B-PC': [`ipconfig ${ip(nb, 10)} 255.255.255.0 ${ip(nb, 1)}`],
      },
    }),
    goals: [
      ['A-PC reaches its gateway', n => n.canPing('A-PC', ip(na, 1))],
      ['B-PC reaches its gateway', n => n.canPing('B-PC', ip(nb, 1))],
      [`${Ta} and ${Tb} can reach each other`, n => n.canPing('A-PC', ip(nb, 10))],
    ],
    hints: [
      'One physical router port has to act as two gateways at once, one per VLAN. That needs the switch to send both VLANs down that cable, tagged.',
      `Make S1 Gi0/1 a trunk. On R1, bring Gi0/0 up, then create a subinterface per VLAN that understands that VLAN's tag and carries the gateway address.`,
      `R1: \`interface g0/0\` → \`no shutdown\`; \`interface g0/0.${va}\` → \`encapsulation dot1Q ${va}\` → \`ip address ${ip(na, 1)} 255.255.255.0\` (same for ${vb}). S1: \`interface g0/1\` → \`switchport mode trunk\`.`,
    ],
    solution: {
      S1: [...C, 'int g0/1', 'switchport mode trunk', 'end'],
      R1: [...C, 'int g0/0', 'no shutdown', `int g0/0.${va}`, `encapsulation dot1Q ${va}`, `ip address ${ip(na, 1)} 255.255.255.0`, `int g0/0.${vb}`, `encapsulation dot1Q ${vb}`, `ip address ${ip(nb, 1)} 255.255.255.0`, 'end'],
    },
    explain: 'Router-on-a-stick: the trunk delivers tagged frames to R1, and each dot1Q subinterface is the gateway for one VLAN; traffic between VLANs goes up to R1 and back down.',
  };
}

function staticRoutes(seed) {
  const r = rng(seed);
  const [h, b] = distinct(r, 2, 1, 250);
  const w = int(r, 0, 63) * 4;
  const wan = `10.${int(r, 0, 255)}.${int(r, 0, 255)}.${w}`;
  const [hq, br] = [`192.168.${h}.0`, `192.168.${b}.0`];
  const company = pick(r, COMPANIES);
  return {
    story: `**${company}** has opened a branch. **R2** (branch) connects to **R1** (HQ) over a point-to-point link, ${wan}/30. Every interface is addressed and up, but the branch PC can't reach the HQ file server yet.

- HQ LAN: ${hq}/24, file server **SRV** at ${ip(hq, 10)}
- Branch LAN: ${br}/24, **BR-PC** at ${ip(br, 10)}

The branch has only one way out, so keep it simple: **no routing protocol**. The branch router should send anything it doesn't know toward HQ.`,
    make: () => build({
      devices: [['router', 'R1', 150, 120], ['router', 'R2', 400, 120], ['pc', 'SRV', 150, 310], ['pc', 'BR-PC', 400, 310]],
      links: [['R1', 'GigabitEthernet0/0', 'R2', 'GigabitEthernet0/0'], ['SRV', 'FastEthernet0', 'R1', 'GigabitEthernet0/1'], ['BR-PC', 'FastEthernet0', 'R2', 'GigabitEthernet0/1']],
      setup: {
        R1: [...C, 'int g0/0', `ip address ${ip(wan, 1)} 255.255.255.252`, 'no shut', 'int g0/1', `ip address ${ip(hq, 1)} 255.255.255.0`, 'no shut', 'end'],
        R2: [...C, 'int g0/0', `ip address ${ip(wan, 2)} 255.255.255.252`, 'no shut', 'int g0/1', `ip address ${ip(br, 1)} 255.255.255.0`, 'no shut', 'end'],
        SRV: [`ipconfig ${ip(hq, 10)} 255.255.255.0 ${ip(hq, 1)}`], 'BR-PC': [`ipconfig ${ip(br, 10)} 255.255.255.0 ${ip(br, 1)}`],
      },
    }),
    goals: [
      ['BR-PC reaches SRV', n => n.canPing('BR-PC', ip(hq, 10))],
      ['R2 sends unknown traffic to HQ (a default route)', n => routesOf(n, 'R2').some(x => x.type === 'S' && x.net === 0 && x.mask === 0)],
      ['No routing protocol is running', n => ['R1', 'R2'].every(d => !n.byName(d)?.ospf)],
    ],
    hints: [
      'Each router only knows the networks plugged into it. `show ip route` on both: what is missing, and on which router?',
      'R2 needs a route that matches everything, pointing at R1. R1 also needs a way back to the branch LAN; traffic has to return.',
      `R2: \`ip route 0.0.0.0 0.0.0.0 ${ip(wan, 1)}\`. R1: \`ip route ${br} 255.255.255.0 ${ip(wan, 2)}\`.`,
    ],
    solution: { R2: [...C, `ip route 0.0.0.0 0.0.0.0 ${ip(wan, 1)}`, 'end'], R1: [...C, `ip route ${br} 255.255.255.0 ${ip(wan, 2)}`, 'end'] },
    explain: 'Routing has to work in both directions: the default route gets packets from the branch to HQ, and R1 needs a static route back to the branch LAN for the replies.',
  };
}

function ospf(seed) {
  const r = rng(seed);
  const lans = distinct(r, 3, 1, 250).map(x => `192.168.${x}.0`);
  const t = int(r, 0, 200);
  const links = [`10.${t}.12.0`, `10.${t}.13.0`, `10.${t}.23.0`];
  const P = ['A', 'B', 'C'];
  const pcs = lans.map((l, i) => [`PC-${P[i]}`, `R${i + 1}`, ip(l, 10)]);
  const cfg = [
    ['R1', [['g0/0', ip(links[0], 1)], ['g0/1', ip(links[1], 1)]]],
    ['R2', [['g0/0', ip(links[0], 2)], ['g0/1', ip(links[2], 1)]]],
    ['R3', [['g0/0', ip(links[1], 2)], ['g0/1', ip(links[2], 2)]]],
  ];
  return {
    story: `Three sites, **R1**, **R2** and **R3**, are wired in a triangle. Every interface is addressed and up. Management wants the sites to find each other automatically, and to **keep working if any one link fails**, so: **single-area OSPF (area 0)**.

The security team also has a rule: routers must **not send OSPF messages out of the LAN ports** facing the PCs (Gi0/2 on each router).

| Site | LAN | PC |
|---|---|---|
${pcs.map(([n, rt, a], i) => `| ${rt} | ${lans[i]}/24 (on Gi0/2) | ${n} ${a} |`).join('\n')}`,
    make: () => build({
      devices: [['router', 'R1', 260, 50], ['router', 'R2', 110, 230], ['router', 'R3', 410, 230], ['pc', 'PC-A', 260, 170], ['pc', 'PC-B', 70, 380], ['pc', 'PC-C', 450, 380]],
      links: [['R1', 'GigabitEthernet0/0', 'R2', 'GigabitEthernet0/0'], ['R1', 'GigabitEthernet0/1', 'R3', 'GigabitEthernet0/0'], ['R2', 'GigabitEthernet0/1', 'R3', 'GigabitEthernet0/1'],
        ...pcs.map(([n, rt]) => [n, 'FastEthernet0', rt, 'GigabitEthernet0/2'])],
      setup: {
        ...Object.fromEntries(cfg.map(([rt, ifs], i) => [rt, [...C, ...ifs.flatMap(([f, a]) => [`int ${f}`, `ip address ${a} 255.255.255.0`, 'no shut']), 'int g0/2', `ip address ${ip(lans[i], 1)} 255.255.255.0`, 'no shut', 'end']])),
        ...Object.fromEntries(pcs.map(([n, , a], i) => [n, [`ipconfig ${a} 255.255.255.0 ${ip(lans[i], 1)}`]])),
      },
    }),
    goals: [
      ['PC-A reaches PC-B and PC-C', n => n.canPing('PC-A', pcs[1][2]) && n.canPing('PC-A', pcs[2][2])],
      ['PC-B reaches PC-C', n => n.canPing('PC-B', pcs[2][2])],
      ['Every router has two OSPF neighbors', n => ['R1', 'R2', 'R3'].every(d => n.byName(d)?.ospf && n.ospfNeighbors(n.byName(d)).length === 2)],
      ['No OSPF hellos out of the LAN ports', n => ['R1', 'R2', 'R3'].every(d => n.byName(d)?.ospf?.passive.some(p => p === 'GigabitEthernet0/2'))],
      ['Survives a link failure (R1 reaches R3\'s LAN via R2 if R1–R3 is down)', n => {
        const g = n.byName('R1')?.ifaces['GigabitEthernet0/1'];
        if (!g) return false;
        const was = g.shutdown; g.shutdown = true;
        try { return n.canPing('PC-A', pcs[2][2]); } finally { g.shutdown = was; }
      }],
    ],
    hints: [
      'Each router has to advertise its own networks and form neighborships on the router-to-router links. Which command tells OSPF which interfaces to use?',
      'Turn on OSPF on all three routers with `network` statements covering every interface, all in area 0. Then stop hellos toward the PCs without removing those LANs from OSPF.',
      'On each router: `router ospf 1` → `network 10.0.0.0 0.255.255.255 area 0` → `network 192.168.0.0 0.0.255.255 area 0` → `passive-interface g0/2`. Check with `show ip ospf neighbor`.',
    ],
    solution: Object.fromEntries(['R1', 'R2', 'R3'].map((rt, i) => [rt, [...C, 'router ospf 1', `router-id ${i + 1}.${i + 1}.${i + 1}.${i + 1}`, 'network 10.0.0.0 0.255.255.255 area 0', 'network 192.168.0.0 0.0.255.255 area 0', 'passive-interface GigabitEthernet0/2', 'end']])),
    explain: 'A passive interface is still advertised but sends no hellos, so no neighbor can form there. With all three links in OSPF, each router learns two paths and fails over by itself.',
  };
}

function vlsm(seed) {
  const r = rng(seed);
  const block = `192.168.${int(r, 1, 250)}.0`;
  const ha = int(r, 30, 120), hb = int(r, 6, 28);
  const fit = n => { let p = 30; while (usableHosts(p) < n) p--; return p; };
  const [pa, pb] = [fit(ha), fit(hb)];
  const sa = block, sb = ip(block, 2 ** (32 - pa));
  const [ga, gb] = [ip(sa, 1), ip(sb, 1)];
  return {
    story: `The new office was given one block, **${block}/24**. It has two LANs on router **R1**:

- **LAN A** (R1 Gi0/0) needs **${ha} hosts**
- **LAN B** (R1 Gi0/1) needs **${hb} hosts**

Waste as little address space as possible: give each LAN the **smallest subnet that fits**. LAN A starts at the very beginning of the block, and LAN B starts **right after** LAN A ends. Each router interface takes the **first usable address** of its subnet. Address **PC-A** and **PC-B** with any valid host address in their LAN, gateway included.`,
    make: () => build({
      devices: [['router', 'R1', 260, 70], ['switch', 'S1', 130, 210], ['switch', 'S2', 390, 210], ['pc', 'PC-A', 130, 360], ['pc', 'PC-B', 390, 360]],
      links: [['R1', 'GigabitEthernet0/0', 'S1', 'GigabitEthernet0/1'], ['R1', 'GigabitEthernet0/1', 'S2', 'GigabitEthernet0/1'], ['PC-A', 'FastEthernet0', 'S1', 'FastEthernet0/1'], ['PC-B', 'FastEthernet0', 'S2', 'FastEthernet0/1']],
    }),
    goals: [
      [`Gi0/0 has LAN A's first usable address and the smallest mask that fits ${ha} hosts`, n => ifc(n, 'R1', 'GigabitEthernet0/0')?.ip === ga && ifc(n, 'R1', 'GigabitEthernet0/0')?.mask === maskOf(pa)],
      [`Gi0/1 has LAN B's first usable address and the smallest mask that fits ${hb} hosts`, n => ifc(n, 'R1', 'GigabitEthernet0/1')?.ip === gb && ifc(n, 'R1', 'GigabitEthernet0/1')?.mask === maskOf(pb)],
      ['PC-A reaches PC-B through R1', n => { const b = ifc(n, 'PC-B', 'FastEthernet0'); return !!b?.ip && n.canPing('PC-A', b.ip); }],
    ],
    hints: [
      `How many host bits give at least ${ha} usable addresses? Remember the network and broadcast addresses can't be used: 2^h − 2 ≥ hosts.`,
      `LAN A needs a /${pa} (${usableHosts(pa)} hosts), so it spans ${2 ** (32 - pa)} addresses from ${sa}. LAN B needs a /${pb}; where does it start? R1's interfaces also need \`no shutdown\`.`,
      `R1: \`interface g0/0\` → \`ip address ${ga} ${maskOf(pa)}\` → \`no shutdown\`; \`interface g0/1\` → \`ip address ${gb} ${maskOf(pb)}\` → \`no shutdown\`. PC-A e.g. \`ipconfig ${ip(sa, 2)} ${maskOf(pa)} ${ga}\`.`,
    ],
    solution: {
      R1: [...C, 'int g0/0', `ip address ${ga} ${maskOf(pa)}`, 'no shut', 'int g0/1', `ip address ${gb} ${maskOf(pb)}`, 'no shut', 'end'],
      'PC-A': [`ipconfig ${ip(sa, 2)} ${maskOf(pa)} ${ga}`], 'PC-B': [`ipconfig ${ip(sb, 2)} ${maskOf(pb)} ${gb}`],
    },
    explain: `${ha} hosts need ${32 - pa} host bits (/${pa}, ${usableHosts(pa)} usable), so LAN A is ${sa}/${pa}. LAN B (${hb} hosts) is a /${pb} starting at the next free address, ${sb}. Allocating the biggest subnet first keeps every block aligned.`,
  };
}

function guestAcl(seed) {
  const r = rng(seed);
  const [l, s] = distinct(r, 2, 1, 250);
  const [lan, srvNet] = [`192.168.${l}.0`, `192.168.${s}.0`];
  const guest = int(r, 50, 99);
  return {
    story: `The lobby has a **guest kiosk (GUEST, ${ip(lan, guest)})** on the staff LAN (${lan}/24, router **R1** Gi0/0). The internal **server LAN** (${srvNet}/24, R1 Gi0/1) holds **SRV** at ${ip(srvNet, 100)}.

The kiosk must **not reach anything on the server LAN**, but staff (STAFF-1, STAFF-2) must still reach SRV, and the kiosk still needs its gateway. Use a **standard ACL**, placed where Cisco recommends standard ACLs go.`,
    make: () => build({
      devices: [['router', 'R1', 280, 70], ['switch', 'S1', 140, 200], ['pc', 'STAFF-1', 40, 350], ['pc', 'STAFF-2', 160, 350], ['pc', 'GUEST', 280, 350], ['pc', 'SRV', 450, 230]],
      links: [['R1', 'GigabitEthernet0/0', 'S1', 'GigabitEthernet0/1'], ['STAFF-1', 'FastEthernet0', 'S1', 'FastEthernet0/1'], ['STAFF-2', 'FastEthernet0', 'S1', 'FastEthernet0/2'], ['GUEST', 'FastEthernet0', 'S1', 'FastEthernet0/3'], ['SRV', 'FastEthernet0', 'R1', 'GigabitEthernet0/1']],
      setup: {
        R1: [...C, 'int g0/0', `ip address ${ip(lan, 1)} 255.255.255.0`, 'no shut', 'int g0/1', `ip address ${ip(srvNet, 1)} 255.255.255.0`, 'no shut', 'end'],
        'STAFF-1': [`ipconfig ${ip(lan, 10)} 255.255.255.0 ${ip(lan, 1)}`], 'STAFF-2': [`ipconfig ${ip(lan, 11)} 255.255.255.0 ${ip(lan, 1)}`],
        GUEST: [`ipconfig ${ip(lan, guest)} 255.255.255.0 ${ip(lan, 1)}`], SRV: [`ipconfig ${ip(srvNet, 100)} 255.255.255.0 ${ip(srvNet, 1)}`],
      },
    }),
    goals: [
      ['GUEST cannot reach SRV', n => !n.canPing('GUEST', ip(srvNet, 100))],
      ['STAFF-1 and STAFF-2 still reach SRV', n => n.canPing('STAFF-1', ip(srvNet, 100)) && n.canPing('STAFF-2', ip(srvNet, 100))],
      ['GUEST still reaches its gateway', n => n.canPing('GUEST', ip(lan, 1))],
      ['A standard ACL, placed close to the destination', n => { const g = ifc(n, 'R1', 'GigabitEthernet0/1'); const a = g?.aclOut && n.byName('R1').acls[g.aclOut]; return !!a && a.type === 'standard'; }],
    ],
    hints: [
      'A standard ACL can only match the source address. If you put it near the source, what else would the guest lose?',
      'Write a standard ACL that denies the kiosk\'s address and permits everyone else (remember the hidden deny at the end), then apply it **outbound** on the interface facing the server LAN.',
      `R1: \`access-list 10 deny host ${ip(lan, guest)}\` → \`access-list 10 permit any\` → \`interface g0/1\` → \`ip access-group 10 out\`. Check the counters with \`show access-lists\`.`,
    ],
    solution: { R1: [...C, `access-list 10 deny host ${ip(lan, guest)}`, 'access-list 10 permit any', 'int g0/1', 'ip access-group 10 out', 'end'] },
    explain: 'Standard ACLs match only the source, so they go close to the destination: applied outbound toward the servers, they block the kiosk there and nowhere else. Without `permit any`, the implicit deny would block staff too.',
  };
}

// ---------------------------------------------------------------- tickets (find the fault)

const TICKET_FAULTS = {
  gw: { pc: true, everyone: false, hint: ['Start at the user\'s PC: are its IP settings right? Compare them with a colleague who can connect.', 'Look closely at USER-PC\'s default gateway.', 'Re-run `ipconfig` on USER-PC with the router\'s LAN address as the gateway.'], what: 'USER-PC had the wrong default gateway.' },
  mask: { pc: true, everyone: false, hint: ['Start at the user\'s PC: compare its IP settings with a colleague\'s.', 'USER-PC\'s subnet mask makes it think the server is on its own LAN, so it never asks the router.', 'Re-run `ipconfig` on USER-PC with mask 255.255.255.0.'], what: 'USER-PC had the wrong subnet mask (/16), so it treated the server as local and never used its gateway.' },
  vlan: { pc: false, everyone: false, hint: ['The PC looks fine, but can it even reach its gateway? Think about layer 2.', 'Check which VLAN USER-PC\'s switch port is in (`show vlan brief` on S1).', 'Put S1 Fa0/1 back in VLAN 1: `switchport access vlan 1`.'], what: 'USER-PC\'s switch port had been moved into an unused VLAN.' },
  acl: { pc: false, everyone: false, hint: ['Only one person is affected and their PC settings look right. What on the router could treat one host differently?', 'Look for an access list on R1 (`show access-lists`, `show running-config`).', 'Remove the ACL from R1\'s LAN interface (`no ip access-group 1 in`) or fix its entries.'], what: 'An ACL on R1\'s LAN interface denied USER-PC.' },
  shut: { pc: false, everyone: true, hint: ['Nobody can reach the server: the problem is shared, not on one PC. Follow the path toward the server.', 'Check R1\'s interfaces with `show ip interface brief`.', 'Bring R1 Gi0/1 back up: `interface g0/1` → `no shutdown`.'], what: 'R1\'s server-facing interface was administratively shut down.' },
  rip: { pc: false, everyone: true, hint: ['Nobody can reach the server. Can anyone reach their default gateway?', 'Compare R1\'s LAN interface address with the gateway the PCs use (`show ip interface brief` on R1).', 'Give R1 Gi0/0 the gateway address the PCs expect.'], what: 'R1\'s LAN interface had the wrong IP address, so the PCs\' gateway didn\'t exist.' },
};

function ticketRouted(seed, hard = false) {
  const r = rng(seed);
  const [l, s] = distinct(r, 2, 1, 250);
  const [lan, srvNet] = [`192.168.${l}.0`, `192.168.${s}.0`];
  const [user, colleague] = shuffle(r, PEOPLE).slice(0, 2);
  const dept = pick(r, TEAMS)[1];
  const all = Object.keys(TICKET_FAULTS);
  // two faults: never two that hide each other's symptom on the PC itself
  let faults = [pick(r, all)];
  if (hard) faults.push(pick(r, all.filter(f => f !== faults[0] && !(TICKET_FAULTS[f].pc && TICKET_FAULTS[faults[0]].pc))));
  const everyone = faults.some(f => TICKET_FAULTS[f].everyone);
  const gw = ip(lan, 1);
  const userCfg = [`ipconfig ${ip(lan, 10)} ${faults.includes('mask') ? '255.255.0.0' : '255.255.255.0'} ${faults.includes('gw') ? ip(lan, 254) : gw}`];
  const r1 = [...C, 'int g0/0', `ip address ${faults.includes('rip') ? ip(lan, 129) : gw} ${faults.includes('rip') ? '255.255.255.128' : '255.255.255.0'}`, 'no shut', 'int g0/1', `ip address ${ip(srvNet, 1)} 255.255.255.0`, faults.includes('shut') ? 'shutdown' : 'no shut', 'exit'];
  if (faults.includes('acl')) r1.push(`access-list 1 deny host ${ip(lan, 10)}`, 'access-list 1 permit any', 'int g0/0', 'ip access-group 1 in');
  r1.push('end');
  const s1 = faults.includes('vlan') ? [...C, 'vlan 99', 'name PARKED', 'int f0/1', 'switchport mode access', 'switchport access vlan 99', 'end'] : null;
  const n = int(r, 1000, 9999);
  return {
    story: `**Ticket #${n}** · from **${user}** (${dept}) · priority: high

> "Since this morning I can't open anything on the file server (**SRV**, ${ip(srvNet, 100)}). ${everyone ? `${colleague} can't get to it either, so I think it's the whole office.` : `${colleague}, two desks away, says it works fine for them.`}"

${user} is on **USER-PC**, ${colleague} on **COLLEAGUE**. Both should use ${gw} (R1 Gi0/0) as their gateway, on ${lan}/24. ${hard ? 'This one is nasty: **there may be more than one problem**.' : ''} Find what's wrong and fix it. Don't re-address the server.`,
    make: () => build({
      devices: [['router', 'R1', 270, 70], ['switch', 'S1', 140, 200], ['pc', 'USER-PC', 70, 350], ['pc', 'COLLEAGUE', 210, 350], ['pc', 'SRV', 440, 230]],
      links: [['R1', 'GigabitEthernet0/0', 'S1', 'GigabitEthernet0/1'], ['USER-PC', 'FastEthernet0', 'S1', 'FastEthernet0/1'], ['COLLEAGUE', 'FastEthernet0', 'S1', 'FastEthernet0/2'], ['SRV', 'FastEthernet0', 'R1', 'GigabitEthernet0/1']],
      setup: { R1: r1, ...(s1 ? { S1: s1 } : {}), 'USER-PC': userCfg, COLLEAGUE: [`ipconfig ${ip(lan, 11)} 255.255.255.0 ${gw}`], SRV: [`ipconfig ${ip(srvNet, 100)} 255.255.255.0 ${ip(srvNet, 1)}`] },
    }),
    goals: [
      [`${user} (USER-PC) can reach SRV`, net => net.canPing('USER-PC', ip(srvNet, 100))],
      [`${colleague} (COLLEAGUE) can reach SRV`, net => net.canPing('COLLEAGUE', ip(srvNet, 100))],
      ['The server keeps its address', net => ifc(net, 'SRV', 'FastEthernet0')?.ip === ip(srvNet, 100)],
    ],
    hints: [
      'Work outward from the user: check the PC\'s settings (`ipconfig` on the PC), then ping its gateway, then the server. Where does it stop working?',
      ...faults.map(f => TICKET_FAULTS[f].hint[1]),
      ...faults.map(f => TICKET_FAULTS[f].hint[2]),
    ],
    solution: Object.assign({},
      faults.some(f => f === 'gw' || f === 'mask') ? { 'USER-PC': [`ipconfig ${ip(lan, 10)} 255.255.255.0 ${gw}`] } : {},
      faults.includes('vlan') ? { S1: [...C, 'int f0/1', 'switchport access vlan 1', 'end'] } : {},
      faults.some(f => ['acl', 'shut', 'rip'].includes(f)) ? { R1: [...C, ...(faults.includes('rip') ? ['int g0/0', `ip address ${gw} 255.255.255.0`] : []), ...(faults.includes('shut') ? ['int g0/1', 'no shutdown'] : []), ...(faults.includes('acl') ? ['int g0/0', 'no ip access-group 1 in'] : []), 'end'] } : {}),
    explain: `What was wrong: ${faults.map(f => TICKET_FAULTS[f].what).join(' Also: ')}`,
  };
}

const VLAN_FAULTS = {
  access: { hint: ['Same-team PCs on different switches can\'t talk. What has to carry their VLANs between the switches?', 'Check `show interfaces trunk` on both switches.', 'Make Gi0/1 a trunk again on S2: `switchport mode trunk`.'], what: 'S2\'s uplink had been changed to an access port, so only one VLAN crossed between the floors.' },
  novlan: { hint: ['Does every switch know about every VLAN it needs?', 'Compare `show vlan brief` on S1 and S2.', 'Re-create the missing VLAN on S2 (and name it).'], what: 'One VLAN had been deleted from S2, so S2 dropped that VLAN\'s frames.' },
  allowed: { hint: ['The trunk is up, but is it carrying everything?', 'Look at the "Vlans allowed on trunk" lines in `show interfaces trunk`.', 'Allow both VLANs on the trunk again (`switchport trunk allowed vlan …` or `no switchport trunk allowed vlan`).'], what: 'The trunk\'s allowed-VLAN list had been cut down, so one VLAN no longer crossed it.' },
  port: { hint: ['Only one PC is affected. Look at that PC\'s port.', 'Check which VLAN each port is in on S2 (`show vlan brief`).', 'Put the PC\'s port back in its team\'s VLAN.'], what: 'A PC\'s switch port had been put in the other team\'s VLAN.' },
};

function ticketVlan(seed) {
  const r = rng(seed);
  const [[ta, Ta], [tb, Tb]] = shuffle(r, TEAMS).slice(0, 2);
  const [va, vb] = distinct(r, 2, 10, 99);
  const [sa, sb] = [`10.${int(r, 1, 120)}.${va}.0`, `10.${int(r, 130, 250)}.${vb}.0`];
  const fault = pick(r, Object.keys(VLAN_FAULTS));
  const victim = r() < 0.5 ? 'a' : 'b'; // which team breaks for novlan/allowed/port
  const [vv, vo] = victim === 'a' ? [va, vb] : [vb, va];
  const sw = s => {
    const c = [...C, `vlan ${va}`, `name ${ta}`, `vlan ${vb}`, `name ${tb}`];
    const portVlanA = s === 'S2' && fault === 'port' && victim === 'a' ? vb : va;
    const portVlanB = s === 'S2' && fault === 'port' && victim === 'b' ? va : vb;
    c.push('int f0/1', 'switchport mode access', `switchport access vlan ${portVlanA}`, 'int f0/2', 'switchport mode access', `switchport access vlan ${portVlanB}`);
    c.push('int g0/1', s === 'S2' && fault === 'access' ? 'switchport mode access' : 'switchport mode trunk');
    if (s === 'S2' && fault === 'allowed') c.push(`switchport trunk allowed vlan ${vo}`);
    c.push('exit');
    if (s === 'S2' && fault === 'novlan') c.push(`no vlan ${vv}`);
    c.push('end');
    return c;
  };
  const [user] = shuffle(r, PEOPLE);
  const team = victim === 'a' ? Ta : Tb;
  const n = int(r, 1000, 9999);
  return {
    story: `**Ticket #${n}** · from **${user}** (${team}, upstairs on S2)

> "I can't reach my ${team} colleagues downstairs anymore. It was fine yesterday."

The office runs **VLAN ${va} ${ta}** (${sa}/24) and **VLAN ${vb} ${tb}** (${sb}/24) on both switches, joined by **Gi0/1**. On each switch Fa0/1 is ${Ta} and Fa0/2 is ${Tb}. Someone made changes on S2 last night. Fix it so both teams reach their own people on both floors, and still can't reach the other team.`,
    make: () => build({
      devices: [['switch', 'S1', 140, 120], ['switch', 'S2', 400, 120], ['pc', 'A-DOWN', 60, 300], ['pc', 'B-DOWN', 200, 300], ['pc', 'A-UP', 340, 300], ['pc', 'B-UP', 480, 300]],
      links: [['S1', 'GigabitEthernet0/1', 'S2', 'GigabitEthernet0/1'], ['A-DOWN', 'FastEthernet0', 'S1', 'FastEthernet0/1'], ['B-DOWN', 'FastEthernet0', 'S1', 'FastEthernet0/2'], ['A-UP', 'FastEthernet0', 'S2', 'FastEthernet0/1'], ['B-UP', 'FastEthernet0', 'S2', 'FastEthernet0/2']],
      setup: { S1: sw('S1'), S2: sw('S2'), 'A-DOWN': [`ipconfig ${ip(sa, 11)} 255.255.255.0`], 'A-UP': [`ipconfig ${ip(sa, 12)} 255.255.255.0`], 'B-DOWN': [`ipconfig ${ip(sb, 11)} 255.255.255.0`], 'B-UP': [`ipconfig ${ip(sb, 12)} 255.255.255.0`] },
    }),
    goals: [
      [`${Ta}: A-DOWN reaches A-UP`, net => net.canPing('A-DOWN', ip(sa, 12))],
      [`${Tb}: B-DOWN reaches B-UP`, net => net.canPing('B-DOWN', ip(sb, 12))],
      ['The teams still can\'t reach each other', net => !net.canPing('A-DOWN', ip(sb, 12)) && !net.canPing('A-UP', ip(sb, 11))],
    ],
    hints: ['Only something on S2 changed. Compare S2 with S1, which still works.', VLAN_FAULTS[fault].hint[1], VLAN_FAULTS[fault].hint[2]],
    solution: { S2: [...C,
      ...(fault === 'access' ? ['int g0/1', 'switchport mode trunk'] : []),
      ...(fault === 'allowed' ? ['int g0/1', 'no switchport trunk allowed vlan'] : []),
      ...(fault === 'novlan' ? [`vlan ${vv}`, `name ${vv === va ? ta : tb}`] : []),
      ...(fault === 'port' ? [victim === 'a' ? 'int f0/1' : 'int f0/2', `switchport access vlan ${vv}`] : []), 'end'] },
    explain: `What was wrong: ${VLAN_FAULTS[fault].what}`,
  };
}

const OSPF_FAULTS = {
  area: { hint: ['R3 has no OSPF neighbor on one link. What must match on both ends for a neighborship to form?', 'Compare the `network` statements on R2 and R3 (`show running-config | section ospf`, `show ip ospf interface`).', 'On R3, put the R2–R3 link back in area 0 (`no network … area 1`, then `network … area 0`).'], what: 'R3 had the R2–R3 link in area 1 while R2 used area 0, so no neighborship could form.' },
  passive: { hint: ['R3 has a neighbor missing. Is R3 even sending hellos on that link?', 'Look for `passive-interface` lines on R3.', 'Remove the passive setting from the router-to-router link (`no passive-interface g0/1`).'], what: 'R3\'s link to R2 was passive, so it sent no hellos and formed no neighborship.' },
  nolan: { hint: ['The neighbors are up, but is every network being advertised?', 'Compare `show ip route` with the list of LANs. Which one does nobody learn?', 'Add a `network` statement on R3 covering its LAN.'], what: 'R3 wasn\'t advertising its LAN: its OSPF network statements didn\'t cover Gi0/2.' },
  shut: { hint: ['Start with layer 1: are all the router-to-router links actually up?', '`show ip interface brief` on R3.', 'Bring R3\'s Gi0/1 back up (`no shutdown`).'], what: 'R3\'s link to R2 was administratively down.' },
};

function ticketOspf(seed) {
  const r = rng(seed);
  // a line: R1 — R2 — R3, each with a LAN
  const lans = distinct(r, 3, 1, 250).map(x => `192.168.${x}.0`);
  const t = int(r, 0, 200);
  const [l12, l23] = [`10.${t}.12.0`, `10.${t}.23.0`];
  const fault = pick(r, Object.keys(OSPF_FAULTS));
  const rt = (name, ifs, lan) => [...C, ...ifs.flatMap(([f, a, shut]) => [`int ${f}`, `ip address ${a} 255.255.255.0`, shut ? 'shutdown' : 'no shut']), 'int g0/2', `ip address ${ip(lan, 1)} 255.255.255.0`, 'no shut', 'exit', 'router ospf 1'];
  const r1 = [...rt('R1', [['g0/0', ip(l12, 1)]], lans[0]), 'network 10.0.0.0 0.255.255.255 area 0', `network ${lans[0]} 0.0.0.255 area 0`, 'passive-interface g0/2', 'end'];
  const r2 = [...rt('R2', [['g0/0', ip(l12, 2)], ['g0/1', ip(l23, 1)]], lans[1]), 'network 10.0.0.0 0.255.255.255 area 0', `network ${lans[1]} 0.0.0.255 area 0`, 'passive-interface g0/2', 'end'];
  const r3 = [...rt('R3', [['g0/1', ip(l23, 2), fault === 'shut']], lans[2]), `network ${l23} 0.0.0.255 area ${fault === 'area' ? 1 : 0}`, ...(fault === 'nolan' ? [] : [`network ${lans[2]} 0.0.0.255 area 0`]), 'passive-interface g0/2', ...(fault === 'passive' ? ['passive-interface g0/1'] : []), 'end'];
  const n = int(r, 1000, 9999);
  return {
    story: `**Ticket #${n}** · Branch 3 is cut off

> "Since the router change last night, the Branch 3 LAN can't reach HQ or Branch 2. Branch 2 and HQ are fine with each other."

The sites form a line: **R1** (HQ) — **R2** (Branch 2) — **R3** (Branch 3), running **single-area OSPF, area 0**. Each router's LAN is on its Gi0/2, and those LAN ports are passive on purpose.

| Router | LAN | PC |
|---|---|---|
| R1 | ${lans[0]}/24 | PC-1 ${ip(lans[0], 10)} |
| R2 | ${lans[1]}/24 | PC-2 ${ip(lans[1], 10)} |
| R3 | ${lans[2]}/24 | PC-3 ${ip(lans[2], 10)} |`,
    make: () => build({
      devices: [['router', 'R1', 90, 110], ['router', 'R2', 270, 110], ['router', 'R3', 450, 110], ['pc', 'PC-1', 90, 300], ['pc', 'PC-2', 270, 300], ['pc', 'PC-3', 450, 300]],
      links: [['R1', 'GigabitEthernet0/0', 'R2', 'GigabitEthernet0/0'], ['R2', 'GigabitEthernet0/1', 'R3', 'GigabitEthernet0/1'], ['PC-1', 'FastEthernet0', 'R1', 'GigabitEthernet0/2'], ['PC-2', 'FastEthernet0', 'R2', 'GigabitEthernet0/2'], ['PC-3', 'FastEthernet0', 'R3', 'GigabitEthernet0/2']],
      setup: { R1: r1, R2: r2, R3: r3, ...Object.fromEntries(lans.map((l, i) => [`PC-${i + 1}`, [`ipconfig ${ip(l, 10)} 255.255.255.0 ${ip(l, 1)}`]])) },
    }),
    goals: [
      ['PC-3 reaches PC-1 (HQ)', net => net.canPing('PC-3', ip(lans[0], 10))],
      ['PC-3 reaches PC-2', net => net.canPing('PC-3', ip(lans[1], 10))],
      ['The LAN ports are still passive', net => ['R1', 'R2', 'R3'].every(d => net.byName(d)?.ospf?.passive.includes('GigabitEthernet0/2'))],
    ],
    hints: ['Start on R3, the odd one out. `show ip ospf neighbor` and `show ip route`: what is missing?', OSPF_FAULTS[fault].hint[1], OSPF_FAULTS[fault].hint[2]],
    solution: { R3: [...C,
      ...(fault === 'shut' ? ['int g0/1', 'no shutdown', 'exit'] : []),
      'router ospf 1',
      ...(fault === 'area' ? [`no network ${l23} 0.0.0.255 area 1`, `network ${l23} 0.0.0.255 area 0`] : []),
      ...(fault === 'passive' ? ['no passive-interface g0/1'] : []),
      ...(fault === 'nolan' ? [`network ${lans[2]} 0.0.0.255 area 0`] : []), 'end'] },
    explain: `What was wrong: ${OSPF_FAULTS[fault].what}`,
  };
}

// ---------------------------------------------------------------- catalogue

export const CHALLENGES = [
  { id: 'vlan-split', title: 'Keep two teams apart', kind: 'build', domain: 'Network Access', level: 1, gen: vlanSplit },
  { id: 'trunk', title: 'Two floors, one cable', kind: 'build', domain: 'Network Access', level: 2, gen: trunk },
  { id: 'ticket-vlan', title: 'Ticket: lost my team upstairs', kind: 'ticket', domain: 'Network Access', level: 2, gen: ticketVlan },
  { id: 'vlsm', title: 'Carve up the office block', kind: 'build', domain: 'IP Addressing', level: 2, gen: vlsm },
  { id: 'ticket-net', title: 'Ticket: can\'t reach the server', kind: 'ticket', domain: 'IP Connectivity', level: 1, gen: s => ticketRouted(s, false) },
  { id: 'roas', title: 'One cable, two VLANs, one router', kind: 'build', domain: 'IP Connectivity', level: 2, gen: roas },
  { id: 'static', title: 'Connect the new branch', kind: 'build', domain: 'IP Connectivity', level: 2, gen: staticRoutes },
  { id: 'ospf', title: 'Three sites that heal themselves', kind: 'build', domain: 'IP Connectivity', level: 3, gen: ospf },
  { id: 'ticket-ospf', title: 'Ticket: Branch 3 is cut off', kind: 'ticket', domain: 'IP Connectivity', level: 3, gen: ticketOspf },
  { id: 'guest-acl', title: 'Lock out the lobby kiosk', kind: 'build', domain: 'Security Fundamentals', level: 2, gen: guestAcl },
  { id: 'ticket-hard', title: 'Ticket: it\'s broken (twice)', kind: 'ticket', domain: 'IP Connectivity', level: 3, gen: s => ticketRouted(s, true) },
];

export const challengeById = id => CHALLENGES.find(c => c.id === id);

/** Build an instance for a type + seed, ready for the lab view. */
export function instance(id, seed) {
  const c = challengeById(id);
  if (!c) return null;
  const x = c.gen(seed >>> 0);
  return { ...c, ...x, seed: seed >>> 0 };
}

export const newSeed = () => (Math.random() * 2 ** 31) >>> 0;
export { script };
