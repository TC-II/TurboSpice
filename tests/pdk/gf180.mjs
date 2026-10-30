// Equivalencia de los modelos de GF180MCU traducidos por scripts/build-pdk-gf180.ts: el mismo
// circuito (MOS de 3.3 y 6 V, nativo, resistencias de poly y de difusión, MIM, NPN, PNP, diodo y
// un inversor en transitorio) se corre en ngspice nativo con los originales (.lib de
// sm141064.ngspice) y ngbehavior=hsa, y con los traducidos y ltpsa, en cada esquina.
// Se comparan puntos de operación en varias polarizaciones y la transitoria (ver equivalence.mjs).
// Uso: node tests/pdk/gf180.mjs   (necesita ngspice en el PATH; clona los modelos la 1.ª vez)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CORNERS, MODELS, build, fetchGf180 } from '../../scripts/build-pdk-gf180.ts';

const TOL = 1e-6; // relativo al fondo de escala de cada señal

const DEVICES = `Vg g 0 1.65
Vd d 0 3.3
Vh h 0 6
Vb b 0 0
X1 d g 0 0 nfet_03v3 W=1u L=0.28u
X2 0 g d d pfet_03v3 W=2u L=0.28u
X3 h g 0 0 nfet_06v0 W=1u L=0.7u
X4 0 g h h pfet_06v0 W=2u L=0.55u
X5 d g 0 0 nfet_06v0_nvt W=1u L=1.8u
X6 d g 0 ppolyf_u r_width=1u r_length=10u
X7 d g 0 nplus_u r_width=1u r_length=10u
X8 g 0 cap_mim_2f0_m4m5_noshield c_width=5u c_length=5u
X9 0 g b 0 npn_10p00x10p00
X10 0 b g pnp_10p00x10p00
D1 b g diode_nd2ps_03v3 area=1e-12 pj=4e-6
Vin in 0 pulse(0 3.3 1n 50p 50p 2n 4n)
X11 out in 0 0 nfet_03v3 W=1u L=0.28u
X12 out in d d pfet_03v3 W=2u L=0.28u
C1 out 0 10f
.control
foreach vg 0 0.5 1 1.65 2.3 2.8 3.3
  alter vg dc = $vg
  op
  echo "op $vg" $&i(vd) $&i(vh) $&i(vg) $&i(vb)
end
alter vg dc = 1.65
tran 10p 8n
wrdata tran.txt v(out) i(vd)
.endc
.end
`;

function run(dir, behavior, models) {
  writeFileSync(join(dir, '.spiceinit'), `set ngbehavior=${behavior}\n`);
  writeFileSync(join(dir, 'eq.cir'), `equivalencia gf180\n${models}\n${DEVICES}`);
  const log = execFileSync('ngspice', ['-b', 'eq.cir'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  if (/error/i.test(log)) throw new Error(`${behavior}:\n${log}`);
  const rows = [];
  for (const [, ...v] of log.matchAll(/^op \S+ (\S+) (\S+) (\S+) (\S+)/gm)) rows.push(v.map(Number));
  for (const l of readFileSync(join(dir, 'tran.txt'), 'utf8').split('\n')) {
    if (l.trim()) rows.push(l.trim().split(/\s+/).map(Number));
  }
  if (rows.length < 8) throw new Error(`${behavior}: sin resultados\n${log}`);
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

fetchGf180();
const ours = mkdtempSync(join(tmpdir(), 'gf180-'));
build(ours);
const dir = mkdtempSync(join(tmpdir(), 'gf180-run-'));

let failed = 0;
for (const [corner, sections] of Object.entries(CORNERS)) {
  // (design.spice: el de los originales con el Monte Carlo apagado, como en las esquinas)
  const orig = [`.include "${ours}/design.spice"`, ...sections.map((s) => `.lib "${MODELS}/sm141064.ngspice" ${s}`)].join('\n');
  const ref = run(dir, 'hsa', orig);
  const got = run(dir, 'ltpsa', `.include "${ours}/${corner}.spice"`);
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
