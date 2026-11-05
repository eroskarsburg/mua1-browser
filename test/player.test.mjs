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
// pulo: v0=450 u/s, g=1300: apogeu ~78; pulo duplo soma 270; pousa e toca jump_land
{
  const mk = () => { const e2 = { name: 'h', pos: [-300, -300, 0], orient: [0, 0, 0], _ver: 0 }, log2 = []; const p2 = new Player(e2, { p: { anims: [] } }, { play: (_, n) => log2.push(n) }, g); p2.update(0.05, new Set(), 0); p2.update(0.05, new Set(), 0); return { e2, log2, p2 }; };
  const { e2, log2, p2 } = mk(); const z0 = e2.pos[2];
  assert.ok(p2.jump()); assert.equal(log2[log2.length - 1], 'jump_start');
  let top = 0; for (let i = 0; i < 200 && p2.air; i++) { p2.update(0.005, new Set(), 0); top = Math.max(top, e2.pos[2]); }
  assert.ok(Math.abs(top - z0 - 450 * 450 / 2600) < 3, 'apogeu ' + (top - z0)); assert.equal(p2.air, null); assert.equal(e2.pos[2], z0);
  assert.equal(log2[log2.length - 1], 'jump_land'); assert.equal(p2.jump(), false, 'aterrissando'); for (let i = 0; i < 40; i++) p2.update(0.01, new Set(), 0); assert.equal(p2.state, 'idle');
  const b = mk(), z1 = b.e2.pos[2]; b.p2.jump(); let t2 = 0; for (let i = 0; i < 30; i++) b.p2.update(0.01, new Set(), 0);
  assert.ok(b.p2.jump(), 'pulo duplo'); assert.equal(b.log2[b.log2.length - 1], 'jumpdouble_start'); assert.equal(b.p2.air.hs, 1.4); assert.equal(b.p2.jump(), false, 'só um');
  for (let i = 0; i < 300 && b.p2.air; i++) { b.p2.update(0.005, new Set(), 0); t2 = Math.max(t2, b.e2.pos[2]); } assert.ok(t2 - z1 > 78, 'pulo duplo vai mais alto: ' + (t2 - z1));
}
// borda do mapa e killz: não sai para o vazio e volta ao último chão firme
{
  const e3 = { name: 'k', pos: [-300, -300, 0], orient: [0, 0, 0], _ver: 0 }, p3 = new Player(e3, { p: { anims: [] } }, { play: () => {} }, g); p3.update(0.05, new Set(), 0); p3.update(0.05, new Set(), 0);
  const z = e3.pos[2], x = e3.pos[0]; p3.killz = z - 10; p3.jump(); p3.air.vz = -500; p3.ground = { blocked: () => false, height: () => null };
  for (let i = 0; i < 400 && p3.air; i++) p3.update(0.01, new Set(['KeyW']), 0);
  assert.equal(p3.air, null, 'não cai para sempre'); assert.equal(e3.pos[2], z); assert.equal(e3.pos[0], x, 'sem chão não anda no ar');
}
console.log('player ok');
