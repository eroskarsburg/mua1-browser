import assert from 'node:assert/strict';
import { Pose } from '../src/anim.js';

// esqueleto de 1 osso (blend 0), clipes sintéticos de 1 canal: rotação em Z de 0 e de 90 graus
const skel = { bones: [{ name: 'Root', parent: -1, blend: 0 }], loc: new Float32Array([0, 0, 0]), inv: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), nblend: 1, blend2bone: new Int32Array([0]) };
const rotZ = deg => { const h = deg * Math.PI / 360; return [0, 0, Math.sin(h), Math.cos(h), 0, 0, 0]; };
const clip = deg => ({ name: 'c' + deg, dur: 1, chanOf: new Map([['Root', 0]]), clip: { nch: 1, nf: 2, fps: 1, data: new Float32Array([...rotZ(deg), ...rotZ(deg)]) } });
const angle = p => Math.abs(Math.atan2(p.palette[1], p.palette[0]) * 180 / Math.PI);       // paleta column-major: [0],[1] = primeira coluna

const p = new Pose(skel); p.setAnimation(clip(0)); p.update(0.1); assert.ok(Math.abs(angle(p)) < 1e-3);
p.setAnimation(clip(90));                                        // crossfade a partir de 0 graus
p.update(0.0); assert.ok(Math.abs(angle(p)) < 3, 'início do blend ~ clipe anterior: ' + angle(p));
p.update(0.09); const mid = angle(p); assert.ok(mid > 25 && mid < 65, 'meio do blend entre 0 e 90: ' + mid);
p.update(0.30); assert.ok(Math.abs(angle(p) - 90) < 1e-3, 'fim do blend = clipe novo: ' + angle(p));
// sem blend: troca seca
const q = new Pose(skel); q.setAnimation(clip(0)); q.update(0.1); q.setAnimation(clip(90), false); q.update(0.0); assert.ok(Math.abs(angle(q) - 90) < 1e-3);
console.log('anim ok');
