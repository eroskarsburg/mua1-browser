import { openAsBlob } from 'node:fs';
import assert from 'node:assert/strict';
import { Archive } from '../src/archive.js';
import { Effects, parseEffect } from '../src/effects.js';
import { parseXmlb } from '../src/xmlb.js';
const G = 'C:/Users/Eros/Desktop/_apps/_games/Marvel Ultimate Alliance/';
const open = async n => Archive.open(await openAsBlob(G + n + '.bin'), n);
const [eff, tex] = await Promise.all([open('effects'), open('textures')]);
let ok = 0, ems = 0, bad = 0;
for (const e of eff.entries) { try { const s = parseEffect(parseXmlb(await eff.read(e))); ok++; ems += s.emitters.length; } catch { bad++; } }
console.log(`efeitos ${eff.count}: parse ok ${ok}, falhas ${bad}, emissores ${ems}`);
assert.equal(bad, 0);
const fx = new Effects(eff, tex);
for (const n of ['base/hit/hit_fire', 'base/hit/hit_default', 'char/wolv/p1_power', 'char/storm/p2_power']) {
  assert.ok(fx.has(n), n);
  assert.ok(await fx.spawn(n, [0, 0, 0]), n);
}
let peak = 0, quads0 = 0;
await new Promise(r => setTimeout(r, 400));
for (let i = 0; i < 90; i++) { fx.update(1 / 30); peak = Math.max(peak, fx.particles.length); if (i === 6) for (const v of fx.collect().values()) quads0 += v.v.length / 66; }
assert.ok(peak > 10, 'emitiu partículas: ' + peak); assert.ok(quads0 > 0, 'coletou quads');
for (const p of fx.particles) assert.ok(Number.isFinite(p.x + p.y + p.z + p.age));
const g = fx.collect(); let quads = 0; for (const v of g.values()) quads += v.v.length / 66;
console.log('partículas vivas (2s):', peak, 'quads agrupados:', quads, 'grupos:', g.size);
assert.ok(fx.particles.length <= fx.max);
