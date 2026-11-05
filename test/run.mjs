// Roda todas as suítes (cada test/*.test.mjs em um processo) e resume.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = readdirSync(new URL('.', import.meta.url)).filter(f => f.endsWith('.test.mjs')).sort();
let fail = 0;
for (const f of files) {
  const t0 = Date.now(), r = spawnSync(process.execPath, ['--max-old-space-size=4096', new URL(f, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], { encoding: 'utf8' });
  const ok = r.status === 0; if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${f} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (!ok) console.log((r.stdout + r.stderr).split('\n').slice(-12).join('\n'));
}
console.log(fail ? `${fail} suíte(s) falharam` : `todas as ${files.length} suítes passaram`);
process.exit(fail ? 1 : 0);
