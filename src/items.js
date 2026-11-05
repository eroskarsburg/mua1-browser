// Itens do mundo: orbes de vida/energia (item_ents.xmlb: orbent), Tech Bits (moeda, items.xmlb MONEY*), XP e níveis.
export const ORB = { health: { color: [.25, 1, .35, .85], label: 'vida' }, energy: { color: [.3, .6, 1, .85], label: 'energia' } };
/** Tech Bits: o jogo usa 3 modelos (pickups/tech_01..03) para valores crescentes. */
export const TECH = [{ model: 'pickups/tech_01', value: 1 }, { model: 'pickups/tech_02', value: 5 }, { model: 'pickups/tech_03', value: 25 }];
export const xpNeeded = lvl => 40 + 30 * lvl;

/** Concede XP a um lutador; sobe de nível (vida/dano maiores) e devolve quantos níveis subiu. */
export function grantXp(f, amount) {
  f.xp = (f.xp || 0) + amount; f.level = f.level || 1; let ups = 0;
  while (f.xp >= xpNeeded(f.level)) {
    f.xp -= xpNeeded(f.level); f.level++; ups++;
    const k = f.maxhp; f.maxhp = Math.round(f.maxhp * 1.08); f.hp = Math.min(f.maxhp, f.hp + (f.maxhp - k)); f.dmg = Math.round(f.dmg * 1.06 * 10) / 10;
  }
  return ups;
}

/** Quebra um valor em peças de Tech Bits (25 / 5 / 1), no máximo `max` peças. */
export function splitMoney(total, max = 6) {
  const out = []; let t = Math.max(0, Math.floor(total));
  for (const k of [2, 1, 0]) while (t >= TECH[k].value && out.length < max) { out.push(k); t -= TECH[k].value; }
  if (t > 0 && out.length) out[out.length - 1] = Math.min(2, out[out.length - 1] + 1);          // resto vai na última peça
  return out;
}

export class Loot {
  /** visual(orb): adiciona o desenho; fx(nome,pos): efeito de coleta; sfx(nome): som; onMoney(valor): soma no inventário */
  constructor({ combat, visual = () => {}, fx = () => {}, sfx = () => {}, onMoney = () => {}, rng = Math.random } = {}) {
    Object.assign(this, { combat, visual, fx, sfx, onMoney, rng }); this.orbs = []; this.collected = { health: 0, energy: 0, money: 0 };
  }
  /** drop ao morrer um inimigo: ~22% vida, ~22% energia */
  drop(pos) {
    const r = this.rng(); const type = r < 0.22 ? 'health' : r < 0.44 ? 'energy' : null; if (!type) return null;
    return this.spawn(type, pos);
  }
  /** Tech Bits: valor total espalhado em até 6 peças */
  dropMoney(pos, total) {
    return splitMoney(total).map((tier, i, a) => {
      const ang = (i / Math.max(1, a.length)) * 6.283 + this.rng(), r = 18 + this.rng() * 22;
      return this.spawn('money', [pos[0] + Math.cos(ang) * r, pos[1] + Math.sin(ang) * r, pos[2]], { tier, value: TECH[tier].value });
    });
  }
  spawn(type, pos, extra = {}) {
    const ent = { pos: [pos[0], pos[1], pos[2] + 14], orient: [0, 0, 0], _ver: 0, alive: true, enabled: true, invisible: false, name: 'orb_' + type, scale: 1 };
    const orb = { type, ent, z0: ent.pos[2], t: 0, life: type === 'money' ? 45 : 15, ...extra };
    this.orbs.push(orb); this.visual(orb); return orb;
  }
  update(dt) {
    const heroes = this.combat.fighters.filter(f => f.team === 'hero' && f.alive);
    for (const o of this.orbs) {
      o.t += dt; o.ent.orient[2] += dt * 2.5; o.ent._ver++;
      if (o.t > o.life) { o.ent.alive = false; continue; }
      let near = null, nd = 1e9;
      for (const f of heroes) { const d = Math.hypot(f.ent.pos[0] - o.ent.pos[0], f.ent.pos[1] - o.ent.pos[1]); if (d < nd) { nd = d; near = f; } }
      if (o.type === 'money' && near && o.t > 0.45 && nd < 150 && nd > 1) {            // ímã: Tech Bits voam até o herói
        const k = Math.min(nd, (260 + (150 - nd) * 4) * dt); o.ent.pos[0] += (near.ent.pos[0] - o.ent.pos[0]) / nd * k; o.ent.pos[1] += (near.ent.pos[1] - o.ent.pos[1]) / nd * k;
        o.z0 += (near.ent.pos[2] + 30 - o.z0) * Math.min(1, dt * 6);
      }
      o.ent.pos[2] = o.z0 + Math.sin(o.t * 4) * 4;
      const h = near && nd < 55 && Math.abs(near.ent.pos[2] + 30 - o.z0) < 90 ? near : null;
      if (!h) continue;
      if (o.type === 'health') h.hp = Math.min(h.maxhp, h.hp + Math.round(h.maxhp * 0.25));
      else if (o.type === 'energy') h.energy = Math.min(100, h.energy + 40);
      else this.onMoney(o.value);
      this.collected[o.type] = (this.collected[o.type] || 0) + (o.type === 'money' ? o.value : 1);
      o.ent.alive = false; this.fx('base/item/item_pickup', o.ent.pos); this.sfx(o.type === 'money' ? 'common/game/pickup_item' : 'common/game/pickup_power');
    }
    this.orbs = this.orbs.filter(o => o.ent.alive);
  }
}
