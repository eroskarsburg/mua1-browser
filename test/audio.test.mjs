import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { parseFSB5 } from '../src/audio.js';
const root = 'C:/Users/Eros/Desktop/_apps/_games/Marvel Ultimate Alliance/sounds';
let files = 0, samples = 0, bad = 0, noSync = 0, stereo = 0, bytes = 0, named = 0; const freqs = new Map();
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.fsb')) one(p); } };
function one(p) {
  files++;
  try {
    for (const s of parseFSB5(fs.readFileSync(p))) {
      samples++; bytes += s.data.length; if (s.channels === 2) stereo++; freqs.set(s.freq, (freqs.get(s.freq) || 0) + 1); if (s.name) named++;
      let i = 0; while (i < 64 && !(s.data[i] === 0xff && (s.data[i + 1] & 0xe0) === 0xe0)) i++;
      if (i >= 64 || s.data.length < 100) noSync++;
    }
  } catch (e) { bad++; if (bad < 4) console.log('FAIL', p, e.message); }
}
walk(root);
console.log(`fsb ${files}: amostras ${samples}, falhas ${bad}, sem sync MPEG ${noSync}, estéreo ${stereo}, ${(bytes / 1e6).toFixed(0)} MB, nomes ${named}, freq`, Object.fromEntries(freqs));
assert.equal(bad, 0); assert.ok(noSync < samples * 0.01);

// ---- decodificação MP2 (jsmpeg): contagem de amostras PCM == cabeçalho FSB, em uma amostragem grande
import vm from 'node:vm';
import { decodeMP2 } from '../src/audio.js';
{
  const ctx = vm.createContext({ document: { readyState: 'complete', querySelectorAll: () => [], addEventListener() {} }, window: { performance: { now: () => Date.now() } }, console, Uint8Array, Float32Array, Int32Array, Uint32Array, Uint16Array, Int16Array, ArrayBuffer, DataView, Math, setTimeout, performance });
  vm.runInContext(fs.readFileSync('vendor/jsmpeg.min.js', 'utf8') + ';this.JSMpeg=JSMpeg;', ctx);
  const all = []; const w = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) w(p); else if (e.name.endsWith('.fsb')) all.push(p); } }; w(root);
  let ok = 0, mismatch = 0, silent = 0, tested = 0;
  for (let i = 0; i < all.length; i += 40) {
    for (const s of parseFSB5(fs.readFileSync(all[i]))) {
      const d = decodeMP2(ctx.JSMpeg, s.data, s.channels); tested++;
      if (Math.abs(d.n - s.samples) > 1152) mismatch++; else ok++;
      let pk = 0; for (const fr of d.L) for (let k = 0; k < fr.length; k += 17) pk = Math.max(pk, Math.abs(fr[k])); if (pk < 1e-4) silent++;
    }
  }
  console.log(`mp2: ${tested} amostras decodificadas, ${ok} com duração correta, ${mismatch} divergentes, ${silent} silenciosas`);
  assert.ok(ok > tested * 0.98);
}
