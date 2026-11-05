// Modelo de mundo a partir do .xmlb de um mapa (entity = definição, entinst/inst = instância) e o Host que liga
// as nativas dos scripts BehavEd a esse estado.
import { Host, Runner, parse, compare } from './behaved.js';
import { Acts } from './acts.js';

const vec = (s, n = 3, d = 0) => { const a = (s || '').trim().split(/\s+/).map(Number); return Array.from({ length: n }, (_, i) => Number.isFinite(a[i]) ? a[i] : d); };
const truthy = v => v === 1 || v === true || String(v).toUpperCase() === 'TRUE' || (typeof v === 'string' && Number(v) === 1);

export class World {
  /** @param root árvore de parseXmlb() de um mapa  */
  constructor(root) {
    this.defs = new Map(); this.insts = []; this.byName = new Map(); this.zoneVars = new Map(); this.precache = [];
    for (const c of root.children) {
      if (c.tag === 'entity' && c.attrs.name) this.defs.set(c.attrs.name, c.attrs);
      else if (c.tag === 'precache') this.precache.push(c.attrs);
    }
    for (const c of root.children) {
      if (c.tag !== 'entinst') continue;
      for (const i of c.children) if (i.tag === 'inst') this.add(c.attrs.type, i.attrs);
    }
  }
  add(type, a = {}) {
    const def = this.defs.get(type) || {};
    const e = {
      id: this.insts.length, type, name: a.name || type, def, _ver: 0,
      pos: vec(a.pos), orient: vec(a.orient), ext: vec(a.extents, 6),
      enabled: true, actEnabled: def.startenabled !== 'false', invisible: false, alive: true, loopOn: def.loopfxstarton === 'true', noCollide: def.nocollide === 'true', noTarget: false, invulnerable: false,
      noGravity: def.nogravity === 'true', aiActive: true, health: Number(def.health) || 100, healthMax: Number(def.health) || 100,
    };
    this.insts.push(e);
    (this.byName.get(e.name) || this.byName.set(e.name, []).get(e.name)).push(e);
    return e;
  }
  find(name) { return this.byName.get(name) || []; }
  get playerStarts() { return this.insts.filter(e => e.def.classname === 'playerstartent'); }
  /** ponto de início: o que declara `prevzone` igual à zona de onde se veio, senão o marcado `default` */
  startFor(prevZone = '') {
    const l = this.playerStarts, base = s => String(s || '').toLowerCase().split('/').pop(), z = base(prevZone);   // prevzone pode vir com caminho completo
    return (z && l.find(e => base(e.def.prevzone) === z)) || l.find(e => e.def.default === 'true') || l[0] || null;
  }
}

/** Host com semântica de entidades. `loadScript(path)` devolve o programa (ou null) para actscript/spawnscript... */
export class WorldHost extends Host {
  constructor(world, { loadScript = () => null, rng, prevZone = '' } = {}) {
    super(rng); this.world = world; this.loadScript = loadScript; this.runner = null; this.objectives = new Map();
    const st = world.startFor(prevZone), sp = st ? st.pos : [0, 0, 0];     // allinone: a equipe inteira no mesmo ponto, em formação
    this.heroes = [1, 2, 3, 4].map(n => this.world.find(`_HERO${n}_`)[0] || Object.assign(world.add('hero', { name: `_HERO${n}_`, pos: [sp[0] + ((n - 1) % 2) * 50, sp[1] + ((n - 1) >> 1) * 50, sp[2]].join(' '), orient: st ? st.orient.join(' ') : '' }), { hero: true }));
    this.acts = new Acts(this, rng); this.onTip = null; this.onLoopFx = null; this.onZoneLink = null;
    this.inventory = new Map(); this.onPopup = null; this.onMoneyChange = null;
    this.onSound = null; this.onPlayAnim = null; this.onTeleport = null; this.onAttack = null; this.onEffect = null; this.onLight = null; this.aiAll = true; this.noTarget = { hero: false, enemy: false };
    this.onLoadZone = null; this.director = null; this.obj = null; this.onConversation = null; this.convAllowed = true;   // ligados pelo viewer
    this.onSpawn = null;                                 // (entidade, personagem) => void, ligado pelo viewer
    this.stats = { resolved: 0, unresolved: 0, blocked: 0 }; this.runs = new Map(); this.unresolvedNames = new Map(); this.maxTasks = 5000; this.maxRuns = 8;
  }
  ents(name, ctx) {                                   // nomes especiais e instâncias com o nome
    if (name === '_OWNER_') return ctx.owner && typeof ctx.owner === 'object' ? [ctx.owner] : this.world.find(ctx.owner);
    if (name === '_ACTIVATOR_') return ctx.activator ? [ctx.activator] : [this.heroes[0]];
    if (name === '_ACTIVE_HERO_') return [this.heroes[0]];
    const m = /^_HERO(\d)_$/.exec(name); if (m) return [this.heroes[m[1] - 1]];
    return this.world.find(String(name));
  }
  target(name, ctx) { const l = this.ents(name, ctx); this.stats[l.length ? 'resolved' : 'unresolved']++; if (!l.length) this.unresolvedNames.set(String(name), (this.unresolvedNames.get(String(name)) || 0) + 1); return l; }
  /** Cria o personagem de um monsterspawnerent (nome da entidade = monster_name ou o personagem). */
  spawnCharacter(sp) {
    const ch = sp.def.character; if (!ch || sp.spawned) return null;
    sp.spawned = true;
    const e = this.world.add('character', { name: sp.def.monster_name || ch.toLowerCase(), pos: sp.pos.join(' '), orient: sp.orient.join(' ') });
    e.character = ch; e.spawner = sp; e.def = { ...sp.def, classname: 'character', nocollide: 'true' };
    if (this.onSpawn) this.onSpawn(e, ch);
    this.runScript(sp.def.monster_spawnscript, e);
    return e;
  }
  /** Spawners com instantspawn nascem ao carregar o mapa. */
  initialSpawns() { return this.world.insts.filter(e => e.def.classname === 'monsterspawnerent' && e.def.instantspawn === 'true').map(e => this.spawnCharacter(e)).filter(Boolean); }
  /** repeat: ativação legítima e repetível (toque, uso, reagendamento), fora do limite contra scripts que se re-disparam */
  runScript(path, owner, activator, repeat = false) {
    if (!path) return false;
    const m = /^([A-Za-z_]\w*)\((.*)\)$/.exec(path);                       // chamada inline: actionFigureReward('x',1,2)
    const prog = m ? parse(path) : this.loadScript(path);
    if (!prog || !this.runner) return false;
    const key = path + '|' + (owner && owner.id), n = (this.runs.get(key) || 0) + 1; this.runs.set(key, n);   // guarda contra scripts que se re-disparam
    if ((n > this.maxRuns && !repeat) || this.runner.tasks.length >= this.maxTasks) { this.stats.blocked++; return false; }
    this.runner.start(prog, { owner, activator }); return true;
  }
  call(name, args, ctx) {
    const set = (prop, val) => { for (const e of this.target(args[0], ctx)) e[prop] = val; };
    switch (name) {
      case 'setEnable': for (const e of this.target(args[0], ctx)) e.enabled = e.actEnabled = truthy(args[1]); break;
      case 'getEnable': return this.target(args[0], ctx).every(e => e.enabled && e.actEnabled !== false) ? 1 : 0;
      case 'setInvisible': set('invisible', truthy(args[1])); break;
      case 'setNoCollide': set('noCollide', truthy(args[1])); break;
      case 'setNoTarget': set('noTarget', truthy(args[1])); break;
      case 'setInvulnerable': set('invulnerable', truthy(args[1])); break;
      case 'setNoGravity': set('noGravity', truthy(args[1])); break;
      case 'setAIActive': set('aiActive', truthy(args[1])); break;
      case 'remove': case 'killEntity': case 'killEntitySilent': for (const e of this.target(args[0], ctx)) { e.alive = false; e.enabled = false; } break;
      case 'alive': { const l = this.target(args[0], ctx); return l.length && l.some(e => e.alive) ? 1 : 0; }
      case 'getName': { const l = this.ents(args[0], ctx); return l[0] ? l[0].name : String(args[0]); }
      case 'getHealth': return this.target(args[0], ctx)[0]?.health ?? 0;
      case 'getHealthMax': return this.target(args[0], ctx)[0]?.healthMax ?? 0;
      case 'setHealth': set('health', Number(args[1])); break;
      case 'getPosX': return this.target(args[0], ctx)[0]?.pos[0] ?? 0;
      case 'getPosY': return this.target(args[0], ctx)[0]?.pos[1] ?? 0;
      case 'getPosZ': return this.target(args[0], ctx)[0]?.pos[2] ?? 0;
      case 'getDistance': { const a = this.target(args[0], ctx)[0], b = this.target(args[1], ctx)[0]; return a && b ? Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]) : 0; }
      case 'copyOriginAndAngles': {
        const src = this.target(args[1], ctx)[0];
        if (src) for (const e of this.target(args[0], ctx)) { e.pos = [...src.pos]; e.orient = [...src.orient]; e._ver++; } break;
      }
      case 'faceEntity': { const a = this.target(args[0], ctx)[0], b = this.target(args[1], ctx)[0]; if (a && b) { a.orient[2] = Math.atan2(b.pos[1] - a.pos[1], b.pos[0] - a.pos[0]); a._ver++; } break; }
      case 'spawn': {
        const at = this.target(args[0], ctx)[0], off = String(args[3] ?? '').trim().split(/\s+/).map(Number), ang = String(args[4] ?? '').trim().split(/\s+/).map(Number);
        const pos = (at ? at.pos : [0, 0, 0]).map((v, i) => v + (off[i] || 0)), orient = at ? at.orient.map((v, i) => v + (ang[i] || 0)) : [0, 0, 0];
        const e = this.world.add(String(args[1]), { name: String(args[2] ?? args[1]), pos: pos.join(' '), orient: orient.join(' ') });
        this.runScript(e.def.spawnscript, e); return e.name;
      }
      case 'act': case 'actSilent': for (const e of this.target(args[0], ctx)) this.acts.act(e, ctx.activator || this.heroes[0], { silent: name === 'actSilent', byScript: true }); break;
      case 'deact': for (const e of this.target(args[0], ctx)) this.acts.deact(e, ctx.activator); break;
      case 'setObjective': this.objectives.set(String(args[0]), args[1]); break;
      case 'getObjective': return this.obj ? (this.obj.done.has(String(args[0])) ? 1 : 0) : (this.objectives.get(String(args[0])) ?? 0);
      case 'objective': if (this.obj) this.obj.command(String(args[0]), args[1]); else this.objectives.set(String(args[0]), args[1]); break;
      case 'display': if (this.director) this.director.toast(args[0]); break;
      case 'lockControls': if (this.director) this.director.lockControls(args[0]); break;
      case 'startCutScene': if (this.director) this.director.startCutScene(); break;
      case 'endCutScene': if (this.director) this.director.endCutScene(); break;
      case 'cameraFade': case 'fadeScreen': if (this.director) this.director.cameraFade(args[0], args[1]); break;
      case 'cameraToLocationAngles': if (this.director) this.director.cameraToLocationAngles(args[0], args[1], args[2]); break;
      case 'cameraMove': if (this.director) this.director.cameraMove(args[0], args[1]); break;
      case 'cameraPan': if (this.director) this.director.cameraPan(args[0], args[1]); break;
      case 'cameraFocusToEntity': if (this.director) this.director.cameraFocusToEntity(this.target(args[0], ctx)[0], args[1], args[2], args[3], args[4]); break;
      case 'cameraReset': case 'cameraResetOldSchool': if (this.director) this.director.cameraReset(); break;
      case 'cameraShake': if (this.director) this.director.cameraShake(args[0], args[1]); break;
      case 'cameraFOV': if (this.director) this.director.cameraFOV(args[0], args[1]); break;
      case 'loadZone': case 'loadMap': if (this.onLoadZone) this.onLoadZone(String(args[0]), String(args[1] || '')); break;
      case 'playanim': {                                    // playanim(zona, alvo, modo, sinal): sinal ao terminar (par do waitsignal)
        const ent = this.target(args[1], ctx)[0], sig = String(args[3] ?? ''), mode = String(args[2] ?? 'NONE').toUpperCase();
        const ok = ent && this.onPlayAnim ? this.onPlayAnim(ent, String(args[0]), mode, sig) : false;
        if (!ok && sig && this.runner) this.runner.signal(sig);                         // sem animação: não trava o script
        break;
      }
      case 'getInventoryCount': return this.inventory.get(String(args[0])) ?? 0;
      case 'setInventoryCount': this.inventory.set(String(args[0]), Math.max(0, Number(args[1]) | 0)); if (this.onMoneyChange) this.onMoneyChange(); break;
      case 'createPopupDialogXml': if (this.onPopup) this.onPopup(String(args[0])); break;
      case 'getOpened': { const l = this.target(args[0], ctx); return l.length && l.every(e => e.opened) ? 1 : 0; }
      case 'setHintType': for (const e of this.target(args[0], ctx)) e.hint = String(args[1] ?? '').toLowerCase(); break;
      case 'cameraSetClipPlane': case 'cameraFollowMotionPath': break;
      case 'sound': if (this.onSound && /PLAY/i.test(String(args[0]))) this.onSound(String(args[1])); break;
      case 'startMovie': if (this.director) this.director.toast('Vídeo: ' + String(args[0]).split('/').pop() + ' (Bink 2 não suportado, pulado)'); break;
      case 'setallaiactive': this.aiAll = truthy(args[0]); break;
      case 'heroNoTarget': this.noTarget.hero = truthy(args[0]); break;
      case 'enemiesNoTarget': this.noTarget.enemy = truthy(args[0]); break;
      case 'moveHeroesToEnt': {
        const t = this.target(args[0], ctx)[0];
        if (t) this.heroes.forEach((h, i) => { h.pos = [t.pos[0] + (i % 2) * 45, t.pos[1] + (i >> 1) * 45, t.pos[2]]; h._ver++; if (this.onTeleport) this.onTeleport(h); });
        break;
      }
      case 'attackEntityWithType': { const a = this.target(args[0], ctx)[0], v = this.target(args[1], ctx)[0]; if (a && v && this.onAttack) this.onAttack(a, v); break; }
      case 'setNoClip': set('noClip', truthy(args[1])); break;
      case 'setScale': for (const e of this.target(args[0], ctx)) { e.scale = Number(args[1]) || 1; e._ver++; } break;
      case 'setAlpha': set('alpha', Number(args[1])); break;
      case 'spawnEffect': case 'spawnEffectBone': {
        const t = this.target(args[0], ctx)[0], off = String(args[2] ?? '').trim().split(/\s+/).map(Number);
        if (t && this.onEffect) this.onEffect(String(args[1]), [t.pos[0] + (off[0] || 0), t.pos[1] + (off[1] || 0), t.pos[2] + (off[2] || 0) + 40]);
        break;
      }
      case 'setPartyLightColor': case 'setAmbientLightColor': if (this.onLight) this.onLight(String(args[0]).trim().split(/\s+/).map(Number)); break;
      case 'setWaypointPath': {                              // patrulha: waypoints cujo nome começa com o caminho
        const path = String(args[1] ?? '');
        for (const e of this.target(args[0], ctx)) {
          if (!path) { e.path = null; continue; }
          const pts = this.world.insts.filter(w => w.def.classname === 'waypointent' && w.name.startsWith(path)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
          e.path = pts.length ? pts.map(w => [...w.pos]) : null; e.pathI = 0;
        }
        break;
      }
      case 'allowConversation': this.convAllowed = truthy(args[0]); break;
      case 'startConversation': case 'startCharConversation': if (this.convAllowed && this.onConversation) this.onConversation(String(args[0]), args[1] ? String(args[1]) : ''); break;
      case 'isActorInList': case 'isActorOnTeam': break;
      default: return super.call(name, args, ctx);
    }
    this.log.push({ t: this.time, fn: name, args, owner: ctx.owner && ctx.owner.name || ctx.owner });
    return name.startsWith('get') || name.startsWith('is') ? 0 : undefined;
  }
}

/** Cria Runner+host ligados ao mundo. */
export function createSim(world, opts) {
  const host = new WorldHost(world, opts), runner = new Runner(host); host.runner = runner; return { host, runner };
}
