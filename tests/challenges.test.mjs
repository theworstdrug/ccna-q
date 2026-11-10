import test from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGES, instance, script } from '../js/sim/challenges.js';
import { Net } from '../js/sim/engine.js';

for (const c of CHALLENGES) {
  test(`challenge ${c.id}: every variant starts unsolved and the model solution solves it`, () => {
    const seen = new Set();
    for (let seed = 1; seed <= 25; seed++) {
      const x = instance(c.id, seed * 7919);
      seen.add(x.story);
      assert.ok(x.story.length > 80 && x.goals.length >= 2 && x.hints.length >= 3, 'has a story, goals and hints');
      assert.ok(!/\b(switchport|ip route|router ospf|access-list|encapsulation)\b/.test(x.story), `${c.id}: the story must not give away commands`);
      const n = x.make();
      const before = x.goals.map(([, f]) => f(n));
      assert.ok(before.includes(false), `${c.id} seed ${seed}: some goal should start unmet`);
      for (const [dev, cmds] of Object.entries(x.solution)) script(n, dev, cmds);
      for (const [text, f] of x.goals) assert.ok(f(n), `${c.id} seed ${seed}: ${text}\n${x.explain}`);
      const n2 = new Net(JSON.parse(JSON.stringify(n.toJSON())));
      for (const [text, f] of x.goals) assert.ok(f(n2), `${c.id} seed ${seed} after reload: ${text}`);
    }
    assert.ok(seen.size >= 20, `${c.id}: variants should differ (${seen.size} distinct)`);
  });
}

test('a seed always gives the same variant', () => {
  for (const c of CHALLENGES) assert.equal(instance(c.id, 42).story, instance(c.id, 42).story);
});

test('classic mistakes do not pass', () => {
  const C = ['en', 'conf t'];
  const fails = (id, seed, cmds, goalRe) => {
    const x = instance(id, seed);
    const n = x.make();
    for (const [dev, cs] of Object.entries(cmds(x))) script(n, dev, cs);
    const g = x.goals.find(([t]) => goalRe.test(t));
    assert.ok(g, `${id}: no goal matching ${goalRe}`);
    assert.equal(g[1](n), false, `${id}: "${g[0]}" should fail for this mistake`);
  };
  // standard ACL near the source: blocks the kiosk's gateway too, and is in the wrong place
  fails('guest-acl', 11, x => ({ R1: [...C, `access-list 10 deny host ${x.story.match(/GUEST, ([\d.]+)/)[1]}`, 'access-list 10 permit any', 'int g0/0', 'ip access-group 10 in', 'end'] }), /gateway/);
  fails('guest-acl', 11, x => ({ R1: [...C, `access-list 10 deny host ${x.story.match(/GUEST, ([\d.]+)/)[1]}`, 'access-list 10 permit any', 'int g0/0', 'ip access-group 10 in', 'end'] }), /close to the destination/);
  // default route on the branch but no route back from HQ
  fails('static', 12, x => ({ R2: x.solution.R2 }), /reaches SRV/);
  // /24s instead of the smallest subnets
  fails('vlsm', 13, x => ({ R1: x.solution.R1.map(l => l.replace(/255\.255\.255\.\d+/, '255.255.255.0')) }), /Gi0\/0/);
  // OSPF everywhere but hellos still go to the PCs
  fails('ospf', 14, x => Object.fromEntries(Object.entries(x.solution).map(([d, cs]) => [d, cs.filter(c => !c.startsWith('passive'))])), /hellos/);
  // VLANs created, ports never assigned
  fails('vlan-split', 15, x => ({ S1: x.solution.S1.filter(c => !/^(interface|switchport)/.test(c)) }), /can't reach each other/);
});
