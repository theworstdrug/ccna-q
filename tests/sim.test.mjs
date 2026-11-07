import test from 'node:test';
import assert from 'node:assert/strict';
import { Net } from '../js/sim/engine.js';
import { IosCli, PcCli } from '../js/sim/cli.js';

function run(net, name, cmds) {
  const d = net.byName(name);
  const cli = d.type === 'pc' ? new PcCli(net, d) : new IosCli(net, d);
  const out = [];
  for (const c of cmds) out.push(...cli.exec(c).lines);
  return out;
}

test('two PCs on a switch can ping', () => {
  const n = new Net();
  const p1 = n.addDevice('pc'); const p2 = n.addDevice('pc'); const s = n.addDevice('switch');
  n.connect(p1.id, 'FastEthernet0', s.id, 'FastEthernet0/1');
  n.connect(p2.id, 'FastEthernet0', s.id, 'FastEthernet0/2');
  run(n, 'PC1', ['ipconfig 192.168.1.10 255.255.255.0']);
  run(n, 'PC2', ['ipconfig 192.168.1.11 255.255.255.0']);
  assert.ok(n.canPing('PC1', '192.168.1.11'));
  assert.ok(!n.canPing('PC1', '192.168.1.99'));
  // VLAN separation
  run(n, 'S1', ['en', 'conf t', 'int f0/2', 'sw mode acc', 'sw acc vlan 10', 'end']);
  assert.ok(!n.canPing('PC1', '192.168.1.11'));
  const mac = run(n, 'S1', ['en', 'show mac address-table']);
  assert.ok(mac.some(l => l.includes('Fa0/1')));
});

test('router on a stick', () => {
  const n = new Net();
  const p1 = n.addDevice('pc'); const p2 = n.addDevice('pc');
  const s = n.addDevice('switch'); const r = n.addDevice('router');
  n.connect(p1.id, 'FastEthernet0', s.id, 'FastEthernet0/1');
  n.connect(p2.id, 'FastEthernet0', s.id, 'FastEthernet0/2');
  n.connect(r.id, 'GigabitEthernet0/0', s.id, 'GigabitEthernet0/1');
  run(n, 'PC1', ['ipconfig 10.0.10.10 255.255.255.0 10.0.10.1']);
  run(n, 'PC2', ['ipconfig 10.0.20.10 255.255.255.0 10.0.20.1']);
  const so = run(n, 'S1', ['enable', 'configure terminal', 'vlan 10', 'name USERS', 'vlan 20', 'exit',
    'interface f0/1', 'switchport mode access', 'switchport access vlan 10',
    'int f0/2', 'sw m a', 'sw a v 20', 'int g0/1', 'switchport mode trunk', 'end']);
  assert.deepEqual(so.filter(l => l.startsWith('%') && !l.startsWith('%LINK')), []);
  const ro = run(n, 'R1', ['en', 'conf t', 'int g0/0', 'no shut', 'int g0/0.10', 'encapsulation dot1Q 10',
    'ip add 10.0.10.1 255.255.255.0', 'int g0/0.20', 'encap dot1q 20', 'ip address 10.0.20.1 255.255.255.0', 'end']);
  assert.ok(!ro.some(l => l.includes('Invalid')), ro.join('\n'));
  assert.ok(n.canPing('PC1', '10.0.20.10'));
  const rt = run(n, 'R1', ['en', 'sh ip ro']);
  assert.ok(rt.some(l => l.startsWith('C') && l.includes('10.0.20.0/24')), rt.join('\n'));
  const tr = run(n, 'S1', ['en', 'sh int trunk']);
  assert.ok(tr.some(l => l.includes('trunking')));
});

function triangle() {
  const n = new Net();
  const r1 = n.addDevice('router'); const r2 = n.addDevice('router'); const r3 = n.addDevice('router');
  const p1 = n.addDevice('pc'); const p3 = n.addDevice('pc');
  n.connect(r1.id, 'GigabitEthernet0/0', r2.id, 'GigabitEthernet0/0');
  n.connect(r2.id, 'GigabitEthernet0/1', r3.id, 'GigabitEthernet0/1');
  n.connect(r1.id, 'GigabitEthernet0/1', r3.id, 'GigabitEthernet0/0');
  n.connect(p1.id, 'FastEthernet0', r1.id, 'GigabitEthernet0/2');
  n.connect(p3.id, 'FastEthernet0', r3.id, 'GigabitEthernet0/2');
  run(n, 'PC1', ['ipconfig 192.168.1.10 255.255.255.0 192.168.1.1']);
  run(n, 'PC2', ['ipconfig 192.168.3.10 255.255.255.0 192.168.3.1']);
  run(n, 'R1', ['en', 'conf t', 'int g0/0', 'ip add 10.0.12.1 255.255.255.252', 'no sh',
    'int g0/1', 'ip add 10.0.13.1 255.255.255.252', 'no sh', 'int g0/2', 'ip add 192.168.1.1 255.255.255.0', 'no sh', 'end']);
  run(n, 'R2', ['en', 'conf t', 'int g0/0', 'ip add 10.0.12.2 255.255.255.252', 'no sh',
    'int g0/1', 'ip add 10.0.23.1 255.255.255.252', 'no sh', 'end']);
  run(n, 'R3', ['en', 'conf t', 'int g0/1', 'ip add 10.0.23.2 255.255.255.252', 'no sh',
    'int g0/0', 'ip add 10.0.13.2 255.255.255.252', 'no sh', 'int g0/2', 'ip add 192.168.3.1 255.255.255.0', 'no sh', 'end']);
  return n;
}

test('static routes and traceroute', () => {
  const n = triangle();
  assert.ok(!n.canPing('PC1', '192.168.3.10'));
  run(n, 'R1', ['en', 'conf t', 'ip route 192.168.3.0 255.255.255.0 10.0.12.2']);
  run(n, 'R2', ['en', 'conf t', 'ip route 192.168.3.0 255.255.255.0 10.0.23.2', 'ip route 192.168.1.0 255.255.255.0 10.0.12.1']);
  run(n, 'R3', ['en', 'conf t', 'ip route 0.0.0.0 0.0.0.0 10.0.13.1']);
  assert.ok(n.canPing('PC1', '192.168.3.10'));
  const tr = run(n, 'PC1', ['tracert 192.168.3.10']);
  assert.ok(tr.some(l => l.includes('10.0.12.2')), tr.join('\n'));
  const rt = run(n, 'R3', ['en', 'sh ip route']);
  assert.ok(rt.some(l => l.startsWith('S*')), rt.join('\n'));
});

test('OSPF converges and ACL filters', () => {
  const n = triangle();
  for (const r of ['R1', 'R2', 'R3']) run(n, r, ['en', 'conf t', 'router ospf 1', 'network 10.0.0.0 0.255.255.255 area 0', 'network 192.168.0.0 0.0.255.255 area 0', 'end']);
  assert.ok(n.canPing('PC1', '192.168.3.10'));
  const rt = run(n, 'R1', ['en', 'show ip route']);
  assert.ok(rt.some(l => l.startsWith('O') && l.includes('192.168.3.0/24') && l.includes('10.0.13.2')), rt.join('\n'));
  const nb = run(n, 'R1', ['en', 'show ip ospf neighbor']);
  assert.equal(nb.filter(l => l.includes('FULL')).length, 2, nb.join('\n'));
  // cost change reroutes via R2
  run(n, 'R1', ['en', 'conf t', 'int g0/1', 'ip ospf cost 50', 'end']);
  const rt2 = run(n, 'R1', ['en', 'show ip route']);
  assert.ok(rt2.some(l => l.includes('192.168.3.0/24') && l.includes('10.0.12.2')), rt2.join('\n'));
  // ACL on R3 blocking PC1
  run(n, 'R3', ['en', 'conf t', 'access-list 10 deny host 192.168.1.10', 'access-list 10 permit any', 'int g0/2', 'ip access-group 10 out', 'end']);
  assert.ok(!n.canPing('PC1', '192.168.3.10'));
  const acl = run(n, 'R3', ['en', 'show access-lists']);
  assert.ok(acl.some(l => l.includes('deny host 192.168.1.10') && l.includes('match')), acl.join('\n'));
  // extended named ACL allowing only echo-reply style traffic
  run(n, 'R3', ['en', 'conf t', 'int g0/2', 'no ip access-group 10 out', 'end']);
  assert.ok(n.canPing('PC1', '192.168.3.10'));
});

test('CLI niceties', () => {
  const n = new Net();
  n.addDevice('router');
  const d = n.byName('R1');
  const cli = new IosCli(n, d);
  assert.deepEqual(cli.exec('e').lines[0].startsWith('% Ambiguous'), true);
  cli.exec('enable');
  assert.equal(cli.prompt(), 'R1#');
  assert.equal(cli.complete('conf'), 'configure ');
  cli.exec('conf t');
  assert.equal(cli.prompt(), 'R1(config)#');
  const h = cli.exec('?').lines;
  assert.ok(h.some(l => l.includes('hostname')));
  cli.exec('hostname Core');
  assert.equal(cli.prompt(), 'Core(config)#');
  const bad = cli.exec('interfase g0/0').lines;
  assert.ok(bad.some(l => l.includes('Invalid input')));
  cli.exec('int g0/0');
  assert.equal(cli.prompt(), 'Core(config-if)#');
  cli.exec('ip address 10.1.1.1 255.255.255.0');
  cli.exec('int g0/1');
  const ov = cli.exec('ip address 10.1.1.2 255.255.255.0').lines;
  assert.ok(ov[0].includes('overlaps'), ov.join());
  const sr = cli.exec('do sh run').lines;
  assert.ok(sr.includes(' ip address 10.1.1.1 255.255.255.0'));
  assert.equal(cli.prompt(), 'Core(config-if)#');
  cli.exec('end');
  cli.exec('conf t');
  cli.exec('enable secret cisco');
  cli.exec('end');
  cli.exec('disable');
  cli.exec('enable');
  assert.equal(cli.prompt(), 'Password: ');
  cli.exec('cisco');
  assert.equal(cli.prompt(), 'Core#');
});
