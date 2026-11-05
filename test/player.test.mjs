import assert from 'node:assert/strict';
import { Ground, Player, cameraDistance } from '../src/player.js';

const ID = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const quad = (z, s = 500) => ({ n: 4, pos: new Float32Array([-s, -s, z, s, -s, z, s, s, z, -s, s, z]), idx: new Uint16Array([0, 1, 2, 0, 2, 3]) });
const wall = x => ({ n: 4, pos: new Float32Array([x, -50, 0, x, 50, 0, x, 50, 200, x, -50, 200]), idx: new Uint16Array([0, 1, 2, 0, 2, 3]) });

const g = new Ground(); g.add([{ geo: quad(10), m: ID }, { geo: wall(100), m: ID }]);
assert.equal(g.height(0, 0, 100), 10);                 // chão plano
assert.equal(g.height(0, 0, 5), null);                 // nada abaixo de z=5
assert.ok(g.blocked(95, 0, 10));                       // perto da parede em x=100
assert.ok(!g.blocked(0, 0, 10));
// degrau: sobe até +36, não mais
g.add([{ geo: quad(30, 40), m: ID }]); assert.equal(g.height(0, 0, 10 + 36), 30);

// Player: anda para frente (câmera yaw=PI -> frente = +X), para na parede, desliza, e troca de animação
const ent = { pos: [0, 0, 10], orient: [0, 0, 0], _ver: 0 }, played = [];
const pl = new Player(ent, {}, { play: (_, s) => played.push(s) }, g);
pl.update(0.016, new Set(), Math.PI); assert.ok(pl.grounded);
const keys = new Set(['KeyW']);
for (let i = 0; i < 200; i++) pl.update(0.016, keys, Math.PI);
assert.ok(ent.pos[0] > 40 && ent.pos[0] < 100, 'parou antes da parede: ' + ent.pos[0]);
assert.deepEqual(played, ['run']);
keys.add('ShiftLeft'); pl.update(0.016, keys, Math.PI); assert.equal(played.at(-1), 'walk');
assert.ok(cameraDistance(g, [0, 0, 55], Math.PI, 0.45, 230) > 40);
// pulo: v0=450 u/s, apogeu ~ v0^2/2g, pousa no chão e toca jump_land
{
  const e2 = { name: 'h', pos: [-300, -300, 0], orient: [0, 0, 0], _ver: 0 }, log2 = [];
  const p2 = new Player(e2, { p: { anims: [{ name: 'jump_start', dur: 1.1 }] } }, { play: (_, n, o) => log2.push([n, o && o.rate]) }, g);
  p2.update(0.05, new Set(), 0); p2.update(0.05, new Set(), 0);
  const z0 = e2.pos[2]; assert.ok(p2.jump()); assert.equal(p2.jump(), false, 'sem pulo duplo'); assert.equal(log2[log2.length - 1][0], 'jump_start');
  let top = 0; for (let i = 0; i < 100 && p2.air; i++) { p2.update(0.01, new Set(), 0); top = Math.max(top, e2.pos[2]); }
  assert.ok(Math.abs(top - z0 - 450 * 450 / 2000) < 6, 'apogeu ' + (top - z0)); assert.equal(p2.air, null); assert.equal(e2.pos[2], z0);
  assert.equal(log2[log2.length - 1][0], 'jump_land'); for (let i = 0; i < 40; i++) p2.update(0.01, new Set(), 0); assert.equal(p2.state, 'idle');
}
console.log('player ok');
