import { openAsBlob } from 'node:fs';
import { Archive } from '../src/archive.js';
import { IGB } from '../src/igb.js';
const G = 'C:/Users/Eros/Desktop/_apps/_games/Marvel Ultimate Alliance/';
const open = async n => Archive.open(await openAsBlob(G + n + '.bin'), n);
const t0 = performance.now();
let tot = 0, bad = 0, cls = new Map();
for (const [bin, limit] of [['textures', 1e9], ['models', 1e9], ['hud', 1e9], ['shaders', 1e9], ['skybox', 1e9], ['motionpaths', 1e9]]) {
  const a = await open(bin); let n = 0, b = 0;
  for (const e of a.entries.slice(0, limit)) {
    if (!e.name.endsWith('.igb')) continue;
    try { new IGB(await a.read(e)); n++; } catch (err) { b++; if (b < 3) console.log('FAIL', bin, e.name, err.message); }
  }
  console.log(bin, 'ok', n, 'bad', b); tot += n; bad += b;
}
console.log('total', tot, 'bad', bad, (performance.now() - t0).toFixed(0) + 'ms');
