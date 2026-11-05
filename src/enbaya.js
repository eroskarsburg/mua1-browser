// Decoder do codec de animação Enbaya (igEnbayaAnimationSource), obtido por engenharia reversa do Marvel.exe.
// Blob: hdr(80) | S1.D | S2.E | S3.D | S1.C | S2.D | S3.C | S1.A | S1.B | S2.A | S2.B | S2.C | S3.A | S3.B | máscaras
//  S1 = frame inicial (A: códigos 2b, B: i8, C: i16, D: i32)
//  S2 = deltas por frame (A: 2b, B: nibbles, C: bytes, D: i16, E: i32), acumulados como velocidade (x h)
//  S3 = run-length de eventos que alternam bits da máscara (canal*7+comp) entre frames
// Cada canal tem 7 componentes: quaternion (x,y,z,w) + translação (x,y,z).
const NIB = [0, 8, 2, 3, 4, 5, 6, 7, -8, -7, -6, -5, -4, -3, -2, -9];
const C2 = [0, 1, 0, -1];
const ORDER = [['S1D', 3], ['S2E', 8], ['S3D', 12], ['S1C', 2], ['S2D', 7], ['S3C', 11], ['S1A', 0], ['S1B', 1],
  ['S2A', 4], ['S2B', 5], ['S2C', 6], ['S3A', 9], ['S3B', 10], ['MSK', 13]];

class Bits {                                          // campos de w bits, bits altos primeiro
  constructor(b, w) { this.b = b; this.w = w; this.per = 8 / w; this.i = 0; this.n = 0; }
  read() {
    if (this.n === this.per) { this.i++; this.n = 0; }
    const v = (this.b[this.i] >> (8 - this.w * (this.n + 1))) & ((1 << this.w) - 1); this.n++; return v;
  }
}
class Rd {
  constructor(b) { this.b = b; this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength); this.i = 0; }
  u8() { return this.b[this.i++]; }
  s8() { const v = this.b[this.i++]; return v > 127 ? v - 256 : v; }
  s16() { const v = this.dv.getInt16(this.i, true); this.i += 2; return v; }
  u16() { const v = this.dv.getUint16(this.i, true); this.i += 2; return v; }
  s32() { const v = this.dv.getInt32(this.i, true); this.i += 4; return v; }
  u32() { const v = this.dv.getUint32(this.i, true); this.i += 4; return v; }
}

/** -> { nch, fps, dur, nf, data: Float32Array(nf*nch*7) }   (frame-major) */
export function decodeEnbaya(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const nch = dv.getUint32(4, true), h = dv.getFloat32(8, true), dur = dv.getFloat32(12, true), fps = dv.getUint32(16, true);
  const T = Array.from({ length: 15 }, (_, i) => dv.getUint32(0x14 + 4 * i, true));
  const sec = {}; let p = T[14];
  for (const [name, k] of ORDER) { sec[name] = b.subarray(p, p + T[k]); p += T[k]; }
  const mask = Uint8Array.from(sec.MSK);

  // frame 0
  const a = new Bits(sec.S1A, 2), p8 = new Rd(sec.S1B), p16 = new Rd(sec.S1C), p32 = new Rd(sec.S1D);
  const cur = new Float32Array(nch * 7);
  for (let ch = 0; ch < nch; ch++) {
    const o = ch * 7; let n = 0;
    for (let c = 0; c < 7; c++) {
      const code = a.read();
      const v = code === 0 ? 0 : code === 1 ? p8.s8() : code === 2 ? p16.s16() : p32.s32();
      cur[o + c] = v * h; if (c < 4) n += cur[o + c] * cur[o + c];
    }
    n = Math.sqrt(n) || 1; for (let c = 0; c < 4; c++) cur[o + c] /= n;
  }
  // deltas
  const A = new Bits(sec.S2A, 2), B = new Bits(sec.S2B, 4), C = new Rd(sec.S2C), D = new Rd(sec.S2D), E = new Rd(sec.S2E);
  const delta = () => {
    const c = A.read(); if (c !== 2) return C2[c];
    const n = B.read(); if (n) return NIB[n];
    const x = C.s8();
    if (x) return (x >= 1 && x <= 8) ? x + 127 : (x >= -8 && x <= -1) ? x - 128 : x;
    const w = D.s16(); return w || E.s32();
  };
  // S3
  const S3a = new Bits(sec.S3A, 2), S3b = new Rd(sec.S3B), S3c = new Rd(sec.S3C), S3d = new Rd(sec.S3D);
  const s3read = () => { const c = S3a.read(); return c === 0 ? 0 : c === 1 ? S3b.u8() : c === 2 ? S3c.u16() : S3d.u32(); };
  let cnt = s3read();
  const apply = () => {
    let pos = 0; const total = nch * 7;
    while (pos < total) {
      if (cnt === 0) { mask[(pos / 7) | 0] ^= 1 << (pos % 7); cnt = s3read(); pos++; }
      else { const k = Math.min(cnt, total - pos); cnt -= k; pos += k; }
    }
  };
  const nf = (fps ? Math.max(1, Math.ceil(dur * fps - 1e-4)) : 1) + 1;
  const data = new Float32Array(nf * nch * 7); data.set(cur, 0);
  const acc = new Float32Array(nch * 7);
  for (let f = 1; f < nf; f++) {
    if (f > 1) apply();
    for (let ch = 0; ch < nch; ch++) {
      const o = ch * 7;
      for (let c = 0; c < 7; c++) if ((mask[ch] >> c) & 1) acc[o + c] += delta();
      let n = 0;
      for (let c = 0; c < 7; c++) { cur[o + c] += h * acc[o + c]; if (c < 4) n += cur[o + c] * cur[o + c]; }
      n = Math.sqrt(n) || 1; for (let c = 0; c < 4; c++) cur[o + c] /= n;
    }
    data.set(cur, f * nch * 7);
  }
  return { nch, fps, dur, nf, data };
}
