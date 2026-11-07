import test from 'node:test';
import assert from 'node:assert/strict';
import { LABS, script } from '../js/sim/labs.js';
import { Net } from '../js/sim/engine.js';

const C = ['en', 'conf t'];
const SOLUTIONS = {
  hello: { PC1: ['ipconfig 192.168.1.10 255.255.255.0'], PC2: ['ipconfig 192.168.1.11 255.255.255.0'], _ping: ['PC1', '192.168.1.11'] },
  mgmt: { S1: [...C, 'hostname SW1', 'enable secret class', 'banner motd #Authorized access only#', 'int vlan 1', 'ip add 192.168.1.2 255.255.255.0', 'no shut', 'exit', 'ip default-gateway 192.168.1.1', 'line vty 0 4', 'password cisco', 'login', 'end', 'wr'] },
  vlans: Object.fromEntries(['S1', 'S2'].map(s => [s, [...C, 'vlan 10', 'name SALES', 'vlan 20', 'name ENG', 'int f0/1', 'sw mo acc', 'sw acc vl 10', 'int f0/2', 'sw mo acc', 'sw acc vl 20', 'int g0/1', 'sw mo tr', 'end']])),
  roas: { S1: [...C, 'int g0/1', 'switchport mode trunk', 'end'], R1: [...C, 'int g0/0', 'no shut', 'int g0/0.10', 'encapsulation dot1Q 10', 'ip address 10.0.10.1 255.255.255.0', 'int g0/0.20', 'encapsulation dot1Q 20', 'ip address 10.0.20.1 255.255.255.0', 'end'] },
  static: {
    R1: [...C, 'int g0/0', 'ip add 10.0.12.1 255.255.255.252', 'no sh', 'int g0/1', 'ip add 192.168.1.1 255.255.255.0', 'no sh', 'exit', 'ip route 192.168.2.0 255.255.255.0 10.0.12.2', 'end'],
    R2: [...C, 'int g0/0', 'ip add 10.0.12.2 255.255.255.252', 'no sh', 'int g0/1', 'ip add 192.168.2.1 255.255.255.0', 'no sh', 'exit', 'ip route 0.0.0.0 0.0.0.0 10.0.12.1', 'end'],
  },
  ospf: Object.fromEntries(['R1', 'R2', 'R3'].map((r, i) => [r, [...C, 'router ospf 1', `router-id ${i + 1}.${i + 1}.${i + 1}.${i + 1}`, 'network 10.0.0.0 0.255.255.255 area 0', 'network 192.168.0.0 0.0.255.255 area 0', ...(r !== 'R2' ? ['passive-interface g0/2'] : []), 'end']])),
  acl: { R1: [...C, 'access-list 10 deny host 192.168.1.10', 'access-list 10 permit any', 'int g0/1', 'ip access-group 10 out', 'end'] },
  extacl: { R1: [...C, 'ip access-list extended NO-PING-SRV', 'deny icmp 192.168.1.0 0.0.0.255 host 192.168.2.100 echo', 'permit ip any any', 'interface g0/0', 'ip access-group NO-PING-SRV in', 'end'] },
};

for (const lab of LABS) {
  if (!lab.checks.length) continue;
  test(`lab ${lab.id} is solvable`, () => {
    const n = lab.make();
    const before = lab.checks.map(([, f]) => f(n));
    assert.ok(before.includes(false), 'some objective should start unmet');
    for (const [dev, cmds] of Object.entries(SOLUTIONS[lab.id])) {
      if (dev === '_ping') continue;
      script(n, dev, cmds);
    }
    if (SOLUTIONS[lab.id]._ping) n.canPing(...SOLUTIONS[lab.id]._ping);
    for (const [text, f] of lab.checks) assert.ok(f(n), `${lab.id}: ${text}`);
    // round-trips through JSON (what localStorage does)
    const n2 = new Net(JSON.parse(JSON.stringify(n.toJSON())));
    for (const [text, f] of lab.checks) assert.ok(f(n2), `after reload ${lab.id}: ${text}`);
  });
}
