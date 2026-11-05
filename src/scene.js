// Constrói a lista de desenho a partir do grafo de cena de um IGB.
// Matrizes do jogo: 4x4 row-major com translação em [12..14] == column-major do GL (composição pai*filho).
export const mul = (a, b) => {                       // a*b em column-major
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s;
  }
  return o;
};
/** Matriz de uma entidade: orient = (rx, ry, rz) em radianos, R = Rz*Ry*Rx, translação = pos. */
export const entMatrix = e => {
  const [rx, ry, rz] = e.orient, cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  const m = new Float32Array(16), k = e.scale ?? 1;
  m[0] = cz * cy; m[1] = sz * cy; m[2] = -sy;
  m[4] = cz * sy * sx - sz * cx; m[5] = sz * sy * sx + cz * cx; m[6] = cy * sx;
  m[8] = cz * sy * cx + sz * sx; m[9] = sz * sy * cx - cz * sx; m[10] = cy * cx;
  if (k !== 1) for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) m[i] *= k;
  m[12] = e.pos[0]; m[13] = e.pos[1]; m[14] = e.pos[2]; m[15] = 1; return m;
};
export const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const flag = f => (f.v & 0xff) !== 0;

export function readImage(g, o) {
  const v = o.v.map(x => x.v);
  return { w: v[0], h: v[1], fmt: v[9] === 14 ? 'dxt1' : v[9] === 16 ? 'dxt5' : null, data: g.mem(v[11]) };
}

/** Texturas: atributo (igTextureAttr) -> {levels:[{w,h,fmt,data}]} (mip 0 primeiro). */
export function readTexture(g, ta) {
  if (ta._tex) return ta._tex;
  const top = g.obj(ta.v[8].v), mml = g.list(g.obj(ta.v[12].v));
  const levels = [top, ...mml].filter(Boolean).map(i => readImage(g, i)).filter(l => l.fmt);
  return ta._tex = { key: ta.slot, levels };
}

export function buildScene(g) {
  const draws = [], lights = [];
  const si = g.byName('igSceneInfo')[0];
  const root = si && g.obj(si.v[2].v);

  function geometry(node, m, st) {
    for (const a of g.list(g.obj(node.v[4].v))) {
      if (a && a.name === 'igGeometryAttr2') {
        const va = g.obj(a.v[1].v), ia = g.obj(a.v[2].v);
        if (!va || !ia) continue;
        const key = a.slot, g_ = a._geo || (a._geo = vertexData(g, va, ia));
        if (g_) draws.push({ geo: g_, m, st: { ...st }, id: key });
      }
    }
  }
  function attrs(list, st) {
    for (const a of g.list(list)) {
      if (!a) continue;
      switch (a.name) {
        case 'igTextureBindAttr': {                      // multitextura: vale a menor unidade com formato suportado
          const ta = g.obj(a.v[1].v); if (!ta) break;
          const t = readTexture(g, ta), unit = a.v[2].v;
          if (t.levels.length && (!st.tex || unit < st.texUnit)) { st.tex = t; st.texUnit = unit; }
          break;
        }
        case 'igMaterialAttr': st.diffuse = a.v[3].v; break;
        case 'igColorAttr': st.color = a.v[1].v; break;
        case 'igBlendStateAttr': st.blend = flag(a.v[1]); break;
        case 'igAlphaStateAttr': st.atest = flag(a.v[1]); break;
        case 'igLightAttr': lights.push(a); break;
      }
    }
  }
  function visit(node, m, st, depth) {
    if (!node || depth > 200) return;
    switch (node.name) {
      case 'igGeometry': { const s = { ...st }; attrs(g.obj(node.v[4].v), s); geometry(node, m, s); return; }
      case 'igTransform': m = mul(m, node.v[4].v); break;
      default: {                                       // igAttrSet, igBlendMatrixSelect...: nós com lista de atributos em v[4]
        const al = node.v[4] && node.v[4].t === 'ObjectRef' ? g.obj(node.v[4].v) : null;
        if (al && al.name === 'igAttrList') { st = { ...st }; attrs(al, st); }
      }
    }
    if (node.v.length > 3 && g.meta[node.cls].fields[3] && g.types[g.meta[node.cls].fields[3][0]] === 'ObjectRef')
      for (const c of g.list(g.obj(node.v[3].v))) visit(c, m, st, depth + 1);
  }
  const st0 = () => ({ tex: null, diffuse: null, color: null, blend: false, atest: false });
  if (root) visit(root, IDENT, st0(), 0);
  // atores não têm igSceneInfo: a raiz é o igSkin -> igBlendMatrixSelect (malha na pose de bind)
  else for (const sk of g.byName('igSkin')) visit(g.obj(sk.v[1].v), IDENT, st0(), 0);
  return { draws, lights };
}

/** igVertexArray2 + igIndexArray -> buffers planos. Semântica: 1 pos, 3 normal, 4 uv, 2 cor(4uc). */
function vertexData(g, va, ia) {
  const sem = {};
  for (const vd of g.list(g.obj(va.v[1].v))) {
    const l = g.obj(vd.v[1].v); if (!l) continue;
    sem[vd.v[2].v] = l;
  }
  if (!sem[1]) return null;
  const pos = g.floats(sem[1]), n = pos.length / 3;
  const nrm = sem[3] ? g.floats(sem[3]) : null, uv = sem[4] ? g.floats(sem[4]) : null;
  let col = null;
  if (sem[2]) { const b = g.mem(sem[2].v[2].v); col = new Uint8Array(b.slice(0, n * 4)); }
  const ib = g.mem(ia.v[0].v), cnt = ia.v[1].v;
  const idx = new Uint16Array(ib.buffer.slice(ib.byteOffset, ib.byteOffset + cnt * 2));
  let wt = null, bi = null;                                   // skin: semântica 5 = pesos (4 floats), 6 = índices (4 u8)
  if (sem[5] && sem[6]) { wt = g.floats(sem[5]); bi = new Uint8Array(g.mem(sem[6].v[2].v).slice(0, n * 4)); }
  const min = [1e30, 1e30, 1e30], max = [-1e30, -1e30, -1e30];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const x = pos[i * 3 + k]; if (x < min[k]) min[k] = x; if (x > max[k]) max[k] = x; }
  return { n, pos, nrm, uv, col, wt, bi, idx, min, max };
}
