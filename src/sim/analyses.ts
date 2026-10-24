import { t } from '../i18n/i18n.ts';
// Comandos de análisis: modelo editable, generación y lectura de la línea SPICE.
// Se usa la sintaxis común a LTspice y ngspice; los análisis que sólo tiene ngspice
// se guardan como comentario (ver netlist/directives.ts).

export type SweepType = 'dec' | 'oct' | 'lin';

export interface Sweep {
  type: SweepType;
  points: string;
  start: string;
  stop: string;
}

export interface DcSweep {
  src: string;
  start: string;
  stop: string;
  step: string;
}

export type Analysis =
  | { kind: 'tran'; tstop: string; tstart: string; tmax: string; tstep: string; uic: boolean; startup: boolean }
  | { kind: 'ac'; sweep: Sweep }
  | { kind: 'dc'; sweeps: DcSweep[] }
  | { kind: 'noise'; out: string; ref: string; src: string; sweep: Sweep }
  | { kind: 'op' }
  | { kind: 'tf'; out: string; src: string }
  | { kind: 'sens'; out: string; ac: boolean; sweep: Sweep }
  | { kind: 'pz'; inP: string; inN: string; outP: string; outN: string; type: 'vol' | 'cur'; which: 'pz' | 'pol' | 'zer' }
  | { kind: 'disto'; sweep: Sweep; f2overf1: string }
  | { kind: 'sp'; sweep: Sweep; noise: boolean };

export type AnalysisKind = Analysis['kind'];

export const ANALYSES: { kind: AnalysisKind; label: string; ngspiceOnly: boolean; help: string }[] = [
  { kind: 'tran', label: t('Transient'), ngspiceOnly: false, help: t('Response over time (.tran).') },
  { kind: 'ac', label: 'AC (Bode)', ngspiceOnly: false, help: t('Small-signal frequency response around the operating point (.ac). Excitation sources need "AC 1" in their value.') },
  { kind: 'op', label: t('Operating point'), ngspiceOnly: false, help: t('DC voltages and currents (.op).') },
  { kind: 'dc', label: t('DC sweep'), ngspiceOnly: false, help: t('Sweeps the value of one or two sources and solves the operating point at each step (.dc).') },
  { kind: 'noise', label: t('Noise'), ngspiceOnly: false, help: t('Noise spectral density at the output and referred to the input (.noise).') },
  { kind: 'tf', label: t('DC transfer function'), ngspiceOnly: false, help: t('DC gain, input and output resistance (.tf).') },
  { kind: 'sens', label: t('Sensitivity'), ngspiceOnly: true, help: t('Sensitivity of an output to each circuit parameter (.sens).') },
  { kind: 'pz', label: t('Poles and zeros'), ngspiceOnly: true, help: t('Poles and zeros of a transfer function (.pz).') },
  { kind: 'disto', label: t('Distortion'), ngspiceOnly: true, help: t('Small-signal harmonic and intermodulation distortion (.disto). Sources need DISTOF1/DISTOF2.') },
  { kind: 'sp', label: t('S-parameters'), ngspiceOnly: true, help: t('S-parameters (.sp). The ports are voltage sources with "portnum N z0 50" in their value.') },
];

const SWEEP: Sweep = { type: 'dec', points: '100', start: '1', stop: '1meg' };

export function defaultAnalysis(kind: AnalysisKind): Analysis {
  switch (kind) {
    case 'tran':
      return { kind, tstop: '10m', tstart: '', tmax: '', tstep: '', uic: false, startup: false };
    case 'ac':
      return { kind, sweep: { ...SWEEP } };
    case 'dc':
      return { kind, sweeps: [{ src: '', start: '0', stop: '5', step: '0.1' }] };
    case 'noise':
      return { kind, out: '', ref: '', src: '', sweep: { ...SWEEP, points: '20' } };
    case 'op':
      return { kind };
    case 'tf':
      return { kind, out: '', src: '' };
    case 'sens':
      return { kind, out: '', ac: false, sweep: { ...SWEEP, points: '10' } };
    case 'pz':
      return { kind, inP: '', inN: '0', outP: '', outN: '0', type: 'vol', which: 'pz' };
    case 'disto':
      return { kind, sweep: { ...SWEEP, points: '10', start: '1k', stop: '100k' }, f2overf1: '' };
    case 'sp':
      return { kind, sweep: { ...SWEEP, points: '10', start: '1meg', stop: '1g' }, noise: false };
  }
}

const sweepText = (s: Sweep) => `${s.type} ${s.points} ${s.start} ${s.stop}`;
/** "out" → "V(out)"; deja igual lo que ya es V(…)/I(…) */
const asVoltage = (n: string) => (/^[vi]\s*\(/i.test(n) ? n : `V(${n})`);

export function formatAnalysis(a: Analysis): string {
  switch (a.kind) {
    case 'tran': {
      const opt = [a.tstart, a.tmax].some((x) => x.trim()) || a.tstep.trim();
      const parts = opt ? ['.tran', a.tstep.trim() || '0', a.tstop, a.tstart.trim() || '0', a.tmax.trim()] : ['.tran', a.tstop];
      if (a.uic) parts.push('uic');
      if (a.startup) parts.push('startup');
      return parts.filter((x) => x !== '').join(' ');
    }
    case 'ac':
      return `.ac ${sweepText(a.sweep)}`;
    case 'dc':
      return `.dc ${a.sweeps
        .filter((s) => s.src)
        .map((s) => `${s.src} ${s.start} ${s.stop} ${s.step}`)
        .join(' ')}`;
    case 'noise': {
      const out = a.ref.trim() ? `V(${a.out},${a.ref})` : asVoltage(a.out);
      return `.noise ${out} ${a.src} ${sweepText(a.sweep)}`;
    }
    case 'op':
      return '.op';
    case 'tf':
      return `.tf ${asVoltage(a.out)} ${a.src}`;
    case 'sens':
      return a.ac ? `.sens ${asVoltage(a.out)} ac ${sweepText(a.sweep)}` : `.sens ${asVoltage(a.out)}`;
    case 'pz':
      return `.pz ${a.inP} ${a.inN} ${a.outP} ${a.outN} ${a.type} ${a.which}`;
    case 'disto':
      return `.disto ${sweepText(a.sweep)}${a.f2overf1.trim() ? ` ${a.f2overf1.trim()}` : ''}`;
    case 'sp':
      return `.sp ${sweepText(a.sweep)}${a.noise ? ' 1' : ''}`;
  }
}

export const ANALYSIS_LINE = /^\s*\.(tran|ac|dc|noise|op|tf|sens|pz|disto|sp)\b/i;

function parseSweep(tt: string[]): Sweep | null {
  const [type, points, start, stop] = tt;
  if (!/^(dec|oct|lin)$/i.test(type ?? '') || stop === undefined) return null;
  return { type: type.toLowerCase() as SweepType, points, start, stop };
}

/** "V(out)" → "out"; "V(a,b)" → ["a","b"] */
function unwrapV(s: string): [string, string] {
  const m = /^v\s*\(\s*([^,)]+)\s*(?:,\s*([^)]+))?\)$/i.exec(s);
  return m ? [m[1].trim(), (m[2] ?? '').trim()] : [s, ''];
}

/** Interpreta una línea de análisis; null si no se reconoce (se edita como texto libre) */
export function parseAnalysis(line: string): Analysis | null {
  // V(a, b) con espacios: juntarlo en un token
  const tt = line.trim().replace(/\(\s*([^)]*?)\s*\)/g, (_, x: string) => `(${x.replace(/\s+/g, '')})`).split(/\s+/);
  const kind = tt[0]?.slice(1).toLowerCase();
  const a = tt.slice(1);
  switch (kind) {
    case 'tran': {
      const uic = a.some((x) => /^uic$/i.test(x));
      const startup = a.some((x) => /^startup$/i.test(x));
      const nums = a.filter((x) => !/^[a-z]/i.test(x) || x.startsWith('{'));
      if (a.some((x) => /^[a-z]/i.test(x) && !/^(uic|startup)$/i.test(x))) return null; // steady, nodiscard…
      if (nums.length === 1) return { kind, tstop: nums[0], tstart: '', tmax: '', tstep: '', uic, startup };
      if (nums.length < 2) return null;
      const [tstep, tstop, tstart = '', tmax = ''] = nums;
      return { kind, tstop, tstart: tstart === '0' ? '' : tstart, tmax, tstep: tstep === '0' ? '' : tstep, uic, startup };
    }
    case 'ac': {
      const sweep = parseSweep(a);
      return sweep && a.length === 4 ? { kind, sweep } : null;
    }
    case 'dc': {
      if (a.length !== 4 && a.length !== 8) return null;
      const sweeps: DcSweep[] = [];
      for (let i = 0; i < a.length; i += 4) sweeps.push({ src: a[i], start: a[i + 1], stop: a[i + 2], step: a[i + 3] });
      return { kind, sweeps };
    }
    case 'noise': {
      const sweep = parseSweep(a.slice(2));
      if (!sweep) return null;
      const [out, ref] = unwrapV(a[0]);
      return { kind, out, ref, src: a[1], sweep };
    }
    case 'op':
      return a.length ? null : { kind };
    case 'tf':
      return a.length === 2 ? { kind, out: unwrapV(a[0])[0], src: a[1] } : null;
    case 'sens': {
      const out = unwrapV(a[0] ?? '')[0];
      if (a.length === 1) return { kind, out, ac: false, sweep: { ...SWEEP, points: '10' } };
      const sweep = /^ac$/i.test(a[1] ?? '') ? parseSweep(a.slice(2)) : null;
      return sweep ? { kind, out, ac: true, sweep } : null;
    }
    case 'pz': {
      // sin entrada o salida elegidas (".pz  0  0 vol pz") faltan nodos: se leen vacíos para que la
      // barra siga mostrando sus campos
      const n = a.length - 2;
      if (n < 2 || n > 4 || !/^(vol|cur)$/i.test(a[n]) || !/^(pz|pol|zer)$/i.test(a[n + 1])) return null;
      const [inP, inN, outP, outN] = n === 4 ? a : n === 3 ? [a[0], a[1], '', a[2]] : ['', a[0], '', a[1]];
      return { kind, inP, inN, outP, outN, type: a[n].toLowerCase() as 'vol', which: a[n + 1].toLowerCase() as 'pz' };
    }
    case 'disto': {
      const sweep = parseSweep(a);
      return sweep ? { kind, sweep, f2overf1: a[4] ?? '' } : null;
    }
    case 'sp': {
      const sweep = parseSweep(a);
      return sweep ? { kind, sweep, noise: a[4] === '1' } : null;
    }
  }
  return null;
}

export const isNum = (s: string) => /^\{.+\}$/.test(s.trim()) || /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?[a-zµμ]*$/i.test(s.trim());

/** Errores del formulario (vacío = se puede aceptar) */
export function validateAnalysis(a: Analysis): string[] {
  const errs: string[] = [];
  const num = (v: string, what: string, required = true) => {
    if (!v.trim()) {
      if (required) errs.push(t('{what} is missing', { what }));
    } else if (!isNum(v)) errs.push(t('{what}: "{v}" isn\'t a number', { what, v }));
  };
  const sweep = (s: Sweep) => {
    num(s.points, t('the number of points'));
    num(s.start, t('the start'));
    num(s.stop, t('the stop'));
  };
  switch (a.kind) {
    case 'tran':
      num(a.tstop, t('the stop time'));
      num(a.tstart, t('the start time'), false);
      num(a.tmax, t('the maximum step'), false);
      num(a.tstep, t('the output step'), false);
      break;
    case 'ac':
    case 'disto':
    case 'sp':
      sweep(a.sweep);
      if (a.kind === 'disto') num(a.f2overf1, 'f2/f1', false);
      break;
    case 'dc':
      a.sweeps.forEach((s, i) => {
        if (!s.src) {
          if (i === 0) errs.push(t('The source to sweep is missing'));
          return;
        }
        num(s.start, t('the start'));
        num(s.stop, t('the stop'));
        num(s.step, t('the increment'));
      });
      break;
    case 'noise':
      if (!a.out) errs.push(t('The output node is missing'));
      if (!a.src) errs.push(t('The input source is missing'));
      sweep(a.sweep);
      break;
    case 'tf':
      if (!a.out) errs.push(t('The output is missing'));
      if (!a.src) errs.push(t('The input source is missing'));
      break;
    case 'sens':
      if (!a.out) errs.push(t('The output is missing'));
      if (a.ac) sweep(a.sweep);
      break;
    case 'pz':
      for (const [v, w] of [[a.inP, t('input +')], [a.inN, t('input −')], [a.outP, t('output +')], [a.outN, t('output −')]]) {
        if (!v) errs.push(t('The {w} node is missing', { w }));
      }
      break;
  }
  return errs;
}
