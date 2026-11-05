import { openAsBlob } from 'node:fs';
import { Archive } from '../src/archive.js';
import { IGB } from '../src/igb.js';
import { buildScene } from '../src/scene.js';
const G = 'C:/Users/Eros/Desktop/_apps/_games/Marvel Ultimate Alliance/';
const a = await Archive.open(await openAsBlob(G + 'actors.bin'), 'actors');
let withMesh = 0, tris = 0, n = 0, bad = 0;
for (const e of a.entries) {
  try { const g = new IGB(await a.read(e)); n++; const s = buildScene(g); if (s.draws.length) { withMesh++; tris += s.draws.reduce((x, d) => x + d.geo.idx.length / 3, 0); } }
  catch (err) { bad++; if (bad < 4) console.log('FAIL', e.name, err.message); }
}
console.log('actors', n, 'bad', bad, 'com malha', withMesh, 'tris', tris);
