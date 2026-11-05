import { mul, entMatrix } from './scene.js';
import { decodeDXT } from './dxt.js';

const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec2 aUv; layout(location=3) in vec4 aCol;
uniform mat4 uVP, uM; out vec3 vN; out vec2 vUv; out vec4 vCol;
void main(){ vN=mat3(uM)*aNrm; vUv=vec2(aUv.x,1.0-aUv.y); vCol=aCol; gl_Position=uVP*uM*vec4(aPos,1.0); }`;
const VS_SKIN = VS.replace('layout(location=3) in vec4 aCol;', 'layout(location=3) in vec4 aCol; layout(location=4) in vec4 aW; layout(location=5) in uvec4 aBI; uniform mat4 uPal[48];')
  .replace('vN=mat3(uM)*aNrm;', 'mat4 S=aW.x*uPal[aBI.x]+aW.y*uPal[aBI.y]+aW.z*uPal[aBI.z]+aW.w*uPal[aBI.w]; vN=mat3(uM)*(mat3(S)*aNrm);')
  .replace('gl_Position=uVP*uM*vec4(aPos,1.0);', 'gl_Position=uVP*uM*(S*vec4(aPos,1.0));');
const FS = `#version 300 es
precision highp float; in vec3 vN; in vec2 vUv; in vec4 vCol; out vec4 o;
uniform sampler2D uTex; uniform bool uHasTex, uAtest; uniform vec4 uDiffuse; uniform vec3 uL, uTint;
void main(){
  vec4 c=uDiffuse*vCol; if(uHasTex) c*=texture(uTex,vUv);
  if(uAtest && c.a<0.5) discard;
  float l=max(dot(normalize(vN),normalize(uL)),0.0); c.rgb*=(0.62+0.38*l)*uTint; o=c; }`;

const PVS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aC; layout(location=2) in vec4 aCol; layout(location=3) in vec2 aSR;
uniform mat4 uVP; uniform vec3 uR, uU; out vec2 vUv; out vec4 vCol;
void main(){ float c=cos(aSR.y), s=sin(aSR.y); vec2 q=vec2(c*aC.x-s*aC.y, s*aC.x+c*aC.y)*aSR.x; vUv=aC*0.5+0.5; vCol=aCol; gl_Position=uVP*vec4(aPos+uR*q.x+uU*q.y,1.0); }`;
const PFS = `#version 300 es
precision mediump float; in vec2 vUv; in vec4 vCol; out vec4 o; uniform sampler2D uTex; uniform bool uHasTex;
void main(){ vec4 t = uHasTex ? texture(uTex, vUv) : vec4(1.0); o = t * vCol; if (o.a < 0.01) discard; }`;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };

// esfera englobante da geometria no espaço do mundo (para frustum culling)
const sphere = (geo, m) => {
  const c = [(geo.min[0] + geo.max[0]) / 2, (geo.min[1] + geo.max[1]) / 2, (geo.min[2] + geo.max[2]) / 2];
  const r = Math.hypot(geo.max[0] - geo.min[0], geo.max[1] - geo.min[1], geo.max[2] - geo.min[2]) / 2;
  const s = Math.max(Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10]));
  return [m[0] * c[0] + m[4] * c[1] + m[8] * c[2] + m[12], m[1] * c[0] + m[5] * c[1] + m[9] * c[2] + m[13],
    m[2] * c[0] + m[6] * c[1] + m[10] * c[2] + m[14], r * s];
};

export class Renderer {
  constructor(canvas) {
    const gl = this.gl = canvas.getContext('webgl2', { antialias: true });
    if (!gl) throw new Error('WebGL2 indisponível');
    this.canvas = canvas;
    this.s3tc = gl.getExtension('WEBGL_compressed_texture_s3tc');
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const mk = vs => {
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
      return { p, u: Object.fromEntries(['uVP', 'uM', 'uTex', 'uHasTex', 'uAtest', 'uDiffuse', 'uL', 'uPal', 'uTint'].map(n => [n, gl.getUniformLocation(p, n)])) };
    };
    this.prog = mk(VS); this.progSkin = mk(VS_SKIN);
    const pp = gl.createProgram(); gl.attachShader(pp, sh(gl.VERTEX_SHADER, PVS)); gl.attachShader(pp, sh(gl.FRAGMENT_SHADER, PFS)); gl.linkProgram(pp);
    this.pprog = { p: pp, u: Object.fromEntries(['uVP', 'uR', 'uU', 'uTex', 'uHasTex'].map(n => [n, gl.getUniformLocation(pp, n)])) };
    this.pvao = gl.createVertexArray(); this.pbuf = gl.createBuffer(); this.particles = null;
    gl.bindVertexArray(this.pvao); gl.bindBuffer(gl.ARRAY_BUFFER, this.pbuf);
    [[0, 3, 0], [1, 2, 12], [2, 4, 20], [3, 2, 36]].forEach(([i, n, o]) => { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, gl.FLOAT, false, 44, o); });
    this.palette = null;                                  // Float32Array de matrizes (16 floats) para geometrias com skin
    this.geos = new WeakMap(); this.texs = new WeakMap();
    this.items = null;
    this.cam = { yaw: 0.6, pitch: 0.5, dist: 100, target: [0, 0, 0], radius: 100 };
    this.stats = { draws: 0, culled: 0, tris: 0, tex: 0, vram: 0 };
    this._input(canvas);
  }

  setScene(sc) {
    this.items = sc.draws.map(d => ({ ...d, sph: sphere(d.geo, d.m) })); this.showMarkers = this.showMarkers ?? false;
    // opacos primeiro (agrupados por textura), blend por último
    this.items.sort((a, b) => (a.st.blend - b.st.blend) || ((a.st.tex?.key ?? -1) - (b.st.tex?.key ?? -1)));
    if (!this.items.length) return this.draw();
    const lo = [1e30, 1e30, 1e30], hi = [-1e30, -1e30, -1e30];
    for (const s of this.items) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], s.sph[k] - s.sph[3]); hi[k] = Math.max(hi[k], s.sph[k] + s.sph[3]); }
    const c = lo.map((x, k) => (x + hi[k]) / 2), r = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2;
    Object.assign(this.cam, { target: c, dist: r * 1.6, radius: r });
    this.draw();
  }

  /** Acrescenta itens (instâncias de entidade) sem reenquadrar a câmera. */
  addItems(list) {
    for (const d of list) { d.sph = sphere(d.geo, d.m); (this.items ||= []).push(d); }
    this.items.sort((a, b) => (a.st.blend - b.st.blend) || ((a.st.tex?.key ?? -1) - (b.st.tex?.key ?? -1)));
    this.dirty = true;
  }

  _geo(geo) {
    let g = this.geos.get(geo); if (g) return g;
    const gl = this.gl, n = geo.n, skin = !!(geo.wt && geo.bi), S = skin ? 44 : 36, buf = new ArrayBuffer(n * S), f = new Float32Array(buf), u8 = new Uint8Array(buf);
    for (let i = 0; i < n; i++) {                        // pos(12) nrm(12) uv(8) cor(4)
      const o = i * (S >> 2);
      f.set(geo.pos.subarray(i * 3, i * 3 + 3), o);
      if (geo.nrm) f.set(geo.nrm.subarray(i * 3, i * 3 + 3), o + 3); else f[o + 5] = 1;
      if (geo.uv) f.set(geo.uv.subarray(i * 2, i * 2 + 2), o + 6);
      if (geo.col) u8.set(geo.col.subarray(i * 4, i * 4 + 4), i * S + 32); else u8.fill(255, i * S + 32, i * S + 36);
      if (skin) { for (let k = 0; k < 4; k++) u8[i * S + 36 + k] = Math.round(Math.min(1, Math.max(0, geo.wt[i * 4 + k])) * 255); u8.set(geo.bi.subarray(i * 4, i * 4 + 4), i * S + 40); }
    }
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, S, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, S, 32);
    if (skin) {
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.UNSIGNED_BYTE, true, S, 36);
      gl.enableVertexAttribArray(5); gl.vertexAttribIPointer(5, 4, gl.UNSIGNED_BYTE, S, 40);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.idx, gl.STATIC_DRAW);
    this.stats.vram += buf.byteLength + geo.idx.byteLength;
    g = { vao, count: geo.idx.length, skin }; this.geos.set(geo, g); return g;
  }

  // upload preguiçoso: a textura só vai para a GPU quando fica visível pela primeira vez
  _tex(t) {
    let h = this.texs.get(t); if (h) return h;
    const gl = this.gl; h = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, h);
    const E = this.s3tc, glfmt = E && { dxt1: E.COMPRESSED_RGBA_S3TC_DXT1_EXT, dxt5: E.COMPRESSED_RGBA_S3TC_DXT5_EXT };
    let n = 0;
    for (const [i, l] of t.levels.entries()) {
      if (E) gl.compressedTexImage2D(gl.TEXTURE_2D, i, glfmt[l.fmt], l.w, l.h, 0, l.data);
      else gl.texImage2D(gl.TEXTURE_2D, i, gl.RGBA, l.w, l.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, decodeDXT(l.data, l.w, l.h, l.fmt));
      n++; this.stats.vram += l.data.length;
    }
    const mips = n > 1;
    if (!E && !mips) gl.generateMipmap(gl.TEXTURE_2D);
    if (mips) gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, n - 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, (mips || !E) ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    this.stats.tex++; this.texs.set(t, h); return h;
  }

  _vp() {
    const { yaw, pitch, dist, target: t } = this.cam, a = this.canvas.width / this.canvas.height || 1;
    const e = [t[0] + dist * Math.cos(pitch) * Math.cos(yaw), t[1] + dist * Math.cos(pitch) * Math.sin(yaw), t[2] + dist * Math.sin(pitch)];
    const z = norm(sub(e, t)), x = norm(cross([0, 0, 1], z)), y = cross(z, x);
    this.camRight = x; this.camUp = y;
    const V = new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
    const r = this.cam.radius, near = Math.max(r / 5000, 0.05), far = r * 12, f = 1 / Math.tan((this.cam.fov ?? 0.8) / 2);
    const P = new Float32Array([f / a, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0]);
    return mul(P, V);
  }

  // planos do frustum (Gribb-Hartmann) a partir da matriz VP column-major
  _planes(M) {
    const row = i => [M[i], M[i + 4], M[i + 8], M[i + 12]], r3 = row(3), p = [];
    for (const s of [1, -1]) for (const i of [0, 1, 2]) { const q = row(i); p.push(q.map((v, k) => r3[k] + s * v)); }
    return p.map(q => { const l = Math.hypot(q[0], q[1], q[2]); return q.map(v => v / l); });
  }

  draw() {
    const gl = this.gl, c = this.canvas, dpr = devicePixelRatio || 1;
    const w = c.clientWidth * dpr | 0, h = c.clientHeight * dpr | 0;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    gl.viewport(0, 0, w, h); gl.clearColor(...(this.clearColor || [0.09, 0.1, 0.13, 1])); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!this.items) return;
    gl.enable(gl.DEPTH_TEST);
    const VP = this._vp(), pl = this._planes(VP); this.vp = VP;
    let draws = 0, culled = 0, tris = 0, curTex = null, curBlend = null, cur = null;
    const use = P => {
      if (cur === P) return; cur = P; gl.useProgram(P.p);
      gl.uniformMatrix4fv(P.u.uVP, false, VP); gl.uniform3f(P.u.uL, 0.4, -0.3, 0.85); gl.uniform1i(P.u.uTex, 0); gl.uniform3fv(P.u.uTint, this.tint || [1, 1, 1]);
      curTex = null; curBlend = null;
    };
    for (const d of this.items) {
      const en = d.ent;
      if (en) {                                          // estado vindo do mundo (scripts)
        if (d.marker ? !this.showMarkers : false) continue;
        if (!en.enabled || !en.alive || en.invisible) continue;
        if (en._ver !== d.ver) { d.m = mul(entMatrix(en), d.base); d.sph = sphere(d.geo, d.m); d.ver = en._ver; }
      }
      const [x, y, z, r] = d.sph; let vis = true;
      for (const q of pl) if (q[0] * x + q[1] * y + q[2] * z + q[3] < -r) { vis = false; break; }
      if (!vis) { culled++; continue; }
      const g = this._geo(d.geo); use(g.skin && (d.palette || this.palette) ? this.progSkin : this.prog); const u = cur.u;
      if (cur === this.progSkin) gl.uniformMatrix4fv(u.uPal, false, d.palette || this.palette);
      const tex = d.st.tex && d.st.tex.levels.length ? d.st.tex : null;
      if (tex !== curTex) { curTex = tex; if (tex) gl.bindTexture(gl.TEXTURE_2D, this._tex(tex)); gl.uniform1i(u.uHasTex, !!tex); }
      if (d.st.blend !== curBlend) { curBlend = d.st.blend; if (curBlend) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); } else gl.disable(gl.BLEND); }
      gl.uniform1i(u.uAtest, !!d.st.atest);
      const df = d.st.diffuse || d.st.color || [1, 1, 1, 1]; gl.uniform4f(u.uDiffuse, df[0], df[1], df[2], df[3] ?? 1);
      gl.uniformMatrix4fv(u.uM, false, d.m);
      gl.bindVertexArray(g.vao); gl.drawElements(gl.TRIANGLES, g.count, gl.UNSIGNED_SHORT, 0);
      draws++; tris += g.count / 3;
    }
    if (this.particles) this._drawParticles(VP);
    Object.assign(this.stats, { draws, culled, tris });
    if (this.onstats) this.onstats(this.stats);
  }

  _drawParticles(VP) {
    const gl = this.gl, groups = this.particles.collect(); if (!groups.size) return;
    gl.useProgram(this.pprog.p); const u = this.pprog.u;
    gl.uniformMatrix4fv(u.uVP, false, VP); gl.uniform3fv(u.uR, this.camRight); gl.uniform3fv(u.uU, this.camUp); gl.uniform1i(u.uTex, 0);
    gl.enable(gl.BLEND); gl.depthMask(false); gl.bindVertexArray(this.pvao); gl.bindBuffer(gl.ARRAY_BUFFER, this.pbuf);
    for (const g of groups.values()) {
      gl.blendFunc(gl.SRC_ALPHA, g.additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1i(u.uHasTex, !!g.tex); if (g.tex) gl.bindTexture(gl.TEXTURE_2D, this._tex(g.tex));
      const data = new Float32Array(g.v); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW); gl.drawArrays(gl.TRIANGLES, 0, data.length / 11);
    }
    gl.depthMask(true); gl.disable(gl.BLEND);
  }

  /** Projeta um ponto de mundo para pixels CSS do canvas; null se estiver atrás da câmera. */
  project(p) {
    const M = this.vp; if (!M) return null;
    const x = M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], y = M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], w = M[3] * p[0] + M[7] * p[1] + M[11] * p[2] + M[15];
    if (w <= 0) return null;
    return [(x / w * 0.5 + 0.5) * this.canvas.clientWidth, (1 - (y / w * 0.5 + 0.5)) * this.canvas.clientHeight];
  }

  _input(c) {
    let drag = null; const redraw = () => requestAnimationFrame(() => this.draw());
    c.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 2 }; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointerup', () => { drag = null; });
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('pointermove', e => {
      if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      const cam = this.cam;
      if (drag.pan) {
        const k = cam.dist * 0.0015, s = Math.sin(cam.yaw), co = Math.cos(cam.yaw), sp = Math.sin(cam.pitch);
        cam.target[0] += (s * dx - co * sp * dy) * k; cam.target[1] += (-co * dx - s * sp * dy) * k; cam.target[2] += Math.cos(cam.pitch) * dy * k;
      } else { cam.yaw -= dx * 0.006; cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch + dy * 0.006)); }
      redraw();
    });
    c.addEventListener('wheel', e => { e.preventDefault(); const k = Math.exp(e.deltaY * 0.001); this.cam.dist *= k; if (this.cam.want) this.cam.want *= k; redraw(); }, { passive: false });
    new ResizeObserver(redraw).observe(c);
  }
}
