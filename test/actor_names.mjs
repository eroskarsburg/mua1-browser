import { openAsBlob } from 'node:fs';
import { Archive } from '../src/archive.js';
import { IGB } from '../src/igb.js';
import { buildScene } from '../src/scene.js';
const G = 'C:/Users/Eros/Desktop/_apps/_games/Marvel Ultimate Alliance/';
const a = await Archive.open(await openAsBlob(G + 'actors.bin'), 'actors');
const out = [];
for (const e of a.entries) { const g = new IGB(await a.read(e)); const s = buildScene(g); if (s.draws.length && /[a-z]{3}/.test(e.name)) out.push(e.name + ':' + s.draws.length); }
console.log(out.slice(0, 60).join('  '));
