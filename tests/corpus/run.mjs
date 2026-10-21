// Corre TurboSpice (worker.mjs) y LTspice -b sobre jobs.json. Reanudable: salta lo ya hecho.
// Uso: node run.mjs [--groups a,b] [--conc N]
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readRaw } from './raw.mjs';

const SP = dirname(new URL(import.meta.url).pathname).replace(/^\/(\w:)/, '$1');
const RES = join(SP, 'res');
mkdirSync(RES, { recursive: true });
const LT = 'C:/Users/TC2/AppData/Local/Programs/ADI/LTspice/LTspice.exe';
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const groups = opt('--groups', null)?.split(',');
const conc = Number(opt('--conc', 6));
const jobs = JSON.parse(readFileSync(join(SP, 'jobs.json'), 'utf8')).filter((j) => !groups || groups.includes(j.group));

const run = (cmd, a, opts) =>
  new Promise((res) => {
    const t0 = Date.now();
    execFile(cmd, a, { ...opts, windowsHide: true, maxBuffer: 1 << 26 }, (err, stdout, stderr) =>
      res({ err: err ? { code: err.code, killed: err.killed, signal: err.signal } : null, ms: Date.now() - t0, stderr: String(stderr).slice(-2000) }));
  });

function summarizeRaw(p) {
  const r = readRaw(p);
  const n = r.np;
  const step = Math.max(1, Math.floor(n / 4000));
  const pick = (arr) => { const o = []; for (let i = 0; i < n; i += step) o.push(arr[i]); if ((n - 1) % step) o.push(arr[n - 1]); return o; };
  // por paso: sólo el primero completo (más el número de pasos)
  const end = r.steps.length > 1 ? r.steps[1] : n;
  const sub = (arr) => { const o = []; const s = Math.max(1, Math.floor(end / 4000)); for (let i = 0; i < end; i += s) o.push(arr[i]); if ((end - 1) % s) o.push(arr[end - 1]); return o; };
  return {
    plotname: r.plotname, flags: r.flags, np: n, nsteps: r.steps.length,
    vars: r.vars.map((v, i) => ({ name: v.name, type: v.type, re: sub(r.data[i].re), im: r.data[i].im ? sub(r.data[i].im) : undefined })),
  };
}

let done = 0;
const t0 = Date.now();
async function one(j) {
  const tsOut = join(RES, `${j.id}.ts.json`);
  const ltOut = join(RES, `${j.id}.lt.json`);
  if (!existsSync(tsOut)) {
    const r = await run(process.execPath, ['--max-old-space-size=4096', join(SP, 'worker.mjs'), j.path, tsOut], { timeout: 180000 });
    if (!existsSync(tsOut)) writeFileSync(tsOut, JSON.stringify({ file: j.path, crashed: r }));
  }
  if (!existsSync(ltOut)) {
    const o0 = {};
    const base = j.path.replace(/\.asc$/i, '');
    let hasSim = true;
    try { const t = JSON.parse(readFileSync(tsOut, 'utf8')); hasSim = t.hasSim === true; } catch {}
    // sin análisis, -b se queda en un diálogo: sólo la netlist
    const r = await run(LT, hasSim ? ['-Run', '-b', j.path] : ['-netlist', j.path], { timeout: hasSim ? 90000 : 30000, cwd: dirname(j.path) });
    o0.hasSim = hasSim;
    const o = { run: r, ...o0 };
    try { o.log = readFileSync(base + '.log', 'utf8').slice(0, 20000); } catch {}
    try { const b = readFileSync(base + '.net'); o.net = new TextDecoder(b[1] === 0 ? 'utf-16le' : 'utf-8').decode(b); } catch {}
    if (existsSync(base + '.raw')) {
      try { o.raw = summarizeRaw(base + '.raw'); } catch (e) { o.rawError = String(e); }
    }
    // los .op con .step o .meas también dejan .op.raw
    if (existsSync(base + '.op.raw')) try { o.opraw = summarizeRaw(base + '.op.raw'); } catch {}
    writeFileSync(ltOut, JSON.stringify(o));
  }
  done++;
  if (done % 20 === 0) process.stdout.write(`${done}/${jobs.length} ${((Date.now() - t0) / 60000).toFixed(1)} min\n`);
}

const queue = [...jobs];
await Promise.all(Array.from({ length: conc }, async () => { while (queue.length) await one(queue.shift()); }));
console.log('fin', done);
