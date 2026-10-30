// Arma los modelos del PDK sky130 para TurboSpice a partir de open_pdks (sky130A, los mismos que
// usan xschem y los tutoriales), de las versiones ya armadas de fossi-foundation/ciel-releases
// (fijada por su commit de open_pdks): libs.tech/ngspice de common.tar.zst y
// libs.ref/sky130_fd_pr/spice de sky130_fd_pr.tar.zst. Están escritos para el modo HSPICE de
// ngspice (ngbehavior=hsa); TurboSpice corre siempre con ltpsa, así que se traducen una vez acá
// en vez de cambiar el modo por proyecto:
// - cada esquina (.lib tt … .endl de sky130.lib.spice) pasa a su propio archivo con .include:
//   en modo LTspice, un `.lib tt` de un solo argumento se lee como «incluir el archivo tt»;
// - `level = 5.400000e+1` pasa a `level = 54`: el modo PSpice lee mal el exponente (sale EKV, level 5);
// - por las dudas, como en los primitivos de SkyWater sin procesar: se borran los comentarios de
//   fin de línea `$ …` (HSPICE) y un `include` sin punto queda comentado.
// Sólo se copian los archivos alcanzables desde las esquinas. Cargar una esquina entera tarda
// ~1 s (la mayor parte, dispositivos que el circuito no usa), así que cada esquina se parte además
// en unidades (sus .include, abriendo los archivos que sólo agrupan otros) y index.json guarda qué
// unidades necesita cada dispositivo: las que lo definen y, transitivamente, las que definen los
// parámetros y modelos que éstas usan, más las que fijan .option (scale). La equivalencia con los originales
// la prueba tests/pdk/equivalence.mjs.
// Corre con `npm run assets`; la salida no se versiona. Si ya está generada desde el mismo commit
// y no cambió este script, no hace nada (sin red).
// Uso: node scripts/build-pdk.ts [salida]   (por defecto public/library/pdk/sky130)
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Versión de open_pdks (su commit), la misma para sky130 y gf180 */
export const OPEN_PDKS = '792ef67037d74c8c51811eab3ce23cf793491296';
const RELEASES = 'https://github.com/fossi-foundation/ciel-releases/releases/download';
export const CORNERS = ['tt', 'ff', 'ss', 'sf', 'fs'] as const;

export const SRC = join(ROOT, '.cache', 'pdk', `sky130-${OPEN_PDKS.slice(0, 12)}`, 'sky130A');
const OUT = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(ROOT, 'public', 'library', 'pdk', 'sky130');

export const rel = (base: string, p: string) => relative(base, p).split('\\').join('/');

/**
 * Baja de ciel-releases las partes de una versión de open_pdks que hacen falta (sin guardar los
 * .tar.zst: se descomprimen al vuelo y se extrae sólo `globs`) a `dest`, o reusa lo ya bajado.
 * Necesita curl, zstd y tar. (También la usa scripts/build-pdk-gf180.ts.)
 */
export function fetchCiel(family: string, dest: string, parts: { asset: string; globs: string[] }[]) {
  const done = join(dest, '.ciel-ok');
  if (existsSync(done)) return;
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  for (const { asset, globs } of parts) {
    const url = `${RELEASES}/${family}-${OPEN_PDKS}/${asset}`;
    console.log(`${family}: bajando ${asset}…`);
    execSync(`curl -fsSL ${quote(url)} | zstd -dc | tar -x -C ${quote(dest)} --wildcards ${globs.map(quote).join(' ')}`, { stdio: 'inherit', shell: '/bin/sh' });
  }
  writeFileSync(done, `${family}-${OPEN_PDKS}\n`);
}

/** Los modelos de sky130A (el directorio de arriba de SRC), si no están */
export const fetchSources = () =>
  fetchCiel('sky130', dirname(SRC), [
    { asset: 'common.tar.zst', globs: ['sky130A/libs.tech/ngspice/*'] },
    { asset: 'sky130_fd_pr.tar.zst', globs: ['sky130A/libs.ref/sky130_fd_pr/spice/*'] },
  ]);

/**
 * Traduce un archivo de modelos de la sintaxis HSPICE a la que ngspice lee con ltpsa. Con
 * `onlyFixes` sólo arregla el error del repo (para que los originales carguen con hsa).
 */
export function translate(text: string, onlyFixes = false): string {
  return text
    .split('\n')
    .map((line) => {
      if (/^\s*\*/.test(line)) return line;
      if (/^\s*include\s/i.test(line)) return `* ${line}`;
      if (onlyFixes) return line;
      return line
        .replace(/\s+\$.*$/, '')
        .replace(/\blevel\s*=\s*(\d+(?:\.\d*)?e[+-]?\d+)/gi, (_, n) => `level = ${Math.round(Number(n))}`);
    })
    .join('\n');
}

const INCLUDE = /^\s*\.inc(?:lude)?\s+"?([^"\s]+)"?/i;

/** Las líneas de la sección `.lib <name>` … `.endl` de sky130.lib.spice. */
function libSection(text: string, name: string): string[] {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^\\.lib\\s+${name}\\s*$`, 'i').test(l));
  if (start < 0) throw new Error(`sky130.lib.spice no tiene la sección ${name}`);
  const end = lines.findIndex((l, i) => i > start && /^\.endl/i.test(l));
  return lines.slice(start + 1, end);
}

type Subckt = { name: string; pins: string[]; params: Record<string, string>; file: string };

/** Pines y parámetros por defecto de cada .subckt (la línea y sus continuaciones +). */
export function subckts(text: string, file: string): Subckt[] {
  const out: Subckt[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/^\.subckt\s/i.test(lines[i])) continue;
    let head = lines[i];
    while (i + 1 < lines.length && /^\+/.test(lines[i + 1])) head += ' ' + lines[++i].slice(1);
    const [, name, ...rest] = head.replace(/\s*=\s*/g, '=').trim().split(/\s+/);
    const pins = rest.filter((t) => !t.includes('=') && !/^params:$/i.test(t));
    const params = Object.fromEntries(
      rest.filter((t) => t.includes('=')).map((t) => t.split('=') as [string, string]),
    );
    out.push({ name, pins, params, file });
  }
  return out;
}

/** Sentencias de un archivo SPICE: sin comentarios, con las continuaciones + unidas. */
function statements(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    if (/^\s*(\*|$)/.test(line)) continue;
    if (/^\+/.test(line) && out.length) out[out.length - 1] += ' ' + line.slice(1);
    else out.push(line);
  }
  return out;
}

const AGGREGATOR = 3; // un archivo con al menos estos .include se abre en unidades

/**
 * Parte el cuerpo de una esquina en unidades en el orden original: cada .include es una, salvo
 * los archivos que agrupan otros (all.spice, rf.spice…), que se abren; sus líneas propias van a
 * archivos `<nombre>.partN.spice`. Devuelve las unidades, las que van siempre y, por dispositivo,
 * los índices de las que necesita.
 */
function splitUnits(out: string, corner: string, body: string[]) {
  const units: string[] = [];
  const open = (lines: string[], file: string | null) => {
    let chunk: string[] = [];
    const flush = () => {
      if (!chunk.some((l) => !/^\s*(\*|$)/.test(l))) return (chunk = []);
      // (las líneas propias de la esquina, como .param mc_mm_switch=0, van a <esquina>.partN.spice)
      const at = (file ?? `${corner}.spice`).replace(/\.spice$/, '.part');
      const part = `${at}${units.filter((u) => u.startsWith(at)).length + 1}.spice`;
      writeFileSync(join(out, part), chunk.join('\n') + '\n');
      units.push(part);
      chunk = [];
    };
    for (const line of lines) {
      const m = INCLUDE.exec(line);
      if (!m) {
        chunk.push(line);
        continue;
      }
      flush();
      const target = file ? rel(out, join(out, dirname(file), m[1])) : m[1];
      const text = readFileSync(join(out, target), 'utf8').split('\n');
      if (text.filter((l) => INCLUDE.test(l)).length >= AGGREGATOR) open(text, target);
      else units.push(target);
    }
    flush();
  };
  open(body, null);

  // Qué define y qué usa cada unidad (con lo que incluye). Los .param dentro de un .subckt son
  // locales y no cuentan como definiciones.
  const defines = new Map<string, Set<number>>();
  const uses: Set<string>[] = [];
  const always: number[] = [];
  const seen = (file: string, acc: Set<string>) => {
    if (acc.has(file)) return;
    acc.add(file);
    for (const line of readFileSync(join(out, file), 'utf8').split('\n')) {
      const m = INCLUDE.exec(line);
      if (m) seen(rel(out, join(out, dirname(file), m[1])), acc);
    }
  };
  units.forEach((unit, i) => {
    const files = new Set<string>();
    seen(unit, files);
    const used = new Set<string>();
    const def = (name: string) => {
      const key = name.toLowerCase().replace(/\.\d+$/, '');
      if (!defines.has(key)) defines.set(key, new Set());
      defines.get(key)!.add(i);
    };
    let depth = 0;
    for (const file of files) {
      for (const st of statements(readFileSync(join(out, file), 'utf8'))) {
        if (/^\s*\.option/i.test(st) && !always.includes(i)) always.push(i);
        if (/^\s*\.subckt\s/i.test(st)) {
          def(st.trim().split(/\s+/)[1]);
          depth++;
        } else if (/^\s*\.ends/i.test(st)) depth--;
        else if (/^\s*\.model\s/i.test(st)) def(st.trim().split(/\s+/)[1]);
        else if (/^\s*\.param\s/i.test(st) && depth === 0) {
          for (const [, name] of st.matchAll(/(\w+)\s*=/g)) def(name);
        }
        for (const [tok] of st.matchAll(/[a-z_]\w*/gi)) used.add(tok.toLowerCase());
      }
    }
    uses.push(used);
  });

  const needs = (seeds: Iterable<number>) => {
    const set = new Set<number>(always);
    const stack = [...seeds];
    while (stack.length) {
      const i = stack.pop()!;
      if (set.has(i) && !always.includes(i)) continue;
      set.add(i);
      for (const tok of uses[i]) for (const j of defines.get(tok) ?? []) if (!set.has(j)) stack.push(j);
    }
    return [...set].sort((a, b) => a - b);
  };
  // `always` también arrastra lo suyo
  const base = needs(always);
  always.splice(0, always.length, ...base);

  const devices: Record<string, number[]> = {};
  for (const [name, at] of defines) {
    if (name.startsWith('sky130_fd_pr__')) devices[name] = needs(at).filter((i) => !base.includes(i));
  }
  return { units, always: base, devices };
}

export function build(out = OUT, onlyFixes = false) {
  const modelsDir = join(SRC, 'libs.tech', 'ngspice');
  const lib = readFileSync(join(modelsDir, 'sky130.lib.spice'), 'utf8');
  rmSync(out, { recursive: true, force: true });

  const done = new Map<string, string>(); // archivo fuente → ruta de salida relativa a `out`
  const devices = new Map<string, Subckt>();
  const models = new Map<string, { name: string; type: string; file: string }>();

  // Copia un archivo traducido y, recursivamente, lo que incluye. Devuelve su ruta en la salida.
  const copy = (src: string): string => {
    const known = done.get(src);
    if (known) return known;
    const dst = rel(SRC, src);
    done.set(src, dst);
    const text = translate(readFileSync(src, 'utf8'), onlyFixes)
      .split('\n')
      .map((line) => {
        const m = INCLUDE.exec(line);
        if (!m) return line;
        const target = copy(normalize(join(dirname(src), m[1])));
        return `.include "${rel(dirname(join(out, dst)), join(out, target))}"`;
      })
      .join('\n');
    mkdirSync(dirname(join(out, dst)), { recursive: true });
    writeFileSync(join(out, dst), text);
    for (const s of subckts(text, dst)) if (!devices.has(s.name)) devices.set(s.name, s);
    for (const [, name, type] of text.matchAll(/^\.model\s+(sky130_fd_pr__\S+)\s+(\w+)/gim)) {
      const key = name.toLowerCase();
      if (!/\.\d+$/.test(name) && !models.has(key)) models.set(key, { name, type: type.toLowerCase(), file: dst });
    }
    return dst;
  };

  const corners = [];
  for (const corner of CORNERS) {
    const body = libSection(lib, corner).map((line) => {
      const m = INCLUDE.exec(line);
      return m ? `.include "${copy(normalize(join(modelsDir, m[1])))}"` : line;
    });
    const header = [
      `* sky130, esquina ${corner}. Generado por scripts/build-pdk.ts desde`,
      `* open_pdks ${OPEN_PDKS} (sky130A, de ciel-releases)`,
      '* (Apache-2.0). No editar: se regenera.',
    ];
    writeFileSync(join(out, `${corner}.spice`), [...header, ...body, ''].join('\n'));
    corners.push({ name: corner, file: `${corner}.spice`, ...splitUnits(out, corner, body) });
  }

  const files = [...done.values()];
  const bytes = files.reduce((n, f) => n + statSync(join(out, f)).size, 0);
  const index = {
    pdk: 'sky130',
    source: { open_pdks: OPEN_PDKS, from: `${RELEASES}/sky130-${OPEN_PDKS}`, license: 'Apache-2.0' },
    corners,
    devices: [...devices.values()]
      .filter((d) => d.name.startsWith('sky130_fd_pr__'))
      .sort((a, b) => a.name.localeCompare(b.name)),
    // Modelos sueltos (diodos, BJT…) que se instancian directo, sin subcircuito. Los binned
    // (nombre.N) los elige ngspice solo y no se listan.
    models: [...models.values()]
      .filter((m) => !devices.has(m.name))
      .sort((a, b) => a.name.localeCompare(b.name)),
    files: files.length,
    bytes,
  };
  // Apache-2.0: la licencia va con los modelos
  copyFileSync(join(ROOT, 'scripts', 'pdk', 'LICENSE-Apache-2.0'), join(out, 'LICENSE'));
  writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 1) + '\n');
  return index;
}

/** La salida ya está al día: mismo commit y generada después del último cambio a este script. */
function upToDate(out: string) {
  try {
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'));
    return index.source.open_pdks === OPEN_PDKS && statSync(join(out, 'index.json')).mtimeMs > statSync(fileURLToPath(import.meta.url)).mtimeMs;
  } catch {
    return false;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url) && !upToDate(OUT)) {
  fetchSources();
  const index = build();
  console.log(
    `sky130: ${index.corners.length} esquinas, ${index.devices.length} subcircuitos, ` +
      `${index.models.length} modelos, ${index.files} archivos, ${(index.bytes / 1e6).toFixed(1)} MB → ${rel(ROOT, OUT)}`,
  );
}
