import assert from 'node:assert/strict';
import { Loot, grantXp, xpNeeded, moneyDrop, itemMoney, orbCount, healthOrbChance, DROP_CHANCE, MAX_PICKUPS } from '../src/items.js';
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
// orbes e Tech Bits: regras do exe
{
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(i => DROP_CHANCE[i]), [0, 0.15, 0.3, 0.45, 0.65, 1]);
  assert.equal(orbCount(1, () => 0.99), 2); assert.equal(orbCount(1, () => 0), 0); assert.equal(orbCount(10, () => 0), 3); assert.equal(orbCount(30, () => 0.99), 7);
  assert.equal(healthOrbChance(1, 1), 0.5); assert.ok(Math.abs(healthOrbChance(0.25, 1) - 1) < 1e-9); assert.ok(Math.abs(healthOrbChance(1, 0.25)) < 1e-9);
  const low = moneyDrop(1, () => 0), hi = moneyDrop(10, () => 0.999);
  assert.deepEqual(low, { stacks: 1, each: 1, total: 1 }); assert.equal(hi.total, 15); assert.equal(hi.stacks, 2); assert.equal(hi.each, 7);
  const h = hero('Storm', 0), combat = { fighters: [h] }, fx = [], sfx = [], seen = [], money = [];
  const mk = rng => new Loot({ combat, fx: n => fx.push(n), sfx: n => sfx.push(n), visual: o => seen.push(o.type), onMoney: v => money.push(v), rng });
  h.hp = 100; h.maxhp = 200;
  const l = mk(() => 0.1); h.ent.pos = [900, 900, 0];
  const o = l.spawn('health', [200, 0, 0]); assert.equal(o.life, 15); assert.deepEqual(seen, ['health']);
  l.update(0.1); assert.equal(l.orbs.length, 1);
  h.ent.pos = [o.ent.pos[0], o.ent.pos[1], 0]; l.update(0.01);
  assert.equal(h.hp, 150); assert.equal(l.collected.health, 1); assert.deepEqual(fx, ['base/item/item_pickup']); assert.equal(l.orbs.length, 0);
  const m = mk(() => 0.1); h.ent.pos = [900, 900, 0]; const c = m.spawn('money', [0, 0, 0], { value: 7 });
  assert.equal(c.life, 60); assert.equal(c.ent.scale, 0.6); const x0 = Math.hypot(c.ent.pos[0], c.ent.pos[1]);
  for (let i = 0; i < 100; i++) m.update(0.05); assert.ok(Math.hypot(c.ent.pos[0], c.ent.pos[1]) < 120, 'sem ímã: fica onde caiu'); assert.equal(m.orbs.length, 1); void x0;
  h.ent.pos = [c.ent.pos[0], c.ent.pos[1], 0]; m.update(0.05); assert.deepEqual(money, [7]); assert.ok(sfx.includes('common/game/pickup_item'));
  const e = mk(() => 0.1); e.spawn('money', [0, 0, 0], { value: 1 }); h.ent.pos = [900, 900, 0]; for (let i = 0; i < 1300; i++) e.update(0.05); assert.equal(e.orbs.length, 0, 'some após 60 s');
  // dropFor: rng baixo => ramo de item (pago em Tech Bits: valor inteiro em 2..4 pilhas); rng alto => Tech Bits; orbes só para personagens
  assert.deepEqual(itemMoney(1, () => 0), { stacks: 2, each: 4, total: 8 });
  const d1 = mk(() => 0.1); d1.dropFor([0, 0, 0], 5, { level: 1, character: false }); assert.ok(d1.orbs.length >= 2 && d1.orbs.every(q => q.type === 'money'));
  const d0 = mk(() => 0.9); d0.dropFor([0, 0, 0], 0, { level: 1 }); assert.equal(d0.orbs.length, 0, 'randompickups 0: nada');
  const db = mk(() => 0.9); db.dropFor([0, 0, 0], 0, { level: 11, character: true, orbs: 3 }); assert.equal(db.orbs.length, 3, 'spawnorbs');
  const d2 = mk(() => 0.9); d2.dropFor([0, 0, 0], 3, { level: 1, character: false }); assert.ok(d2.orbs.length >= 1 && d2.orbs.every(q => q.type === 'money'));
  const d3 = mk(() => 0.9); d3.dropFor([0, 0, 0], 0, { level: 1, character: true }); assert.equal(d3.orbs.length, 2);
  const d4 = mk(() => 0.9); for (let i = 0; i < 40; i++) d4.dropFor([0, 0, 0], 3, { level: 1, character: true }); assert.ok(d4.orbs.length <= MAX_PICKUPS);
  assert.equal(mk(() => 0.9).spawn('energy', [0, 0, 0]).life, 15);
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
