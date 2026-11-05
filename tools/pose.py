"""Experimento: pose de animação Enbaya + skinning (CPU) para calibrar convenções."""
import sys, struct, math, itertools
import numpy as np
sys.path.insert(0, 'tools')
from igb import IGB
import enbaya

def load_mesh(path):
    g = IGB(open(path, 'rb').read())
    ga = [o for o in g.objects if o['name'] == 'igGeometryAttr2'][0]
    va = g.obj(ga['v'][1][2]); ia = g.obj(ga['v'][2][2]); sem = {}
    for vd in g.list(g.obj(va['v'][1][2])):
        l = g.obj(vd['v'][1][2]); sem[vd['v'][2][2]] = l
    fl = lambda o: np.frombuffer(g.mem(o['v'][2][2]), np.float32)
    pos = fl(sem[1]).reshape(-1, 3); n = len(pos)
    w = fl(sem[5]).reshape(n, 4); bi = np.frombuffer(g.mem(sem[6]['v'][2][2]), np.uint8)[:n * 4].reshape(n, 4)
    idx = np.frombuffer(g.mem(ia['v'][0][2]), np.uint16)[:ia['v'][1][2]].reshape(-1, 3)
    return g, pos, w, bi, idx

def skeleton(g, sk=None):
    sk = sk or [o for o in g.objects if o['name'] == 'igSkeleton'][0]
    bl = g.obj(sk['v'][2][2]); bones = []
    for b in g.list(bl):
        v = [x[2] for x in b['v']]; bones.append(dict(name=g.strings[v[0]], parent=v[1], blend=v[2]))
    inv = np.frombuffer(g.mem(sk['v'][3][2]), np.float32).reshape(-1, 4, 4)
    loc = np.frombuffer(g.mem(sk['v'][1][2]), np.float32).reshape(-1, 3)
    return bones, inv, loc

def qmat(q, conj):
    x, y, z, w = q
    if conj: x, y, z = -x, -y, -z
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    return R

def pose(bones, chan_of, frame, bind_local, conj, order, qorder):
    """matrizes de mundo (row-vector, 4x4) por osso; ordem: 0 = local@pai, 1 = pai@local."""
    nb = len(bones); world = [None] * nb
    loc = np.where(np.abs(bind_local) > 1e5, 0, bind_local)
    def build(i):
        if world[i] is not None: return world[i]
        c = chan_of[i]; M = np.eye(4)
        if c is not None:
            q = frame[c][:4]; t = frame[c][4:7]
            q = [q[qorder[0]], q[qorder[1]], q[qorder[2]], q[qorder[3]]]
            M[:3, :3] = qmat(q, conj).T
            M[3, :3] = t if np.abs(t).max() > 1e-9 else loc[i]
        else: M[3, :3] = loc[i]
        p = bones[i]['parent']
        if 0 <= p < nb and p != i:
            P = build(p); world[i] = M @ P if order == 0 else P @ M
        else: world[i] = M
        return world[i]
    for i in range(nb): build(i)
    return world
