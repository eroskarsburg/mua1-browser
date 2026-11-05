// Efeitos de partículas (effects.bin): parser das árvores <Effect>, simulação e coleta de quads para o renderer.
// Aproximação das primitivas ParticleCloud / Sprite / OrientedSprite / Spark / Trail (billboards), com faixas "min max".
import { IGB } from './igb.js';
import { parseXmlb } from './xmlb.js';
import { readTexture } from './scene.js';

const nums = (s, n, d = 0) => { const a = String(s ?? '').trim().split(/\s+/).map(Number); return Array.from({ length: n }, (_, i) => Number.isFinite(a[i]) ? a[i] : d); };
const rnd = (a, b) => a + Math.random() * (b - a);
const argb = v => { const u = Number(v) >>> 0; return [((u >>> 16) & 255) / 255, ((u >>> 8) & 255) / 255, (u & 255) / 255, ((u >>> 24) & 255) / 255]; };
const lerp4 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
const KINDS = new Set(['ParticleCloud', 'Sprite', 'OrientedSprite', 'Spark', 'Trail', 'Cylinder']);

/** <Effect> -> { loop, emitters[] } */
export function parseEffect(root) {
  const emitters = [];
  const walk = n => {
    if (KINDS.has(n.tag)) {
      const a = n.attrs, c = (k, d) => argb(a[k] ?? d);
      emitters.push({
        kind: n.tag, additive: /additive/i.test(a.blend || ''), texture: a.texture || '',
        count: nums(a.count, 2, 1), delay: nums(a.delay, 2), interval: Number(a.interval) || 0, life: nums(a.life, 2, 0.5),
        origin: nums(a.origin, 6), velocity: nums(a.velocity, 6), accel: nums(a.acceleration, 6), gravity: nums(a.gravity, 2), drag: nums(a.drag, 2),
        size: nums(a.size, 6), radius: nums(a.radius, 2), height: nums(a.height, 2),
        c0a: c('startcolor1', 4294967295), c0b: c('startcolor2', 4294967295), cma: c('midcolor1', 4294967295), cmb: c('midcolor2', 4294967295), c1a: c('endcolor1', 4294967295), c1b: c('endcolor2', 4294967295),
      });
    }
    for (const k of n.children) walk(k);
  };
  walk(root);
  return { loop: Number(root.attrs.looptime) || 0, emitters };
}

export class Effects {
  /** effectsArchive: effects.bin; texturesArchive: textures.bin */
  constructor(effectsArchive, texturesArchive, { max = 6000 } = {}) {
    this.eff = effectsArchive; this.tex = texturesArchive; this.max = max;
    this.effIndex = new Map(effectsArchive.entries.map(e => [e.name.toLowerCase().replace(/\\/g, '/'), e]));
    this.texIndex = new Map(texturesArchive.entries.map(e => [e.name.toLowerCase().replace(/\\/g, '/'), e]));
    this.specs = new Map(); this.textures = new Map(); this.active = []; this.particles = [];
  }
  has(name) { return this.effIndex.has(name.toLowerCase() + '.xmlb'); }
  async spec(name) {
    const k = name.toLowerCase() + '.xmlb';
    if (!this.specs.has(k)) this.specs.set(k, (async () => { const e = this.effIndex.get(k); return e ? parseEffect(parseXmlb(await this.eff.read(e))) : null; })());
    return this.specs.get(k);
  }
  texture(path) {                                                // 'textures/nextgen/fire4.png' -> textures.bin 'nextgen/fire4.igb'
    if (!path) return null;
    const k = path.toLowerCase().replace(/\\/g, '/').replace(/\.png$|\.tga$|\.dds$/, '.igb').replace(/^textures\//, '');
    const e = this.texIndex.get(k) || this.texIndex.get(k.split('/').pop()); if (!e) return null;
    if (!this.textures.has(e.name)) {
      const holder = { tex: null }; this.textures.set(e.name, holder);
      this.tex.read(e).then(d => { const g = new IGB(d), ta = g.byName('igTextureAttr')[0]; if (ta) holder.tex = readTexture(g, ta); }).catch(() => {});
    }
    return this.textures.get(e.name);
  }
  /** Dispara um efeito em `pos` (mundo). Assíncrono: espera o parse do XML. */
  async spawn(name, pos, { scale = 1 } = {}) {
    const sp = await this.spec(name); if (!sp) return false;
    const inst = { t: 0, pos: [...pos], scale, ems: sp.emitters.map(e => ({ e, start: rnd(e.delay[0], e.delay[1]), n: Math.max(0, Math.round(rnd(e.count[0], e.count[1]))), done: 0, tex: this.texture(e.texture) })), loop: sp.loop, lastLoop: 0, age: 0 };
    this.active.push(inst); return true;
  }
  emit(inst, em) {
    const e = em.e, p = {
      x: inst.pos[0] + rnd(e.origin[0], e.origin[3]) * inst.scale, y: inst.pos[1] + rnd(e.origin[1], e.origin[4]) * inst.scale, z: inst.pos[2] + rnd(e.origin[2], e.origin[5]) * inst.scale,
      vx: rnd(e.velocity[0], e.velocity[3]), vy: rnd(e.velocity[1], e.velocity[4]), vz: rnd(e.velocity[2], e.velocity[5]),
      ax: rnd(e.accel[0], e.accel[3]), ay: rnd(e.accel[1], e.accel[4]), az: rnd(e.accel[2], e.accel[5]) - rnd(e.gravity[0], e.gravity[1]),
      drag: Math.max(0, rnd(e.drag[0], e.drag[1])), life: Math.max(0.05, rnd(e.life[0], e.life[1])), age: 0,
      s0: Math.max(1, rnd(e.size[1], e.size[4]) || rnd(e.radius[0], e.radius[1]) || 8) * inst.scale, s1: 0, rot: Math.random() * 6.283, em,
    };
    p.s1 = Math.max(1, rnd(e.size[2], e.size[5]) || p.s0 / inst.scale) * inst.scale;
    if (e.kind === 'Spark') { p.vx += rnd(-60, 60); p.vy += rnd(-60, 60); p.vz += rnd(20, 120); }
    if (this.particles.length < this.max) this.particles.push(p);
  }
  update(dt) {
    for (const inst of this.active) {
      inst.t += dt;
      if (inst.loop > 0 && inst.t < 1.2 && inst.t - inst.lastLoop >= inst.loop) {       // efeitos com looptime re-emitem em ciclos
        inst.lastLoop = inst.t;
        for (const em of inst.ems) { em.start = inst.t + rnd(em.e.delay[0], em.e.delay[1]); em.n = Math.max(0, Math.round(rnd(em.e.count[0], em.e.count[1]))); em.done = 0; }
      }
      for (const em of inst.ems) {
        if (inst.t < em.start) continue;
        const dur = em.e.interval > 0 ? em.e.interval : 0, want = dur ? Math.min(em.n, Math.ceil(((inst.t - em.start) / dur) * em.n)) : em.n;
        while (em.done < want) { this.emit(inst, em); em.done++; }
      }
    }
    this.active = this.active.filter(i => i.ems.some(em => em.done < em.n) || i.t < 0.01 || (i.loop > 0 && i.t < 1.2));
    const out = [];
    for (const p of this.particles) {
      p.age += dt; if (p.age >= p.life) continue;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx = (p.vx + p.ax * dt) * d; p.vy = (p.vy + p.ay * dt) * d; p.vz = (p.vz + p.az * dt) * d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; out.push(p);
    }
    this.particles = out;
  }
  /** Agrupa por (textura, blend) em vértices: pos3 corner2 cor4 tamanho1 rot1 = 11 floats; 6 vértices por partícula. */
  collect() {
    const groups = new Map(), C = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    for (const p of this.particles) {
      const e = p.em.e, holder = p.em.tex; if (holder && !holder.tex && e.texture) continue;        // espera a textura carregar
      const key = (holder ? holder.tex?.key ?? 'n' : 'n') + (e.additive ? '+' : '-');
      let g = groups.get(key); if (!g) groups.set(key, g = { tex: holder && holder.tex, additive: e.additive, v: [] });
      const t = p.age / p.life, c0 = lerp4(e.c0a, e.c0b, 0.5), cm = lerp4(e.cma, e.cmb, 0.5), c1 = lerp4(e.c1a, e.c1b, 0.5);
      const col = t < 0.5 ? lerp4(c0, cm, t * 2) : lerp4(cm, c1, (t - 0.5) * 2);
      const fade = Math.min(1, p.age / 0.06) * (t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1), size = p.s0 + (p.s1 - p.s0) * t, a = col[3] * fade;
      for (const [cx, cy] of C) g.v.push(p.x, p.y, p.z, cx, cy, col[0], col[1], col[2], a, size * 0.5, p.rot + t * 0.8);
    }
    return groups;
  }
}
