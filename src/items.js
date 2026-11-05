// Itens do mundo: regras do Marvel.exe (FUN_1403f7c40 / 1403fc080 / 1403fbe50 / 1403f6150) + data/item_ents.xmlb.
//   instanthealthorb / instantenergyorb: toque, vida 15 s  |  inventory_money: toque, vida 60 s, caixa +-22, gravitymod 0.5, sem ímã
export const ORB = { health: { color: [1, .15, .12, .9], label: 'vida' }, energy: { color: [.3, .6, 1, .85], label: 'energia' } };
export const MONEY_MODEL = 'pickups/tech_01';             // item MONEY1 (data/items.xmlb)
export const DROP_CHANCE = [0, 0.15, 0.3, 0.45, 0.65, 1]; // por randompickups (0..5): chance de sair equipamento em vez de Tech Bits
export const MAX_PICKUPS = 24, GRAVITY = 1300;
const LIFE = { money: 60, health: 15, energy: 15 }, GRAV = { money: 0.5, health: 1, energy: 1 };
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

/** Quantidade de orbes ao morrer um inimigo (nível >= 10: 3 + até nível*0.2, máx. 5; senão 0..2) */
export const orbCount = (level, rng = Math.random) => (level >= 10 ? Math.trunc(rng() * Math.min(level * 0.2, 5)) + 3 : Math.trunc(rng() * 3));
/** Chance de o orbe ser de vida: 0.5 ajustada pelo herói mais fraco da equipe (vida < 75% puxa para vida; energia < 75%, para energia). */
export function healthOrbChance(minHp, minEnergy) { return minHp < 0.75 ? 0.75 - minHp + 0.5 : minEnergy < 0.75 ? 0.5 - (0.75 - minEnergy) : 0.5; }
/** Tech Bits: total = max(valor/10, 1..4) em 1..2 pilhas. valor = nível * (1 + 15 * r), r em [0.5, 1). */
export function moneyDrop(level, rng = Math.random) {
  const v = level + Math.trunc((0.5 + rng() * 0.5) * level * 15), n = Math.max(Math.trunc(v / 10), 1 + Math.floor(rng() * 4));
  const stacks = Math.max(1, Math.min(n, 1 + Math.floor(rng() * 2))); return { stacks, each: Math.max(1, Math.trunc(n / stacks)), total: n };
}

/** Ramo de item do exe quando o item sorteado é dinheiro: valor inteiro em 2..4 pilhas. Sem equipamento no port, é o pagamento desse ramo. */
export function itemMoney(level, rng = Math.random) {
  const v = level + Math.trunc((0.5 + rng() * 0.5) * level * 15), stacks = Math.max(1, Math.min(v, 2 + Math.floor(rng() * 3)));
  return { stacks, each: Math.max(1, Math.trunc(v / stacks)), total: v };
}

export class Loot {
  /** visual(orb): adiciona o desenho; fx(nome,pos): efeito de coleta; sfx(nome): som; onMoney(valor): soma no inventário; ground: chão p/ a queda */
  constructor({ combat, ground = null, visual = () => {}, fx = () => {}, sfx = () => {}, onMoney = () => {}, rng = Math.random } = {}) {
    Object.assign(this, { combat, ground, visual, fx, sfx, onMoney, rng }); this.orbs = []; this.collected = { health: 0, energy: 0, money: 0 };
  }
  /** Drop de uma entidade destruída: `count` = randompickups (0..5); orbes só para personagens. */
  dropFor(pos, count, { level = 1, character = false, orbs = null } = {}) {
    if (this.orbs.length >= MAX_PICKUPS) return;
    const heroes = this.combat.fighters.filter(f => f.team === 'hero' && f.alive);
    const minHp = Math.min(1, ...heroes.map(f => f.hp / f.maxhp)), minEn = Math.min(1, ...heroes.map(f => f.energy / 100));
    let n = orbs ?? (character ? orbCount(level, this.rng) : 0);            // spawnorbs do npcstat fixa a quantidade (chefes)
    if (character && n < 1 && (minHp <= 0.15 || minEn <= 0.15)) n = 1;      // equipe em perigo: garante um orbe
    const pH = healthOrbChance(minHp, minEn);
    for (let i = 0; i < n && this.orbs.length < MAX_PICKUPS; i++) this.spawn(this.rng() < pH ? 'health' : 'energy', pos);
    if (count <= 0) return;
    const m = this.rng() > DROP_CHANCE[Math.min(5, count)] ? moneyDrop(level, this.rng) : itemMoney(level, this.rng);
    for (let i = 0; i < m.stacks && this.orbs.length < MAX_PICKUPS; i++) this.spawn('money', pos, { value: m.each });
  }
  spawn(type, pos, extra = {}) {
    const ent = { pos: [pos[0], pos[1], pos[2] + 12], orient: [0, 0, 0], _ver: 0, alive: true, enabled: true, invisible: false, name: 'pickup_' + type, scale: type === 'money' ? 0.6 : 1 };
    const yaw = this.rng() * 6.2832, r = 0.8 + this.rng() * 0.4, l = Math.hypot(r, 0.6), sp = 130 + this.rng() * 20;     // lançado para cima e para o lado (FUN_1403fb890)
    const orb = { type, ent, t: 0, life: LIFE[type], vx: Math.cos(yaw) * 0.6 / l * sp, vy: Math.sin(yaw) * 0.6 / l * sp, vz: r / l * sp, g: GRAVITY * GRAV[type], rest: false, ...extra };
    this.orbs.push(orb); this.visual(orb); return orb;
  }
  update(dt) {
    const heroes = this.combat.fighters.filter(f => f.team === 'hero' && f.alive);
    for (const o of this.orbs) {
      o.t += dt; o.ent.orient[2] += dt * 2.5; o.ent._ver++; const e = o.ent;
      if (o.t > o.life) { e.alive = false; continue; }
      if (!o.rest) {
        o.vz -= o.g * dt; e.pos[0] += o.vx * dt; e.pos[1] += o.vy * dt; e.pos[2] += o.vz * dt;
        const h = this.ground ? this.ground.height(e.pos[0], e.pos[1], e.pos[2] + 60) : 0;
        if (o.vz < 0 && h !== null && e.pos[2] <= h + 6) { e.pos[2] = h + 6; o.rest = true; }
        else if (o.vz < 0 && h === null && o.t > 2) o.rest = true;
      }
      const f = heroes.find(x => Math.hypot(x.ent.pos[0] - e.pos[0], x.ent.pos[1] - e.pos[1]) < 42 && Math.abs(x.ent.pos[2] + 30 - e.pos[2]) < 70);
      if (!f) continue;
      if (o.type === 'health') f.hp = Math.min(f.maxhp, f.hp + Math.round(f.maxhp * 0.25));
      else if (o.type === 'energy') f.energy = Math.min(100, f.energy + 40);
      else this.onMoney(o.value);
      this.collected[o.type] = (this.collected[o.type] || 0) + (o.type === 'money' ? o.value : 1);
      e.alive = false; this.fx('base/item/item_pickup', e.pos); this.sfx(o.type === 'money' ? 'common/game/pickup_item' : 'common/game/pickup_power');
    }
    this.orbs = this.orbs.filter(o => o.ent.alive);
  }
}
