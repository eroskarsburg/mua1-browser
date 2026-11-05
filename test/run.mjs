// Roda todas as suítes (cada test/*.test.mjs em um processo) e resume.
// Suítes de integração leem os arquivos do jogo (não distribuídos); sem a pasta do jogo elas são PULADAS e listadas como tal.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const GAME = 'C:/Users/Eros/Desktop/_apps/_games/Marvel Ultimate Alliance/', hasGame = existsSync(GAME) && existsSync(GAME + 'data.bin');
const dir = new URL('.', import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith('.test.mjs')).sort();
let fail = 0, skipped = 0;
for (const f of files) {
  const path = new URL(f, dir).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  if (!hasGame && readFileSync(path, 'utf8').includes('Marvel Ultimate Alliance')) { skipped++; console.log(`skip ${f} (precisa dos arquivos do jogo)`); continue; }
  const t0 = Date.now(), r = spawnSync(process.execPath, ['--max-old-space-size=4096', path], { encoding: 'utf8' });
  const ok = r.status === 0; if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${f} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (!ok) console.log((r.stdout + r.stderr).split('\n').slice(-12).join('\n'));
}
console.log(fail ? `${fail} suíte(s) falharam` : `${files.length - skipped} suíte(s) passaram${skipped ? `, ${skipped} puladas (sem os arquivos do jogo)` : ''}`);
process.exit(fail ? 1 : 0);
