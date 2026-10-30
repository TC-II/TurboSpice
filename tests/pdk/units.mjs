// Cada dispositivo de sky130 cargado sólo con sus unidades (pdkIncludes, a partir del mapa de
// index.json) tiene que dar lo mismo que con la esquina entera: si a una unidad le falta una
// dependencia, ngspice da error o el punto de operación cambia.
// Cada dispositivo se polariza con una fuente por pin (0.9, 0.6, 0.3, 0 V…) y se comparan las
// corrientes de esas fuentes. La referencia es un solo circuito con todos los dispositivos y la
// esquina entera; los que no dan punto de operación ahí (o no se pueden instanciar con valores
// por defecto) se informan y se saltean.
// Uso: node tests/pdk/units.mjs [esquinas…]   (por defecto todas; necesita ngspice en el PATH
// y public/library/pdk/sky130, de `npm run assets`)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pdkIncludes } from '../../src/library/pdk.ts';

const PDK = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'library', 'pdk', 'sky130');
const index = JSON.parse(readFileSync(join(PDK, 'index.json'), 'utf8'));
const TOL = 1e-5; // relativo: echo imprime 6 cifras
const ABS = 1e-12; // ruido del solver en nodos sin corriente (capacitores en continua)

const PRIM = { d: 'D', pnp: 'Q', npn: 'Q', r: 'R', c: 'C' };
/** Las líneas de un dispositivo, con sus fuentes, y los nombres de las fuentes. */
function instance(dev, k) {
  const pins = dev.pins ?? (dev.type === 'pnp' || dev.type === 'npn' ? ['c', 'b', 'e'] : ['a', 'b']);
  const lines = [];
  const sources = pins.map((_, p) => {
    lines.push(`V${k}_${p} n${k}_${p} 0 ${Math.max(0, 0.9 - 0.3 * p).toFixed(1)}`);
    return `v${k}_${p}`;
  });
  const nodes = pins.map((_, p) => `n${k}_${p}`).join(' ');
  if (dev.pins) lines.push(`X${k} ${nodes} ${dev.name}`);
  else lines.push(`${PRIM[dev.type]}${k} ${nodes} ${dev.name}${dev.type === 'r' ? ' 1k' : dev.type === 'c' ? ' 1p' : ''}`);
  return { lines, sources };
}

function op(dir, includes, devs) {
  const parts = devs.map((d) => instance(d.dev, d.k));
  const sources = parts.flatMap((p) => p.sources);
  const net = [
    'unidades sky130',
    ...includes,
    ...parts.flatMap((p) => p.lines),
    '.control',
    'op',
    ...sources.map((s) => `echo "I ${s}" $&i(${s})`),
    '.endc',
    '.end',
    '',
  ].join('\n');
  writeFileSync(join(dir, 'u.cir'), net);
  let log;
  try {
    log = execFileSync('ngspice', ['-b', 'u.cir'], { cwd: dir, encoding: 'utf8', stdio: 'pipe', timeout: 120e3 });
  } catch (e) {
    log = `${e.stdout ?? ''}${e.stderr ?? ''}error`;
  }
  const out = Object.fromEntries([...log.matchAll(/^I (\S+) (\S+)/gm)].map(([, s, v]) => [s, Number(v)]));
  return { out, log, error: /error/i.test(log) };
}

const dir = mkdtempSync(join(tmpdir(), 'pdk-units-'));
writeFileSync(join(dir, '.spiceinit'), 'set ngbehavior=ltpsa\n');
const all = [...index.devices, ...index.models].map((dev, k) => ({ dev, k }));
const corners = process.argv.slice(2).length ? process.argv.slice(2) : index.corners.map((c) => c.name);

let failed = 0;
for (const corner of corners) {
  const c = index.corners.find((c) => c.name === corner);
  // referencia: de a un dispositivo con la esquina entera sería ~1 s cada uno; todos juntos,
  // uno solo. Si alguno no deja converger al conjunto, se lo saca.
  let pool = all;
  let ref;
  for (;;) {
    ref = op(dir, [`.include "${PDK}/${c.file}"`], pool);
    if (!ref.error) break;
    // las instancias nombradas en los errores y en la línea siguiente (n<k>_<pin>, x<k>…)
    const lines = ref.log.split('\n');
    const blamed = new Set();
    lines.forEach((l, i) => {
      if (!/error|can't find model/i.test(l)) return;
      for (const [, k] of `${l} ${lines[i + 1] ?? ''}`.matchAll(/\b(?:[xdqrc]|n)(\d+)(?:_\d+)?\b/gi)) blamed.add(Number(k));
    });
    const bad = pool.filter(({ k }) => blamed.has(k));
    if (!bad.length) throw new Error(`${corner}: la esquina entera no da punto de operación:\n${ref.log.slice(-2000)}`);
    for (const b of bad) console.log(`  -  ${corner} ${b.dev.name}: no se puede instanciar con valores por defecto`);
    pool = pool.filter((p) => !bad.includes(p));
  }
  let ok = 0;
  let worstMs = 0;
  for (const d of pool) {
    const t0 = performance.now();
    const got = op(dir, pdkIncludes(index, corner, [d.dev.name], PDK), [d]);
    worstMs = Math.max(worstMs, performance.now() - t0);
    const bad = got.error
      ? 'error de ngspice'
      : Object.keys(got.out).find((s) => Math.abs(got.out[s] - ref.out[s]) > ABS + TOL * Math.abs(ref.out[s]));
    if (bad) {
      failed++;
      console.log(`MAL ${corner} ${d.dev.name}: ${bad === 'error de ngspice' ? got.log.split('\n').filter((l) => /error/i.test(l)).slice(0, 3).join(' | ') : `${bad} ${got.out[bad]} ≠ ${ref.out[bad]}`}`);
    } else ok++;
  }
  console.log(`${corner}: ${ok}/${pool.length} dispositivos iguales a la esquina entera (el más lento, ${worstMs.toFixed(0)} ms)`);
}
if (failed) process.exit(1);
