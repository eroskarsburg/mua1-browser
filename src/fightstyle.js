// Máquina de combate do jogo original, dirigida por dados:
//   data/shared_anims.xmlb          ea_* (ação) -> nome do clipe
//   data/shared_event_templates.xmlb eventos-modelo (punch, kick, slide, ...) com dano/alcance/arco
//   data/shared_nodes*.xmlb         nós comuns (reações, esquiva, queda, levantar)
//   data/fightstyles/<estilo>.xmlb  nós de ataque do estilo (combos light1->2->3, heavy, popup, ground...)
// Cada nó (FightMove) toca uma animação, dispara gatilhos em instantes (golpe, rastro, som, deslize) e encadeia
// por ação do jogador (attack/smash/...) a partir de `startchaintime`; ao fim do clipe segue a cadeia `idle`.
const lc = s => String(s || '').toLowerCase();
const isTag = (n, name) => lc(n.tag) === name;

/** "2 3" -> média 2.5; número simples -> ele mesmo; ausente -> 0 */
export function avgRange(v) {
  if (v === undefined || v === null || v === '') return 0;
  const p = String(v).trim().split(/\s+/).map(Number).filter(Number.isFinite); return p.length ? p.reduce((a, b) => a + b, 0) / p.length : 0;
}

/** Tabela ea_* -> clipe (minúsculo). */
export function parseAnimTable(root) {
  const m = new Map(); const a = (root.children || []).find(c => isTag(c, 'anims')); if (!a) return m;
  for (const [k, v] of Object.entries(a.attrs)) m.set(lc(k), lc(v));
  return m;
}

/** Eventos-modelo: nome -> atributos já resolvidos por `inherit` (+ mods de dano). */
export function parseEvents(root, into = new Map()) {
  const raw = new Map(); for (const c of root.children || []) if (isTag(c, 'event') && c.attrs.name) raw.set(lc(c.attrs.name), c);
  const resolve = (c, seen = new Set()) => {
    const a = c.attrs, base = a.inherit && raw.get(lc(a.inherit)) && !seen.has(lc(a.inherit)) ? resolve(raw.get(lc(a.inherit)), new Set([...seen, lc(a.name)])) : { attrs: {}, mods: [] };
    return { attrs: { ...base.attrs, ...a }, mods: [...base.mods, ...modsOf(c)] };
  };
  for (const [n, c] of raw) into.set(n, resolve(c));
  return into;
}
const modsOf = c => (c.children || []).filter(t => isTag(t, 'damagemod')).map(t => lc(t.attrs.name));

/** Lista de nós (NodeList/FightingStyle) -> Map nome -> nó resolvido (herança, cadeias, gatilhos). */
export function parseNodes(root, { anim, events }, into = new Map()) {
  const raw = new Map(); for (const c of root.children || []) if (isTag(c, 'fightmove') && c.attrs.name) raw.set(lc(c.attrs.name), c);
  const localEv = new Map(events);
  for (const c of raw.values()) for (const e of c.children || []) if (isTag(e, 'event') && e.attrs.name) {           // eventos declarados dentro do nó
      const base = e.attrs.inherit && localEv.get(lc(e.attrs.inherit)) || { attrs: {}, mods: [] };
      localEv.set(lc(e.attrs.name), { attrs: { ...base.attrs, ...e.attrs }, mods: [...base.mods, ...modsOf(e)] });
  }
  const resolve = (c, seen = new Set()) => {
    const a = c.attrs, name = lc(a.name);
    const par = a.inherit && raw.get(lc(a.inherit)) && !seen.has(lc(a.inherit)) ? resolve(raw.get(lc(a.inherit)), new Set([...seen, name])) : null;
    const chain = new Map(par ? par.chain : []), trig = par ? par.triggers.map(t => ({ ...t, attrs: { ...t.attrs }, mods: [...t.mods] })) : [];
    for (const ch of (c.children || [])) {
      if (isTag(ch, 'chain')) chain.set(lc(ch.attrs.action), lc(ch.attrs.result));
      else if (isTag(ch, 'trigger')) {
        const own = { ...ch.attrs }, ev = localEv.get(lc(own.name)), mods = modsOf(ch);
        const tag = own.tag, prev = tag !== undefined && !own.name ? trig.find(t => t.attrs.tag === tag) : null;
        if (prev) { Object.assign(prev.attrs, own); prev.mods.push(...mods); }                                     // sobrescreve o gatilho herdado de mesma tag
        else trig.push({ name: lc(own.name), time: own.time === undefined ? 0 : Number(own.time), attrs: { ...(ev ? ev.attrs : {}), ...own }, mods: [...(ev ? ev.mods : []), ...mods] });
      }
    }
    const attrs = { ...(par ? par.attrs : {}), ...a }; delete attrs.inherit;
    const ea = lc(attrs.animenum);
    return { name, attrs, clip: anim.get(ea) || null, ea, chain, triggers: trig,
      playspeed: Number(attrs.playspeed) || 1, startChain: attrs.startchaintime === undefined ? null : Number(attrs.startchaintime),
      endChain: attrs.endchaintime === undefined ? null : Number(attrs.endchaintime), blend: attrs.blendtime === undefined ? null : Number(attrs.blendtime),
      noncombat: attrs.noncombat === 'true', lockAngles: attrs.lockangles === 'true', handler: attrs.handler || '' };
  };
  for (const [n, c] of raw) into.set(n, resolve(c));
  return into;
}

/** Carrega todos os dados de combate do archive `data` (e o estilo `style`, ex.: fightstyle_default). */
export async function loadFightData(data, parse) {
  const rd = async n => (data.has(n) ? parse(await data.read(n)) : null);
  const anim = parseAnimTable(await rd('shared_anims.xmlb') || { children: [] });
  const events = parseEvents(await rd('shared_event_templates.xmlb') || { children: [] });
  const shared = new Map();
  for (const f of ['shared_nodes.xmlb', 'shared_nodes_combat.xmlb']) { const r = await rd(f); if (r) parseNodes(r, { anim, events }, shared); }
  const styles = new Map();
  return {
    anim, events, shared, styles,
    async style(name) {                                                    // nós do estilo + compartilhados (o estilo vence)
      const k = lc(name); if (!styles.has(k)) {
        const r = await rd(`fightstyles/${k}.xmlb`), own = r ? parseNodes(r, { anim, events }) : new Map();
        styles.set(k, new Map([...shared, ...own]));
      }
      return styles.get(k);
    },
  };
}

/**
 * Execução de um nó: tempo, gatilhos, entrada em buffer e encadeamento.
 * `clipDur` = duração do clipe em segundos (já na velocidade 1); o nó dura clipDur/playspeed.
 */
export class MoveRun {
  constructor(node, clipDur, nodes) {
    this.node = node; this.nodes = nodes; this.t = 0; this.dur = Math.max(0.05, (clipDur || 0.5) / node.playspeed); this.fired = new Set(); this.buffer = null; this.bufT = 0;
    this.tags = new Set(); this.next = undefined;                          // next: undefined = em curso, string = nó, null = fim (volta ao livre)
    this.sorted = node.triggers.map((t, i) => ({ t, i })).filter(x => x.t.time >= 0).sort((a, b) => a.t.time - b.t.time);
  }
  /** guarda uma ação do jogador (attack, smash, ...); é consumida em `startchaintime` */
  press(action) { this.buffer = action; this.bufT = this.t; }
  /** avança dt; devolve a lista de gatilhos disparados neste passo */
  step(dt) {
    const out = [], ps = this.node.playspeed; this.t += dt;
    for (const { t, i } of this.sorted) if (!this.fired.has(i) && t.time / ps <= this.t) { this.fired.add(i); out.push(t); }
    const sc = this.node.startChain === null ? this.dur : this.node.startChain / ps;
    if (this.buffer && this.t >= Math.min(sc, this.dur)) {
      const r = this.node.chain.get(this.buffer); this.buffer = null;
      if (r && r !== 'null' && this.nodes.has(r)) this.next = r;
    }
    if (this.next === undefined && this.t >= this.dur) {                   // fim do clipe: cadeia `idle`
      const r = this.node.chain.get('idle'); this.next = r && r !== 'null' && this.nodes.has(r) ? r : null;
    }
    return out;
  }
  /** gatilhos marcados por tag (time < 0), usados após um `filter` */
  tagged(tag) { return this.node.triggers.filter(t => String(t.attrs.tag) === String(tag) && t.time < 0); }
}

/** nós de locomoção/ociosos: ao encadear para eles, o combate termina e o jogador volta ao controle */
export const isLocomotion = n => !n || n.noncombat || ['idle', 'walk', 'run', 'sprint', 'strafeleft', 'straferight', 'advance', 'retreat', 'jump', 'blocking', 'powers', 'guarddecide'].includes(n.name);

/** Clipe de reação por tipo; `dir` = 'front' (atingido de frente) ou 'back'. Ordem = sequência de clipes e a taxa de reprodução. */
export function reactionPlan(kind, dir = 'front', has = () => true, high = true) {
  const pick = (...c) => c.find(has);
  const front = dir !== 'back';                                            // atingido de frente -> é jogado para trás e cai de costas
  switch (kind) {
    case 'knockdown': return front
      ? [{ clip: pick('flyingback_loop'), air: true, T: 0.4, h: 30 }, { clip: pick('flyingback_land'), rate: 1.75 }, { clip: pick('flyingback_getup'), rate: 1.75 }]
      : [{ clip: pick('flyingforward_loop'), air: true, T: 0.4, h: 30 }, { clip: pick('flyingforward_land'), rate: 1.5 }, { clip: pick('flyingforward_getup'), rate: 2 }];
    case 'popup': return [{ clip: pick('popup'), air: true, T: 0.85, h: 95 }, { clip: pick('popup_bounce'), rate: 1.75 }, { clip: pick('flyingforward_getup'), rate: 2 }];
    case 'trip': return [{ clip: pick('trip'), rate: 1.3 }, { clip: pick('flyingforward_getup'), rate: 2 }];
    case 'stun': return [{ clip: pick('stun'), rate: 1.6 }];
    case 'pain': return [{ clip: front ? pick(high ? 'pain_high' : 'pain_low', 'pain_high') : pick('pain_rear', 'pain_high'), rate: 1 }];
    default: return [];
  }
}
