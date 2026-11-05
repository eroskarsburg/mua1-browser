// Parser de IGB (Intrinsic Alchemy, MUA PC). Port de tools/igb.py.
// Layout: header[6 pares] | strings | tipos de metacampo | tipos de memória | meta-objetos | pools |
//         diretório | tabela F (slot->diretório) | objetos | blobs de memória.
const td = new TextDecoder('latin1');
const cstr = (u8, p, n) => { let e = p; const end = p + n; while (e < end && u8[e]) e++; return td.decode(u8.subarray(p, e)); };

export class IGB {
  constructor(u8) {
    this.u8 = u8;
    const dv = this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const U = o => dv.getUint32(o, true), I = o => dv.getInt32(o, true);
    const pairs = this.pairs = Array.from({ length: 6 }, (_, i) => [U(i * 8), U(i * 8 + 4)]);

    // tabela de strings (nomes de ossos/animações/arquivos): n x (u32 len, bytes)
    this.strings = [];
    for (let i = 0, q = 0x38, n = U(0x34); i < n; i++) { const len = U(q); this.strings.push(cstr(u8, q + 4, len)); q += 4 + len; }

    // tipos de metacampo (52 nomes, mesmos em todos os arquivos)
    let p = 0x30 + U(0x30);
    const [tsz, tcnt] = pairs[4];
    this.types = [];
    for (let i = 0, q = p + 12 * tcnt; i < tcnt; i++) { const n = U(p + 12 * i); this.types.push(cstr(u8, q, n).slice(2, -9)); q += n; }
    p += tsz;
    p += U(p);                                   // tipos de memória

    // meta-objetos: esquema de cada classe (campos = [tipo, slot, bytes])
    const [msz, mcnt] = pairs[1];
    this.meta = [];
    for (let i = 0, q = p + 24 * mcnt; i < mcnt; i++) {
      const ln = I(p + 24 * i), nf = I(p + 24 * i + 12), parent = I(p + 24 * i + 16);
      const name = cstr(u8, q, ln); q += ln;
      const fields = [];
      for (let f = 0; f < nf; f++, q += 6) fields.push([dv.getUint16(q, true), dv.getUint16(q + 2, true), dv.getUint16(q + 4, true)]);
      this.meta.push({ name, parent, fields });
    }
    p += msz;

    // pools de memória (ignorados)
    p += 16 + U(p + 12);
    p += U(p);

    // diretório: entradas tipo 3 (objeto: [classe,nome]) e tipo 4 (memória: [tamanho,...,pool])
    this.dir = [];
    const dend = p + pairs[0][0];
    for (let c = 0; c < pairs[0][1]; c++) {
      const a = U(p), sz = U(p + 4), n = (sz - 12) >> 2, v = [];
      for (let i = 0; i < n; i++) v.push(I(p + 12 + 4 * i));
      this.dir.push([a, v]); p += sz;
    }
    // tabela F: slot global -> índice no diretório
    const fcnt = U(p + 4);
    this.F = Array.from({ length: fcnt }, (_, i) => dv.getUint16(p + 8 + 2 * i, true));

    // objetos e blobs
    const [osz, ocnt] = pairs[2], bsz = pairs[3][0];
    this.pBlob = u8.length - bsz;
    this.objects = [];
    for (let q = this.pBlob - osz; q < this.pBlob;) {
      const cls = U(q), sz = U(q + 4);
      this.objects.push({ cls, name: this.meta[cls].name, off: q + 8, size: sz - 8 });
      q += sz;
    }
    if (this.objects.length !== ocnt) throw new Error('igb: contagem de objetos');
    for (const o of this.objects) this._decode(o);

    // blobs: ordenados pelo slot, tamanho vem do diretório, alinhados a 4 bytes
    const refs = new Set();
    for (const o of this.objects) for (const f of o.v) if (f.t === 'MemoryRef' && f.v >= 0) refs.add(f.v);
    this.memrefs = new Map();
    let off = 0;
    for (const r of [...refs].sort((a, b) => a - b)) {
      const size = this.dir[this.F[r]][1][0];
      this.memrefs.set(r, [off, size]); off += (size + 3) & ~3;
    }
    // slots de objetos: os de diretório tipo 3, em ordem de fluxo
    this.slot2obj = new Map();
    let k = 0;
    for (let r = 0; r < this.F.length; r++) if (this.dir[this.F[r]][0] === 3) { const o = this.objects[k++]; o.slot = r; this.slot2obj.set(r, o); }
  }

  _decode(o) {
    const { dv } = this; let p = o.off; o.v = [];
    for (const [t, , sz] of this.meta[o.cls].fields) {
      const tn = this.types[t], n = Math.max(4, sz); let v;
      if (tn === 'Float') v = dv.getFloat32(p, true);
      else if (tn === 'Vec2f' || tn === 'Vec3f' || tn === 'Vec4f' || tn === 'Matrix44f') v = new Float32Array(n >> 2).map((_, i) => dv.getFloat32(p + 4 * i, true));
      else if (sz === 8) v = Number(dv.getBigInt64(p, true));
      else if (n === 4) v = dv.getInt32(p, true);
      else v = null;
      o.v.push({ t: tn, v }); p += n;
    }
  }

  obj(r) { return r >= 0 ? this.slot2obj.get(r) || null : null; }
  mem(r) {
    if (r < 0) return new Uint8Array(0);
    const [o, n] = this.memrefs.get(r); return this.u8.subarray(this.pBlob + o, this.pBlob + o + n);
  }
  /** Valor do campo i do objeto. */
  f(o, i) { return o.v[i].v; }
  /** Elementos (slots->objetos) de uma lista de objetos (igNodeList, igAttrList...). */
  list(o) {
    if (!o) return [];
    const n = o.v[0].v; if (n <= 0) return [];
    const b = this.mem(o.v[2].v), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return Array.from({ length: n }, (_, i) => this.obj(dv.getInt32(4 * i, true)));
  }
  /** Lista de dados (igVec3fList...): Float32Array. */
  floats(o) {
    const b = this.mem(o.v[2].v);
    return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + (b.byteLength & ~3)));
  }
  byName(name) { return this.objects.filter(o => o.name === name); }
}
