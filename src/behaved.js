// Interpretador da linguagem BehavEd dos scripts de missão (scripts.bin).
// Gramática (4595 scripts, 71k linhas): comentários "# ...", chamadas `f(a, b)`, atribuições `v = f(...)`/`v = literal`,
// `if a op b` / `elif` / `else` / `endif` (op: == != < > <= >=). Sem laços. Suspende em waittimed(seg) e waitsignal(nome).
// Cada script roda como corrotina (gerador); o Runner agenda vários sobre um relógio virtual e despacha as nativas
// para um Host plugável (o motor de jogo).

// ---------------------------------------------------------------- parser
const splitArgs = s => {                       // vírgulas fora de aspas
  const out = []; let cur = '', q = null;
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; }
    else if (ch === '"' || ch === "'") { q = ch; cur += ch; }
    else if (ch === ',') { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim() !== '' || out.length) out.push(cur.trim());
  return out;
};
const operand = t => {
  if ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'"))) return { k: 's', v: t.slice(1, -1) };
  if (/^[-+]?\d+(\.\d+)?$/.test(t)) return { k: 'n', v: parseFloat(t) };
  return { k: 'v', v: t };
};
const CALL = /^([A-Za-z_]\w*)\s*\((.*)\)\s*$/;
const COND = /^(.+?)\s*(==|!=|<=|>=|<|>)\s*(.+)$/;

export function parse(text) {
  const root = [], stack = [{ block: root }];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i].trim(); if (!s || s[0] === '#') continue;
    const top = stack[stack.length - 1];
    let m;
    if (s.startsWith('if ') || s.startsWith('if(')) {
      m = COND.exec(s.slice(2).trim()); if (!m) throw new Error(`linha ${i + 1}: condição inválida: ${s}`);
      const node = { t: 'if', arms: [{ c: [operand(m[1].trim()), m[2], operand(m[3].trim())], b: [] }], els: null, line: i + 1 };
      top.block.push(node); stack.push({ block: node.arms[0].b, node });
    } else if (s.startsWith('elif ')) {
      m = COND.exec(s.slice(4).trim()); if (!m) throw new Error(`linha ${i + 1}: condição inválida: ${s}`);
      const node = top.node; if (!node) throw new Error(`linha ${i + 1}: elif sem if`);
      const arm = { c: [operand(m[1].trim()), m[2], operand(m[3].trim())], b: [] }; node.arms.push(arm); top.block = arm.b;
      stack[stack.length - 1] = { block: arm.b, node };
    } else if (s === 'else') {
      const node = top.node; if (!node) throw new Error(`linha ${i + 1}: else sem if`);
      node.els = []; stack[stack.length - 1] = { block: node.els, node };
    } else if (s === 'endif') {
      if (stack.length < 2) throw new Error(`linha ${i + 1}: endif sem if`); stack.pop();
    } else {
      let target = null, rest = s; m = /^(\S+)\s*=\s*(.+)$/.exec(s);
      if (m && !/^[A-Za-z_]\w*\s*\(/.test(s)) { target = m[1]; rest = m[2].trim(); }
      const c = CALL.exec(rest);
      if (c) top.block.push({ t: 'call', fn: c[1], args: splitArgs(c[2]).map(operand), to: target, line: i + 1 });
      else if (target) top.block.push({ t: 'set', to: target, val: operand(rest), line: i + 1 });
      else throw new Error(`linha ${i + 1}: instrução desconhecida: ${s}`);
    }
  }
  if (stack.length !== 1) throw new Error('if sem endif');
  return root;
}

// ---------------------------------------------------------------- avaliação
const num = v => (typeof v === 'number' ? v : (v !== '' && v != null && !isNaN(Number(v)) ? Number(v) : NaN));
export function compare(a, op, b) {
  const x = num(a), y = num(b), numeric = !isNaN(x) && !isNaN(y);
  const p = numeric ? x : String(a).toLowerCase(), q = numeric ? y : String(b).toLowerCase();
  switch (op) { case '==': return p === q; case '!=': return p !== q; case '<': return p < q; case '>': return p > q; case '<=': return p <= q; default: return p >= q; }
}

/** Nativas puras (aritmética e strings); as que consultam/alteram o mundo ficam no Host. */
export const PURE = {
  iadd: (a, b) => (num(a) | 0) + (num(b) | 0), isub: (a, b) => (num(a) | 0) - (num(b) | 0),
  fadd: (a, b) => num(a) + num(b), fsub: (a, b) => num(a) - num(b), fmul: (a, b) => num(a) * num(b), fdiv: (a, b) => num(b) ? num(a) / num(b) : 0,
  strcatstr: (a, b) => String(a) + String(b), strcatint: (a, b) => String(a) + (num(b) | 0),
  instring: (a, b) => String(a).includes(String(b)) ? 1 : 0,
};

/** Host padrão: estado de jogo em memória + registro de tudo que não conhece. */
export class Host {
  constructor(rng = Math.random) { this.flags = new Map(); this.zone = new Map(); this.rng = rng; this.log = []; this.unknown = new Map(); this.time = 0; }
  key(a) { return a.map(String).join(':'); }
  call(name, args, ctx) {
    if (name in PURE) return PURE[name](...args);
    switch (name) {
      case 'randomInt': { const lo = num(args[0]) | 0, hi = args.length > 1 ? num(args[1]) | 0 : lo; return lo + Math.floor(this.rng() * (hi - lo + 1)); }
      case 'getGameFlag': return this.flags.get(this.key(args.slice(0, 2))) ?? 0;
      case 'setGameFlag': this.flags.set(this.key(args.slice(0, 2)), args[2]); break;
      case 'getZoneVar': case 'getZoneFlag': return this.zone.get(this.key(args)) ?? 0;
      case 'setZoneVar': this.zone.set(this.key(args.slice(0, -1)), args[args.length - 1]); break;
      case 'getName': case 'getID': case 'getIDString': return String(args[0]);
      case 'alive': return 1;
      case 'getHealth': case 'getHealthMax': return 100;
      default: this.unknown.set(name, (this.unknown.get(name) || 0) + 1);
    }
    this.log.push({ t: this.time, fn: name, args, owner: ctx.owner });
    return name.startsWith('get') || name.startsWith('is') ? 0 : undefined;
  }
}

/** Corrotina de um script. Produz {wait: segundos} ou {signal: nome}. */
export function* exec(prog, host, ctx = {}) {
  const vars = ctx.vars || (ctx.vars = {});
  const val = o => o.k === 'v' ? (o.v in vars ? vars[o.v] : o.v) : o.v;       // identificador não definido == seu próprio nome
  function* block(stmts) {
    for (const st of stmts) {
      if (st.t === 'set') vars[st.to] = val(st.val);
      else if (st.t === 'call') {
        const a = st.args.map(val);
        if (st.fn === 'waittimed') { yield { wait: num(a[0]) || 0 }; continue; }
        if (st.fn === 'waitsignal') { yield { signal: String(a[0]) }; continue; }
        const r = host.call(st.fn, a, ctx);
        if (st.to) vars[st.to] = r === undefined ? 0 : r;
      } else {
        let done = false;
        for (const arm of st.arms) if (compare(val(arm.c[0]), arm.c[1], val(arm.c[2]))) { yield* block(arm.b); done = true; break; }
        if (!done && st.els) yield* block(st.els);
      }
    }
  }
  yield* block(prog);
}

/** Agenda vários scripts sobre um relógio virtual. */
export class Runner {
  constructor(host) { this.host = host || new Host(); this.t = 0; this.tasks = []; this.signals = new Set(); }
  start(prog, ctx = {}) { const task = { gen: exec(prog, this.host, ctx), at: this.t, sig: null, done: false, ctx }; this.tasks.push(task); this._run(task); return task; }
  signal(name) { this.signals.add(name); for (const k of this.tasks) if (k.sig === name) { k.sig = null; this._run(k); } }
  _run(k) {
    this.host.time = this.t;
    for (;;) {
      const r = k.gen.next();
      if (r.done) { k.done = true; return; }
      if (r.value.wait !== undefined) { k.at = this.t + r.value.wait; return; }
      if (this.signals.has(r.value.signal)) { this.signals.delete(r.value.signal); continue; }
      k.sig = r.value.signal; return;
    }
  }
  /** avança o relógio até t; retorna true se ainda há tarefas ativas. */
  advance(dt) {
    const end = this.t + dt;
    for (;;) {
      const next = this.tasks.filter(k => !k.done && k.sig === null && k.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.t = Math.max(this.t, next.at); this._run(next);
    }
    this.t = end; return this.tasks.some(k => !k.done);
  }
  get blocked() { return this.tasks.filter(k => !k.done && k.sig !== null); }
}
