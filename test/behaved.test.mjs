import { openAsBlob } from 'node:fs';
import assert from 'node:assert/strict';
import { Archive } from '../src/archive.js';
import { parse, Runner, Host } from '../src/behaved.js';

// unitário: sintaxe, if/elif/else, aritmética, suspensão e sinais
{
  const p = parse(`# c\nx = iadd(2, 3)\nif x == 5\n  a = "ok"\nelif x > 5\n  a = "big"\nelse\n  a = "small"\nendif\nwaittimed ( 1.5 )\nsetGameFlag("f", 1, a )\nwaitsignal ( "go" )\nsetGameFlag("f", 2, 9 )`);
  const h = new Host(), r = new Runner(h), t = r.start(p);
  assert.equal(t.ctx.vars.x, 5); r.advance(1); assert.equal(h.flags.size, 0);
  r.advance(1); assert.equal(h.flags.get('f:1'), 'ok'); assert.equal(r.blocked.length, 1);
  r.signal('go'); assert.equal(h.flags.get('f:2'), 9); assert.ok(t.done);
}

const a = await Archive.open(await openAsBlob('C:/Users/Eros/Desktop/_apps/_games/Marvel Ultimate Alliance/scripts.bin'), 'scripts');
let ok = 0, bad = 0, stuck = 0, stmts = 0; const unknown = new Map(); const t0 = performance.now();
for (const e of a.entries) {
  let prog;
  try { prog = parse(await a.text(e)); } catch (err) { bad++; if (bad < 5) console.log('PARSE', e.name, err.message); continue; }
  const host = new Host(() => 0.5), r = new Runner(host); r.start(prog, { owner: e.name });
  for (let i = 0; i < 400 && r.tasks.some(k => !k.done); i++) { r.advance(1); for (const k of r.blocked) r.signal(k.sig); }
  if (r.tasks.some(k => !k.done)) { stuck++; if (stuck < 5) console.log('STUCK', e.name); } else ok++;
  stmts += host.log.length; for (const [k, v] of host.unknown) unknown.set(k, (unknown.get(k) || 0) + v);
}
console.log(`scripts ${a.count}: executados ${ok}, erro de parse ${bad}, presos ${stuck}; ${stmts} chamadas nativas despachadas em ${(performance.now() - t0 | 0)}ms`);
console.log('nativas distintas despachadas ao host:', unknown.size);
assert.equal(bad, 0); assert.equal(stuck, 0);
