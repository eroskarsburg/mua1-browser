// Esqueleto, animações (Enbaya) e pose -> paleta de matrizes de skinning.
// Convenção do jogo: matrizes row-major, vetor-linha; a mesma memória lida como column-major do GL
// compõe com a ordem invertida, então mundo = mul(mundoPai, local) e paleta = mul(mundo, inverseBind).
import { decodeEnbaya } from './enbaya.js';
import { mul, IDENT } from './scene.js';

const f32 = (b, n) => new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + n * 4));

/** igSkeleton -> ossos {name,parent,blend}, inverseBind (16 floats por blend index), translação local (3 por osso) */
export function readSkeleton(g, sk) {
  const bones = g.list(g.obj(sk.v[2].v)).map(b => ({ name: g.strings[b.v[0].v], parent: b.v[1].v, blend: b.v[2].v }));
  const nb = bones.length, nblend = Math.max(-1, ...bones.map(b => b.blend)) + 1;
  const inv = f32(g.mem(sk.v[3].v), nblend * 16);
  const loc = f32(g.mem(sk.v[1].v), nb * 3).map(x => Math.abs(x) > 1e5 ? 0 : x);   // 0xCDCDCDCD = sem dado
  const blend2bone = new Int32Array(nblend).fill(-1);
  bones.forEach((b, i) => { if (b.blend >= 0) blend2bone[b.blend] = i; });
  return { bones, inv, loc, nblend, blend2bone };
}

/** animações de um arquivo de ator: [{name, dur, fps, chanOf(Map nome-do-osso -> canal), source(lazy)}] */
export function readAnimations(g) {
  const out = [];
  for (const an of g.byName('igAnimation')) {
    const binds = g.list(g.obj(an.v[2].v)), tracks = g.list(g.obj(an.v[3].v));
    if (!binds.length || !tracks.length) continue;
    const bind = binds[0], skel = g.obj(bind.v[0].v); if (!skel) continue;
    const abones = g.list(g.obj(skel.v[2].v)).map(b => g.strings[b.v[0].v]);
    const bm = g.mem(bind.v[1].v), bmap = new Int32Array(bm.buffer.slice(bm.byteOffset, bm.byteOffset + (bm.byteLength & ~3)));
    const chanOf = new Map();
    abones.forEach((nm, j) => { if (j < bmap.length && bmap[j] >= 0) chanOf.set(nm, bmap[j]); });
    const ts = g.obj(tracks[0].v[1].v), srcObj = ts && g.obj(ts.v[1].v); if (!srcObj) continue;
    let clip = null;
    out.push({ name: g.strings[an.v[0].v], dur: an.v[7].v / 1e9, chanOf, get clip() { return clip ||= decodeEnbaya(g.mem(srcObj.v[0].v)); } });
  }
  return out;
}

function quatToMat(out, o, x, y, z, w) {          // row-major, vetor-linha == R padrão (ver tools/pose.py)
  out[o] = 1 - 2 * (y * y + z * z); out[o + 1] = 2 * (x * y - z * w); out[o + 2] = 2 * (x * z + y * w);
  out[o + 4] = 2 * (x * y + z * w); out[o + 5] = 1 - 2 * (x * x + z * z); out[o + 6] = 2 * (y * z - x * w);
  out[o + 8] = 2 * (x * z - y * w); out[o + 9] = 2 * (y * z + x * w); out[o + 10] = 1 - 2 * (x * x + y * y);
  out[o + 3] = out[o + 7] = out[o + 11] = 0; out[o + 15] = 1;
}

/** Instância de pose: casa os ossos da malha com os canais da animação por nome. */
export class Pose {
  constructor(skel) {
    this.skel = skel; const nb = skel.bones.length;
    this.local = new Float32Array(nb * 16); this.world = Array.from({ length: nb }, () => IDENT);
    this.palette = new Float32Array(Math.max(1, skel.nblend) * 16);
    this.anim = null; this.chan = null; this.lockRoot = false;        // lockRoot: o movimento horizontal vem do jogo, não da animação
  }
  /** Troca o clipe; com blend, faz crossfade a partir do clipe atual (BLEND s). */
  setAnimation(anim, blend = true) {
    if (blend && this.anim && anim && anim !== this.anim) this.prev = { anim: this.anim, chan: this.chan, t: this.lastT || 0 }, this.blendT = 0;
    else this.prev = null;
    this.anim = anim; this.chan = this.skel.bones.map(b => anim ? (anim.chanOf.get(b.name) ?? -1) : -1); this.lastT = 0;
  }
  /** amostra um canal de um clipe em t -> out = [qx,qy,qz,qw, tx,ty,tz] (t = null se o canal não tem translação) */
  _sample(anim, c, t, loop, out) {
    const clip = anim.clip, stride = clip.nch * 7, tt = loop && anim.dur > 0 ? t % anim.dur : Math.min(t, anim.dur);
    const f = clip.fps ? tt * clip.fps : 0, f0 = Math.min(Math.floor(f), clip.nf - 1), f1 = Math.min(f0 + 1, clip.nf - 1), k = f - f0, d = clip.data;
    const p0 = f0 * stride + c * 7, p1 = f1 * stride + c * 7;
    const dot = d[p0] * d[p1] + d[p0 + 1] * d[p1 + 1] + d[p0 + 2] * d[p1 + 2] + d[p0 + 3] * d[p1 + 3], s = dot < 0 ? -1 : 1;
    const x = d[p0] + (s * d[p1] - d[p0]) * k, y = d[p0 + 1] + (s * d[p1 + 1] - d[p0 + 1]) * k, z = d[p0 + 2] + (s * d[p1 + 2] - d[p0 + 2]) * k, w = d[p0 + 3] + (s * d[p1 + 3] - d[p0 + 3]) * k;
    const n = Math.hypot(x, y, z, w) || 1; out[0] = x / n; out[1] = y / n; out[2] = z / n; out[3] = w / n;
    const ax = d[p0 + 4] + (d[p1 + 4] - d[p0 + 4]) * k, ay = d[p0 + 5] + (d[p1 + 5] - d[p0 + 5]) * k, az = d[p0 + 6] + (d[p1 + 6] - d[p0 + 6]) * k;
    if (Math.abs(ax) + Math.abs(ay) + Math.abs(az) > 1e-9) { out[4] = ax; out[5] = ay; out[6] = az; return true; }
    return false;                                              // sem canal de translação: usa a do esqueleto
  }
  /** Movimento de raiz do jogo: o canal "Motion" guarda o deslocamento ACUMULADO (x = frente, y = esquerda) em unidades; [x,y,z] em t, ou null. */
  motionAt(anim, t) {
    const c = anim && anim.chanOf.get('Motion'); if (c === undefined || c < 0 || !anim.clip.nf) return null;
    const A = [0, 0, 0, 0, 0, 0, 0]; if (!this._sample(anim, c, Math.min(Math.max(0, t), (anim.clip.nf - 2) / (anim.clip.fps || 1)), false, A)) return [0, 0, 0];
    return [A[4], A[5], A[6]];
  }
  /** Velocidade de solo (u/s) de um clipe de locomoção = inclinação do canal Motion (o último quadro reinicia o ciclo e é ignorado). */
  motionSpeed(anim) {
    if (!anim || !anim.chanOf.has('Motion') || !anim.clip.nf || anim.clip.nf < 3) return 0;
    const t1 = (anim.clip.nf - 2) / anim.clip.fps, a = this.motionAt(anim, 0), b = this.motionAt(anim, t1);
    return Math.hypot(b[0] - a[0], b[1] - a[1]) / t1;
  }
  /** Deslocamento da raiz (Bip01) em um ciclo completo do clipe, em unidades do jogo; 0 se o clipe não anda. Usado p/ casar velocidade com a passada. */
  rootTravel(anim) {
    const c = anim && anim.chanOf.get('Bip01'); if (c === undefined || c < 0 || !anim.clip.nf || anim.clip.nf < 2) return 0;
    const A = [0, 0, 0, 0, 0, 0, 0], B = [0, 0, 0, 0, 0, 0, 0], last = (anim.clip.nf - 1) / (anim.clip.fps || 1);
    if (!this._sample(anim, c, 0, false, A) || !this._sample(anim, c, last, false, B)) return 0;
    return Math.hypot(B[4] - A[4], B[5] - A[5]);          // horizontal: eixos X/Y locais do esqueleto
  }
  /** t em segundos (com loop). Preenche this.palette. */
  update(t, loop = true) {
    const { skel, local, anim } = this, nb = skel.bones.length, BLEND = 0.18;
    const dt = Math.max(0, t - (this.lastT || 0)); this.lastT = t;
    let w = 1;
    if (this.prev) { this.prev.t += dt; this.blendT += dt; w = Math.min(1, this.blendT / BLEND); w = w * w * (3 - 2 * w); if (this.blendT >= BLEND) this.prev = null; }
    const clip = anim && anim.clip, A = [0, 0, 0, 1, 0, 0, 0], B = [0, 0, 0, 1, 0, 0, 0];
    for (let i = 0; i < nb; i++) {
      const c = this.chan ? this.chan[i] : -1, o = i * 16, bone = skel.bones[i];
      let q = [0, 0, 0, 1], tx = skel.loc[i * 3], ty = skel.loc[i * 3 + 1], tz = skel.loc[i * 3 + 2];
      let ax = tx, ay = ty, az = tz, aq = [0, 0, 0, 1];
      if (clip && c >= 0) { const tr = this._sample(anim, c, t, loop, A); aq = [A[0], A[1], A[2], A[3]]; if (tr) { ax = A[4]; ay = A[5]; az = A[6]; } }
      if (this.lockRoot && bone.name === 'Bip01') { ax = skel.loc[i * 3]; ay = skel.loc[i * 3 + 1]; }
      q = aq; tx = ax; ty = ay; tz = az;
      if (this.prev && this.prev.anim.clip) {                // crossfade com o clipe anterior
        const pc = this.prev.chan[i]; let pq = [0, 0, 0, 1], px = skel.loc[i * 3], py = skel.loc[i * 3 + 1], pz = skel.loc[i * 3 + 2];
        if (pc >= 0) { const tr = this._sample(this.prev.anim, pc, this.prev.t, true, B); pq = [B[0], B[1], B[2], B[3]]; if (tr) { px = B[4]; py = B[5]; pz = B[6]; } }
        if (this.lockRoot && bone.name === 'Bip01') { px = skel.loc[i * 3]; py = skel.loc[i * 3 + 1]; }
        const s = (pq[0] * q[0] + pq[1] * q[1] + pq[2] * q[2] + pq[3] * q[3]) < 0 ? -1 : 1;
        const x = pq[0] + (s * q[0] - pq[0]) * w, y = pq[1] + (s * q[1] - pq[1]) * w, z = pq[2] + (s * q[2] - pq[2]) * w, ww = pq[3] + (s * q[3] - pq[3]) * w, n = Math.hypot(x, y, z, ww) || 1;
        q = [x / n, y / n, z / n, ww / n]; tx = px + (tx - px) * w; ty = py + (ty - py) * w; tz = pz + (tz - pz) * w;
      }
      quatToMat(local, o, q[0], q[1], q[2], q[3]);
      local[o + 12] = tx; local[o + 13] = ty; local[o + 14] = tz;
    }
    const done = new Uint8Array(nb);
    const build = i => {
      if (done[i]) return this.world[i]; done[i] = 1;
      const m = local.subarray(i * 16, i * 16 + 16), p = skel.bones[i].parent;
      return this.world[i] = (p >= 0 && p < nb && p !== i) ? mul(build(p), m) : Float32Array.from(m);
    };
    for (let i = 0; i < nb; i++) build(i);
    for (let j = 0; j < skel.nblend; j++) {
      const b = skel.blend2bone[j]; if (b < 0) { this.palette.set(IDENT, j * 16); continue; }
      this.palette.set(mul(this.world[b], skel.inv.subarray(j * 16, j * 16 + 16)), j * 16);
    }
    return this.palette;
  }
}
