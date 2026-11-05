// Talentos (data/talents/<herói>.xmlb): cada talento liga um poder (`power="power1"` = nó do powerstyle) a valores por nível
// (`%captam_p1_dmg`, `_pwr`, `_req`...). Os gatilhos dos nós citam esses valores como "%nome".
import { avgRange } from './fightstyle.js';
const lc = s => String(s || '').toLowerCase();

/** root (<talents>) -> { talents: Map nome -> {name, power, slot, values}, values: Map nome -> [{level, value, scale}] } */
export function parseTalents(root) {
  const talents = new Map(), values = new Map();
  for (const t of root.children || []) {
    if (lc(t.tag) !== 'talent' || !t.attrs.name) continue;
    const vs = [];
    for (const g of t.children || []) if (lc(g.tag) === 'talentvalues') for (const v of g.children || []) if (lc(v.tag) === 'talentvalue') {
      const e = { level: Number(v.attrs.level) || 1, value: String(v.attrs.value ?? ''), scale: v.attrs.value_charged_scale === undefined ? 1 : Number(v.attrs.value_charged_scale) };
      const k = lc(v.attrs.name); if (!values.has(k)) values.set(k, []); values.get(k).push(e); vs.push(k);
    }
    const m = /_p(\d+)$/.exec(lc(t.attrs.name));
    talents.set(lc(t.attrs.name), { name: lc(t.attrs.name), power: t.attrs.power ? lc(t.attrs.power) : null, slot: m ? Number(m[1]) : null, values: [...new Set(vs)] });
  }
  for (const l of values.values()) l.sort((a, b) => a.level - b.level);
  return { talents, values };
}

/** Valor de `ref` ("%nome" ou literal) no nível `rank`: maior entrada com level <= rank (a primeira se nenhuma). */
export function resolveValue(tv, ref, rank = 1) {
  if (ref === undefined || ref === null) return null;
  const s = String(ref); if (s[0] !== '%') return { value: s, scale: 1 };
  const l = tv && tv.values.get(lc(s.slice(1))); if (!l || !l.length) return null;
  let best = l[0]; for (const e of l) if (e.level <= rank) best = e; return best;
}
/** número (média de "a b") de `ref` no nível `rank`; `def` se não existir */
export function resolveNumber(tv, ref, rank = 1, def = 0) {
  const r = resolveValue(tv, ref, rank); return r ? avgRange(r.value) : def;
}

/** Poder do slot 1..4 (por sufixo _pN do talento, senão por ordem); null se o herói não tem. */
export function powerForSlot(tv, names, slot) {
  const own = (names || []).map(n => tv.talents.get(lc(n))).filter(t => t && t.power);
  return own.find(t => t.slot === slot) || (own.every(t => t.slot === null) ? own[slot - 1] : null) || null;
}

/** nível de herói exigido para liberar o talento (valor `<nome>_req` no rank 1) */
export function unlockLevel(tv, talent) {
  const r = tv.values.get(`${talent.name}_req`); return r && r.length ? Number(r[0].value) || 1 : 1;
}

export async function loadTalents(data, parse, heroName) {
  const f = `talents/${lc(heroName)}.xmlb`; return data.has(f) ? parseTalents(parse(await data.read(f))) : { talents: new Map(), values: new Map() };
}
