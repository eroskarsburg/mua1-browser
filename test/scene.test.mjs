import { openAsBlob } from 'node:fs';
import { Archive } from '../src/archive.js';
import { IGB } from '../src/igb.js';
import { buildScene } from '../src/scene.js';
const G = 'C:/Users/Eros/Desktop/_apps/_games/Marvel Ultimate Alliance/';
const open = async n => Archive.open(await openAsBlob(G + n + '.bin'), n);
const maps = await open('maps'), models = await open('models');
for (const [a, nm] of [[models, 'shadow_blob.igb'], [maps, 'test/atvi_demo.igb'], [maps, 'e3/heli/heli3.igb']]) {
  const t = performance.now(); const g = new IGB(await a.read(nm)); const s = buildScene(g);
  const tris = s.draws.reduce((x, d) => x + d.geo.idx.length / 3, 0), tex = new Set(s.draws.map(d => d.st.tex && d.st.tex.key)).size;
  console.log(nm, 'draws', s.draws.length, 'tris', tris, 'tex', tex, 'lights', s.lights.length, (performance.now() - t).toFixed(0) + 'ms');
}
