// Leitor streaming dos containers .bin do MUA. Roda no navegador (File/Blob) e no Node (fs.openAsBlob).
// Só o índice (tabela de entradas + nomes, poucos KB/MB) é lido na abertura; cada arquivo é lido, decifrado e
// descomprimido sob demanda via Blob.slice().

const MAGIC = 0xb19aca6e;
const FLAG_ZLIB = 0x01, FLAG_CRYPT = 0x10;

// LCG: seed = (seed*0x3fd+1) & 0x0fffffff ; dword ^= seed.  Seed inicial deriva do tamanho comprimido.
export function decrypt(bytes, compSize) {
  const s = (compSize + 0x55) & 0xffff;
  const sx = (s & 0x8000) ? (s | 0xffff0000) : s;
  let seed = (((sx << 16) | sx) ^ 0x3b9a1d9) & 0x0fffffff;
  const n = bytes.length >>> 2;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < n; i++) {
    seed = (Math.imul(seed, 0x3fd) + 1) & 0x0fffffff;
    dv.setUint32(i * 4, (dv.getUint32(i * 4, true) ^ seed) >>> 0, true);
  }
  return bytes;
}

async function inflate(bytes) {
  const ds = new DecompressionStream('deflate');
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer());
}

export class Archive {
  constructor(blob, name = '') { this.blob = blob; this.name = name; }

  static async open(blob, name) {
    const a = new Archive(blob, name);
    const h = new DataView(await blob.slice(0, 0x1c).arrayBuffer());
    if (h.getUint32(0, true) !== MAGIC) throw new Error(`${name}: magic inválido`);
    a.flags = h.getUint16(6, true);
    a.count = h.getUint32(8, true);
    const c1 = h.getUint32(12, true), c2 = h.getUint32(20, true);
    a.dataStart = 0x1c + c1 + c2;
    const ents = await a._block(0x1c, c1), names = await a._block(0x1c + c1, c2);
    const ev = new DataView(ents.buffer, ents.byteOffset, ents.byteLength);
    const td = new TextDecoder('latin1');
    a.entries = new Array(a.count);
    a.byName = new Map();
    for (let i = 0; i < a.count; i++) {
      const o = i * 40;
      const noff = ev.getUint32(o + 8, true);
      let e = noff; while (names[e]) e++;
      const ent = {
        name: td.decode(names.subarray(noff, e)),
        offset: Number(ev.getBigUint64(o + 16, true)) + a.dataStart,
        compSize: ev.getUint32(o + 24, true),
        size: Number(ev.getBigUint64(o + 32, true)),
      };
      a.entries[i] = ent; a.byName.set(ent.name, ent);
    }
    return a;
  }

  async _block(off, len) {
    let b = new Uint8Array(await this.blob.slice(off, off + len).arrayBuffer());
    if (this.flags & FLAG_CRYPT) decrypt(b, len);
    if (this.flags & FLAG_ZLIB) b = await inflate(b);
    return b;
  }

  has(name) { return this.byName.has(name); }
  list(prefix = '') { return this.entries.filter(e => e.name.startsWith(prefix)); }

  /** Lê UM arquivo (só os bytes dele). */
  async read(name) {
    const e = typeof name === 'string' ? this.byName.get(name) : name;
    if (!e) throw new Error(`${this.name}: ${name} não existe`);
    return this._block(e.offset, e.compSize);
  }
  async text(name) { return new TextDecoder('latin1').decode(await this.read(name)); }
}
