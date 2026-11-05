import { openAsBlob } from 'node:fs';
import assert from 'node:assert/strict';
import { Archive } from '../src/archive.js';
import { parseXmlb } from '../src/xmlb.js';
import { parse } from '../src/behaved.js';
import { World, createSim } from '../src/world.js';
import { entMatrix } from '../src/scene.js';

// matriz de entidade: yaw de 90 graus leva +X para +Y; translação em [12..14]
{
  const m = entMatrix({ pos: [10, 20, 30], orient: [0, 0, Math.PI / 2] });
  assert.ok(Math.abs(m[0]) < 1e-6 && Math.abs(m[1] - 1) < 1e-6 && Math.abs(m[4] + 1) < 1e-6);
  assert.deepEqual([m[12], m[13], m[14]], [10, 20, 30]);
}
const G = 'C:/Users/Eros/Desktop/_apps/_games/Marvel Ultimate Alliance/';
const [maps, scripts] = await Promise.all([['maps'], ['scripts']].map(async ([n]) => Archive.open(await openAsBlob(G + n + '.bin'), n)));
const cache = new Map();
const loadScript = p => { if (!cache.has(p)) cache.set(p, scripts.has(p + '.py') ? parse(new TextDecoder('latin1').decode(scripts._sync?.(p + '.py') ?? '')) : null); return cache.get(p); };
// carga síncrona de scripts: pré-lê tudo (2,5 MB)
const text = new Map(); for (const e of scripts.entries) text.set(e.name, await scripts.text(e));
const load = p => { if (!cache.has(p)) { const t = text.get(p + '.py'); cache.set(p, t ? parse(t) : null); } return cache.get(p); };

let blocked = 0, nm = 0, insts = 0, defs = 0, res = 0, unres = 0, ran = 0, withScripts = 0; const t0 = performance.now(); const unresNames = new Map();
for (const e of maps.entries) {
  if (!e.name.endsWith('.xmlb')) continue;
  let root; try { root = parseXmlb(await maps.read(e)); } catch { continue; }
  if (root.tag !== 'world') continue;
  const w = new World(root); nm++; insts += w.insts.length; defs += w.defs.size;
  const dir = e.name.slice(0, -5) + '/', mine = [...text.keys()].filter(k => k.startsWith(dir));
  if (!mine.length) continue; withScripts++;
  const { host, runner } = createSim(w, { loadScript: load, rng: () => 0.5 });
  for (const s of mine) runner.start(load(s.slice(0, -3)), { owner: null });
  for (let i = 0; i < 300 && runner.tasks.some(k => !k.done); i++) { runner.advance(0.5); for (const k of runner.blocked) runner.signal(k.sig); }
  for (const [k, v] of host.unresolvedNames) unresNames.set(k, (unresNames.get(k) || 0) + v);
  ran += runner.tasks.length; res += host.stats.resolved; unres += host.stats.unresolved; blocked += host.stats.blocked;
}
console.log(`mapas ${nm} (com scripts: ${withScripts}) · defs ${defs} · instâncias ${insts} · scripts executados ${ran}`);
console.log(`referências a entidades: resolvidas ${res}, não resolvidas ${unres} (${(100 * res / (res + unres)).toFixed(1)}%) em ${(performance.now() - t0) | 0}ms; re-disparos bloqueados ${blocked}`);
assert.ok(nm > 100); assert.ok(res > 1000);

console.log('não resolvidos (top):', [...unresNames].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => k + ':' + v).join('  '));
