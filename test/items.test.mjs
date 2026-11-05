import assert from 'node:assert/strict';
import { Loot, grantXp, xpNeeded, splitMoney } from '../src/items.js';
import { snapshot, restore, applyHero, write, read, clear } from '../src/save.js';
import { Host } from '../src/behaved.js';
import { Objectives } from '../src/objectives.js';

const hero = (name, x = 0) => ({ team: 'hero', alive: true, hp: 100, maxhp: 200, energy: 10, dmg: 16, level: 1, xp: 0, ent: { pos: [x, 0, 0] }, inst: { p: { info: { name } } } });

// XP / nível
{
  const f = hero('Thor'); assert.equal(grantXp(f, xpNeeded(1) - 1), 0); assert.equal(grantXp(f, 1), 1);
  assert.equal(f.level, 2); assert.equal(f.maxhp, 216); assert.ok(f.dmg > 16 && f.hp > 100);
  assert.equal(grantXp(f, 1000) >= 3, true);
}
// orbes e Tech Bits: spawn, coleta, ímã, expiração
{
  const h = hero('Storm', 0), combat = { fighters: [h] }, fx = [], sfx = [], seen = [], money = [];
  const mk = rng => new Loot({ combat, fx: (n) => fx.push(n), sfx: n => sfx.push(n), visual: o => seen.push(o.type), onMoney: v => money.push(v), rng });
  const loot = mk(() => 0.1);
  const o = loot.drop([200, 0, 0]); assert.equal(o.type, 'health'); assert.deepEqual(seen, ['health']);
  loot.update(0.1); assert.equal(loot.orbs.length, 1);
  h.ent.pos[0] = 200; loot.update(0.1);
  assert.equal(h.hp, 150); assert.equal(loot.collected.health, 1); assert.deepEqual(fx, ['base/item/item_pickup']); assert.equal(loot.orbs.length, 0);
  const l2 = mk(() => 0.3); const e = l2.drop([900, 900, 0]); assert.equal(e.type, 'energy');
  h.ent.pos[0] = 900; h.ent.pos[1] = 900; l2.update(0.1); assert.equal(h.energy, 50);
  assert.equal(mk(() => 0.9).drop([0, 0, 0]), null);
  const l4 = mk(() => 0.1); l4.drop([0, 0, 0]); l4.combat = { fighters: [] }; l4.update(16); assert.equal(l4.orbs.length, 0);
  // Tech Bits
  assert.deepEqual(splitMoney(31), [2, 1, 0]); assert.deepEqual(splitMoney(3), [0, 0, 0]); assert.equal(splitMoney(0).length, 0); assert.ok(splitMoney(900).length <= 6);
  const lm = mk(() => 0.5); h.ent.pos = [500, 500, 0]; const bits = lm.dropMoney([500, 500, 0], 7); assert.equal(bits.length, 3);   // 5 + 1 + 1
  assert.equal(bits.reduce((s, b) => s + b.value, 0), 7);
  for (let i = 0; i < 60; i++) lm.update(0.05);                                  // ímã traz tudo até o herói
  assert.equal(money.reduce((s, v) => s + v, 0), 7); assert.equal(lm.collected.money, 7); assert.ok(sfx.includes('common/game/pickup_item'));
}

// save: ida e volta
{
  const store = new Map(), st = { setItem: (k, v) => store.set(k, v), getItem: k => store.get(k) ?? null, removeItem: k => store.delete(k) };
  const host = new Host(); host.flags.set('atlantis1:6', 1); host.zone.set('z:a', 3);
  const ob = new Objectives(); ob.command('o1', 'EOBJCMD_SHOW'); ob.command('o2', 'EOBJCMD_COMPLETE'); ob.command('o2', 'EOBJCMD_INCREMENT');
  const f = hero('Wolverine'); f.level = 4; f.xp = 33; f.maxhp = 300;
  const sv = snapshot({ map: 'act1/atlantis/atlantis1', team: ['Wolverine', 'Thor', 'Storm', 'Blade'], fighters: [f], host, objectives: ob, kills: 7 });
  assert.ok(write(sv, st)); const back = read(st); assert.deepEqual(back.team, sv.team); assert.equal(back.heroes.Wolverine.level, 4);
  const h2 = new Host(), ob2 = new Objectives(); restore(back, { host: h2, objectives: ob2 });
  assert.equal(h2.flags.get('atlantis1:6'), 1); assert.equal(h2.zone.get('z:a'), 3); assert.ok(ob2.shown.has('o1') && ob2.done.has('o2')); assert.equal(ob2.progress.get('o2'), 1);
  const g = hero('Wolverine'); applyHero(back, g); assert.equal(g.level, 4); assert.equal(g.maxhp, 300); assert.equal(g.hp, 300);
  clear(st); assert.equal(read(st), null);
  assert.equal(read({ getItem: () => 'lixo{' }), null);                       // save corrompido não quebra
}
console.log('items ok');
