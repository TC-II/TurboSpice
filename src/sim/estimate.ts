// Cuánta memoria va a necesitar una simulación, antes de correrla (#58). ngspice guarda
// todos los vectores en memoria (wasm32: como mucho 4 GB, y el navegador puede negar
// antes) y después hay que copiarlos a la página: una simulación demasiado grande se
// rechaza con una estimación y una propuesta de menos puntos.
import { formatSpiceNumber, parseSpiceNumber } from '../netlist/spicenum.ts';
import { parseAnalysis, type Analysis, type Sweep } from './analyses.ts';

/**
 * Por encima de esto no se simula. ngspice agranda los vectores con realloc (el viejo y el
 * nuevo conviven) y después se copian a la página: el pico es varias veces esto.
 */
export const MAX_SIM_BYTES = 512 * 1024 ** 2;
/** Puntos por corrida: más tardan minutos en simular y no se pueden graficar con fluidez */
export const MAX_POINTS = 2_000_000;
/** Más puntos por década casi nunca aportan resolución */
const MAX_PER_DECADE = 10000;
/** Lo que se propone al bajar los puntos */
const TARGET_BYTES = 100 * 1024 ** 2;
const TARGET_POINTS = 200_000;

/** Puntos de un barrido dec/oct/lin, o NaN si no se puede saber (parámetros, etc.) */
export function sweepPoints(s: Sweep): number {
  const n = parseSpiceNumber(s.points);
  const a = parseSpiceNumber(s.start);
  const b = parseSpiceNumber(s.stop);
  if (!(n > 0) || !(a > 0 || s.type === 'lin') || !Number.isFinite(b)) return NaN;
  if (s.type === 'lin') return Math.max(1, Math.floor(n));
  const span = s.type === 'dec' ? Math.log10(b / a) : Math.log2(b / a);
  return Math.floor(n * Math.abs(span)) + 1;
}

/**
 * Puntos que genera un análisis (NaN si no se sabe o no barre nada). En .tran ngspice guarda
 * cada paso interno, que nunca es mayor que min(paso, duración/50).
 */
export function analysisPoints(a: Analysis): number {
  switch (a.kind) {
    case 'ac':
    case 'noise':
    case 'disto':
    case 'sp':
      return sweepPoints(a.sweep);
    case 'sens':
      return a.ac ? sweepPoints(a.sweep) : NaN;
    case 'dc':
      return a.sweeps
        .filter((s) => s.src)
        .reduce((acc, s) => {
          const span = Math.abs(parseSpiceNumber(s.stop) - parseSpiceNumber(s.start));
          const step = Math.abs(parseSpiceNumber(s.step));
          return acc * (step > 0 ? Math.floor(span / step + 1e-9) + 1 : NaN);
        }, 1);
    case 'tran': {
      const tstop = parseSpiceNumber(a.tstop);
      const tstart = a.tstart.trim() ? parseSpiceNumber(a.tstart) : 0;
      const dur = tstop - tstart;
      // sin paso, TurboSpice pone tstop/1000 (ver fixTran)
      const tstep = a.tstep.trim() && parseSpiceNumber(a.tstep) > 0 ? parseSpiceNumber(a.tstep) : tstop / 1000;
      const tmax = a.tmax.trim() && parseSpiceNumber(a.tmax) > 0 ? parseSpiceNumber(a.tmax) : Infinity;
      const h = Math.min(tstep, tmax, dur / 50);
      return dur > 0 && h > 0 ? Math.floor(dur / h) + 1 : NaN;
    }
    default:
      return NaN;
  }
}

/** Vectores de corriente que agrega cada dispositivo con ".options savecurrents" */
const CURRENTS: Record<string, number> = { R: 1, C: 1, L: 1, I: 1, G: 1, F: 1, B: 1, D: 1, Q: 4, M: 4, J: 3, Z: 3 };
/** Ramas propias (fuentes de tensión e inductores) */
const BRANCHES: Record<string, number> = { V: 1, L: 1, E: 1, H: 1 };
/** Nodos de cada tipo de elemento (los que no están, se ignoran) */
const NODES: Record<string, number> = { R: 2, C: 2, L: 2, V: 2, I: 2, D: 2, B: 2, F: 2, H: 2, E: 4, G: 4, Q: 3, M: 4, J: 3, Z: 3 };

interface Subckt {
  ports: string[];
  lines: string[];
}

/**
 * Vectores que va a guardar ngspice: un nodo por red (también las internas de los
 * subcircuitos), las ramas de fuentes e inductores y las corrientes de savecurrents.
 */
export function countVectors(netlist: string, files: Record<string, string> = {}): number {
  const subckts = new Map<string, Subckt>();
  const top: string[] = [];
  const lines = (text: string) => {
    const acc: string[] = [];
    for (const l of text.split(/\r\n|\r|\n/)) {
      // continuaciones "+" pegadas a la línea anterior
      if (/^\s*\+/.test(l) && acc.length) acc[acc.length - 1] += ` ${l.replace(/^\s*\+/, '')}`;
      else acc.push(l);
    }
    return acc;
  };
  const collect = (text: string, isTop: boolean) => {
    let cur: Subckt | null = null;
    let control = false;
    for (const raw of lines(text)) {
      const l = raw.trim();
      if (!l || l.startsWith('*')) continue;
      if (/^\.control\b/i.test(l)) control = true;
      if (control) {
        if (/^\.endc\b/i.test(l)) control = false;
        continue;
      }
      const sub = /^\.subckt\s+(\S+)\s*(.*)$/i.exec(l);
      if (sub) {
        cur = { ports: sub[2].split(/\s+/).filter((t) => t && !t.includes('=') && !/^params:$/i.test(t)), lines: [] };
        subckts.set(sub[1].toLowerCase(), cur);
        continue;
      }
      if (/^\.ends\b/i.test(l)) {
        cur = null;
        continue;
      }
      if (cur) cur.lines.push(l);
      else if (isTop) top.push(l);
    }
  };
  collect(netlist, true);
  for (const t of Object.values(files)) collect(t, false);

  // (memo por subcircuito: vectores internos de una instancia)
  const memo = new Map<string, number>();
  const count = (body: string[], ports: Set<string>, depth: number): number => {
    const nodes = new Set<string>();
    let vectors = 0;
    for (const l of body) {
      if (l.startsWith('.')) continue;
      const tok = l.split(/\s+/);
      const letter = tok[0][0].toUpperCase();
      if (letter === 'X') {
        const plain = tok.slice(1).filter((t) => !t.includes('=') && !/^params:$/i.test(t));
        const name = plain.pop()?.toLowerCase() ?? '';
        for (const n of plain) nodes.add(n.toLowerCase());
        vectors += depth > 8 ? 0 : inner(name, depth + 1);
        continue;
      }
      for (const n of tok.slice(1, 1 + (NODES[letter] ?? 0))) nodes.add(n.toLowerCase());
      vectors += (CURRENTS[letter] ?? 0) + (BRANCHES[letter] ?? 0);
    }
    for (const p of ports) nodes.delete(p);
    nodes.delete('0');
    nodes.delete('gnd');
    return vectors + nodes.size;
  };
  const inner = (name: string, depth: number): number => {
    const s = subckts.get(name);
    if (!s) return 10; // subcircuito que no está a la vista: una estimación
    if (!memo.has(name)) memo.set(name, count(s.lines, new Set(s.ports.map((p) => p.toLowerCase())), depth));
    return memo.get(name)!;
  };
  // + el vector de la escala (tiempo, frecuencia…)
  return count(top, new Set(), 0) + 1;
}

const fmtBytes = (b: number) =>
  b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB` : `${Math.round(b / 1024 ** 2)} MB`;
const fmtCount = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',')} M` : n >= 1e4 ? `${Math.round(n / 1e3)} k` : String(n);

export interface SizeProblem {
  text: string;
  /** línea del esquemático y por cuál reemplazarla para bajar los puntos */
  fix?: { from: string; to: string };
}

export interface SizeCheck {
  /** no se simula */
  errors: SizeProblem[];
  warnings: SizeProblem[];
}

/** Misma línea con menos puntos (para .ac/.noise: puntos por década; para .tran: paso máximo) */
function fewerPoints(line: string, a: Analysis, factor: number): string | undefined {
  const t = line.trim().split(/\s+/);
  if ('sweep' in a && a.kind !== 'sens') {
    const i = t.findIndex((x) => /^(dec|oct|lin)$/i.test(x));
    if (i < 0) return undefined;
    const n = parseSpiceNumber(t[i + 1]);
    // (en dec/oct, más de 1000 puntos no aportan: tampoco se proponen)
    const want = Math.max(1, Math.min(Math.floor(n * factor), a.sweep.type === 'lin' ? Infinity : 1000));
    // un número redondo: 10, 20, 50, 100, 200, 500…
    const round = [1, 2, 5].flatMap((m) => [0, 1, 2, 3, 4, 5, 6].map((e) => m * 10 ** e)).filter((x) => x <= want).sort((x, y) => y - x)[0] ?? 1;
    t[i + 1] = String(round);
    return t.join(' ');
  }
  if (a.kind === 'tran') {
    const p = analysisPoints(a);
    const dur = parseSpiceNumber(a.tstop) - (a.tstart.trim() ? parseSpiceNumber(a.tstart) : 0);
    const step = formatSpiceNumber(Number((dur / Math.max(1, p * factor)).toPrecision(1)));
    return `.tran 0 ${a.tstop} ${a.tstart.trim() || '0'} ${step}${a.uic ? ' uic' : ''}`;
  }
  return undefined;
}

/**
 * Revisa los análisis del esquemático (líneas tal como están escritas) contra la netlist
 * final: puntos × vectores × 8 bytes (16 en los complejos: AC), por cada corrida de .step.
 */
export function checkSimSize(analysisLines: string[], netlist: string, files: Record<string, string>, runs = 1): SizeCheck {
  const out: SizeCheck = { errors: [], warnings: [] };
  let vectors: number | undefined;
  for (const line of analysisLines) {
    const a = parseAnalysis(line);
    if (!a) continue;
    const points = analysisPoints(a);
    if (!Number.isFinite(points)) continue;
    if ('sweep' in a && a.sweep.type !== 'lin' && parseSpiceNumber(a.sweep.points) > MAX_PER_DECADE * (a.sweep.type === 'oct' ? 0.3 : 1)) {
      out.warnings.push({
        text: `${line}: ${fmtCount(parseSpiceNumber(a.sweep.points))} puntos por ${a.sweep.type === 'dec' ? 'década' : 'octava'} casi nunca aportan resolución (con 100 a 1000 alcanza)`,
      });
    }
    vectors ??= countVectors(netlist, files);
    const complex = a.kind === 'ac' || a.kind === 'sp' || a.kind === 'disto' || (a.kind === 'sens' && a.ac);
    const bytes = points * vectors * (complex ? 16 : 8) * runs;
    if (bytes <= MAX_SIM_BYTES && points <= MAX_POINTS) continue;
    const to = fewerPoints(line, a, Math.min(TARGET_BYTES / bytes, TARGET_POINTS / points));
    const per = runs > 1 ? ` × ${runs} corridas` : '';
    const why =
      bytes > MAX_SIM_BYTES
        ? `≈ ${fmtBytes(bytes)}: más de lo que el navegador puede guardar y graficar`
        : `≈ ${fmtBytes(bytes)}: demasiados puntos para simular y graficar en un tiempo razonable`;
    out.errors.push({
      text:
        `${line} genera ${fmtCount(points)} puntos × ${vectors} vectores${per} ${why}, así que no se simula.` +
        (to ? ` Probá con «${to}».` : ' Reducí la cantidad de puntos.'),
      fix: to ? { from: line, to } : undefined,
    });
  }
  return out;
}
