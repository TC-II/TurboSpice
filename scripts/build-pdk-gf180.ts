// Arma los modelos del PDK GF180MCU para TurboSpice a partir de los de GlobalFoundries
// (globalfoundries-pdk-libs-gf180mcu_fd_pr, commit fijado, models/ngspice). Como los de sky130
// (scripts/build-pdk.ts), están escritos para ngbehavior=hsa y se traducen una vez para ltpsa:
// - sm141064.ngspice es un solo archivo con secciones `.lib <nombre> … .endl` que se llaman entre
//   sí (`.lib 'sm141064.ngspice' nmos_3p3_t`); con ltpsa ngspice no las encuentra («Could not find
//   include file typical»). Cada sección pasa a su archivo (sections/<nombre>.spice) y las
//   llamadas, a .include.
// - Cada esquina junta, como el corner.sym de xschem, la sección de los MOS (typical, ff, ss, fs,
//   sf) con las de BJT, diodos, resistencias, MIM y moscap (_typical, _ff o _ss; en fs y sf,
//   _typical), más design.ngspice.
// - design.ngspice trae el Monte Carlo prendido (sw_stat_global = 1, sw_stat_mismatch = 1): cada
//   corrida daría otro delvto al azar en cada MOS. Para las esquinas va apagado.
// La esquina entera carga en ~10 ms: no hace falta partirla por dispositivo como sky130, así que
// en index.json todas las unidades van siempre. La equivalencia la prueba tests/pdk/gf180.mjs.
// Uso: node scripts/build-pdk-gf180.ts [salida]   (por defecto public/library/pdk/gf180)
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSources, subckts } from './build-pdk.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'https://github.com/google/globalfoundries-pdk-libs-gf180mcu_fd_pr.git';
const COMMIT = '9f992d5a9186d1f7820c58f039c484ad35b2edea';
export const SRC = join(ROOT, '.cache', 'pdk', 'gf180mcu_fd_pr');
export const MODELS = join(SRC, 'models', 'ngspice');
const OUT = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(ROOT, 'public', 'library', 'pdk', 'gf180');

/** Esquina → secciones de sm141064.ngspice (los MOS y el resto de los dispositivos) */
export const CORNERS: Record<string, string[]> = {
  tt: ['typical', 'bjt_typical', 'diode_typical', 'res_typical', 'mimcap_typical', 'moscap_typical'],
  ff: ['ff', 'bjt_ff', 'diode_ff', 'res_ff', 'mimcap_ff', 'moscap_ff'],
  ss: ['ss', 'bjt_ss', 'diode_ss', 'res_ss', 'mimcap_ss', 'moscap_ss'],
  fs: ['fs', 'bjt_typical', 'diode_typical', 'res_typical', 'mimcap_typical', 'moscap_typical'],
  sf: ['sf', 'bjt_typical', 'diode_typical', 'res_typical', 'mimcap_typical', 'moscap_typical'],
};

export const fetchGf180 = () => fetchSources(SRC, REPO, COMMIT, ['models/ngspice']);

/** Las secciones `.lib <nombre>` … `.endl` del archivo, con las llamadas entre ellas como .include */
function sections(text: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let cur: string[] | null = null;
  for (const line of text.split('\n')) {
    const start = /^\.lib\s+(\w+)\s*$/i.exec(line);
    if (start && !cur) out.set(start[1].toLowerCase(), (cur = []));
    else if (/^\.endl\b/i.test(line) && cur) cur = null;
    else if (cur) cur.push(line.replace(/^\s*\.lib\s+'sm141064\.ngspice'\s+(\w+)\s*$/i, (_, s) => `.include "${s.toLowerCase()}.spice"`));
  }
  return out;
}

export function build(out = OUT) {
  const secs = sections(readFileSync(join(MODELS, 'sm141064.ngspice'), 'utf8'));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'sections'), { recursive: true });
  writeFileSync(
    join(out, 'design.spice'),
    readFileSync(join(MODELS, 'design.ngspice'), 'utf8').replace(/^(\+\s*sw_stat_(?:global|mismatch)\s*=\s*)1\b/gim, '$10'),
  );
  for (const [name, lines] of secs) writeFileSync(join(out, 'sections', `${name}.spice`), lines.join('\n') + '\n');

  // dispositivos: los de todas las secciones (los binned, nombre.N, son un mismo modelo)
  const all = [...secs.values()].map((l) => l.join('\n')).join('\n');
  const devices = new Map(subckts(all, 'sm141064.ngspice').map((s) => [s.name.toLowerCase(), s]));
  const models = new Map<string, { name: string; type: string }>();
  for (const [, name, type] of all.matchAll(/^\.model\s+(\S+)\s+(\w+)/gim)) {
    const base = name.replace(/\.\d+$/, '');
    if (!devices.has(base.toLowerCase()) && !models.has(base.toLowerCase())) models.set(base.toLowerCase(), { name: base, type: type.toLowerCase() });
  }

  const corners = Object.entries(CORNERS).map(([name, list]) => {
    const missing = list.filter((s) => !secs.has(s));
    if (missing.length) throw new Error(`sm141064.ngspice no tiene ${missing.join(', ')}`);
    const units = ['design.spice', ...list.map((s) => `sections/${s}.spice`)];
    const header = [`* gf180mcu, esquina ${name}. Generado por scripts/build-pdk-gf180.ts desde`, `* ${REPO} @ ${COMMIT}`, '* (Apache-2.0). No editar: se regenera.'];
    writeFileSync(join(out, `${name}.spice`), [...header, ...units.map((u) => `.include "${u}"`), ''].join('\n'));
    return { name, file: `${name}.spice`, units, always: units.map((_, i) => i), devices: {} };
  });

  copyFileSync(join(SRC, 'LICENSE'), join(out, 'LICENSE'));
  const index = {
    pdk: 'gf180',
    source: { repo: REPO, commit: COMMIT, license: 'Apache-2.0' },
    corners,
    devices: [...devices.values()].sort((a, b) => a.name.localeCompare(b.name)),
    models: [...models.values()].sort((a, b) => a.name.localeCompare(b.name)),
    files: secs.size + 1,
    bytes: [...secs.keys()].reduce((n, s) => n + statSync(join(out, 'sections', `${s}.spice`)).size, 0),
  };
  writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 1) + '\n');
  return index;
}

/** La salida ya está al día: mismo commit y generada después del último cambio a este script. */
function upToDate(out: string) {
  try {
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'));
    return index.source.commit === COMMIT && statSync(join(out, 'index.json')).mtimeMs > statSync(fileURLToPath(import.meta.url)).mtimeMs;
  } catch {
    return false;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url) && !upToDate(OUT)) {
  fetchGf180();
  const index = build();
  console.log(
    `gf180: ${index.corners.length} esquinas, ${index.devices.length} subcircuitos, ${index.models.length} modelos, ` +
      `${index.files} archivos, ${(index.bytes / 1e6).toFixed(1)} MB → public/library/pdk/gf180`,
  );
}
