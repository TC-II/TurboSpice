// Punto de operación sobre el esquemático: qué parámetros pedirle a ngspice por dispositivo
// y cómo describir una red o un componente (hover y anotación, como el .op de LTspice).
import type { AscDoc } from '../asc/model.ts';
import type { Element } from '../netlist/ltnetlist.ts';
import { si } from '../waveform/series.ts';
import { deviceVector, netVector, type BuiltSimulation } from './schematicSim.ts';
import { blockInstances, scopeElement, scopeNet, hierDevice, type InstScope } from './context.ts';
import { ANALYSIS_LINE } from './analyses.ts';
import { t } from '../i18n/i18n.ts';
import { pinTerminal } from './traces.ts';

export type Bias = Record<string, number>;

const PARAMS: Record<string, string[]> = {
  q: ['gm', 'vbe', 'vbc', 'ic', 'ib', 'ie'],
  m: ['id', 'ig', 'is', 'ib', 'vgs', 'vds', 'gm', 'gds', 'von', 'vdsat'],
  j: ['id', 'ig', 'is', 'vgs', 'vgd', 'gm'],
  d: ['id', 'vd'],
  r: ['p'],
  v: ['p'],
  i: ['p'],
};

/** Parámetros de dispositivo (`@q1[gm]`…) a leer en el punto de operación */
/**
 * Con qué se calcula el punto de operación que se anota: en un .tran, el estado en t = 0 (sin uic
 * es el bias con las condiciones iniciales de capacitores e inductores, como en LTspice; con uic,
 * el estado inicial); en el resto, el "op" de continua.
 */
export function biasCommand(netlist: string): { cmd: string; atZero: boolean } {
  const tran = /^\s*\.tran\b(.*)$/im.exec(netlist);
  if (!tran) return { cmd: 'op', atZero: false };
  return { cmd: `tran 1p 1p${/\buic\b/i.test(tran[1]) ? ' uic' : ''}`, atZero: true };
}

export function biasParams(sim: BuiltSimulation): string[] {
  const out: string[] = [];
  for (const ng of sim.ng.names.values()) {
    const n = ng.toLowerCase();
    for (const p of PARAMS[n[0]] ?? []) out.push(`@${n}[${p}]`);
  }
  // los de adentro de cada instancia de un subcircuito del proyecto (#199): @q.x_u1.q1[gm]
  for (const inst of blockInstances(sim))
    for (const ng of inst.names.values()) {
      const n = hierDevice(`${inst.prefix}${ng}`)!;
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

/** Tensión de una red de adentro de una instancia (#199), con su nombre local en el título */
export function scopedNetBias(bias: Bias, scope: InstScope, net: string): BiasInfo | null {
  const b = netBias(bias, scopeNet(scope, net));
  return b && { ...b, title: `V(${scope.prefix}${net})` };
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

/**
 * Corriente del OP en un pin de un transistor (`pin` = SpiceOrder), como la mide la punta de
 * prueba en los demás análisis: "Ib = 12.3µA". null si el elemento no es de varios pines.
 */
export function pinBias(sim: BuiltSimulation, bias: Bias, el: Element, pin: number, scope?: InstScope): string | null {
  const term = pinTerminal(el.prefix, pin);
  const local = scope ? scopeElement(scope, el.name) : sim.ng.names.get(el.name)?.toLowerCase();
  const ng = local && (scope ? hierDevice(local) : local);
  if (!term || !ng) return null;
  return `I${term} = ${fmt(bias[`@${ng}[i${term}]`], 'A')}`;
}

/** `scope`: el elemento es de adentro de esa instancia (#199) */
export function elementBias(sim: BuiltSimulation, bias: Bias, el: Element, scope?: InstScope): BiasInfo | null {
  const local = scope ? scopeElement(scope, el.name) : sim.ng.names.get(el.name)?.toLowerCase();
  const ng = local && (scope ? hierDevice(local) : local);
  if (!ng) return null;
  const p = (k: string) => bias[`@${ng}[${k}]`];
  const iVec = deviceVector(ng, el.value);
  const i = iVec ? bias[iVec] : undefined;
  const v = (k: number) => (el.nodes[k] === undefined ? undefined : nodeV(bias, scope ? scopeNet(scope, el.nodes[k]) : el.nodes[k]));
  const vab = v(0) !== undefined && v(1) !== undefined ? v(0)! - v(1)! : undefined;
  const title = (scope ? `${scope.prefix}${el.name}` : el.name).replace(/§/g, '');
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
