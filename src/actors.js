// Atores animados no mundo: character (npcstat/herostat) -> malha (skin) + animações (characteranims), uma pose por instância.
import { IGB } from './igb.js';
import { buildScene, mul, entMatrix } from './scene.js';
import { parseXmlb } from './xmlb.js';
import { readSkeleton, readAnimations, Pose } from './anim.js';

/** Tabelas de personagens: nome (minúsculo) -> { name, skin, anims, playable }. */
export async function loadCharacterDB(data) {
  const db = new Map();
  for (const f of ['npcstat', 'herostat']) {
    if (!data.has(f + '.xmlb')) continue;
    for (const c of parseXmlb(await data.read(f + '.xmlb')).children) {
      const a = c.attrs; if (!a.name || !a.skin) continue;
      const fs = (c.children || []).find(t => t.tag === 'talent' && /^fightstyle_/.test(t.attrs.name || ''));
      const talents = (c.children || []).filter(t => t.tag === 'talent' && t.attrs.name).map(t => t.attrs.name);
      db.set(a.name.toLowerCase(), { name: a.name, skin: a.skin, anims: a.characteranims || '', playable: a.playable === 'true', fightstyle: fs ? fs.attrs.name : 'fightstyle_default', powerstyle: a.powerstyle || '', talents });
    }
  }
  return db;
}

export class Actors {
  constructor(archive, db) {
    this.archive = archive; this.db = db; this.protos = new Map(); this.list = [];
    this.index = new Map(archive.entries.map(e => [e.name.toLowerCase(), e]));
  }
  /** Carrega (uma vez por skin) malha + esqueleto + animações. */
  proto(char) {
    const info = this.db.get(String(char).toLowerCase()); if (!info) return Promise.resolve(null);
    if (!this.protos.has(info.skin)) this.protos.set(info.skin, (async () => {
      const se = this.index.get(info.skin.toLowerCase() + '.igb'); if (!se) return null;
      const g = new IGB(await this.archive.read(se)), sk = g.byName('igSkeleton')[0];
      const scene = buildScene(g); if (!scene.draws.length) return null;
      const skel = sk ? readSkeleton(g, sk) : null, anims = [];
      const own = info.anims.toLowerCase(), fs = info.fightstyle.toLowerCase();
      // ordem de prioridade (o primeiro nome vence): clipes do personagem, do estilo de luta, depois os compartilhados do jogo (dor, queda, esquiva, morte)
      for (const n of [own, own + '_4_combat', `${fs}_4_${own}`, fs, 'common_combat', 'common']) {
        if (!n) continue; for (const a of await this.sharedAnims(n)) if (!anims.some(x => x.name === a.name)) anims.push(a);
      }
      return { info, scene, skel, anims, speeds: new Map() };
    })());
    return this.protos.get(info.skin);
  }
  /** Clipes de um arquivo de animação de actors.bin (com cache); [] se não existe. */
  sharedAnims(name) {
    this.shared ||= new Map();
    if (!this.shared.has(name)) this.shared.set(name, (async () => {
      const e = this.index.get(name + '.igb'); if (!e) return [];
      try { return readAnimations(new IGB(await this.archive.read(e))); } catch { return []; }
    })());
    return this.shared.get(name);
  }
  /** Velocidade de solo (unidades/s) em que a passada do clipe não desliza: velocidade do pé de apoio medida ao longo do ciclo. */
  groundSpeed(inst, name) {
    const sp = inst.p.speeds; if (sp.has(name)) return sp.get(name);
    const a = inst.p.anims.find(x => x.name === name); let v = 0;
    const mv = a && inst.pose ? inst.pose.motionSpeed(a) : 0;                  // velocidade real: canal "Motion" do clipe
    if (mv > 5) { sp.set(name, mv); return mv; }
    if (a && inst.pose && a.dur > 0) {
      const pose = new Pose(inst.p.skel); pose.lockRoot = true; pose.setAnimation(a, false);
      const meds = [];
      for (const foot of ['Bip01 R Foot', 'Bip01 L Foot']) {
        const bi = inst.p.skel.bones.findIndex(b => b.name === foot); if (bi < 0) continue;
        const N = 60, P = []; for (let i = 0; i <= N; i++) { pose.update(i / N * a.dur, false); const w = pose.world[bi]; P.push([w[12], w[13], w[14]]); }
        const zmin = Math.min(...P.map(q => q[2])), dt = a.dur / N, vs = [];
        for (let i = 0; i < N; i++) if (P[i][2] < zmin + 1.5 && P[i + 1][2] < zmin + 1.5) vs.push(-(P[i + 1][0] - P[i][0]) / dt);
        vs.sort((x, y) => x - y); if (vs.length) meds.push(vs[vs.length >> 1]);
      }
      if (meds.length) v = Math.max(0, meds.reduce((x, y) => x + y, 0) / meds.length);
    }
    sp.set(name, v); return v;
  }
  /** Cria a instância de um personagem para a entidade `ent`; devolve os itens de desenho. */
  async spawn(char, ent) {
    const p = await this.proto(char); if (!p) return [];
    const inst = { ent, p, pose: p.skel && p.anims.length ? new Pose(p.skel) : null, t: Math.random() * 2, clip: null };
    if (inst.pose) { inst.pose.lockRoot = true; this.play(inst, 'idle'); }
    const pal = inst.pose ? inst.pose.palette : null;
    const items = p.scene.draws.map(d => ({ geo: d.geo, base: d.m, m: mul(entMatrix(ent), d.m), st: d.st, ent, ver: ent._ver, palette: pal }));
    inst.items = items; this.list.push(inst); return items;
  }
  /** Toca uma animação. loop=false: toca uma vez e congela no último frame. Devolve false se não existir (e não for loop). */
  play(inst, name, { loop = true, rate = 1 } = {}) {
    if (!inst.pose) return false;
    const a = inst.p.anims.find(x => x.name === name) || (loop ? (inst.p.anims.find(x => /idle/.test(x.name)) || inst.p.anims[0]) : null);
    if (!a) return false;
    if (inst.clip !== a || !loop || inst.loop === false) { inst.clip = a; inst.loop = loop; inst.rate = rate; inst.pose.setAnimation(a); inst.t = 0; }
    return true;
  }
  /** Pousa no chão os atores ainda não assentados (o mapa carrega aos poucos). */
  settle(ground, budget = 6) {
    for (const a of this.list) {
      if (a.grounded || budget <= 0) continue; budget--;
      const h = ground.height(a.ent.pos[0], a.ent.pos[1], a.ent.pos[2] + 150);
      if (h !== null) { a.ent.pos[2] = h; a.ent._ver++; a.grounded = true; }
    }
  }
  /** Avança as poses (atualiza as paletas in-place). */
  update(dt) {
    for (const a of this.list) if (a.pose && a.ent.alive && a.ent.enabled && !a.ent.invisible) {
      a.t += dt * (a.rate || 1); const once = a.loop === false && a.clip;
      if (once && a.t > a.clip.dur) a.t = a.clip.dur;
      a.pose.update(a.t, !once);
      if (once && a.t >= a.clip.dur && a.onEnd) { const f = a.onEnd; a.onEnd = null; f(); }          // fim de animação única
    }
  }
}
