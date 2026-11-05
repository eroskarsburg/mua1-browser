// Decodificador DXT1/DXT5 -> RGBA8 (fallback quando a GPU não tem S3TC, e preview).
const c565 = c => [((c >> 11) & 31) * 255 / 31 | 0, ((c >> 5) & 63) * 255 / 63 | 0, (c & 31) * 255 / 31 | 0];
export function decodeDXT(src, w, h, fmt) {
  const bs = fmt === 'dxt1' ? 8 : 16, bx = Math.max(1, (w + 3) >> 2), by = Math.max(1, (h + 3) >> 2);
  const out = new Uint8Array(w * h * 4), dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
  const pal = new Uint8Array(16), al = new Uint8Array(8);
  for (let by_ = 0; by_ < by; by_++) for (let bx_ = 0; bx_ < bx; bx_++) {
    const o = (by_ * bx + bx_) * bs, co = fmt === 'dxt5' ? o + 8 : o;
    const k0 = dv.getUint16(co, true), k1 = dv.getUint16(co + 2, true), a = c565(k0), b = c565(k1);
    const four = k0 > k1 || fmt !== 'dxt1';
    for (let i = 0; i < 3; i++) {
      pal[i] = a[i]; pal[4 + i] = b[i];
      pal[8 + i] = four ? (2 * a[i] + b[i]) / 3 | 0 : (a[i] + b[i]) >> 1;
      pal[12 + i] = four ? (a[i] + 2 * b[i]) / 3 | 0 : 0;
    }
    pal[3] = pal[7] = pal[11] = 255; pal[15] = four ? 255 : 0;
    if (fmt === 'dxt5') {
      const a0 = src[o], a1 = src[o + 1]; al[0] = a0; al[1] = a1;
      if (a0 > a1) for (let i = 1; i < 7; i++) al[i + 1] = ((7 - i) * a0 + i * a1) / 7 | 0;
      else { for (let i = 1; i < 5; i++) al[i + 1] = ((5 - i) * a0 + i * a1) / 5 | 0; al[6] = 0; al[7] = 255; }
    }
    const bits = dv.getUint32(co + 4, true);
    let abits = 0n; if (fmt === 'dxt5') for (let i = 0; i < 6; i++) abits |= BigInt(src[o + 2 + i]) << BigInt(8 * i);
    for (let p = 0; p < 16; p++) {
      const x = bx_ * 4 + (p & 3), y = by_ * 4 + (p >> 2); if (x >= w || y >= h) continue;
      const ci = ((bits >>> (2 * p)) & 3) * 4, d = (y * w + x) * 4;
      out[d] = pal[ci]; out[d + 1] = pal[ci + 1]; out[d + 2] = pal[ci + 2];
      out[d + 3] = fmt === 'dxt5' ? al[Number((abits >> BigInt(3 * p)) & 7n)] : pal[ci + 3];
    }
  }
  return out;
}
