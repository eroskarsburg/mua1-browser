// Sistema de ativação de entidades do motor, dirigido pelos atributos do .xmlb do mapa:
//   actontouch / scripttriggerent (caixa + boxcollision), actonuse, actleader, actinactivedelay, tipid
//   actscript, deactscript, acttargets, acteffect, actsound, acttogglesloopfx, actdelay,
//   actcountremove, actcountdisable, actrescheduledelay(min), toggleonact, startenabled
// É isto que conduz a fase: mísseis, jatos, emboscadas, Escorpião, portas e a saída para a próxima zona.
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

/** ponto p dentro da caixa local (extents) da entidade, girada por orient[2] */
export function inBox(e, p, pad = 0) {
  const [x0, y0, z0, x1, y1, z1] = e.ext; if (x0 === x1 && y0 === y1) return false;
  const dx = p[0] - e.pos[0], dy = p[1] - e.pos[1], dz = p[2] - e.pos[2], c = Math.cos(-e.orient[2]), s = Math.sin(-e.orient[2]);
  const lx = dx * c - dy * s, ly = dx * s + dy * c;
  return lx >= x0 - pad && lx <= x1 + pad && ly >= y0 - pad && ly <= y1 + pad && dz >= z0 - 40 && dz <= z1 + pad;
}

/** toque: pela caixa, ou por proximidade para entidades sem extents (cartões, chaves) */
export function touches(e, p) {
  if (e.ext[0] !== e.ext[3] || e.ext[1] !== e.ext[4]) return inBox(e, p);
  return Math.hypot(p[0] - e.pos[0], p[1] - e.pos[1]) < num(e.def.actdistance, 45) && Math.abs(p[2] - e.pos[2]) < 100;
}

export class Acts {
  constructor(host, rng = Math.random) { this.host = host; this.rng = rng; this.timers = []; this.n = -1; this.touch = []; this.usable = []; this.tips = new Set(); this.leader = null; }
  refresh() {
    const l = this.host.world.insts; if (l.length === this.n) return; this.n = l.length;
    this.touch = l.filter(e => e.def.actontouch === 'true' || e.def.classname === 'scripttriggerent');
    this.usable = l.filter(e => e.def.actonuse === 'true');
  }
  /** Ativa `e` (respeita actdelay). silent: sem efeito/som (actSilent). */
  act(e, who, { silent = false, depth = 0, byScript = false } = {}) {
    if (!e || !e.alive || depth > 8) return false;
    const d = num(e.def.actdelay);
    if (d > 0) { this.timers.push({ t: d, e, fn: () => this.fire(e, who, silent, depth, byScript) }); return true; }
    return this.fire(e, who, silent, depth, byScript);
  }
  fire(e, who, silent, depth, byScript = false) {
    if (!e.alive) return false;
    const def = e.def, h = this.host, hero = who || h.heroes[0];
    e.opened = def.toggleonact === 'true' ? !e.opened : true; e.actCount = (e.actCount || 0) + 1;
    if (def.classname === 'doorent') { e.noCollide = e.opened; e.invisible = e.opened; e._ver++; }
    if (!silent) {
      if (def.acteffect && h.onEffect) h.onEffect(def.acteffect, [...e.pos]);
      if (def.actsound && h.onSound) h.onSound(def.actsound);
    }
    if (def.acttogglesloopfx === 'true' && def.loopfx) { e.loopOn = !e.loopOn; if (h.onLoopFx) h.onLoopFx(e, e.loopOn); }
    if (def.classname === 'monsterspawnerent') h.spawnCharacter(e);
    h.runScript(def.actscript, e, hero, !byScript);
    for (const n of String(def.acttargets || '').split(/\s+/)) if (n) for (const t of h.world.find(n)) this.act(t, who, { silent, depth: depth + 1, byScript });
    if (def.actcountremove && e.actCount >= num(def.actcountremove)) { e.alive = false; e.enabled = false; }
    if (def.actcountdisable && e.actCount >= num(def.actcountdisable)) e.actEnabled = false;
    if (def.actrescheduledelay && e.alive && !e.resched) {                  // repete até desativar (canhões, elevador)
      const hi = num(def.actrescheduledelay), lo = num(def.actrescheduledelaymin, hi);
      e.resched = true; this.timers.push({ t: lo + (hi - lo) * this.rng(), e, re: true, fn: () => { e.resched = false; if (e.alive) this.act(e, who, { silent, depth }); } });
    }
    return true;
  }
  /** objeto ou entidade destruída: deathscript, deathtargets e, com actondeath, a ativação normal */
  death(e, who) {
    const def = e.def, h = this.host, hero = who || h.heroes[0];
    h.runScript(def.deathscript, e, hero, true);
    for (const n of String(def.deathtargets || '').split(/\s+/)) if (n) for (const t of h.world.find(n)) this.act(t, who);
    if (def.actondeath === 'true') { h.runScript(def.actscript, e, hero, true); for (const n of String(def.acttargets || '').split(/\s+/)) if (n) for (const t of h.world.find(n)) this.act(t, who); }
  }
  deact(e, who) {
    if (!e) return; e.resched = false; this.timers = this.timers.filter(t => !(t.e === e && t.re));
    this.host.runScript(e.def.deactscript, e, who || this.host.heroes[0], true);
  }
  /** avança temporizadores e testa toques. leader = entidade do herói controlado. */
  update(dt, leader) {
    this.leader = leader || this.host.heroes[0]; this.refresh();
    const due = []; for (const t of this.timers) { t.t -= dt; if (t.t <= 0) due.push(t); }
    if (due.length) { this.timers = this.timers.filter(t => t.t > 0); for (const t of due) t.fn(); }
    const heroes = this.host.heroes;
    for (const e of this.touch) {
      if (e.actCd > 0) e.actCd -= dt;
      if (!e.alive || !e.enabled || e.actEnabled === false) continue;
      const list = e.def.actleader === 'true' ? [this.leader] : heroes, who = list.find(h => h && h.alive !== false && touches(e, h.pos));
      if (who && !e.touching) {
        e.touching = true; if (e.actCd > 0) continue;
        const tip = e.def.tipid; if (tip && !this.tips.has(tip)) { this.tips.add(tip); if (this.host.onTip) this.host.onTip(tip); }
        this.act(e, who); e.actCd = num(e.def.actinactivedelay);
      } else if (!who && e.touching) { e.touching = false; if (e.def.classname === 'scripttriggerent') this.deact(e, this.leader); }
    }
  }
  /** entidade que `who` pode usar agora: dentro da caixa, ou perto (actdistance, 110 por padrão, para portas sem caixa) */
  usableBy(who) {
    this.refresh(); let best = null, bd = Infinity;
    for (const e of this.usable) {
      if (!e.alive || !e.enabled || e.actEnabled === false || (e.def.actleader === 'true' && who !== this.leader && this.leader)) continue;
      const boxed = e.ext[0] !== e.ext[3], d = Math.hypot(who.pos[0] - e.pos[0], who.pos[1] - e.pos[1]);
      if (Math.abs(who.pos[2] - e.pos[2]) > 130) continue;
      if (boxed ? !inBox(e, who.pos, 40) : d > num(e.def.actdistance, 110)) continue;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  /** tecla de usar: ativa a entidade próxima; ligação de zona troca de mapa */
  use(who) {
    const e = this.usableBy(who); if (!e) return null;
    if (e.def.classname === 'zonelinkent' && e.def.nextzone) { if (this.host.onZoneLink) this.host.onZoneLink(e); e.actCd = num(e.def.actinactivedelay); return e; }
    this.act(e, who); return e;
  }
}
