// Save/load em localStorage: mapa, equipe, nível/XP por herói, flags de jogo, objetivos.
const KEY = 'mua-save-v1';

export function snapshot({ map, team, fighters = [], host, objectives, kills = 0 }) {
  const heroes = {}; for (const f of fighters) if (f.team === 'hero') heroes[f.inst.p.info.name] = { level: f.level || 1, xp: f.xp || 0, maxhp: f.maxhp, dmg: f.dmg };
  return {
    v: 1, at: Date.now(), map, team: [...team], heroes, kills,
    flags: host ? [...host.flags] : [], zone: host ? [...host.zone] : [], inventory: host && host.inventory ? [...host.inventory] : [],
    objectives: objectives ? { shown: [...objectives.shown.keys()], done: [...objectives.done], progress: [...objectives.progress] } : null,
  };
}

/** Aplica um save a host/objetivos (flags e objetivos); níveis são aplicados por applyHero ao registrar cada lutador. */
export function restore(save, { host, objectives }) {
  if (host) { host.flags = new Map(save.flags || []); host.zone = new Map(save.zone || []); host.inventory = new Map(save.inventory || []); }
  if (objectives && save.objectives) {
    objectives.shown = new Map(save.objectives.shown.map(n => [n, true])); objectives.done = new Set(save.objectives.done); objectives.progress = new Map(save.objectives.progress);
  }
}
export function applyHero(save, f) {
  const h = save && save.heroes && save.heroes[f.inst.p.info.name]; if (!h) return;
  Object.assign(f, { level: h.level, xp: h.xp, maxhp: h.maxhp, dmg: h.dmg }); f.hp = f.maxhp;
}

export function write(save, storage = globalThis.localStorage) { try { storage.setItem(KEY, JSON.stringify(save)); return true; } catch { return false; } }
export function read(storage = globalThis.localStorage) { try { const s = JSON.parse(storage.getItem(KEY) || 'null'); return s && s.v === 1 ? s : null; } catch { return null; } }
export function clear(storage = globalThis.localStorage) { try { storage.removeItem(KEY); } catch { /* sem storage */ } }
