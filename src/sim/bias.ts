// Punto de operación sobre el esquemático: qué parámetros pedirle a ngspice por dispositivo
// y cómo describir una red o un componente (hover y anotación, como el .op de LTspice).
import type { AscDoc } from '../asc/model.ts';
import type { Element } from '../netlist/ltnetlist.ts';
import { si } from '../waveform/series.ts';
import { elementVector, netVector, type BuiltSimulation } from './schematicSim.ts';
import { ANALYSIS_LINE } from './analyses.ts';
import { t } from '../i18n/i18n.ts';

export type Bias = Record<string, number>;

const PARAMS: Record<string, string[]> = {
  q: ['gm', 'vbe', 'vbc', 'ic', 'ib', 'ie'],
  m: ['id', 'vgs', 'vds', 'gm', 'gds', 'von', 'vdsat'],
  j: ['id', 'vgs', 'vgd', 'gm'],
  d: ['id', 'vd'],
  r: ['p'],
  v: ['p'],
  i: ['p'],
};

/** Parámetros de dispositivo (`@q1[gm]`…) a leer en el punto de operación */
export function biasParams(sim: BuiltSimulation): string[] {
  const out: string[] = [];
  for (const ng of sim.ng.names.values()) {
    const n = ng.toLowerCase();
    for (const p of PARAMS[n[0]] ?? []) out.push(`@${n}[${p}]`);
  }
  return out;
}

/** Directivas que cambian el circuito: sin comentarios ni comandos de análisis */
const circuitDirectives = (doc: AscDoc) =>
  doc.texts
    .filter((tt) => tt.kind === 'directive')
    .flatMap((tt) => tt.text.split('\\n'))
    .filter((l) => !ANALYSIS_LINE.test(l))
    .join('\n');

/**
 * ¿Mismo circuito? El punto de operación no depende del comando de análisis (cambia al elegir
 * otra simulación o editar sus parámetros) ni de los comentarios: sólo de componentes,
 * cables, etiquetas y del resto de las directivas.
 */
export function sameCircuit(a: AscDoc, b: AscDoc): boolean {
  if (a === b) return true;
  if (a.symbols !== b.symbols || a.wires !== b.wires || a.flags !== b.flags) return false;
  return circuitDirectives(a) === circuitDirectives(b);
}

const nodeV = (bias: Bias, node: string) => (node === '0' ? 0 : bias[netVector(node)]);
const fmt = (x: number | undefined, unit: string) => (x === undefined || !Number.isFinite(x) ? '—' : `${si(x, 4)}${unit}`);

export interface BiasInfo {
  title: string;
  lines: string[];
  /** valor corto para anotar en el esquemático */
  short?: string;
}

export function netBias(bias: Bias, net: string): BiasInfo | null {
  const v = nodeV(bias, net);
  if (v === undefined) return null;
  return { title: `V(${net})`, lines: [fmt(v, 'V')], short: fmt(v, 'V') };
}

/** Región de un BJT: corte / activa / saturación. `s` = 1 en NPN, -1 en PNP */
function bjtRegion(vbe: number, vbc: number, s: number): string {
  const be = s * vbe;
  const bc = s * vbc;
  if (be < 0.4) return t('cutoff');
  return bc > 0.4 ? t('saturation') : t('forward active');
}

/** Región de un MOSFET. `s` = 1 en canal N, -1 en canal P (ngspice da von con signo) */
function mosRegion(vgs: number, vds: number, von: number, vdsat: number, s: number): string {
  if (s * vgs < s * von) return t('cutoff');
  return Math.abs(vds) < Math.abs(vdsat) ? t('triode (linear)') : t('saturation');
}

export function elementBias(sim: BuiltSimulation, bias: Bias, el: Element): BiasInfo | null {
  const ng = sim.ng.names.get(el.name)?.toLowerCase();
  if (!ng) return null;
  const p = (k: string) => bias[`@${ng}[${k}]`];
  const iVec = elementVector(sim, el.name);
  const i = iVec ? bias[iVec] : undefined;
  const v = (k: number) => nodeV(bias, el.nodes[k]);
  const vab = v(0) !== undefined && v(1) !== undefined ? v(0)! - v(1)! : undefined;
  const title = el.name.replace(/§/g, '');
  const pol = /^(QP|MP|JP)$/i.test(el.prefix) ? -1 : 1;
  switch (ng[0]) {
    case 'r':
      return { title, lines: [`I = ${fmt(i, 'A')}`, `V = ${fmt(vab, 'V')}`, `P = ${fmt(p('p'), 'W')}`], short: fmt(i, 'A') };
    case 'c':
    case 'l':
      return { title, lines: [`I = ${fmt(i, 'A')}`, `V = ${fmt(vab, 'V')}`], short: ng[0] === 'l' ? fmt(i, 'A') : fmt(vab, 'V') };
    case 'v':
    case 'i': {
      // potencia entregada (ngspice la da con signo de consumida)
      const pw = p('p');
      return {
        title,
        lines: [`I = ${fmt(i, 'A')}`, `V = ${fmt(vab, 'V')}`, `P entregada = ${fmt(pw === undefined ? undefined : -pw, 'W')}`],
        short: fmt(i, 'A'),
      };
    }
    case 'd':
      return { title, lines: [`Id = ${fmt(p('id'), 'A')}`, `Vd = ${fmt(p('vd') ?? vab, 'V')}`], short: fmt(p('id'), 'A') };
    case 'q': {
      const [vbe, vbc] = [p('vbe'), p('vbc')];
      const vce = v(0) !== undefined && v(2) !== undefined ? v(0)! - v(2)! : undefined;
      const ic = p('ic');
      const ib = p('ib');
      return {
        title,
        lines: [
          `Ic = ${fmt(ic, 'A')}`,
          `Ib = ${fmt(ib, 'A')}`,
          `Ie = ${fmt(p('ie'), 'A')}`,
          `Vbe = ${fmt(vbe, 'V')}`,
          `Vce = ${fmt(vce, 'V')}`,
          `gm = ${fmt(p('gm'), 'S')}`,
          ...(ic !== undefined && ib ? [`β = Ic/Ib = ${si(ic / ib, 4)}`] : []),
          ...(vbe !== undefined && vbc !== undefined ? [t('Region: {p0}', { p0: bjtRegion(vbe, vbc, pol) })] : []),
        ],
        short: fmt(ic, 'A'),
      };
    }
    case 'm': {
      const [vgs, vds, von, vdsat] = [p('vgs'), p('vds'), p('von'), p('vdsat')];
      return {
        title,
        lines: [
          `Id = ${fmt(p('id'), 'A')}`,
          `Vgs = ${fmt(vgs, 'V')}`,
          `Vds = ${fmt(vds, 'V')}`,
          `Vth = ${fmt(von, 'V')}`,
          `Vds,sat = ${fmt(vdsat, 'V')}`,
          `gm = ${fmt(p('gm'), 'S')}`,
          `gds = ${fmt(p('gds'), 'S')}`,
          ...(vgs !== undefined && vds !== undefined && von !== undefined && vdsat !== undefined
            ? [t('Region: {p0}', { p0: mosRegion(vgs, vds, von, vdsat, pol) })]
            : []),
        ],
        short: fmt(p('id'), 'A'),
      };
    }
    case 'j':
      return {
        title,
        lines: [`Id = ${fmt(p('id'), 'A')}`, `Vgs = ${fmt(p('vgs'), 'V')}`, `Vds = ${fmt(p('vgs') !== undefined && p('vgd') !== undefined ? p('vgs') - p('vgd') : undefined, 'V')}`, `gm = ${fmt(p('gm'), 'S')}`],
        short: fmt(p('id'), 'A'),
      };
    default:
      return i === undefined ? null : { title, lines: [`I = ${fmt(i, 'A')}`], short: fmt(i, 'A') };
  }
}
