import assert from 'node:assert/strict';
import { World, createSim } from '../src/world.js';
import { Combat, Fighter } from '../src/combat.js';
import { Ground } from '../src/player.js';
import { entMatrix } from '../src/scene.js';
import { parse } from '../src/behaved.js';

const inst = (x, y, name, cls = 'physent') => ({ tag: 'entinst', attrs: { type: name }, children: [{ tag: 'inst', attrs: { name, pos: `${x} ${y} 0` }, children: [] }] });
const def = (name, cls) => ({ tag: 'entity', attrs: { name, classname: cls }, children: [] });
const w = new World({ tag: 'world', attrs: {}, children: [def('npc', 'physent'), inst(100, 0, 'npc'), def('wp', 'waypointent'), inst(0, 300, 'path_1'), inst(300, 300, 'path_2'), def('spot', 'physent'), inst(500, 500, 'spot')].map(x => x) });
// instâncias com nome de waypoint precisam do tipo wp
w.add('wp', { name: 'path_1', pos: '0 300 0' }); w.add('wp', { name: 'path_2', pos: '300 300 0' });
const { host, runner } = createSim(w, { rng: () => 0.5 });

// playanim sem animação: o sinal dispara na hora (não trava o waitsignal)
const t = runner.start(parse('playanim("EA_ZONE1", "npc", "NONE", "done1")\nwaitsignal("done1")\nsetGameFlag("f", 1, 1)'));
assert.ok(t.done && host.flags.get('f:1') === 1);
// com animação: sinal só quando termina
const calls = []; host.onPlayAnim = (e, z, m, s) => { calls.push([e.name, z, m, s]); return true; };
const t2 = runner.start(parse('playanim("EA_ZONE5", "npc", "LOOP", "done2")\nwaitsignal("done2")\nsetGameFlag("f", 2, 1)'));
assert.ok(!t2.done); assert.deepEqual(calls[0], ['npc', 'EA_ZONE5', 'LOOP', 'done2']); runner.signal('done2'); assert.ok(t2.done);

// IA global, alvos, teleporte, escala, noClip
runner.start(parse('setallaiactive("FALSE")\nheroNoTarget("TRUE")\nenemiesNoTarget("TRUE")\nsetScale("npc", 2.0)\nsetNoClip("npc", "TRUE")\nmoveHeroesToEnt("spot")'));
assert.equal(host.aiAll, false); assert.ok(host.noTarget.hero && host.noTarget.enemy);
assert.ok(Math.abs(entMatrix(w.find('npc')[0])[0] - 2) < 1e-6); assert.ok(w.find('npc')[0].noClip);
assert.deepEqual(host.heroes[0].pos.slice(0, 2), [500, 500]);
runner.start(parse('setAmbientLightColor(" 0.2 0.4 0.6 ")')); // sem hook: só registra

// combate respeita aiAll/noTarget e patrulha por waypoints
const ID = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const g = new Ground(); for (let x = -1000; x < 1000; x += 400) for (let y = -1000; y < 1000; y += 400) g.add([{ geo: { n: 4, pos: new Float32Array([x, y, 0, x + 400, y, 0, x + 400, y + 400, 0, x, y + 400, 0]), idx: new Uint16Array([0, 1, 2, 0, 2, 3]) }, m: ID }]);
const names = ['idle', 'walk', 'run', 'attack_light1'], mk = () => ({ pose: {}, p: { anims: names.map(n => ({ name: n, dur: .6 })) } });
const ent = (n, x, y) => ({ name: n, pos: [x, y, 0], orient: [0, 0, 0], _ver: 0, alive: true, enabled: true, def: {} });
const h2 = { aiAll: true, noTarget: { hero: false, enemy: false } }, c = new Combat({ actors: { play: () => true }, ground: g, host: h2 });
const hero = c.add(new Fighter(ent('h', 0, 0), mk(), 'hero')); hero.controlled = true;
const foe = c.add(new Fighter(ent('e', 300, 0), mk(), 'enemy', { speed: 200 }));
h2.noTarget.hero = true; for (let i = 0; i < 20; i++) c.update(0.05); assert.equal(foe.ent.pos[0], 300, 'inimigo ignora herói intocável');
h2.noTarget.hero = false; h2.aiAll = false; for (let i = 0; i < 20; i++) c.update(0.05); assert.equal(foe.ent.pos[0], 300, 'IA desligada');
h2.aiAll = true; hero.ent.pos = [900, 900, 0]; foe.ent.path = [[300, 300, 0], [300, -300, 0]]; foe.ent.pathI = 0;   // herói longe: patrulha
for (let i = 0; i < 120; i++) c.update(0.05); assert.ok(foe.ent.pos[1] !== 0 && Math.abs(foe.ent.pos[1]) > 100, 'patrulhou: ' + foe.ent.pos);
assert.ok(c.forceAttack(foe, hero));
console.log('stage ok');
