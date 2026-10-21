// node exp.mjs <nombre> [--all] : corre sólo TurboSpice (con el entorno actual: EXTRA, TMAX…) en res_<nombre>/
// sobre los jobs con simulación (por defecto sin LargeCollection)
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
const SP = new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const name = process.argv[2];
const out = `${SP}res_${name}/`;
mkdirSync(out, { recursive: true });
const report = JSON.parse(readFileSync(SP + 'report.json', 'utf8'));
const want = new Set(report.filter((r) => r.hasSim && (process.argv.includes('--all') || r.group !== 'sueltos-LargeCollection')).map((r) => r.id));
const jobs = JSON.parse(readFileSync(SP + 'jobs.json', 'utf8')).filter((j) => want.has(j.id));
let i = 0, done = 0;
const one = (j) => new Promise((res) => {
  const o = `${out}${j.id}.ts.json`;
  if (existsSync(o)) return res();
  execFile(process.execPath, [SP + 'worker.mjs', j.path, o], { timeout: 180000, windowsHide: true }, () => { done++; if (done % 50 === 0) console.log(done, '/', jobs.length); res(); });
});
await Promise.all(Array.from({ length: 6 }, async () => { while (i < jobs.length) await one(jobs[i++]); }));
console.log('fin', jobs.length);
