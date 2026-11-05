// Áudio: FSB5 (FMOD Studio) em modo MPEG -> extrai as amostras e usa o decoder MP3 do navegador (decodeAudioData).
// Arquivo: sounds/eng/<c1>/<c2>/<zona>_m.pak/<categoria>.<sub>.<nome>.fsb (os scripts usam "categoria/sub/nome").
const FREQ = [0, 8000, 11000, 11025, 16000, 22050, 24000, 32000, 44100, 48000];

/** FSB5 -> [{ name, freq, channels, samples, data:Uint8Array }]  (só modo 11 = MPEG; outros lançam erro) */
export function parseFSB5(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (String.fromCharCode(...u8.subarray(0, 4)) !== 'FSB5') throw new Error('não é FSB5');
  const ver = dv.getUint32(4, true), n = dv.getUint32(8, true), shs = dv.getUint32(12, true), nts = dv.getUint32(16, true), ds = dv.getUint32(20, true), mode = dv.getUint32(24, true);
  if (mode !== 11) throw new Error('codec FSB não suportado: ' + mode);
  const hdr = ver === 0 ? 64 : 60, dataStart = hdr + shs + nts, out = [];
  let p = hdr; const offs = [];
  for (let i = 0; i < n; i++) {
    const lo = dv.getUint32(p, true), hi = dv.getUint32(p + 4, true); p += 8;       // bits: next 1 | freq 4 | stereo 1 | offset 28 (x16) | samples 30
    let freq = FREQ[(lo >>> 1) & 15] || 44100, channels = ((lo >>> 5) & 1) + 1;
    const off = ((((lo >>> 6) | ((hi & 3) << 26)) & 0x0fffffff) >>> 0) * 16, samples = hi >>> 2;
    let next = lo & 1;
    while (next) { const c = dv.getUint32(p, true); p += 4; next = c & 1; const size = (c >>> 1) & 0xffffff, type = c >>> 25; if (type === 1 && size >= 1) channels = dv.getUint8(p); else if (type === 2 && size >= 4) freq = dv.getUint32(p, true); p += size; }
    offs.push(off); out.push({ name: '', freq, channels, samples, off });
  }
  const names = n && nts ? u8.subarray(hdr + shs, hdr + shs + nts) : null;
  out.forEach((s, i) => {
    const end = i + 1 < n ? offs[i + 1] : ds; s.data = u8.subarray(dataStart + s.off, dataStart + end); delete s.off;
    if (names && nts >= 4 * n) { let q = new DataView(names.buffer, names.byteOffset, names.byteLength).getUint32(i * 4, true), e = q; while (names[e]) e++; s.name = new TextDecoder().decode(names.subarray(q, e)); }
  });
  return out;
}

/** Decodifica MPEG-1 Layer II (MP2) com o decoder do jsmpeg (vendor/, MIT). J = objeto JSMpeg. */
export function decodeMP2(J, data, channels = 1) {
  const a = new J.Decoder.MP2Audio({ streaming: false, audioBufferSize: Math.max(1 << 16, data.length + 8192) });
  a.bits.write([data]); const L = [], R = []; let n = 0;
  while (a.decode()) { L.push(a.left.slice()); if (channels > 1) R.push(a.right.slice()); n += a.left.length; }
  return { n, rate: a.sampleRate || 44100, L, R };
}
let jsmpegP = null;
export function loadJsmpeg() {                                  // carrega vendor/jsmpeg.min.js uma vez (navegador)
  if (globalThis.JSMpeg) return Promise.resolve(globalThis.JSMpeg);
  return jsmpegP ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = new URL('../vendor/jsmpeg.min.js', import.meta.url); s.onload = () => res(globalThis.JSMpeg); s.onerror = rej; document.head.append(s); });
}

/** Sistema de arquivos de som: HandleFS (pasta do jogo via File System Access) ou HttpFS (servidor com listagem). */
export class HandleFS {
  constructor(root) { this.root = root; }
  async dir(parts) { let d = this.root; for (const p of parts) d = await d.getDirectoryHandle(p); return d; }
  async list(parts) { try { const d = await this.dir(parts), r = []; for await (const [n, h] of d.entries()) r.push([n, h.kind === 'directory']); return r; } catch { return []; } }
  async read(parts) { try { const d = await this.dir(parts.slice(0, -1)); return await (await (await d.getFileHandle(parts.at(-1))).getFile()).arrayBuffer(); } catch { return null; } }
}
export class HttpFS {
  constructor(base) { this.base = base.replace(/\/?$/, '/'); }
  async list(parts) {
    try {
      const r = await fetch(this.base + parts.map(encodeURIComponent).join('/') + '/'); if (!r.ok) return [];
      return [...(await r.text()).matchAll(/href="([^"?#]+?)"/g)].map(m => decodeURIComponent(m[1]).replace(/^.*\/(?=[^/]+\/?$)/, '')).filter(n => n && n !== '..' && n !== '../').map(n => n.endsWith('/') ? [n.slice(0, -1), true] : [n, false]);
    } catch { return []; }
  }
  async read(parts) { try { const r = await fetch(this.base + parts.map(encodeURIComponent).join('/')); return r.ok ? r.arrayBuffer() : null; } catch { return null; } }
}

export class AudioBank {
  /** fs: HandleFS|HttpFS apontando para a raiz do jogo (contendo "sounds/") */
  constructor(fs, { lang = 'eng' } = {}) { this.fs = fs; this.lang = lang; this.ctx = null; this.master = null; this.paks = null; this.pakFiles = new Map(); this.buffers = new Map(); this.zone = ''; this.volume = 0.7; this.played = 0; this.missing = new Set(); }
  /** AudioContext só depois de um gesto do usuário */
  unlock() { if (!this.ctx) { this.ctx = new (globalThis.AudioContext || globalThis.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination); } if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  /** zona atual ("act1/atlantis/atlantis1") ordena os pacotes candidatos por semelhança de nome */
  setZone(stem) { this.zone = stem.split('/').pop().toLowerCase(); }
  async _paks() {
    if (this.paks) return this.paks;
    const base = ['sounds', this.lang], out = [];
    for (const [a, isD] of await this.fs.list(base)) if (isD) for (const [b, isD2] of await this.fs.list([...base, a])) if (isD2) for (const [p, isD3] of await this.fs.list([...base, a, b])) if (isD3 && p.endsWith('.pak')) out.push({ name: p.toLowerCase(), path: [...base, a, b, p] });
    return this.paks = out;
  }
  _rank(paks) {
    const z = this.zone.replace(/\d+$/, ''), score = p => { const n = p.name.replace(/_m\.pak$/, ''); let s = 0; for (let i = 0; i < Math.min(n.length, z.length); i++) { if (n[i] === z[i]) s += 3 - Math.min(2, i); else break; } return s; };
    return [...paks].sort((a, b) => score(b) - score(a));
  }
  async _index(p) {
    let idx = this.pakFiles.get(p.name);
    if (!idx) { idx = new Map((await this.fs.list(p.path)).map(([n]) => [n.toLowerCase(), n])); this.pakFiles.set(p.name, idx); }
    return idx;
  }
  async _find(file) {                                         // file em minúsculas ("common.game.pickup_item.fsb") -> ArrayBuffer
    const paks = this._rank(await this._paks());
    for (let i = 0; i < paks.length; i += i < 8 ? 1 : 12) {   // pacote da zona primeiro; depois varre os outros em lotes paralelos
      const batch = paks.slice(i, i + (i < 8 ? 1 : 12)), idxs = await Promise.all(batch.map(p => this._index(p)));
      for (let k = 0; k < batch.length; k++) { const real = idxs[k].get(file); if (real) return this.fs.read([...batch[k].path, real]); }
    }
    return null;
  }
  /** carrega e decodifica ("common/game/pickup_item"); devolve [AudioBuffer] (uma por amostra do banco) ou null */
  async load(path) {
    const key = path.toLowerCase().replace(/\\/g, '/'); if (this.buffers.has(key)) return this.buffers.get(key);
    if (this.missing.has(key)) return null;
    const p = (async () => {
      const raw = await this._find(key.replace(/\//g, '.') + '.fsb'); if (!raw) return null;
      const ctx = this.unlock(), J = await loadJsmpeg(), out = [];
      for (const s of parseFSB5(raw)) {
        try {
          const d = decodeMP2(J, s.data, s.channels); if (!d.n) continue;
          const buf = ctx.createBuffer(Math.min(2, s.channels), d.n, d.rate); const chans = [d.L, d.R];
          for (let c = 0; c < buf.numberOfChannels; c++) { const dst = buf.getChannelData(c); let o = 0; for (const fr of chans[c]) { dst.set(fr, o); o += fr.length; } }
          out.push(buf);
        } catch { /* amostra inválida */ }
      }
      return out.length ? out : null;
    })();
    this.buffers.set(key, p); const r = await p; if (!r) { this.missing.add(key); this.buffers.delete(key); } return r;
  }
  async play(path, { volume = 1, loop = false } = {}) {
    const bufs = await this.load(path); if (!bufs) return null;
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain(); src.buffer = bufs[Math.floor(Math.random() * bufs.length)]; src.loop = loop; g.gain.value = volume;
    src.connect(g); g.connect(this.master); src.start(); this.played++; return src;
  }
}

/** Sistema de arquivos sobre FileList (input webkitdirectory): caminhos relativos à pasta escolhida. */
export class FileListFS {
  constructor(files) {
    this.files = new Map(); this.dirs = new Map();
    for (const f of files) {
      const parts = (f.webkitRelativePath || f.name).split('/').slice(1); if (parts[0] !== 'sounds') continue;
      this.files.set(parts.join('/'), f);
      for (let i = 0; i < parts.length; i++) { const d = parts.slice(0, i).join('/'); (this.dirs.get(d) || this.dirs.set(d, new Map()).get(d)).set(parts[i], i < parts.length - 1); }
    }
  }
  async list(parts) { return [...(this.dirs.get(parts.join('/')) || new Map())]; }
  async read(parts) { const f = this.files.get(parts.join('/')); return f ? f.arrayBuffer() : null; }
}
