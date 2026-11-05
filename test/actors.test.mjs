import { openAsBlob } from 'node:fs';
import assert from 'node:assert/strict';
import { Archive } from '../src/archive.js';
import { Actors, loadCharacterDB } from '../src/actors.js';
const G = 'C:/Users/Eros/Desktop/_apps/_games/Marvel Ultimate Alliance/';
const open = async n => Archive.open(await openAsBlob(G + n + '.bin'), n);
const [data, act] = await Promise.all([open('data'), open('actors')]);
const db = await loadCharacterDB(data), actors = new Actors(act, db);
let ok = 0, noSkin = 0, noAnim = 0, noMesh = 0; const missing = [];
for (const [key, info] of db) {
  if (!actors.index.has(info.skin.toLowerCase() + '.igb')) { noSkin++; missing.push(info.name + '(' + info.skin + ')'); continue; }
  const p = await actors.proto(key);
  if (!p) { noMesh++; continue; }
  if (!p.anims.length) { noAnim++; continue; }
  ok++;
}
console.log(`personagens ${db.size}: com malha+animações ${ok}, skin ausente ${noSkin}, sem malha ${noMesh}, sem animações ${noAnim}`);
if (missing.length) console.log('skins ausentes (ex.):', missing.slice(0, 8).join(' '));
assert.ok(ok > db.size * 0.6);
const wolv = await actors.proto('wolverine');
assert.ok(wolv.anims.some(a => a.name === 'idle') && wolv.skel.bones.length > 30);
