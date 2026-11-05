"""Parser estrutural de IGB (Alchemy, MUA PC)."""
import struct, re
TYPES = ['UnsignedChar','ObjectRef','Char','Struct','ObjectRefArray','CharArray','Int','IntArray','SizeType','RawRef','Short','String','UnsignedInt','Bool','MemoryRef','MemoryDescriptor','Float','Long','Enum','IGBMetaInfoStruct']

class IGB:
    def __init__(s, d):
        s.d = d
        s.pairs = [struct.unpack_from('<II', d, i*8) for i in range(6)]
        s._strings(); s._types(); s._pooltypes(); s._meta(); s._pools(); s._dir(); s._objects(); s._blobs()

    def _strings(s):
        d = s.d; size, cnt = struct.unpack_from('<II', d, 0x30)
        p = 0x38; s.strings = []
        for _ in range(cnt):
            n = struct.unpack_from('<I', d, p)[0]; s.strings.append(d[p+4:p+4+n].rstrip(b'\0').decode('latin1')); p += 4+n
        s.p_types = 0x30 + size

    def _types(s):
        d = s.d; size, cnt = s.pairs[4]; p = s.p_types
        lens = [struct.unpack_from('<I', d, p+12*i)[0] for i in range(cnt)]
        q = p + 12*cnt; s.types = []
        for n in lens: s.types.append(d[q:q+n].rstrip(b'\0').decode('latin1')); q += n
        s.p_pool = p + size

    def _pooltypes(s):
        size = struct.unpack_from('<I', s.d, s.p_pool)[0]; s.p_meta = s.p_pool + size

    def _meta(s):
        d = s.d; size, cnt = s.pairs[1]; p = s.p_meta
        recs = [struct.unpack_from('<6i', d, p+24*i) for i in range(cnt)]
        q = p + 24*cnt; s.meta = []
        for ln, _, _, nf, par, z in recs:
            name = d[q:q+ln].split(bytes(1))[0].decode('latin1'); q += ln
            fields = []
            for _ in range(nf):
                t, slot, sz = struct.unpack_from('<3H', d, q); q += 6
                fields.append((t, slot, sz))
            s.meta.append(dict(name=name, parent=par, fields=fields))
        assert q == p + size, (hex(q), hex(p+size))
        s.p_poolnames = p + size

    def _pools(s):
        d = s.d; p = s.p_poolnames
        a, b, c, n = struct.unpack_from('<4I', d, p); p += 16 + n
        sz, cnt = struct.unpack_from('<II', d, p)
        s.pools = d[p+8:p+sz].split(b'\0')[:cnt]
        s.p_dir = p + sz

    def _dir(s):
        d = s.d; size, cnt = s.pairs[0]; p = s.p_dir; s.dir = []
        for _ in range(cnt):
            a, sz, c = struct.unpack_from('<III', d, p)
            s.dir.append((a, struct.unpack_from('<%di' % ((sz-12)//4), d, p+12))); p += sz
        assert p == s.p_dir + size, (hex(p), hex(s.p_dir+size))
        s.p_ref = p

    def _objects(s):
        d = s.d; osz, ocnt = s.pairs[2]; bsz, bcnt = s.pairs[3]
        s.p_blob = len(d) - bsz; s.p_obj = s.p_blob - osz
        fsz, fcnt = struct.unpack_from('<II', d, s.p_ref)
        s.F = list(struct.unpack_from('<%dH' % fcnt, d, s.p_ref + 8))
        # tabela de refs entre dir e objetos
        s.refhdr = (s.p_ref, s.p_obj - s.p_ref)
        s.objects = []; p = s.p_obj
        while p < s.p_blob:
            idx, sz = struct.unpack_from('<II', d, p)
            s.objects.append(dict(cls=idx, name=s.meta[idx]['name'], off=p, size=sz, raw=d[p+8:p+sz])); p += sz
        assert p == s.p_blob and len(s.objects) == ocnt, (len(s.objects), ocnt)

    def _blobs(s):
        s.blob = s.d[s.p_blob:]
        for o in s.objects: o['v'] = s.decode(o)
        refs = sorted({v for o in s.objects for (t, nm, v) in o['v'] if t == 'MemoryRef' and v >= 0})
        s.memrefs = {}; off = 0
        for r in refs:
            size = s.dir[s.F[r]][1][0]
            s.memrefs[r] = (off, size); off += (size + 3) & ~3
        assert off == len(s.blob), (off, len(s.blob))
        # slots globais: objetos ocupam, em ordem, os slots cujo dir e do tipo 3 (classe)
        objslots = [r for r in range(len(s.F)) if s.dir[s.F[r]][0] == 3]
        assert len(objslots) == len(s.objects), (len(objslots), len(s.objects))
        s.slot2obj = {}
        for r, o in zip(objslots, s.objects):
            o['slot'] = r; s.slot2obj[r] = o
            assert s.dir[s.F[r]][1][0] == o['cls'], ('class mismatch', o['name'])

    def obj(s, r):
        return s.slot2obj.get(r) if r >= 0 else None

    def mem(s, r):
        """bytes do blob referenciado por MemoryRef r."""
        if r < 0: return b''
        o, n = s.memrefs[r]; return s.blob[o:o+n]

    def decode(s, ob):
        """[(tipo, classe, valor)] com os campos da classe mais derivada."""
        raw = ob['raw']; p = 0; out = []
        for t, slot, sz in s.meta[ob['cls']]['fields']:
            tn = s.types[t][2:-9] if t < len(s.types) else '?'   # igXxxMetaField -> Xxx
            n = max(4, sz)
            chunk = raw[p:p+n]; p += n
            if tn in ('Float',): v = struct.unpack('<f', chunk[:4])[0]
            elif tn == 'Vec3f': v = struct.unpack('<3f', chunk)
            elif tn == 'Vec4f': v = struct.unpack('<4f', chunk)
            elif tn == 'Vec2f': v = struct.unpack('<2f', chunk)
            elif tn == 'Matrix44f': v = struct.unpack('<16f', chunk)
            elif sz == 8: v = struct.unpack('<q', chunk)[0]
            elif n == 4: v = struct.unpack('<i', chunk)[0]
            else: v = chunk
            out.append((tn, ob['name'], v))
        assert p == len(raw), (ob['name'], p, len(raw), [(s.types[f[0]], f[2]) for f in s.meta[ob['cls']]['fields']])
        return out

    def fields(s, ob):
        """Campos da classe incluindo herdados (ordem do fluxo: ancestrais primeiro)."""
        chain = []; c = ob['cls']
        while c != -1: chain.append(c); c = s.meta[c]['parent']
        out = []
        for c in reversed(chain): out += [(s.meta[c]['name'], f) for f in s.meta[c]['fields']]
        return out

if __name__ == '__main__':
    import sys
    g = IGB(open(sys.argv[1], 'rb').read())
    print('pools', len(g.pools), 'dir', len(g.dir), 'objs', len(g.objects), 'blob', len(g.blob), 'refhdr', hex(g.refhdr[0]), g.refhdr[1])
    for o in g.objects[:6]: print(o['name'], o['size'], [x[1][0] for x in g.fields(o)][:30])


def _list(s, o):
    if not o: return []
    n = o['v'][0][2]
    if n <= 0: return []
    b = s.mem(o['v'][2][2]); return [s.obj(x) for x in struct.unpack('<%di' % n, b[:4 * n])]
IGB.list = _list
