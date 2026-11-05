// Liga o mundo (World) ao renderer: mapa estático + instâncias de entidade (modelo, posição, orientação, estado).
import { IGB } from './igb.js';
import { buildScene, mul, entMatrix } from './scene.js';
import { parseXmlb } from './xmlb.js';
import { World, createSim } from './world.js';
import { parse } from './behaved.js';

export const CUBE = (() => {                                   // cubo unitário centrado, para marcadores
  const p = [], i = [];
  for (const z of [-.5, .5]) for (const y of [-.5, .5]) for (const x of [-.5, .5]) p.push(x, y, z);
  for (const q of [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]) i.push(q[0], q[1], q[2], q[0], q[2], q[3]);
  return { n: 8, pos: new Float32Array(p), nrm: null, uv: null, col: null, wt: null, bi: null, idx: new Uint16Array(i), min: [-.5, -.5, -.5], max: [.5, .5, .5] };
})();
const COLOR = { playerstartent: [.2, .9, .3], monsterspawnerent: [.95, .25, .2], waypointent: [.3, .6, 1], scripttriggerent: [1, .8, .2], zonelinkent: [.8, .3, 1], doorent: [1, .5, .1], lightent: [1, 1, .5] };

export const idxByName = arc => { const m = new Map(); for (const e of arc.entries) m.set(e.name.toLowerCase(), e); return m; };

/** Carrega mapa estático + mundo. Retorna { world, base (cena do mapa), models:Set(nomes necessários) }. */
export async function loadMap(maps, name) {
  const stem = name.replace(/\.(igb|xmlb)$/i, '');
  const base = maps.has(stem + '.igb') ? buildScene(new IGB(await maps.read(stem + '.igb'))) : { draws: [], lights: [] };
  let world = null;
  if (maps.has(stem + '.xmlb')) { try { const r = parseXmlb(await maps.read(stem + '.xmlb')); if (r.tag === 'world') world = new World(r); } catch { /* sem mundo */ } }
  return { stem, base, world };
}

/** Itens de desenho das instâncias. `getModel(path)` -> Promise<scene>|null. Chama onBatch(items) à medida que carrega. */
export async function entityItems(world, getModel, onBatch, { concurrency = 12 } = {}) {
  const byModel = new Map(), markers = [];
  for (const e of world.insts) {
    const m = e.def.model;
    if (m) (byModel.get(m) || byModel.set(m, []).get(m)).push(e);
    else if (e.ext.some(v => v)) markers.push(e);
  }
  const mk = markers.map(e => {
    const c = COLOR[e.def.classname] || [.6, .6, .6], [x0, y0, z0, x1, y1, z1] = e.ext;
    const off = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], sz = [Math.max(x1 - x0, 4), Math.max(y1 - y0, 4), Math.max(z1 - z0, 4)];
    const base = new Float32Array([sz[0], 0, 0, 0, 0, sz[1], 0, 0, 0, 0, sz[2], 0, off[0], off[1], off[2], 1]);
    return { geo: CUBE, base, m: mul(entMatrix(e), base), st: { tex: null, diffuse: [c[0], c[1], c[2], .3], blend: true, atest: false }, ent: e, marker: true, ver: e._ver };
  });
  if (mk.length) onBatch(mk);
  const names = [...byModel.keys()]; let k = 0, loaded = 0;
  const worker = async () => {
    while (k < names.length) {
      const n = names[k++], sc = await getModel(n).catch(() => null); loaded++;
      if (!sc) continue;
      const items = [];
      for (const e of byModel.get(n)) for (const d of sc.draws) items.push({ geo: d.geo, base: d.m, m: mul(entMatrix(e), d.m), st: d.st, ent: e, ver: e._ver });
      if (items.length) onBatch(items, loaded, names.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, names.length) }, worker));
  return { models: names.length, markers: mk.length };
}

/** Simulação ao vivo: roda os scripts do mapa em tempo real contra o mundo. */
export function startSim(world, scripts, stem, opts = {}) {
  const text = new Map(); const cache = new Map();
  const load = p => { if (!cache.has(p)) { const t = text.get(p + '.py'); cache.set(p, t ? parse(t) : null); } return cache.get(p); };
  const ready = (async () => { for (const e of scripts.entries) if (e.name.startsWith(stem + '/') || opts.all) text.set(e.name, await scripts.text(e)); })();
  const { host, runner } = createSim(world, { loadScript: load, rng: Math.random });
  return {
    host, runner, ready,
    async run(filter = () => true) { await ready; let n = 0; for (const k of text.keys()) if (filter(k)) { runner.start(load(k.slice(0, -3)), { owner: null }); n++; } return n; },
    tick(dt) {
      runner.advance(dt);
      for (const k of runner.blocked) if (runner.t - (k.since ??= runner.t) > 15) { k.since = undefined; runner.signal(k.sig); }   // rede de segurança: sinais sem resposta disparam após 15 s
      return runner.tasks.filter(k => !k.done).length;
    },
  };
}
