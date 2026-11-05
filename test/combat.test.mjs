import assert from 'node:assert/strict';
import { Combat, Fighter } from '../src/combat.js';
import { Ground } from '../src/player.js';

const ID = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const tile = (x, y, s = 500) => ({ geo: { n: 4, pos: new Float32Array([x, y, 0, x + s, y, 0, x + s, y + s, 0, x, y + s, 0]), idx: new Uint16Array([0, 1, 2, 0, 2, 3]) }, m: ID });
const g = new Ground(); for (let x = -2000; x < 2000; x += 500) for (let y = -2000; y < 2000; y += 500) g.add([tile(x, y)]);

const names = ['idle', 'run', 'attack_light1', 'attack_light2', 'attack_light3', 'attack_heavy1', 'attack_knockback1', 'death_gen'];
const mkInst = () => ({ pose: {}, p: { anims: names.map(name => ({ name, dur: 0.6 })) } });
const played = [];
const actors = { play: (inst, name, o) => { played.push(name); return true; } };
const ent = (name, x, y) => ({ name, pos: [x, y, 0], orient: [0, 0, 0], _ver: 0, alive: true, enabled: true, def: {} });
const deaths = [];
const host = { runScript: (p, e) => deaths.push([p, e.name]) };
const c = new Combat({ actors, ground: g, host });

const hero = c.add(new Fighter(ent('_HERO1_', 0, 0), mkInst(), 'hero', { hp: 200, dmg: 16 })); hero.controlled = true;
const foe = c.add(new Fighter(Object.assign(ent('goon', 80, 0), { def: { monster_deathscript: 'x/dead' } }), mkInst(), 'enemy', { hp: 60, dmg: 9, speed: 200 }));
const behind = c.add(new Fighter(ent('behind', -80, 0), mkInst(), 'enemy', { hp: 60 }));
behind.state = 'hurt'; behind.hurtT = 99;                         // não reage nem ataca durante o teste

// golpe leve: acerta quem está na frente (80 u, dentro do arco), não quem está atrás
c.input(hero, 'KeyJ'); assert.equal(hero.state, 'attack');
for (let i = 0; i < 20; i++) c.update(0.05);
assert.ok(foe.hp < 60, 'inimigo à frente levou dano: ' + foe.hp);
assert.equal(behind.hp, 60);
assert.ok(played.includes('attack_light1'));

// golpes seguidos matam o inimigo, roda o script de morte e ele some depois
for (let i = 0; i < 8 && foe.alive; i++) { foe.ent.pos[0] = 70; foe.ent.pos[1] = 0; hero.state = 'free'; hero.combo = 0; c.input(hero, 'KeyK'); for (let k = 0; k < 14; k++) c.update(0.05); }
assert.ok(played.includes('death_gen'));
assert.equal(foe.state, 'dead'); assert.deepEqual(deaths, [['x/dead', 'goon']]); assert.equal(c.kills, 1);
for (let i = 0; i < 60; i++) c.update(0.05); assert.equal(foe.ent.alive, false);

// IA: inimigo longe persegue e ataca o herói
const c2 = new Combat({ actors, ground: g, host }), h2 = c2.add(new Fighter(ent('_HERO1_', 0, 0), mkInst(), 'hero', { hp: 200 })); h2.controlled = true;
const e2 = c2.add(new Fighter(ent('chaser', 500, 0), mkInst(), 'enemy', { dmg: 12, speed: 260 }));
for (let i = 0; i < 200; i++) c2.update(0.05);
assert.ok(Math.hypot(e2.ent.pos[0] - h2.ent.pos[0], e2.ent.pos[1] - h2.ent.pos[1]) < 130, 'ficou perto do herói');
assert.ok(h2.hp < 200, 'e bateu no herói: ' + h2.hp);
console.log('combat ok');

// poderes: dano em área ao redor, consome energia, dispara efeito
{
  const c3 = new Combat({ actors, ground: g, host }), fx = []; c3.onFx = e => fx.push(e);
  const hh = c3.add(new Fighter(ent('_HERO1_', 0, 0), mkInst(), 'hero', { hp: 200 })); hh.controlled = true;
  const a = c3.add(new Fighter(ent('a', 150, 0), mkInst(), 'enemy', { hp: 500 })), b = c3.add(new Fighter(ent('b', -150, 0), mkInst(), 'enemy', { hp: 500 }));
  a.state = b.state = 'hurt'; a.hurtT = b.hurtT = 99;
  assert.ok(c3.power(hh, 1)); assert.equal(hh.energy, 70);
  for (let i = 0; i < 40; i++) c3.update(0.05);
  assert.ok(a.hp < 500 && b.hp < 500, 'atinge frente e trás'); assert.equal(fx.length, 1);
  hh.energy = 10; assert.equal(c3.power(hh, 2), false);
}
console.log('power ok');
