// Combate. Com dados do jogo (`fight` = loadFightData + `useStyle`), os golpes seguem a máquina de nós original
// (combos, tempos de golpe/encadeamento, alcance, dano, reações por modificador). Sem dados, usa um combate simples.
import { MoveRun, isLocomotion, avgRange, reactionPlan } from './fightstyle.js';
import { resolveValue, resolveNumber, powerForSlot, unlockLevel } from './talents.js';
const LIGHT = ['attack_light1', 'attack_light2', 'attack_light3'], HEAVY = 'attack_heavy1';
const REACT = ['pain_high', 'pain_low', 'attack_knockback1', 'attack_knockback2', 'attack_stun1'];
const ENEMY_ATK = ['attack_light1', 'attack_heavy1', 'attack_light2', 'power_1'];
const ACTION = { KeyJ: 'attack', KeyK: 'smash' };
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const DEG = Math.PI / 180, BASE_DMG = 16, UNIT = 2.5;                 // dano do jogo "2 3" (média 2.5) == dano base do herói

export class Fighter {
  constructor(ent, inst, team, { hp = 100, speed = 210, dmg = 10, range = 105 } = {}) {
    Object.assign(this, { ent, inst, team, hp, maxhp: hp, speed, dmg, range, state: 'free', t: 0, cd: 0, combo: 0, comboT: 0, hurtT: 0, hit: false, deadT: 0, controlled: false, energy: 100, area: false, run: null, plan: null, down: false });
  }
  get alive() { return this.state !== 'dead'; }
}

export class Combat {
  /** host: WorldHost (para scripts de morte); actors: Actors; ground: Ground; fight: dados de combate (opcional). */
  constructor({ actors, ground, host, fight = null }) {
    this.actors = actors; this.ground = ground; this.host = host; this.fight = fight; this.styles = new Map(); this.fighters = []; this.log = []; this.kills = 0;
    this.onFx = null; this.onHit = null; this.onKill = null; this.onSwing = null; this.onSound = null; this.onTrail = null; this.onEffect = null; this.onProjectile = null;
    this.projectiles = [];
  }
  add(f) { this.fighters.push(f); return f; }
  /** registra os nós de um estilo de luta (Map) para uso pelos lutadores com aquele `fightstyle` */
  useStyle(name, nodes) { this.styles.set(String(name).toLowerCase(), nodes); }
  /** nós do lutador: estilo + powerstyle do herói (chave `estilo|powerstyle`), ou só o estilo */
  nodesOf(f) {
    const i = f.inst && f.inst.p && f.inst.p.info; if (!i) return null; const fs = String(i.fightstyle || 'fightstyle_default').toLowerCase();
    return this.styles.get(`${fs}|${String(i.powerstyle || '').toLowerCase()}`) || this.styles.get(fs) || null;
  }
  has(f, name) { return !!name && f.inst.p.anims.some(a => a.name === name); }
  dur(f, name) { return (f.inst.p.anims.find(a => a.name === name) || {}).dur || 0.6; }
  face(e, dx, dy, k = 1) { const d = wrap(Math.atan2(dy, dx) - e.orient[2]); e.orient[2] += d * k; e._ver++; }
  dist(a, b) { return Math.hypot(a.ent.pos[0] - b.ent.pos[0], a.ent.pos[1] - b.ent.pos[1]); }
  foes(f) {
    const h = this.host, nt = (h && h.noTarget) || {};
    return this.fighters.filter(o => o.alive && o.team !== f.team && !o.ent.noTarget && !(nt.hero && o.team === 'hero' && f.team === 'enemy') && !(nt.enemy && o.team === 'enemy' && f.team === 'hero'));
  }
  nearest(f, list, max = Infinity) { let b = null, bd = max; for (const o of list) { const d = this.dist(f, o); if (d < bd) { b = o; bd = d; } } return b; }
  aim(f) {                                                              // mira assistida no inimigo mais próximo
    if (f.team !== 'hero') return;
    const t = this.nearest(f, this.foes(f), 240); if (t) this.face(f.ent, t.ent.pos[0] - f.ent.pos[0], t.ent.pos[1] - f.ent.pos[1]);
  }

  // ---- nós de luta (dados do jogo) ----
  /** inicia o nó `name`; false se o personagem não tem a animação */
  startNode(f, name, first = false) {
    const nodes = this.nodesOf(f), node = nodes && nodes.get(name); if (!node || !node.clip || !this.has(f, node.clip)) return false;
    if (first) this.aim(f);
    if (this.onSwing && first) this.onSwing(f);
    f.state = 'attack'; f.t = 0; f.area = false; f.hit = true; f.dmg = f.dmg || BASE_DMG; f.node = node;
    f.run = new MoveRun(node, this.dur(f, node.clip), nodes);
    this.actors.play(f.inst, node.clip, { loop: false, rate: node.playspeed });
    return true;
  }
  /** ação do jogador/IA a partir do estado livre: segue a cadeia do nó `idle` */
  begin(f, action) {
    const nodes = this.nodesOf(f), idle = nodes && nodes.get('idle'), name = idle && idle.chain.get(action);
    return !!name && name !== 'null' && this.startNode(f, name, true);
  }
  fireTrigger(f, t) {
    const a = t.attrs, n = t.name, run = f.run;
    if (a.sound && (n === 'sound' || /^whoosh|_sound$/.test(n) || a.type === 'ce_sound')) { if (this.onSound) this.onSound(a.sound, f); return; }
    if (n === 'trail') { if (this.onTrail) this.onTrail(f, a); return; }
    if (n === 'powerusage') return;                                      // a energia do poder é cobrada ao iniciar
    if (n === 'effect' || n === 'effect_sound') { if (a.effect && this.onEffect) this.onEffect(a.effect, f, a); if (a.sound && this.onSound) this.onSound(a.sound, f); return; }
    if (n === 'projectile') { this.spawnProjectile(f, t); return; }
    if (n === 'slide') {                                                // avança até o alvo mais próximo (targetdistance) ou `movement` unidades
      const tg = this.nearest(f, this.foes(f), 240), life = Number(a.life) || 0.15; let go = Number(a.movement) || 0;
      if (tg && a.targetdistance !== undefined) go = Math.max(0, this.dist(f, tg) - Number(a.targetdistance));
      if (go > 0) f.slide = { dx: Math.cos(f.ent.orient[2]), dy: Math.sin(f.ent.orient[2]), left: Math.min(go, 140), rate: Math.min(go, 140) / life };
      return;
    }
    if (n === 'filter') { const pass = (Number(a.min_charge) || 0) <= (f.charge || 0); for (const x of run.tagged(pass ? a.passtag : a.failtag)) this.fireTrigger(f, x); return; }
    if (a.damage !== undefined && /^ce_atk/.test(a.type || '')) this.strikeTrig(f, t);
  }
  strikeTrig(f, t) {
    const a = t.attrs, mods = t.mods, yaw = f.ent.orient[2], arc = (Number(a.arc) || 60) * DEG, reach = (Number(a.maxrange) || 48) + 36;
    const rank = f.level || 1, ref = resolveValue(f.tv, a.damage, rank), raw = ref ? avgRange(ref.value) : 0;
    const base = a.damagescale === 'none' ? raw : (f.dmg || BASE_DMG) * raw / UNIT, knock = a.knockback === undefined ? 40 : resolveNumber(f.tv, a.knockback, rank, 40);
    const kind = mods.includes('dmgmod_popup') ? 'popup' : mods.includes('dmgmod_trip') ? 'trip' : mods.includes('dmgmod_stun') ? 'stun' : (mods.includes('dmgmod_auto_knockback') || knock >= 120) ? 'knockdown' : 'pain';
    const ground = mods.includes('dmgmod_ground'), radial = arc >= Math.PI * 0.95;
    let hits = 0;
    for (const o of this.foes(f)) {
      if (o.down && !ground) continue;
      const dx = o.ent.pos[0] - f.ent.pos[0], dy = o.ent.pos[1] - f.ent.pos[1], d = Math.hypot(dx, dy);
      if (d > reach || Math.abs(o.ent.pos[2] - f.ent.pos[2]) > 70) continue;
      if (!radial && d > 14 && Math.abs(wrap(Math.atan2(dy, dx) - yaw)) > arc) continue;
      this.damage(o, f, Math.max(1, Math.round(base * (0.9 + Math.random() * 0.2))), knock, kind); hits++;
    }
    return hits;
  }

  /** Esquiva: rolamento com o movimento de raiz do clipe (canal Motion), direção `yaw` ou a atual. Invulnerável durante o rolamento. */
  dodge(f, yaw = null, clip = 'evade_forwardroll') {
    if (f.state !== 'free' || !this.has(f, clip) || !f.inst.pose) return false;
    if (yaw !== null) { f.ent.orient[2] = yaw; f.ent._ver++; }
    const a = f.inst.p.anims.find(x => x.name === clip), node = this.nodesOf(f) && [...this.nodesOf(f).values()].find(n => n.clip === clip);
    f.state = 'dodge'; f.t = 0; f.run = null; f.dodgeDur = a.dur / (node ? node.playspeed || 1 : 1); f.dodgeInv = node && node.startChain ? node.startChain / (node.playspeed || 1) : f.dodgeDur; f.dodgeClip = a; f.motionPrev = [0, 0, 0]; f.ent.invulnerable = true;
    this.actors.play(f.inst, clip, { loop: false, rate: node ? node.playspeed : 1 });
    return true;
  }
  stepDodge(f, dt) {
    f.t += dt; if (f.t >= f.dodgeInv) f.ent.invulnerable = false;
    const a = f.dodgeClip, m = f.inst.pose.motionAt(a, f.t * (f.inst.rate || 1));
    if (m) {                                                                  // x = frente, y = esquerda (em relação ao corpo)
      const dx = m[0] - f.motionPrev[0], dy = m[1] - f.motionPrev[1], c = Math.cos(f.ent.orient[2]), s = Math.sin(f.ent.orient[2]);
      this.ground.move(f.ent, dx * c - dy * s, dx * s + dy * c); f.motionPrev = m;
    }
    if (f.t >= f.dodgeDur) { f.state = 'free'; f.ent.invulnerable = false; f.dodgeClip = null; this.actors.play(f.inst, 'idle'); }
  }

  // ---- legado (sem dados do jogo) ----
  /** forçado por script (attackEntityWithType) */
  forceAttack(f, v) {
    if (!f || !v) return false; this.face(f.ent, v.ent.pos[0] - f.ent.pos[0], v.ent.pos[1] - f.ent.pos[1]);
    if (this.nodesOf(f) && f.state === 'free' && this.begin(f, 'attack')) return true;
    const n = ENEMY_ATK.find(x => this.has(f, x)) || ''; return this.attack(f, n, f.dmg, 0.45);
  }
  /** Inicia um ataque simples; o dano acontece no instante `hitAt` da animação. */
  attack(f, name, dmg, hitAt = 0.42) {
    if (f.state !== 'free' || !f.inst.pose) return false;
    const has = this.has(f, name), d = has ? this.dur(f, name) : 0.55;
    this.aim(f);
    if (this.onSwing) this.onSwing(f);
    f.run = null; f.area = false; f.state = 'attack'; f.t = 0; f.hit = false; f.dur = d; f.hitAt = hitAt * d; f.dmg = dmg;
    if (has) this.actors.play(f.inst, name, { loop: false });
    return true;
  }
  /** Poder do slot n (1..4). Com dados do jogo: nó do powerstyle do herói, nível mínimo e custo de energia do talento. */
  power(f, n) {
    if (f.state !== 'free') return false;
    const nodes = this.nodesOf(f), tv = f.tv, info = f.inst.p.info;
    if (nodes && tv && info.talents) {
      const t = powerForSlot(tv, info.talents, n), lvl = f.level || 1; if (!t) return false;
      if (lvl < unlockLevel(tv, t)) return false;
      const node = nodes.get(t.power); if (!node || !this.has(f, node.clip)) return false;
      const cost = resolveNumber(tv, `%${t.name}_pwr`, lvl, 0); if (f.energy < cost) return false;
      if (!this.startNode(f, t.power, true)) return false;
      f.energy -= cost; f.power = n; f.powerTalent = t; return true;
    }
    if (f.energy < 30) return false;
    const name = `power_${n}`; if (!this.has(f, name) && !this.has(f, HEAVY)) return false;
    if (!this.attack(f, this.has(f, name) ? name : HEAVY, 46 + n * 6, 0.5)) return false;
    f.energy -= 30; f.area = true; f.power = n; f.dur = Math.min(f.dur, 1.6); f.hitAt = Math.min(f.hitAt, 0.8);
    return true;
  }
  /** nível de herói que libera cada slot (1..4); 99 se o herói não tem o poder */
  powerLevels(f) {
    const tv = f.tv, info = f.inst.p.info; return [1, 2, 3, 4].map(n => { const t = tv && info.talents ? powerForSlot(tv, info.talents, n) : null; return t ? unlockLevel(tv, t) : 99; });
  }
  /** projétil do poder (ex.: escudo do Capitão América): voa até `maxrange`, atravessa se `pierce`, e volta ao dono se o handler for ch_returning_projectile */
  spawnProjectile(f, t) {
    const a = t.attrs, rank = f.level || 1, yaw = f.ent.orient[2], ref = resolveValue(f.tv, a.damage, rank);
    const p = { owner: f, dmg: ref ? avgRange(ref.value) : f.dmg, knock: resolveNumber(f.tv, a.knockback, rank, 120), speed: Number(a.speed) || 450, range: Number(a.maxrange) || 800,
      pierce: a.pierce === 'true', returning: !!(f.node && /returning_projectile/.test(f.node.handler)), dir: [Math.cos(yaw), Math.sin(yaw)], dist: 0, back: false, hit: new Set(), t: 0,
      ent: { pos: [f.ent.pos[0] + Math.cos(yaw) * 30, f.ent.pos[1] + Math.sin(yaw) * 30, f.ent.pos[2] + 48], orient: [0, 0, 0], _ver: 0, alive: true, enabled: true, invisible: false, name: 'proj', scale: 1 } };
    this.projectiles.push(p); if (this.onProjectile) this.onProjectile(p, a); return p;
  }
  stepProjectiles(dt) {
    for (const p of this.projectiles) {
      p.t += dt; p.ent.orient[2] += dt * 18; const e = p.ent, o = p.owner;
      if (!p.back) { const k = p.speed * dt; e.pos[0] += p.dir[0] * k; e.pos[1] += p.dir[1] * k; p.dist += k; if (p.dist >= p.range) { if (p.returning) { p.back = true; p.hit.clear(); } else p.dead = true; } }
      else {
        const dx = o.ent.pos[0] - e.pos[0], dy = o.ent.pos[1] - e.pos[1], d = Math.hypot(dx, dy), k = Math.min(d, p.speed * 1.2 * dt);
        if (d < 45 || p.t > 12) p.dead = true; else { e.pos[0] += dx / d * k; e.pos[1] += dy / d * k; }
      }
      e._ver++;
      for (const v of this.foes(o)) {
        if (p.hit.has(v) || Math.hypot(v.ent.pos[0] - e.pos[0], v.ent.pos[1] - e.pos[1]) > 42 || Math.abs(v.ent.pos[2] + 35 - e.pos[2]) > 90) continue;
        p.hit.add(v); this.damage(v, o, Math.max(1, Math.round(p.dmg)), p.knock, 'knockdown'); if (!p.pierce) { if (p.returning && !p.back) { p.back = true; p.hit.clear(); } else p.dead = true; break; }
      }
      if (p.dead) e.alive = false;
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);
  }
  /** entrada do jogador: J = leve (combo), K = pesado */
  input(f, code) {
    if (f.state === 'dead') return;
    const act = ACTION[code];
    if (this.nodesOf(f) && act) {
      if (f.state === 'free') { if (this.begin(f, act)) { if (act === 'smash') { f.holding = true; f.charge = 0; } return; } }
      else if (f.state === 'attack' && f.run) { f.run.press(act); return; }
      else return;
    }
    if (code === 'KeyJ') {
      if (f.state === 'free' || (f.state === 'attack' && f.t > f.dur * 0.55 && f.queued === undefined)) {
        if (f.state === 'attack') { f.queued = 'KeyJ'; return; }
        f.combo = f.comboT > 0 ? (f.combo + 1) % LIGHT.length : 0; this.attack(f, LIGHT[f.combo], 16 + f.combo * 4);
      }
    } else if (code === 'KeyK' && f.state === 'free') { f.combo = 0; this.attack(f, HEAVY, 34, 0.5); }
  }

  /** soltar a tecla do golpe pesado: encerra a carga (o nó segue para o golpe) */
  release(f, code) { if (code === 'KeyK') f.holding = false; }
  /** bloqueio (segurar): reduz dano vindo da frente e toca pain_blocking; só com o personagem livre */
  setBlock(f, on) {
    if (!on) { if (f.blocking) { f.blocking = false; if (f.state === 'free') this.actors.play(f.inst, 'idle'); } return; }
    if (f.state !== 'free' || !this.has(f, 'blocking')) return;
    f.blocking = true; this.actors.play(f.inst, 'blocking', { loop: true });
  }

  // ---- dano e reações ----
  /** Aplica dano a `v` vindo de `a`. kind: pain | knockdown | popup | trip | stun */
  damage(v, a, dmg, knock = 60, kind = null) {
    if (!v.alive || (v.ent.invulnerable)) return;
    if (v.blocking && v.state === 'free') {                                // bloqueio: só vale para golpes vindos da frente
      const bx = a.ent.pos[0] - v.ent.pos[0], by = a.ent.pos[1] - v.ent.pos[1];
      if (Math.abs(wrap(Math.atan2(by, bx) - v.ent.orient[2])) < Math.PI * 0.6) {
        dmg = Math.max(1, Math.round(dmg * 0.2)); knock = Math.min(knock, 25); kind = 'pain';
        if (this.has(v, 'pain_blocking')) { this.actors.play(v.inst, 'pain_blocking', { loop: false }); v.blockHitT = 0.25; }
      }
    }
    v.hp = Math.max(0, v.hp - dmg); this.log.push({ from: a.ent.name, to: v.ent.name, dmg });
    if (this.onHit) this.onHit({ pos: v.ent.pos, dmg, heavy: kind ? kind !== 'pain' : dmg > 25 });
    const dx = v.ent.pos[0] - a.ent.pos[0], dy = v.ent.pos[1] - a.ent.pos[1], l = Math.hypot(dx, dy) || 1;
    const k = kind || (dmg > 25 ? 'knockdown' : 'pain');
    if (v.hp <= 0) { this.ground.move(v.ent, dx / l * knock, dy / l * knock); return this.die(v, a); }
    if (v.blocking && v.state === 'free' && k === 'pain') { this.ground.move(v.ent, dx / l * knock, dy / l * knock); return; }
    if (v.team === 'hero' && k === 'pain' && dmg < 14) { this.ground.move(v.ent, dx / l * knock * 0.3, dy / l * knock * 0.3); return; }   // heróis aguentam golpes fracos sem cambalear
    if (v.state === 'attack' && k === 'pain' && dmg <= 25) { this.ground.move(v.ent, dx / l * knock * 0.3, dy / l * knock * 0.3); return; }
    this.react(v, a, k, knock, dx / l, dy / l);
  }
  /** reação do atingido: sequência de clipes (dor / queda e levantar / lançamento / tropeço / atordoamento) */
  react(v, a, kind, knock, ux, uy) {
    const e = v.ent, front = Math.cos(wrap(Math.atan2(-uy, -ux) - e.orient[2])) > 0;     // atacante à frente do atingido?
    const plan = reactionPlan(kind, front ? 'front' : 'back', n => this.has(v, n), Math.random() < 0.6).filter(s => s.clip);
    v.run = null; v.slide = null; v.down = false; v.ent.invulnerable = false; v.dodgeClip = null;
    if (!plan.length) {                                                       // sem clipes: reação curta genérica
      const r = REACT.find(n => this.has(v, n)) || null; v.state = 'hurt'; v.t = 0; v.plan = null; v.hurtT = r ? this.dur(v, r) : 0.35;
      if (r) this.actors.play(v.inst, r, { loop: false });
      this.ground.move(e, ux * knock, uy * knock); return;
    }
    // o corpo reage olhando para o atacante (cai de costas) ou de costas para ele
    v.state = 'hurt'; v.plan = plan; v.planI = -1; v.air = null; v.push = { ux, uy, left: knock };
    if (kind === 'pain') { this.ground.move(e, ux * Math.min(knock, 30), uy * Math.min(knock, 30)); v.push = null; }
    else this.face(e, -ux, -uy, front ? 1 : 0);
    this.nextStep(v);
  }
  nextStep(v) {
    const p = v.plan; if (!p) return;
    v.planI++; const s = p[v.planI];
    if (!s) { v.state = 'free'; v.plan = null; v.down = false; v.air = null; this.actors.play(v.inst, 'idle'); return; }
    const clipDur = this.dur(v, s.clip), T = s.T || clipDur / (s.rate || 1);
    v.down = /land|bounce|trip/.test(s.clip) && !/getup/.test(s.clip);
    v.t = 0; v.stepT = T; v.air = s.air ? { T, h: s.h || 0, z0: v.ent.pos[2] } : null;
    this.actors.play(v.inst, s.clip, { loop: false, rate: s.T ? clipDur / s.T : (s.rate || 1) });
  }
  die(v, a) {
    v.state = 'dead'; v.deadT = 0; v.run = null; v.plan = null; v.down = true; this.kills += v.team === 'enemy' ? 1 : 0; if (this.onKill) this.onKill(v, a);
    const n = ['death_gen', 'attack_knockback2', 'attack_knockback1'].find(x => this.has(v, x));
    if (n) this.actors.play(v.inst, n, { loop: false }); else v.inst.pose && (v.inst.clip = null);
    if (v.ent.def && v.ent.def.monster_deathscript && this.host) this.host.runScript(v.ent.def.monster_deathscript, v.ent);
  }

  update(dt) {
    this.stepProjectiles(dt);
    for (const f of this.fighters) {
      if (f.blockHitT > 0) { f.blockHitT -= dt; if (f.blockHitT <= 0 && f.blocking && f.state === 'free') this.actors.play(f.inst, 'blocking', { loop: true }); }
      f.cd = Math.max(0, f.cd - dt); f.comboT = Math.max(0, f.comboT - dt); if (f.alive) f.energy = Math.min(100, f.energy + 6 * dt);
      if (f.state === 'dead') {                                              // some depois de 2.5 s (aliados reaparecem)
        f.deadT += dt;
        if (f.deadT > 2.5) {
          if (f.team === 'hero') { f.hp = f.maxhp; f.state = 'free'; f.down = false; f.ent.alive = true; f.ent.enabled = true; f.deadT = 0; this.actors.play(f.inst, 'idle'); }
          else { f.ent.alive = false; f.ent.enabled = false; }
        }
        continue;
      }
      if (f.state === 'attack') {
        if (f.run) this.stepRun(f, dt);
        else {
          f.t += dt;
          if (!f.hit && f.t >= f.hitAt) { f.hit = true; this.strike(f); }
          if (f.t >= f.dur) {
            f.state = 'free'; f.comboT = 0.7;
            if (f.queued) { const q = f.queued; f.queued = undefined; this.input(f, q); } else this.actors.play(f.inst, 'idle');
          }
        }
      } else if (f.state === 'dodge') this.stepDodge(f, dt);
      else if (f.state === 'hurt') this.stepHurt(f, dt);
      else if (!f.controlled) this.ai(f, dt);
    }
  }
  stepRun(f, dt) {
    const run = f.run;
    if (f.holding && /hold_smash/.test(run.node.handler)) {                                    // segurando K: a carga conta desde o início (charge_time = 1 s) e o clipe espera no fim
      f.charge = Math.min(1, (f.charge || 0) + dt); if (run.t >= run.dur - 0.05) return;
    }
    f.t += dt;
    if (f.slide) {                                                          // deslize do golpe em direção ao alvo
      const k = Math.min(f.slide.left, f.slide.rate * dt); this.ground.move(f.ent, f.slide.dx * k, f.slide.dy * k); f.slide.left -= k; if (f.slide.left <= 0.01) f.slide = null;
    }
    for (const t of run.step(dt)) this.fireTrigger(f, t);
    if (run.next === undefined) return;
    const nodes = this.nodesOf(f), nx = run.next === null ? null : nodes.get(run.next);
    f.slide = null;
    if (nx && !isLocomotion(nx) && this.startNode(f, run.next)) return;      // próximo golpe do combo
    f.state = 'free'; f.run = null; f.comboT = 0.4; f.node = null; this.actors.play(f.inst, 'idle');
  }
  stepHurt(f, dt) {
    f.t += dt;
    if (!f.plan) { if (f.t >= f.hurtT) { f.state = 'free'; this.actors.play(f.inst, 'idle'); } return; }
    const e = f.ent;
    if (f.push && f.push.left > 0) {                                        // deslocamento do lançamento durante a fase aérea
      const dur = (f.air && f.air.T) || 0.4, k = Math.min(f.push.left, f.push.left / Math.max(0.05, dur - f.t + dt) * dt);
      this.ground.move(e, f.push.ux * k, f.push.uy * k); f.push.left -= k;
    }
    if (f.air) {                                                            // arco vertical (lançamento / popup)
      const u = Math.min(1, f.t / f.air.T), h = this.ground.height(e.pos[0], e.pos[1], f.air.z0 + 80);
      e.pos[2] = (h === null ? f.air.z0 : Math.max(h, f.air.z0 - 40)) + Math.sin(Math.PI * u) * f.air.h; e._ver++;
    }
    if (f.t >= f.stepT) {
      if (f.air) { const h = this.ground.height(e.pos[0], e.pos[1], e.pos[2] + 80); if (h !== null) e.pos[2] = h; e._ver++; f.air = null; }
      this.nextStep(f);
    }
  }
  strike(f) {
    const yaw = f.ent.orient[2];
    if (f.area) {
      if (this.onFx) this.onFx({ pos: [...f.ent.pos], r: 240, power: f.power, name: f.ent.character || f.ent.name });
      for (const o of this.foes(f)) { if (this.dist(f, o) <= 240 && Math.abs(o.ent.pos[2] - f.ent.pos[2]) < 90) this.damage(o, f, f.dmg + Math.floor(Math.random() * 6), 120); }
      return;
    }
    for (const o of this.foes(f)) {
      const dx = o.ent.pos[0] - f.ent.pos[0], dy = o.ent.pos[1] - f.ent.pos[1], d = Math.hypot(dx, dy);
      if (d > f.range || Math.abs(wrap(Math.atan2(dy, dx) - yaw)) > 1.25 || Math.abs(o.ent.pos[2] - f.ent.pos[2]) > 70) continue;
      this.damage(o, f, f.dmg + Math.floor(Math.random() * 4), f.dmg > 25 ? 90 : 55);
    }
  }
  /** velocidade de solo (unidades/s) que casa com a passada do clipe; cai no valor do lutador se não houver medida */
  pace(f, clip) { const v = this.actors.groundSpeed ? this.actors.groundSpeed(f.inst, clip) : 0; return v > 5 ? v : f.speed; }
  ai(f, dt) {
    const e = f.ent, foes = this.foes(f);
    if (f.inst.scripted || e.aiActive === false || (f.team === 'enemy' && this.host && this.host.aiAll === false)) return;   // encenação por script / IA desligada
    let target = this.nearest(f, foes, f.team === 'enemy' ? 800 : 600);
    let goal = null, stop = f.range * 0.75;
    if (target) goal = target; else if (f.team === 'hero') {                  // aliados voltam para perto do líder
      const lead = this.fighters.find(o => o.controlled && o.alive); if (lead && this.dist(f, lead) > 220) { goal = lead; stop = 150; }
    }
    if (!goal && e.path && e.path.length) {                                   // patrulha por waypoints
      const p = e.path[e.pathI % e.path.length], dx = p[0] - e.pos[0], dy = p[1] - e.pos[1], d = Math.hypot(dx, dy), w = this.has(f, 'walk') ? 'walk' : 'idle';
      if (d < 40) e.pathI = (e.pathI + 1) % e.path.length;
      else { this.face(e, dx, dy, Math.min(1, dt * 8)); this.actors.play(f.inst, w); const sp = Math.min(this.pace(f, w) || 110, 140) * dt; this.ground.move(e, dx / d * Math.min(sp, d), dy / d * Math.min(sp, d)); }
      return;
    }
    if (!goal) { this.actors.play(f.inst, 'idle'); return; }
    const dx = goal.ent.pos[0] - e.pos[0], dy = goal.ent.pos[1] - e.pos[1], d = Math.hypot(dx, dy);
    this.face(e, dx, dy, Math.min(1, dt * 8));
    if (target && d <= f.range && f.cd === 0 && Math.abs(wrap(Math.atan2(dy, dx) - e.orient[2])) < 0.5) {
      if (this.nodesOf(f)) {                                                  // nós do estilo de luta: abre com leve/pesado e encadeia por chance
        const act = Math.random() < 0.7 ? 'attack' : 'smash';
        if (this.begin(f, act) || this.begin(f, act === 'attack' ? 'smash' : 'attack')) { if (f.run && Math.random() < 0.55) f.run.press('attack'); f.cd = 1.0 + Math.random() * 1.4; return; }
      }
      const n = ENEMY_ATK.filter(x => this.has(f, x)); const pick = n.length ? n[Math.floor(Math.random() * n.length)] : '';
      if (this.attack(f, pick, f.dmg, 0.45)) { f.cd = 1.2 + Math.random() * 1.2; return; }
    }
    if (d > stop) {
      const run = this.has(f, 'run') ? 'run' : this.has(f, 'walk') ? 'walk' : 'idle';
      this.actors.play(f.inst, run); const k = Math.min(this.pace(f, run) * dt, d - stop * 0.9);
      this.ground.move(e, dx / d * k, dy / d * k);
    } else this.actors.play(f.inst, 'idle');
  }
}
