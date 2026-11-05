// Blob-like sobre HTTP Range: permite usar Archive com arquivos servidos (dev local ou hospedagem própria do usuário).
export class RemoteBlob {
  constructor(url) { this.url = url; }
  slice(a, b) { const url = this.url; return { arrayBuffer: async () => {
    const r = await fetch(url, { headers: { Range: `bytes=${a}-${b - 1}` } });
    if (!r.ok && r.status !== 206) throw new Error(`${url}: HTTP ${r.status}`);
    return r.arrayBuffer(); } }; }
}
