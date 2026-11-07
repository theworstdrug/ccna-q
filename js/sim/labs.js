// Guided labs: a starting topology, an optional pre-config script, a brief,
// and objectives that are checked against the live simulation.

import { Net } from './engine.js';
import { IosCli, PcCli } from './cli.js';

export function script(net, name, cmds) {
  const d = net.byName(name);
  const cli = d.type === 'pc' ? new PcCli(net, d) : new IosCli(net, d);
  for (const c of cmds) cli.exec(c);
}

function build({ devices, links, setup = {} }) {
  const net = new Net();
  for (const [type, name, x, y] of devices) net.addDevice(type, x, y, name);
  for (const [a, pa, b, pb] of links) net.connect(net.byName(a).id, pa, net.byName(b).id, pb);
  for (const [name, cmds] of Object.entries(setup)) script(net, name, cmds);
  // Pre-config shouldn't leave ARP/MAC tables filled in.
  for (const d of net.devices) { d.arp = {}; if (d.macTable) d.macTable = {}; }
  return net;
}

const ifc = (net, dev, i) => net.byName(dev)?.ifaces[i];
const R_ON = ['en', 'conf t'];

export const LABS = [
  {
    id: 'sandbox', title: 'Sandbox (empty)', domain: 'Any',
    brief: 'Blank canvas. Add devices with the toolbar, cable them with **Cable**, tap a device to open its CLI.',
    make: () => new Net(),
    checks: [],
  },
  {
    id: 'hello', title: '1 · Hello, switch', domain: 'Network Access',
    brief: `Two PCs hang off one switch. A switch needs **no config** to forward frames inside VLAN 1.

1. Tap **PC1** → \`ipconfig 192.168.1.10 255.255.255.0\`
2. Tap **PC2** → \`ipconfig 192.168.1.11 255.255.255.0\`
3. From PC1: \`ping 192.168.1.11\`
4. On S1: \`enable\` then \`show mac address-table\`. Which port learned which MAC?`,
    make: () => build({
      devices: [['switch', 'S1', 250, 120], ['pc', 'PC1', 120, 300], ['pc', 'PC2', 380, 300]],
      links: [['PC1', 'FastEthernet0', 'S1', 'FastEthernet0/1'], ['PC2', 'FastEthernet0', 'S1', 'FastEthernet0/2']],
    }),
    checks: [
      ['PC1 is 192.168.1.10/24', n => ifc(n, 'PC1', 'FastEthernet0')?.ip === '192.168.1.10' && ifc(n, 'PC1', 'FastEthernet0').mask === '255.255.255.0'],
      ['PC2 is 192.168.1.11/24', n => ifc(n, 'PC2', 'FastEthernet0')?.ip === '192.168.1.11'],
      ['PC1 can ping PC2', n => n.canPing('PC1', '192.168.1.11')],
      ['S1 has learned 2 MAC addresses', n => Object.keys(n.byName('S1')?.macTable || {}).length >= 2],
    ],
  },
  {
    id: 'mgmt', title: '2 · Switch basics & management SVI', domain: 'Network Access / Security',
    brief: `Make S1 manageable and a bit more secure.

- Hostname **SW1**
- \`enable secret\` (any password)
- \`banner motd #Authorized access only#\`
- \`interface vlan 1\` → \`ip address 192.168.1.2 255.255.255.0\` → \`no shutdown\`
- \`ip default-gateway 192.168.1.1\`
- \`line vty 0 4\` → \`password …\` → \`login\`
- Save with \`copy running-config startup-config\` (or \`wr\`)

PC1 is already 192.168.1.10/24. It should be able to ping the switch.`,
    make: () => build({
      devices: [['switch', 'S1', 250, 120], ['pc', 'PC1', 250, 320]],
      links: [['PC1', 'FastEthernet0', 'S1', 'FastEthernet0/1']],
      setup: { PC1: ['ipconfig 192.168.1.10 255.255.255.0 192.168.1.1'] },
    }),
    checks: [
      ['Hostname is SW1', n => !!n.byName('SW1')],
      ['Enable secret set', n => n.devices.some(d => d.type === 'switch' && d.globalCfg.some(l => l.startsWith('enable secret')))],
      ['MOTD banner set', n => n.devices.some(d => d.type === 'switch' && d.globalCfg.some(l => l.startsWith('banner motd')))],
      ['Vlan1 is 192.168.1.2 and up/up', n => { const s = n.devices.find(d => d.type === 'switch'); return s?.ifaces.Vlan1.ip === '192.168.1.2' && n.isUp(s, 'Vlan1'); }],
      ['Default gateway 192.168.1.1', n => n.devices.find(d => d.type === 'switch')?.gw === '192.168.1.1'],
      ['VTY lines have a password and login', n => { const s = n.devices.find(d => d.type === 'switch'); const l = Object.entries(s?.lines || {}).find(([k]) => k.startsWith('vty')); return !!l && l[1].some(x => x.startsWith('password')) && l[1].some(x => x.startsWith('login')); }],
      ['PC1 can ping the switch', n => n.canPing('PC1', '192.168.1.2')],
      ['Config saved to startup', n => !!n.devices.find(d => d.type === 'switch')?.startup?.includes('banner motd')],
    ],
  },
  {
    id: 'vlans', title: '3 · VLANs & an 802.1Q trunk', domain: 'Network Access',
    brief: `PCs are already addressed. Build the VLANs on **both** switches.

| PC | IP | VLAN | Port |
|---|---|---|---|
| PC1 | 10.0.10.11/24 | 10 SALES | S1 Fa0/1 |
| PC2 | 10.0.20.12/24 | 20 ENG | S1 Fa0/2 |
| PC3 | 10.0.10.13/24 | 10 SALES | S2 Fa0/1 |
| PC4 | 10.0.20.14/24 | 20 ENG | S2 Fa0/2 |

- \`vlan 10\` / \`name SALES\`, \`vlan 20\` / \`name ENG\`
- Access ports: \`switchport mode access\`, \`switchport access vlan N\`
- S1 Gi0/1 ↔ S2 Gi0/1: \`switchport mode trunk\` on both ends
- Verify: \`show vlan brief\`, \`show interfaces trunk\``,
    make: () => build({
      devices: [['switch', 'S1', 140, 120], ['switch', 'S2', 400, 120],
        ['pc', 'PC1', 60, 300], ['pc', 'PC2', 210, 300], ['pc', 'PC3', 330, 300], ['pc', 'PC4', 480, 300]],
      links: [['S1', 'GigabitEthernet0/1', 'S2', 'GigabitEthernet0/1'],
        ['PC1', 'FastEthernet0', 'S1', 'FastEthernet0/1'], ['PC2', 'FastEthernet0', 'S1', 'FastEthernet0/2'],
        ['PC3', 'FastEthernet0', 'S2', 'FastEthernet0/1'], ['PC4', 'FastEthernet0', 'S2', 'FastEthernet0/2']],
      setup: {
        PC1: ['ipconfig 10.0.10.11 255.255.255.0'], PC2: ['ipconfig 10.0.20.12 255.255.255.0'],
        PC3: ['ipconfig 10.0.10.13 255.255.255.0'], PC4: ['ipconfig 10.0.20.14 255.255.255.0'],
      },
    }),
    checks: [
      ['VLAN 10 named SALES on both switches', n => ['S1', 'S2'].every(s => n.byName(s)?.vlans[10] === 'SALES')],
      ['VLAN 20 named ENG on both switches', n => ['S1', 'S2'].every(s => n.byName(s)?.vlans[20] === 'ENG')],
      ['Access ports in the right VLANs', n => ['S1', 'S2'].every(s => ifc(n, s, 'FastEthernet0/1')?.vlan === 10 && ifc(n, s, 'FastEthernet0/2')?.vlan === 20)],
      ['Gi0/1 is a trunk on both ends', n => ['S1', 'S2'].every(s => ifc(n, s, 'GigabitEthernet0/1')?.mode === 'trunk')],
      ['PC1 ↔ PC3 (VLAN 10 across the trunk)', n => n.canPing('PC1', '10.0.10.13')],
      ['PC2 ↔ PC4 (VLAN 20 across the trunk)', n => n.canPing('PC2', '10.0.20.14')],
    ],
  },
  {
    id: 'roas', title: '4 · Router-on-a-stick', domain: 'IP Connectivity',
    brief: `S1 already has VLAN 10 (Fa0/1, PC1) and VLAN 20 (Fa0/2, PC2). Route between them with R1.

- S1 Gi0/1 → \`switchport mode trunk\`
- R1: \`interface g0/0\` → \`no shutdown\`
- R1: \`interface g0/0.10\` → \`encapsulation dot1Q 10\` → \`ip address 10.0.10.1 255.255.255.0\`
- R1: \`interface g0/0.20\` → \`encapsulation dot1Q 20\` → \`ip address 10.0.20.1 255.255.255.0\`
- Verify with \`show ip route\` on R1 and a ping from PC1 to PC2.`,
    make: () => build({
      devices: [['router', 'R1', 250, 60], ['switch', 'S1', 250, 200], ['pc', 'PC1', 130, 350], ['pc', 'PC2', 370, 350]],
      links: [['R1', 'GigabitEthernet0/0', 'S1', 'GigabitEthernet0/1'],
        ['PC1', 'FastEthernet0', 'S1', 'FastEthernet0/1'], ['PC2', 'FastEthernet0', 'S1', 'FastEthernet0/2']],
      setup: {
        S1: [...R_ON, 'vlan 10', 'name USERS', 'vlan 20', 'name SERVERS', 'int f0/1', 'sw mode access', 'sw access vlan 10', 'int f0/2', 'sw mode access', 'sw access vlan 20', 'end'],
        PC1: ['ipconfig 10.0.10.10 255.255.255.0 10.0.10.1'], PC2: ['ipconfig 10.0.20.10 255.255.255.0 10.0.20.1'],
      },
    }),
    checks: [
      ['S1 Gi0/1 is a trunk', n => ifc(n, 'S1', 'GigabitEthernet0/1')?.mode === 'trunk'],
      ['R1 Gi0/0 is up', n => n.isUp(n.byName('R1'), 'GigabitEthernet0/0')],
      ['Subinterface for VLAN 10 with 10.0.10.1', n => Object.values(n.byName('R1')?.ifaces || {}).some(i => i.encap === 10 && i.ip === '10.0.10.1')],
      ['Subinterface for VLAN 20 with 10.0.20.1', n => Object.values(n.byName('R1')?.ifaces || {}).some(i => i.encap === 20 && i.ip === '10.0.20.1')],
      ['PC1 can ping its gateway', n => n.canPing('PC1', '10.0.10.1')],
      ['PC1 can ping PC2 (inter-VLAN routing)', n => n.canPing('PC1', '10.0.20.10')],
    ],
  },
  {
    id: 'static', title: '5 · Static & default routes', domain: 'IP Connectivity',
    brief: `Address the routers, then make the LANs reach each other with static routes.

| Device | Interface | Address |
|---|---|---|
| R1 | Gi0/0 (to R2) | 10.0.12.1/30 |
| R1 | Gi0/1 (LAN) | 192.168.1.1/24 |
| R2 | Gi0/0 (to R1) | 10.0.12.2/30 |
| R2 | Gi0/1 (LAN) | 192.168.2.1/24 |

PCs are done. Remember \`no shutdown\` on router interfaces.
- On R1 use a **static network route**: \`ip route 192.168.2.0 255.255.255.0 10.0.12.2\`
- On R2 use a **default route**: \`ip route 0.0.0.0 0.0.0.0 10.0.12.1\`
- Then \`traceroute\` from R1 and \`tracert\` from PC1.`,
    make: () => build({
      devices: [['router', 'R1', 140, 100], ['router', 'R2', 400, 100], ['pc', 'PC1', 140, 300], ['pc', 'PC2', 400, 300]],
      links: [['R1', 'GigabitEthernet0/0', 'R2', 'GigabitEthernet0/0'],
        ['PC1', 'FastEthernet0', 'R1', 'GigabitEthernet0/1'], ['PC2', 'FastEthernet0', 'R2', 'GigabitEthernet0/1']],
      setup: { PC1: ['ipconfig 192.168.1.10 255.255.255.0 192.168.1.1'], PC2: ['ipconfig 192.168.2.10 255.255.255.0 192.168.2.1'] },
    }),
    checks: [
      ['R1 ↔ R2 link is up with /30 addressing', n => ifc(n, 'R1', 'GigabitEthernet0/0')?.mask === '255.255.255.252' && n.canPing('R1', '10.0.12.2')],
      ['PC1 can ping its gateway', n => n.canPing('PC1', '192.168.1.1')],
      ['R1 has a static route to 192.168.2.0/24', n => (n.byName('R1')?.statics || []).some(s => s.mask === 0xffffff00)],
      ['R2 has a default route', n => (n.byName('R2')?.statics || []).some(s => s.net === 0 && s.mask === 0)],
      ['PC1 can ping PC2', n => n.canPing('PC1', '192.168.2.10')],
    ],
  },
  {
    id: 'ospf', title: '6 · Single-area OSPF', domain: 'IP Connectivity',
    brief: `The triangle is addressed and up. Run **OSPF process 1, area 0** on all three routers.

- \`router ospf 1\`, \`router-id 1.1.1.1\` (2.2.2.2, 3.3.3.3)
- \`network 10.0.0.0 0.255.255.255 area 0\` and the LAN networks
- Make the LAN interfaces **passive** (\`passive-interface g0/2\`)
- Verify: \`show ip ospf neighbor\`, \`show ip route\` (look for **O** routes, AD 110)
- Bonus: on R1 set \`ip ospf cost 50\` on Gi0/1 and watch the route to 192.168.3.0 move.`,
    make: () => build({
      devices: [['router', 'R1', 100, 120], ['router', 'R2', 270, 20], ['router', 'R3', 440, 120],
        ['pc', 'PC1', 100, 300], ['pc', 'PC2', 440, 300]],
      links: [['R1', 'GigabitEthernet0/0', 'R2', 'GigabitEthernet0/0'], ['R2', 'GigabitEthernet0/1', 'R3', 'GigabitEthernet0/1'],
        ['R1', 'GigabitEthernet0/1', 'R3', 'GigabitEthernet0/0'],
        ['PC1', 'FastEthernet0', 'R1', 'GigabitEthernet0/2'], ['PC2', 'FastEthernet0', 'R3', 'GigabitEthernet0/2']],
      setup: {
        R1: [...R_ON, 'int g0/0', 'ip add 10.0.12.1 255.255.255.252', 'no sh', 'int g0/1', 'ip add 10.0.13.1 255.255.255.252', 'no sh', 'int g0/2', 'ip add 192.168.1.1 255.255.255.0', 'no sh', 'end'],
        R2: [...R_ON, 'int g0/0', 'ip add 10.0.12.2 255.255.255.252', 'no sh', 'int g0/1', 'ip add 10.0.23.1 255.255.255.252', 'no sh', 'end'],
        R3: [...R_ON, 'int g0/1', 'ip add 10.0.23.2 255.255.255.252', 'no sh', 'int g0/0', 'ip add 10.0.13.2 255.255.255.252', 'no sh', 'int g0/2', 'ip add 192.168.3.1 255.255.255.0', 'no sh', 'end'],
        PC1: ['ipconfig 192.168.1.10 255.255.255.0 192.168.1.1'], PC2: ['ipconfig 192.168.3.10 255.255.255.0 192.168.3.1'],
      },
    }),
    checks: [
      ['OSPF running on all routers', n => ['R1', 'R2', 'R3'].every(r => n.byName(r)?.ospf)],
      ['Router IDs 1.1.1.1 / 2.2.2.2 / 3.3.3.3', n => ['R1', 'R2', 'R3'].every((r, i) => n.routerId(n.byName(r)) === `${i + 1}.${i + 1}.${i + 1}.${i + 1}`)],
      ['Every router has 2 OSPF neighbors', n => ['R1', 'R2', 'R3'].every(r => n.byName(r) && n.ospfNeighbors(n.byName(r)).length === 2)],
      ['LAN interfaces are passive', n => ['R1', 'R3'].every(r => n.byName(r)?.ospf?.passive.includes('GigabitEthernet0/2'))],
      ['R1 learns 192.168.3.0/24 via OSPF', n => n.byName('R1') && n.routes(n.byName('R1')).some(r => r.type === 'O' && r.net === 0xc0a80300)],
      ['PC1 can ping PC2', n => n.canPing('PC1', '192.168.3.10')],
    ],
  },
  {
    id: 'acl', title: '7 · Standard ACL placement', domain: 'Security Fundamentals',
    brief: `R1 routes between LAN A (PC1 .10, PC2 .11 on 192.168.1.0/24) and the server LAN (SRV 192.168.2.100).

**Goal:** PC1 must not reach the server LAN. Everything else is allowed.

- Standard ACLs match **source only**, so place them **close to the destination**.
- \`access-list 10 deny host 192.168.1.10\`
- \`access-list 10 permit any\` (remember the implicit *deny any*)
- Apply outbound on the server-facing interface: \`ip access-group 10 out\`
- Verify with \`show access-lists\` (watch the match counters).`,
    make: () => build({
      devices: [['router', 'R1', 270, 80], ['switch', 'S1', 130, 220], ['pc', 'PC1', 60, 370], ['pc', 'PC2', 200, 370], ['pc', 'SRV', 420, 260]],
      links: [['R1', 'GigabitEthernet0/0', 'S1', 'GigabitEthernet0/1'], ['PC1', 'FastEthernet0', 'S1', 'FastEthernet0/1'],
        ['PC2', 'FastEthernet0', 'S1', 'FastEthernet0/2'], ['SRV', 'FastEthernet0', 'R1', 'GigabitEthernet0/1']],
      setup: {
        R1: [...R_ON, 'int g0/0', 'ip add 192.168.1.1 255.255.255.0', 'no sh', 'int g0/1', 'ip add 192.168.2.1 255.255.255.0', 'no sh', 'end'],
        PC1: ['ipconfig 192.168.1.10 255.255.255.0 192.168.1.1'], PC2: ['ipconfig 192.168.1.11 255.255.255.0 192.168.1.1'],
        SRV: ['ipconfig 192.168.2.100 255.255.255.0 192.168.2.1'],
      },
    }),
    checks: [
      ['An ACL is applied on R1', n => Object.values(n.byName('R1')?.ifaces || {}).some(i => i.aclIn || i.aclOut)],
      ['PC1 cannot reach SRV', n => !n.canPing('PC1', '192.168.2.100')],
      ['PC2 can still reach SRV', n => n.canPing('PC2', '192.168.2.100')],
      ['PC1 can still reach its gateway', n => n.canPing('PC1', '192.168.1.1')],
    ],
  },
  {
    id: 'extacl', title: '8 · Extended named ACL', domain: 'Security Fundamentals',
    brief: `Same network as lab 7. This time block **ICMP echo** (pings) from the whole 192.168.1.0/24 LAN to the server **192.168.2.100 only**, and permit all other IP traffic.

Extended ACLs match source, destination and protocol, so place them **close to the source**.

\`\`\`
ip access-list extended NO-PING-SRV
 deny icmp 192.168.1.0 0.0.0.255 host 192.168.2.100 echo
 permit ip any any
interface g0/0
 ip access-group NO-PING-SRV in
\`\`\``,
    make: () => LABS.find(l => l.id === 'acl').make(),
    checks: [
      ['Named extended ACL exists', n => Object.entries(n.byName('R1')?.acls || {}).some(([k, a]) => !/^\d+$/.test(k) && a.type === 'extended')],
      ['Applied inbound on Gi0/0 (near the source)', n => !!ifc(n, 'R1', 'GigabitEthernet0/0')?.aclIn],
      ['PC1 and PC2 cannot ping SRV', n => !n.canPing('PC1', '192.168.2.100') && !n.canPing('PC2', '192.168.2.100')],
      ['PC1 can still ping R1 192.168.2.1', n => n.canPing('PC1', '192.168.2.1')],
    ],
  },
];

export const labById = id => LABS.find(l => l.id === id);
