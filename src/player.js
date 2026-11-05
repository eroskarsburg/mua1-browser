// Chão (raycast vertical contra a geometria do mapa) e controle do herói em terceira pessoa.

/** Grade 2D de triângulos "caminháveis" em coordenadas de mundo. */
export class Ground {
  constructor(cell = 96) { this.cell = cell; this.grid = new Map(); this.tris = []; this.count = 0; this.wgrid = new Map(); this.walls = []; }
  /** items: {geo, m} estáticos (sem skin). m = matriz column-major do jogo. */
  add(items) {
    const C = this.cell;
    for (const d of items) {
      if (d.palette || d.marker || (d.ent && d.ent.character)) continue;
      const g = d.geo, m = d.m, p = g.pos, idx = g.idx, n = g.n;
      const w = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
        w[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12]; w[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; w[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      }
      for (let t = 0; t + 2 < idx.length; t += 3) {
        const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
        const ux = w[b] - w[a], uy = w[b + 1] - w[a + 1], uz = w[b + 2] - w[a + 2], vx = w[c] - w[a], vy = w[c + 1] - w[a + 1], vz = w[c + 2] - w[a + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
        if (!l) continue;
        if (Math.abs(nz) / l < 0.5) {                                      // parede: vai para a grade de colisão lateral
          const zlo = Math.min(w[a + 2], w[b + 2], w[c + 2]), zhi = Math.max(w[a + 2], w[b + 2], w[c + 2]);
          const wx0 = Math.min(w[a], w[b], w[c]), wx1 = Math.max(w[a], w[b], w[c]), wy0 = Math.min(w[a + 1], w[b + 1], w[c + 1]), wy1 = Math.max(w[a + 1], w[b + 1], w[c + 1]);
          if (zhi - zlo < 6 || (wx1 - wx0) / C > 20 || (wy1 - wy0) / C > 20) continue;
          const wid = this.walls.length; this.walls.push([w[a], w[a + 1], w[b], w[b + 1], w[c], w[c + 1], zlo, zhi]);
          for (let gx = Math.floor(wx0 / C); gx <= Math.floor(wx1 / C); gx++) for (let gy = Math.floor(wy0 / C); gy <= Math.floor(wy1 / C); gy++) {
            const k = gx * 73856093 ^ gy * 19349663; (this.wgrid.get(k) || this.wgrid.set(k, []).get(k)).push(wid);
          }
          continue;
        }
        const tri = [w[a], w[a + 1], w[a + 2], w[b], w[b + 1], w[b + 2], w[c], w[c + 1], w[c + 2]], id = this.tris.length; this.tris.push(tri);
        const x0 = Math.min(tri[0], tri[3], tri[6]), x1 = Math.max(tri[0], tri[3], tri[6]), y0 = Math.min(tri[1], tri[4], tri[7]), y1 = Math.max(tri[1], tri[4], tri[7]);
        if ((x1 - x0) / C > 40 || (y1 - y0) / C > 40) continue;
        for (let gx = Math.floor(x0 / C); gx <= Math.floor(x1 / C); gx++) for (let gy = Math.floor(y0 / C); gy <= Math.floor(y1 / C); gy++) {
          const k = gx * 73856093 ^ gy * 19349663; (this.grid.get(k) || this.grid.set(k, []).get(k)).push(id);
        }
        this.count++;
      }
    }
  }
  /** true se um cilindro (raio r) em (x,y) com pés em z colide com alguma parede entre z+lo e z+hi. */
  blocked(x, y, z, r = 16, lo = 34, hi = 64) {
    const C = this.cell; let hit = false;
    for (let gx = Math.floor((x - r) / C); gx <= Math.floor((x + r) / C) && !hit; gx++) for (let gy = Math.floor((y - r) / C); gy <= Math.floor((y + r) / C) && !hit; gy++) {
      const l = this.wgrid.get(gx * 73856093 ^ gy * 19349663); if (!l) continue;
      for (const id of l) {
        const t = this.walls[id]; if (t[7] < z + lo || t[6] > z + hi) continue;
        if (segDist(x, y, t[0], t[1], t[2], t[3]) < r || segDist(x, y, t[2], t[3], t[4], t[5]) < r || segDist(x, y, t[4], t[5], t[0], t[1]) < r) { hit = true; break; }
      }
    }
    return hit;
  }
  /** Move a entidade (sx,sy) respeitando chão e paredes; desliza em um eixo se bater. true se andou. */
  move(e, sx, sy) {
    if (e.noClip) { e.pos[0] += sx; e.pos[1] += sy; e._ver++; return true; }
    const t = (nx, ny) => {
      if (this.blocked(nx, ny, e.pos[2])) return false;
      const h = this.height(nx, ny, e.pos[2] + STEP0); if (h === null || h <= e.pos[2] - FALL0) return false;
      e.pos[0] = nx; e.pos[1] = ny; e.pos[2] = h; e._ver++; return true;
    };
    return t(e.pos[0] + sx, e.pos[1] + sy) || t(e.pos[0] + sx, e.pos[1]) || t(e.pos[0], e.pos[1] + sy);
  }
  /** Maior altura de piso em (x,y) com z <= zMax; null se não houver. */
  height(x, y, zMax) {
    const C = this.cell, l = this.grid.get(Math.floor(x / C) * 73856093 ^ Math.floor(y / C) * 19349663); if (!l) return null;
    let best = null;
    for (const id of l) {
      const t = this.tris[id];
      const d = (t[4] - t[7]) * (t[0] - t[6]) + (t[6] - t[3]) * (t[1] - t[7]); if (!d) continue;
      const a = ((t[4] - t[7]) * (x - t[6]) + (t[6] - t[3]) * (y - t[7])) / d, b = ((t[7] - t[1]) * (x - t[6]) + (t[0] - t[6]) * (y - t[7])) / d, c = 1 - a - b;
      if (a < -1e-4 || b < -1e-4 || c < -1e-4) continue;
      const z = a * t[2] + b * t[5] + c * t[8];
      if (z <= zMax && (best === null || z > best)) best = z;
    }
    return best;
  }
}

const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
const STEP0 = 36, FALL0 = 240;
const RUN = 300, WALK = 130, STEP = 36, FALL = 240;
// Pulo (Marvel.exe, handler ch_move_jump @ 0x140558100): velocidade vertical inicial 450 u/s; horizontal x1.4 sem poder ativo.
// A gravidade não foi localizada no exe: ajustada para que o tempo no ar (2*v0/g = 0.9 s) caiba no clipe jump_start (1.1 s).
export const JUMP_V = 450, JUMP_G = 1000, JUMP_AIR_SPEED = 1.4;

/** Herói controlado: WASD/setas relativos à câmera; Shift = andar. */
export class Player {
  constructor(ent, inst, actors, ground) { this.ent = ent; this.inst = inst; this.actors = actors; this.ground = ground; this.state = 'idle'; this.grounded = false; }
  /** Direção desejada (yaw do mundo) a partir das teclas e da câmera; null sem entrada. */
  heading(keys, camYaw) {
    const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0), r = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    if (!f && !r) return null; const fx = -Math.cos(camYaw), fy = -Math.sin(camYaw);
    return Math.atan2(fy * f - fx * r, fx * f + fy * r);
  }
  /** Espaço: salta se estiver no chão e livre. */
  jump() {
    if (!this.grounded || this.air || this.landT > 0 || (this.fighter && this.fighter.state !== 'free')) return false;
    this.air = { vz: JUMP_V, t: 0, hv: [0, 0] }; this.state = 'jump';
    const a = this.inst.p.anims.find(x => x.name === 'jump_start'), T = 2 * JUMP_V / JUMP_G;
    this.actors.play(this.inst, 'jump_start', { loop: false, rate: a ? a.dur / T : 1 }); return true;
  }
  stepAir(dt, keys, camYaw) {
    const e = this.ent, a = this.air; a.t += dt; a.vz -= JUMP_G * dt;
    let f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0), r = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    if (f || r) {
      const fx = -Math.cos(camYaw), fy = -Math.sin(camYaw), rx = fy, ry = -fx; let dx = fx * f + rx * r, dy = fy * f + ry * r; const l = Math.hypot(dx, dy); dx /= l; dy /= l;
      const sp = ((this.actors.groundSpeed ? this.actors.groundSpeed(this.inst, 'run') : 0) || RUN) * JUMP_AIR_SPEED;
      this.ground.move(e, dx * sp * dt, dy * sp * dt); const yaw = Math.atan2(dy, dx), d = Math.atan2(Math.sin(yaw - e.orient[2]), Math.cos(yaw - e.orient[2])); e.orient[2] += d * Math.min(1, dt * 10);
    }
    e.pos[2] += a.vz * dt; e._ver++;
    const h = this.ground.height(e.pos[0], e.pos[1], e.pos[2] + 60);
    if (a.vz < 0 && h !== null && e.pos[2] <= h) {                          // pouso
      e.pos[2] = h; this.air = null; this.landT = 0.25; this.state = 'land';
      this.actors.play(this.inst, 'jump_land', { loop: false });
    }
  }
  update(dt, keys, camYaw) {
    const e = this.ent;
    if (this.air) { this.stepAir(dt, keys, camYaw); return; }
    if (this.landT > 0) { this.landT -= dt; if (this.landT > 0) return; this.state = 'idle'; this.actors.play(this.inst, 'idle'); }
    if (this.fighter && this.fighter.state !== 'free') return;      // preso em ataque/reação/morte
    if (this.fighter && this.fighter.blocking) return;              // bloqueando: parado
    let f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    let r = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    if (!this.grounded) {                                           // primeiro pouso: procura chão perto do ponto de início
      const h = this.ground.height(e.pos[0], e.pos[1], e.pos[2] + 120);
      if (h !== null) { e.pos[2] = h; e._ver++; this.grounded = true; }
      return;
    }
    let state = 'idle';
    if (f || r) {
      // frente da câmera no plano XY = direção do olhar (câmera orbita o alvo)
      const fx = -Math.cos(camYaw), fy = -Math.sin(camYaw), rx = fy, ry = -fx;
      let dx = fx * f + rx * r, dy = fy * f + ry * r; const l = Math.hypot(dx, dy); dx /= l; dy /= l;
      const walk = keys.has('ShiftLeft') || keys.has('ShiftRight'); state = walk ? 'walk' : 'run';
      const stride = this.actors.groundSpeed ? this.actors.groundSpeed(this.inst, state) : 0, speed = stride > 5 ? stride : walk ? WALK : RUN;   // velocidade = passada do clipe (sem deslizar)
      this.ground.move(e, dx * speed * dt, dy * speed * dt);
      let yaw = Math.atan2(dy, dx), d = yaw - e.orient[2]; d = Math.atan2(Math.sin(d), Math.cos(d));
      e.orient[2] += d * Math.min(1, dt * 14); e._ver++;
    }
    if (state !== this.state && this.inst) { this.state = state; this.actors.play(this.inst, state); }
  }
}

/** Menor distância (<= want) da câmera ao alvo sem atravessar paredes/piso. */
export function cameraDistance(ground, target, yaw, pitch, want, min = 110) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  for (let d = 30; d <= want; d += 14) {
    const x = target[0] + d * cp * Math.cos(yaw), y = target[1] + d * cp * Math.sin(yaw), z = target[2] + d * sp;
    const floor = ground.height(x, y, z + 2);
    if (ground.blocked(x, y, z - 50, 10, 30, 74) || (floor !== null && floor > z - 8)) return Math.max(min, d - 14);
  }
  return want;
}
