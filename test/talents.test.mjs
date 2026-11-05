import assert from 'node:assert/strict';
import { parseTalents, resolveValue, resolveNumber, powerForSlot, unlockLevel } from '../src/talents.js';
import { parseNodes, parseEvents, parseAnimTable } from '../src/fightstyle.js';
import { Combat, Fighter } from '../src/combat.js';
import { Ground } from '../src/player.js';

const el = (tag, attrs = {}, children = []) => ({ tag, attrs, children });
const tv = parseTalents(el('talents', {}, [
  el('talent', { name: 'captam_p1', power: 'power1' }, [el('talentvalues', {}, [
    el('talentvalue', { level: '1', name: 'captam_p1_req', value: '1' }),
    el('talentvalue', { level: '1', name: 'captam_p1_dmg', value: '13 15' }), el('talentvalue', { level: '5', name: 'captam_p1_dmg', value: '34 38' }),
    el('talentvalue', { level: '1', name: 'captam_p1_pwr', value: '5' })])]),
  el('talent', { name: 'captam_p2', power: 'power2' }, [el('talentvalues', {}, [el('talentvalue', { level: '1', name: 'captam_p2_req', value: '5' }), el('talentvalue', { level: '1', name: 'captam_p2_pwr', value: '8' })])]),
  el('talent', { name: 'melee_moves' }),
]));
assert.equal(resolveValue(tv, '%captam_p1_dmg', 1).value, '13 15'); assert.equal(resolveValue(tv, '%captam_p1_dmg', 4).value, '13 15');
assert.equal(resolveValue(tv, '%captam_p1_dmg', 9).value, '34 38'); assert.equal(resolveNumber(tv, '%captam_p1_dmg', 5), 36);
assert.equal(resolveNumber(tv, '120'), 120); assert.equal(resolveNumber(tv, '%nao_existe', 1, 7), 7);
const names = ['captam_p1', 'captam_p2', 'melee_moves'];
assert.equal(powerForSlot(tv, names, 1).power, 'power1'); assert.equal(powerForSlot(tv, names, 2).power, 'power2'); assert.equal(powerForSlot(tv, names, 3), null);
assert.equal(unlockLevel(tv, powerForSlot(tv, names, 2)), 5);

// poder de projétil que volta (escudo): custo de energia, dano por nível, acerta na ida e na volta (pierce), some ao ser pego
const anim = parseAnimTable(el('A', {}, [el('anims', { ea_idle1: 'idle', ea_power1: 'power_1' })]));
const events = parseEvents(el('Events', {}, []));
const nodes = parseNodes(el('PowerStyle', {}, [
  el('FightMove', { name: 'idle', animenum: 'ea_idle1', noncombat: 'true' }),
  el('FightMove', { name: 'power1', animenum: 'ea_power1', handler: 'ch_returning_projectile', startchaintime: '0.4' }, [
    el('trigger', { name: 'projectile', time: '0.2', damage: '%captam_p1_dmg', damagescale: 'none', knockback: '120', maxrange: '300', speed: '600', pierce: 'true', powerusage: '%captam_p1_pwr' }),
    el('chain', { action: 'idle', result: 'idle' })]),
]), { anim, events });

const ID = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const g = new Ground(); for (let x = -1000; x < 1500; x += 500) for (let y = -1000; y < 1000; y += 500) g.add([{ geo: { n: 4, pos: new Float32Array([x, y, 0, x + 500, y, 0, x + 500, y + 500, 0, x, y + 500, 0]), idx: new Uint16Array([0, 1, 2, 0, 2, 3]) }, m: ID }]);
const ent = (name, x, y) => ({ name, pos: [x, y, 0], orient: [0, 0, 0], _ver: 0, alive: true, enabled: true, def: {} });
const mk = () => ({ pose: {}, p: { info: { name: 'CaptainAmerica', fightstyle: 'fightstyle_default', powerstyle: 'ps_captainamerica', talents: names }, anims: ['idle', 'power_1', 'pain_high'].map(n => ({ name: n, dur: 0.5 })) } });
const c = new Combat({ actors: { play: () => true }, ground: g, host: {} }); c.useStyle('fightstyle_default|ps_captainamerica', nodes);
const hero = c.add(new Fighter(ent('_HERO1_', 0, 0), mk(), 'hero', { hp: 300 })); hero.controlled = true; hero.tv = tv; hero.level = 1; hero.energy = 100;
const foe = c.add(new Fighter(ent('goon', 200, 0), { pose: {}, p: { info: {}, anims: [] } }, 'enemy', { hp: 1000 })); foe.controlled = true;
assert.deepEqual(c.powerLevels(hero), [1, 5, 99, 99]);
assert.equal(c.power(hero, 2), false, 'poder 2 exige nível 5'); assert.equal(c.power(hero, 3), false, 'sem poder no slot 3');
const seen = []; c.onProjectile = p => seen.push(p);
assert.ok(c.power(hero, 1)); assert.equal(hero.energy, 95, 'custo = captam_p1_pwr');
for (let i = 0; i < 12; i++) c.update(0.05);
assert.equal(seen.length, 1, 'projétil criado'); const dmg1 = 1000 - foe.hp; assert.ok(dmg1 >= 13 && dmg1 <= 15, 'dano do rank 1: ' + dmg1);
foe.state = 'free'; foe.ent.pos[0] = 200;
for (let i = 0; i < 60 && c.projectiles.length; i++) c.update(0.05);
assert.ok(1000 - foe.hp >= dmg1 * 2 - 1, 'a volta também acerta'); assert.equal(c.projectiles.length, 0, 'escudo é pego de volta'); assert.equal(seen[0].ent.alive, false);
hero.state = 'free'; hero.level = 5; hero.energy = 100; foe.hp = 1000; foe.state = 'free'; foe.ent.pos[0] = 200; foe.ent.pos[1] = 0; assert.ok(c.power(hero, 1));
for (let i = 0; i < 12; i++) c.update(0.05); assert.ok(1000 - foe.hp >= 34, 'dano sobe com o nível: ' + (1000 - foe.hp));
console.log('talents ok');
