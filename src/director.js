// Diretor de cena: travamento de controles, fade, cutscene, movimentos de câmera, shake, FOV, textos na tela.
// A câmera do renderer é orbital (target, yaw, pitch, dist); posições "olho + mira" dos scripts viram essa forma.
const D2R = Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAng = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const vec = s => String(s).trim().split(/\s+/).map(Number);

/** olho + ponto de mira -> parâmetros orbitais */
export function orbitFrom(eye, look) {
  const dx = eye[0] - look[0], dy = eye[1] - look[1], dz = eye[2] - look[2], dist = Math.hypot(dx, dy, dz) || 1;
  return { target: [...look], yaw: Math.atan2(dy, dx), pitch: Math.asin(Math.max(-1, Math.min(1, dz / dist))), dist };
}

export class Director {
  /** getCam(): devolve o objeto cam do renderer (target,yaw,pitch,dist). */
  constructor(getCam = () => ({ target: [0, 0, 0], yaw: 0, pitch: 0.5, dist: 200 })) {
    this.getCam = getCam; this.lockInf = false; this.lockT = 0; this.cut = false; this.alpha = 0; this.fadeTo = 0; this.fadeRate = 1e9;
    this.view = null; this.from = null; this.t = 0; this.dur = 0; this.shakeT = 0; this.shakeAmp = 0; this.fovGoal = null; this.fovRate = 0;
    this.toasts = []; this.hudHidden = false;
  }
  get locked() { return this.cut || this.lockInf || this.lockT > 0; }
  get active() { return !!this.view; }

  lockControls(v) { const n = Number(v); if (n < 0) this.lockInf = true; else if (n === 0) { this.lockInf = false; this.lockT = 0; } else this.lockT = Math.max(this.lockT, n); }
  cameraFade(a, dur) { this.fadeTo = Number(a); const d = Number(dur); this.fadeRate = d > 0 ? 1 / d : 1e9; }
  startCutScene() { this.cut = true; this.hudHidden = true; }
  endCutScene() { this.cut = false; this.hudHidden = false; this.cameraReset(); }
  cameraReset() { this.view = null; this.fovGoal = null; }
  toast(text, secs = 3.5) { this.toasts.push({ text: String(text), t: secs }); }

  _base() { const c = this.getCam(); return this.view ? { ...this.view } : { target: [...c.target], yaw: c.yaw, pitch: c.pitch, dist: c.dist }; }
  _go(view, dur) { const c = this.getCam(); this.from = { target: [...c.target], yaw: c.yaw, pitch: c.pitch, dist: c.dist }; this.view = view; this.t = 0; this.dur = Math.max(0, Number(dur) || 0); }

  cameraToLocationAngles(eye, look, dur) { this._go(orbitFrom(vec(eye), vec(look)), dur); }
  cameraMove(eye, dur) { const b = this._base(); this._go(orbitFrom(vec(eye), b.target), dur); }
  /** "a pitch dist": mantém alvo e guinada; ajusta inclinação (graus) e distância */
  cameraPan(angles, dur) { const [, pitch, dist] = vec(angles), b = this._base(); this._go({ ...b, pitch: (pitch || 0) * D2R, dist: dist || b.dist }, dur); }
  cameraFocusToEntity(ent, dist, pitchDeg, yawDeg, dur) {
    if (!ent) return;
    this._go({ target: [ent.pos[0], ent.pos[1], ent.pos[2] + 50], yaw: ent.orient[2] + (Number(yawDeg) || 0) * D2R, pitch: (Number(pitchDeg) || 30) * D2R, dist: Number(dist) || 300 }, dur);
  }
  cameraShake(amp, dur) { this.shakeAmp = Number(amp) * 6; this.shakeT = Number(dur) || 0.5; }
  cameraFOV(deg, dur) { const c = this.getCam(); this.fovGoal = Number(deg) * D2R; const d = Number(dur); this.fovRate = d > 0 ? Math.abs(this.fovGoal - (c.fov ?? 0.8)) / d : 1e9; }

  /** Avança o estado; true se o diretor está controlando a câmera (substitui o seguir-herói). */
  update(dt) {
    const cam = this.getCam();
    if (this.lockT > 0) this.lockT = Math.max(0, this.lockT - dt);
    const d = this.fadeTo - this.alpha; this.alpha += Math.sign(d) * Math.min(Math.abs(d), this.fadeRate * dt);
    for (const t of this.toasts) t.t -= dt; this.toasts = this.toasts.filter(t => t.t > 0);
    if (this.fovGoal !== null) { const f = cam.fov ?? 0.8, k = this.fovGoal - f; cam.fov = f + Math.sign(k) * Math.min(Math.abs(k), this.fovRate * dt); }
    else if (cam.fov !== undefined) cam.fov = undefined;
    if (!this.view) return false;
    this.t += dt; const k = this.dur > 0 ? Math.min(1, this.t / this.dur) : 1, e = k * k * (3 - 2 * k), a = this.from, b = this.view;
    cam.target = [lerp(a.target[0], b.target[0], e), lerp(a.target[1], b.target[1], e), lerp(a.target[2], b.target[2], e)];
    cam.yaw = lerpAng(a.yaw, b.yaw, e); cam.pitch = lerp(a.pitch, b.pitch, e); cam.dist = lerp(a.dist, b.dist, e);
    if (this.shakeT > 0) { this.shakeT -= dt; const s = this.shakeAmp * Math.min(1, this.shakeT * 2); cam.target[0] += (Math.random() - .5) * s; cam.target[1] += (Math.random() - .5) * s; cam.target[2] += (Math.random() - .5) * s; }
    return true;
  }
  /** shake também vale no modo seguir: devolve deslocamento a somar ao alvo. */
  shakeOffset(dt) { if (this.shakeT <= 0 || this.view) return [0, 0, 0]; this.shakeT -= dt; const s = this.shakeAmp * Math.min(1, this.shakeT * 2); return [(Math.random() - .5) * s, (Math.random() - .5) * s, (Math.random() - .5) * s]; }
}
