// Equivalencia de los modelos de sky130 traducidos por scripts/build-pdk.ts: el mismo circuito
// (MOS de 1.8 V con sus variantes lvt/hvt, MOS de 5 V, resistencia de poly, MIM, diodo, PNP y un
// inversor en transitorio) se corre en ngspice nativo con los originales y ngbehavior=hsa, y con
// los traducidos y ngbehavior=ltpsa (el de TurboSpice), en cada esquina.
// Se comparan puntos de operación en varias polarizaciones y la transitoria. No se usa .dc: en un
// barrido, la resistencia de poly (r={… v(r0,r1) …}) converge distinto entre puntos según el modo
// (hasta ~4e-5 del fondo de escala con paso 20 mV, menos con paso más fino), aunque el punto de
// operación de cada polarización da igual.
// Uso: node tests/pdk/equivalence.mjs   (necesita ngspice en el PATH; clona los modelos la 1.ª vez)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CORNERS, build, fetchSources } from '../../scripts/build-pdk.ts';

const TOL = 1e-6; // relativo al fondo de escala de cada señal

const circuit = (corner) => `equivalencia sky130 ${corner}
.include "${corner}.spice"
Vg g 0 0.9
Vd d 0 1.8
Vh h 0 3.3
Vb b 0 0
X1 d g 0 0 sky130_fd_pr__nfet_01v8 W=1 L=0.15
X2 d g 0 0 sky130_fd_pr__nfet_01v8_lvt W=1 L=0.35
X3 0 g d d sky130_fd_pr__pfet_01v8 W=2 L=0.15
X4 0 g d d sky130_fd_pr__pfet_01v8_hvt W=2 L=0.15
X5 h g 0 0 sky130_fd_pr__nfet_g5v0d10v5 W=1 L=0.5
X6 d g 0 sky130_fd_pr__res_high_po_0p35 L=3.5
X7 g 0 sky130_fd_pr__cap_mim_m3_1 W=5 L=5
D1 b g sky130_fd_pr__diode_pw2nd_05v5 area=1 pj=4
X8 0 b g 0 sky130_fd_pr__pnp_05v5_W0p68L0p68
Vin in 0 pulse(0 1.8 1n 50p 50p 2n 4n)
X9 out in 0 0 sky130_fd_pr__nfet_01v8 W=1 L=0.15
X10 out in d d sky130_fd_pr__pfet_01v8 W=2 L=0.15
C1 out 0 10f
.control
foreach vg 0 0.3 0.6 0.9 1.2 1.5 1.8
  alter vg dc = $vg
  op
  echo "op $vg" $&i(vd) $&i(vh) $&i(vg) $&i(vb)
end
alter vg dc = 0.9
tran 10p 8n
wrdata tran.txt v(out) i(vd)
.endc
.end
`;

function run(dir, behavior, corner) {
  writeFileSync(join(dir, '.spiceinit'), `set ngbehavior=${behavior}\n`);
  writeFileSync(join(dir, 'eq.cir'), circuit(corner));
  const log = execFileSync('ngspice', ['-b', 'eq.cir'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  if (/error/i.test(log)) throw new Error(`${behavior} ${corner}:\n${log}`);
  const rows = [];
  for (const [, ...v] of log.matchAll(/^op \S+ (\S+) (\S+) (\S+) (\S+)/gm)) rows.push(v.map(Number));
  for (const l of readFileSync(join(dir, 'tran.txt'), 'utf8').split('\n')) {
    if (l.trim()) rows.push(l.trim().split(/\s+/).map(Number));
  }
  return rows;
}

/** Máxima diferencia relativa al fondo de escala, columna por columna. */
function maxDiff(a, b) {
  if (a.length !== b.length) return Infinity;
  let worst = 0;
  for (let j = 0; j < a[0].length; j++) {
    const scale = Math.max(...a.map((r) => Math.abs(r[j]))) || 1;
    for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i][j] - b[i][j]) / scale);
  }
  return worst;
}

fetchSources();
const orig = mkdtempSync(join(tmpdir(), 'pdk-orig-'));
const ours = mkdtempSync(join(tmpdir(), 'pdk-ltpsa-'));
build(orig, true);
build(ours);

let failed = 0;
for (const corner of CORNERS) {
  const ref = run(orig, 'hsa', corner);
  const got = run(ours, 'ltpsa', corner);
  const op = maxDiff(ref.slice(0, 7), got.slice(0, 7));
  const tr = maxDiff(ref.slice(7), got.slice(7));
  const ok = op <= TOL && tr <= TOL;
  if (!ok) failed++;
  console.log(`${ok ? 'ok ' : 'MAL'} ${corner}: op ${op.toExponential(1)}, tran ${tr.toExponential(1)}`);
}
if (failed) {
  console.error(`${failed} esquina(s) no coinciden (tolerancia ${TOL})`);
  process.exit(1);
}
