import assert from 'node:assert/strict';
import { parseAnimTable, parseEvents, parseNodes, MoveRun, avgRange, isLocomotion, reactionPlan } from '../src/fightstyle.js';
import { Combat, Fighter } from '../src/combat.js';
import { Ground } from '../src/player.js';

const el = (tag, attrs = {}, children = []) => ({ tag, attrs, children });
assert.equal(avgRange('2 3'), 2.5); assert.equal(avgRange('7'), 7); assert.equal(avgRange(undefined), 0);

const anim = parseAnimTable(el('ANIMTABLE', {}, [el('anims', { ea_idle1: 'idle', ea_attack_light1: 'attack_light1', ea_attack_light2: 'Attack_Light2', ea_attack_knockback2: 'attack_knockback2' })]));
assert.equal(anim.get('ea_attack_light2'), 'attack_light2');                           // nomes em minúsculo
const events = parseEvents(el('Events', {}, [
  el('event', { name: 'punch', type: 'ce_atk_punch', damage: '2 3', maxrange: '48', arc: '60', knockback: '40' }),
  el('event', { name: 'punch_heavy', inherit: 'punch', damage: '3 4', knockback: '120' }),
  el('event', { name: 'sound', type: 'ce_sound' }), el('event', { name: 'whoosh_light', inherit: 'sound', sound: 'common/melee/whoosh_light' }),
]));
assert.equal(events.get('punch_heavy').attrs.type, 'ce_atk_punch'); assert.equal(events.get('punch_heavy').attrs.maxrange, '48');   // herança

const nodes = parseNodes(el('FightingStyle', {}, [
  el('FightMove', { name: 'idle', animenum: 'ea_idle1', noncombat: 'true' }, [el('chain', { action: 'attack', result: 'attacklight1' }), el('chain', { action: 'smash', result: 'attackknockback2' })]),
  el('FightMove', { name: 'attacklight1', animenum: 'ea_attack_light1', startchaintime: '0.4' }, [
    el('trigger', { name: 'whoosh_light', time: '0.1' }), el('trigger', { name: 'punch', time: '0.3' }),
    el('chain', { action: 'idle', result: 'idle' }), el('chain', { action: 'attack', result: 'attacklight2' })]),
  el('FightMove', { name: 'attacklight2', animenum: 'ea_attack_light2', inherit: 'attacklight1' }, [el('chain', { action: 'attack', result: 'null' })]),
  el('FightMove', { name: 'attackknockback2', animenum: 'ea_attack_knockback2', startchaintime: '0.5', playspeed: '2' }, [
    el('trigger', { name: 'punch_heavy', time: '0.2' }, [el('damagemod', { name: 'dmgmod_auto_knockback' })]), el('chain', { action: 'idle', result: 'idle' })]),
]), { anim, events });
assert.equal(nodes.get('attacklight2').clip, 'attack_light2');
assert.equal(nodes.get('attacklight2').triggers.length, 2, 'herda gatilhos do pai'); assert.equal(nodes.get('attacklight2').chain.get('attack'), 'null');
assert.equal(nodes.get('attacklight1').triggers[1].attrs.damage, '2 3');                 // gatilho recebe os dados do evento-modelo
assert.ok(nodes.get('attackknockback2').triggers[0].mods.includes('dmgmod_auto_knockback'));
assert.ok(isLocomotion(nodes.get('idle')) && !isLocomotion(nodes.get('attacklight1')));

// MoveRun: gatilhos nos instantes certos e encadeamento só a partir de startchaintime
{
  const r = new MoveRun(nodes.get('attacklight1'), 0.6, nodes), seen = []; r.press('attack');
  for (let i = 0; i < 100 && r.next === undefined; i++) { for (const t of r.step(0.02)) seen.push([t.name, +r.t.toFixed(2)]); }
  assert.equal(r.next, 'attacklight2'); assert.ok(r.t >= 0.4 && r.t < 0.45, 'encadeou em startchaintime: ' + r.t);
  assert.deepEqual(seen.map(s => s[0]), ['whoosh_light', 'punch']); assert.ok(seen[1][1] >= 0.3 && seen[1][1] < 0.34);
  const q = new MoveRun(nodes.get('attacklight1'), 0.6, nodes); for (let i = 0; i < 100 && q.next === undefined; i++) q.step(0.02);
  assert.equal(q.next, 'idle', 'sem entrada: termina no idle'); assert.ok(q.t >= 0.6);
  const h = new MoveRun(nodes.get('attackknockback2'), 1, nodes); assert.equal(h.dur, 0.5, 'playspeed 2 dobra a velocidade');
}

// reações
assert.deepEqual(reactionPlan('knockdown', 'front').map(s => s.clip), ['flyingback_loop', 'flyingback_land', 'flyingback_getup']);
assert.deepEqual(reactionPlan('knockdown', 'back').map(s => s.clip), ['flyingforward_loop', 'flyingforward_land', 'flyingforward_getup']);
assert.equal(reactionPlan('pain', 'back')[0].clip, 'pain_rear'); assert.equal(reactionPlan('popup')[0].air, true);

// Combat dirigido pelos nós
const ID = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const tile = (x, y, s = 500) => ({ geo: { n: 4, pos: new Float32Array([x, y, 0, x + s, y, 0, x + s, y + s, 0, x, y + s, 0]), idx: new Uint16Array([0, 1, 2, 0, 2, 3]) }, m: ID });
const g = new Ground(); for (let x = -1000; x < 1000; x += 500) for (let y = -1000; y < 1000; y += 500) g.add([tile(x, y)]);
const names = ['idle', 'attack_light1', 'attack_light2', 'attack_knockback2', 'pain_high', 'pain_low', 'pain_rear', 'flyingback_loop', 'flyingback_land', 'flyingback_getup', 'death_gen'];
const mkInst = () => ({ pose: {}, p: { info: { fightstyle: 'fightstyle_default' }, anims: names.map(name => ({ name, dur: 0.6 })) } });
const played = []; const actors = { play: (i, n, o) => { played.push([n, o && o.rate]); return true; } };
const ent = (name, x, y) => ({ name, pos: [x, y, 0], orient: [0, 0, 0], _ver: 0, alive: true, enabled: true, def: {} });
const c = new Combat({ actors, ground: g, host: {} }); c.useStyle('fightstyle_default', nodes);
const hero = c.add(new Fighter(ent('_HERO1_', 0, 0), mkInst(), 'hero', { hp: 300, dmg: 16 })); hero.controlled = true;
const foe = c.add(new Fighter(ent('goon', 60, 0), mkInst(), 'enemy', { hp: 400 })); foe.controlled = true;     // sem IA: parado para medir
const sounds = []; c.onSound = s => sounds.push(s);

c.input(hero, 'KeyJ'); assert.equal(hero.state, 'attack'); assert.equal(hero.node.name, 'attacklight1');
c.input(hero, 'KeyJ');                                                                  // segundo toque fica em buffer
for (let i = 0; i < 12; i++) c.update(0.05);                                            // 0.6 s
assert.equal(hero.node.name, 'attacklight2', 'combo encadeou'); assert.ok(played.some(p => p[0] === 'attack_light2'));
assert.ok(foe.hp < 400 && foe.hp >= 400 - 20, 'dano vem do dado "2 3": ' + (400 - foe.hp)); assert.ok(sounds.includes('common/melee/whoosh_light'));
for (let i = 0; i < 20; i++) c.update(0.05);
assert.equal(hero.state, 'free', 'termina no idle e devolve o controle');

// golpe pesado com auto_knockback derruba: sequência voo -> chão -> levantar, sem clipe de ataque na vítima
{
  const c2 = new Combat({ actors, ground: g, host: {} }); c2.useStyle('fightstyle_default', nodes); played.length = 0;
  const h = c2.add(new Fighter(ent('_HERO1_', 0, 0), mkInst(), 'hero', { hp: 300, dmg: 16 })); h.controlled = true;
  const v = c2.add(new Fighter(Object.assign(ent('v', 60, 0), { orient: [0, 0, Math.PI] }), mkInst(), 'enemy', { hp: 900 })); v.state = 'free'; v.controlled = true;       // sem IA
  c2.input(h, 'KeyK'); for (let i = 0; i < 10; i++) c2.update(0.05);
  assert.ok(v.hp < 900); assert.equal(v.state, 'hurt'); assert.ok(v.plan && v.plan[0].clip === 'flyingback_loop');
  assert.ok(v.ent.pos[0] > 60, 'foi empurrado para longe do atacante');
  const seq = played.map(p => p[0]).filter(n => /flyingback|pain/.test(n)); assert.equal(seq[0], 'flyingback_loop');
  for (let i = 0; i < 80 && v.state === 'hurt'; i++) c2.update(0.05);
  assert.equal(v.state, 'free', 'levantou'); assert.equal(v.ent.pos[2], 0, 'pousou no chão');
  assert.ok(played.map(p => p[0]).includes('flyingback_getup'));
  assert.ok(!played.slice(0, 3).some(p => p[0].startsWith('attack_knockback') && p !== played[0]), 'vítima não toca clipe de ataque');
}
console.log('fightstyle ok');

// esquiva: root motion do canal Motion (x frente, y esquerda), invulnerável durante o rolamento
{
  const ID2 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const roll = { name: 'evade_forwardroll', dur: 0.85 }, motion = t => [Math.min(t, 0.85) * 200, Math.min(t, 0.85) * 40, 0];
  const mk = () => ({ pose: { motionAt: (a, t) => motion(t) }, p: { info: { fightstyle: 'fightstyle_default' }, anims: [{ name: 'idle', dur: 1 }, roll] } });
  const c3 = new Combat({ actors: { play: () => true }, ground: g, host: {} });
  const h = c3.add(new Fighter(ent('_HERO1_', 0, 0), mk(), 'hero', { hp: 300 })); h.controlled = true; h.ent.orient[2] = Math.PI / 2;      // olhando para +y
  assert.ok(c3.dodge(h)); assert.equal(h.state, 'dodge'); assert.equal(h.ent.invulnerable, true);
  for (let i = 0; i < 30; i++) c3.update(0.05);
  assert.equal(h.state, 'free'); assert.equal(h.ent.invulnerable, false);
  assert.ok(Math.abs(h.ent.pos[1] - 170) < 8, 'avançou ~170 na direção do rosto: ' + h.ent.pos[1]);        // 200 * 0.85
  assert.ok(h.ent.pos[0] < -25, 'y local (esquerda) virou -x no mundo: ' + h.ent.pos[0]);
  assert.equal(c3.dodge(h, null, 'inexistente'), false);
}
console.log('dodge ok');
