"""Decoder Enbaya (igEnbayaAnimationSource), por engenharia reversa do Marvel.exe.
Layout do blob: hdr(80) | S1.D | S2.E | S3.D | S1.C | S2.D | S3.C | S1.A | S1.B | S2.A | S2.B | S2.C | S3.A | S3.B | máscaras
S1 = frame inicial (A codes 2b, B int8, C int16, D int32); S2 = deltas (A 2b, B nibbles, C bytes, D int16, E int32)."""
import struct, math
NIB = (0, 8, 2, 3, 4, 5, 6, 7, -8, -7, -6, -5, -4, -3, -2, -9)
C2 = (0, 1, None, -1)

class Bits:
    """leitor de campos de 2 bits (MSB primeiro) ou 4 bits."""
    def __init__(s, b, w): s.b = b; s.w = w; s.i = 0; s.n = 0; s.per = 8 // w
    def read(s):
        if s.n == s.per: s.i += 1; s.n = 0
        v = (s.b[s.i] >> (8 - s.w * (s.n + 1))) & ((1 << s.w) - 1); s.n += 1; return v

class Ptr:
    def __init__(s, b): s.b = b; s.i = 0
    def u8(s): v = s.b[s.i]; s.i += 1; return v
    def s8(s): v = s.u8(); return v - 256 if v > 127 else v
    def s16(s): v = struct.unpack_from('<h', s.b, s.i)[0]; s.i += 2; return v
    def s32(s): v = struct.unpack_from('<i', s.b, s.i)[0]; s.i += 4; return v

def decode(b):
    magic, nch = struct.unpack_from('<II', b, 0)
    h, dur = struct.unpack_from('<ff', b, 8); fps = struct.unpack_from('<I', b, 0x10)[0]
    T = struct.unpack_from('<15I', b, 0x14)
    order = [('S1D', 3), ('S2E', 8), ('S3D', 12), ('S1C', 2), ('S2D', 7), ('S3C', 11), ('S1A', 0), ('S1B', 1),
             ('S2A', 4), ('S2B', 5), ('S2C', 6), ('S3A', 9), ('S3B', 10), ('MSK', 13)]
    sec = {}; p = T[14]
    for name, k in order: sec[name] = b[p:p + T[k]]; p += T[k]
    assert p == len(b), (p, len(b))
    mask = list(sec['MSK'])
    # frame 0
    a, p8, p16, p32 = Bits(sec['S1A'], 2), Ptr(sec['S1B']), Ptr(sec['S1C']), Ptr(sec['S1D'])
    cur = []
    for ch in range(nch):
        v = []
        for c in range(7):
            code = a.read()
            v.append(0 if code == 0 else p8.s8() if code == 1 else p16.s16() if code == 2 else p32.s32())
        q = [x * h for x in v]; n = math.sqrt(sum(x * x for x in q[:4])) or 1.0
        cur.append([x / n for x in q[:4]] + q[4:])
    # deltas
    A, B, Cb, D, E = Bits(sec['S2A'], 2), Bits(sec['S2B'], 4), Ptr(sec['S2C']), Ptr(sec['S2D']), Ptr(sec['S2E'])
    def delta():
        c = A.read()
        if c != 2: return C2[c]
        n = B.read()
        if n: return NIB[n]
        x = Cb.s8()
        if x:
            if 1 <= x <= 8: return x + 127
            if -8 <= x <= -1: return x - 128
            return x
        w = D.s16()
        return w if w else E.s32()
    # S3: run-length de eventos que alternam bits da mascara (canal*7+comp)
    S3a, S3b, S3c, S3d = Bits(sec['S3A'], 2), Ptr(sec['S3B']), Ptr(sec['S3C']), Ptr(sec['S3D'])
    def s3read():
        c = S3a.read()
        if c == 0: return 0
        if c == 1: return S3b.u8()
        if c == 2: return struct.unpack_from('<H', S3c.b, (S3c.__setattr__('i', S3c.i + 2) or S3c.i) - 2)[0]
        return struct.unpack_from('<I', S3d.b, (S3d.__setattr__('i', S3d.i + 4) or S3d.i) - 4)[0]
    cnt = [s3read()]
    def apply_s3():
        pos, total = 0, nch * 7
        while pos < total:
            if cnt[0] == 0:
                ch, comp = divmod(pos, 7); mask[ch] ^= 1 << comp; cnt[0] = s3read(); pos += 1
            else:
                k = min(cnt[0], total - pos); cnt[0] -= k; pos += k
    frames = [[list(c) for c in cur]]
    acc = [[0] * 7 for _ in range(nch)]
    nframes = max(1, math.ceil(dur * fps - 1e-4)) if fps else 1
    per = sum(bin(m & 0x7f).count('1') for m in mask)
    ncodes = len(sec['S2A']) * 4
    nf = nframes
    for f in range(1, nf + 1):
        if f > 1: apply_s3()
        new = []
        for ch in range(nch):
            for c in range(7):
                if mask[ch] >> c & 1: acc[ch][c] += delta()
            s = [cur[ch][k] + h * acc[ch][k] for k in range(7)]
            n = math.sqrt(sum(x * x for x in s[:4])) or 1.0
            s[:4] = [x / n for x in s[:4]]
            new.append(s)
        cur = new; frames.append([list(c) for c in cur])
    used = dict(A=(A.i + (1 if A.n else 0), len(sec['S2A'])), B=(B.i + (1 if B.n else 0), len(sec['S2B'])), C=(Cb.i, len(sec['S2C'])),
                D=(D.i, len(sec['S2D'])), E=(E.i, len(sec['S2E'])),
                S3A=(S3a.i + (1 if S3a.n else 0), len(sec['S3A'])), S3B=(S3b.i, len(sec['S3B'])), S3C=(S3c.i, len(sec['S3C'])), S3D=(S3d.i, len(sec['S3D'])))
    return dict(nch=nch, h=h, dur=dur, fps=fps, mask=mask, frames=frames, nf=nf, expected=nframes, used=used, sec=sec)

if __name__ == '__main__':
    import sys; sys.path.insert(0, 'tools')
    from igb import IGB
    g = IGB(open(sys.argv[1], 'rb').read()); ok = bad = 0
    for o in g.objects:
        if o['name'] != 'igEnbayaAnimationSource': continue
        r = decode(g.mem(o['v'][0][2]))
        good = all(a == b for a, b in r['used'].values())
        ok += good; bad += not good
        if not good or len(sys.argv) > 2: print('nch', r['nch'], 'fps', r['fps'], 'dur', round(r['dur'], 3), 'frames', r['nf'] + 1, 'exp', r['expected'], 'used', r['used'])
    print('streams consumed exactly:', ok, 'not:', bad)
