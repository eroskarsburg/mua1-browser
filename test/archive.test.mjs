import { openAsBlob } from 'node:fs';
import { readFileSync } from 'node:fs';
import { Archive } from '../src/archive.js';
import assert from 'node:assert/strict';
const G = 'C:/Users/Eros/Desktop/_apps/_games/Marvel Ultimate Alliance/';
const open = async n => Archive.open(await openAsBlob(G + n + '.bin'), n);

const eula = await open('eula');
assert.equal(eula.count, 2);
const t = await eula.text('eula_eng.txt');
assert.equal(t.length, 51074);
assert.ok(t.startsWith('2\r\nIMPORTANT NOTICE'));

// compara byte a byte com a extração Python
const t0 = performance.now();
const tex = await open('textures');
const a = await tex.read('arrow.igb');
assert.deepEqual(Buffer.from(a), readFileSync('out/raw/textures/arrow.igb'));
const sc = await open('scripts');
const py = await sc.read('tower/tower2/find_scarlett.py');
assert.deepEqual(Buffer.from(py), readFileSync('out/raw/scripts/tower/tower2/find_scarlett.py'));

// arquivo grande: só o índice + 1 entrada de maps.bin (840MB) -> mede tempo
const maps = await open('maps');
const big = maps.entries.reduce((m, e) => e.size > m.size ? e : m);
const data = await maps.read(big);
assert.equal(data.length, big.size);
console.log(`ok | maps.bin: ${maps.count} entradas, maior=${big.name} ${(big.size/1e6).toFixed(1)}MB, tempo total ${(performance.now()-t0).toFixed(0)}ms`);

// xmlb: todos os xmlb de data.bin e effects.bin precisam decodificar
import { parseXmlb, toXml } from '../src/xmlb.js';
let n = 0;
for (const arc of [await open('data'), await open('effects'), await open('conversations')])
  for (const e of arc.entries) if (e.name.endsWith('.xmlb')) { toXml(parseXmlb(await arc.read(e))); n++; }
console.log('xmlb ok:', n);
