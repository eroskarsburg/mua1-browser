import { openAsBlob, readFileSync } from 'node:fs';
import { Archive } from '../src/archive.js';
import { IGB } from '../src/igb.js';
import { decodeEnbaya } from '../src/enbaya.js';
import assert from 'node:assert/strict';
const G = 'C:/Users/Eros/Desktop/_apps/_games/Marvel Ultimate Alliance/';
const a = await Archive.open(await openAsBlob(G + 'actors.bin'), 'actors');
const g = new IGB(await a.read('03_wolverine.igb'));
const srcs = g.byName('igEnbayaAnimationSource');
const ref = JSON.parse(readFileSync('out/enb_ref.json', 'utf8')); // gerado por tools/enbaya.py
const near = (x, y) => x.every((v, i) => Math.abs(v - y[i]) < 2e-3);
srcs.slice(0, 4).forEach((o, i) => {
  const r = decodeEnbaya(g.mem(o.v[0].v)), R = ref[i], n = r.nch * 7;
  assert.equal(r.nf, R.nf); assert.equal(r.nch, R.nch);
  assert.ok(near(Array.from(r.data.subarray(3 * 7, 3 * 7 + 7)), R.first), 'frame 0');
  const mid = (R.nf >> 1) * n + 5 * 7; assert.ok(near(Array.from(r.data.subarray(mid, mid + 7)), R.mid), 'frame meio');
  const last = (R.nf - 1) * n + 7 * 7; assert.ok(near(Array.from(r.data.subarray(last, last + 7)), R.last), 'ultimo frame');
});
// todas as animações de todos os atores decodificam sem estourar
let n = 0, t0 = performance.now();
for (const e of a.entries) { const gg = new IGB(await a.read(e)); for (const o of gg.byName('igEnbayaAnimationSource')) { decodeEnbaya(gg.mem(o.v[0].v)); n++; } }
console.log('enbaya ok:', n, 'animações em', (performance.now() - t0 | 0) + 'ms');
