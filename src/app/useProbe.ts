// La punta de prueba en el esquemático: un clic grafica la tensión de un cable o la corriente de un
// componente (también adentro de un subcircuito, en un bus o en un bloque Verilog), arrastrada de un
// punto a otro grafica la resta o el cociente (#308), y con la DFT elige qué transformar
import { useRef, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import type { SimPlot } from '../engine/ngspice.ts';
import { t } from '../i18n/i18n.ts';
import { busBitNode, busBits, isBusName } from '../netlist/bus.ts';
import type { LtNetlist } from '../netlist/ltnetlist.ts';
import type { Tool } from '../schematic/SchematicEditor.tsx';
import type { InstScope } from '../sim/context.ts';
import { toggleOpTag, type OpTags } from '../sim/opPins.ts';
import { deviceSignals, saveSelection } from '../sim/saves.ts';
import { digitalProbeExpr, probeExpr } from '../sim/traces.ts';
import type { Expanded } from '../ui/ResultsSplitter.tsx';
import { placeTrace } from '../waveform/curves.ts';
import { evalTrace, type Resolver } from '../waveform/expr.ts';
import type { PlotPanelHandle } from '../waveform/PlotPanel.tsx';
import { scaleOf } from '../waveform/series.ts';
import type { TraceBoxHandle } from '../waveform/TraceBox.tsx';
import { addTraceTo, sameExpr, type Pane } from '../waveform/view.ts';
import type { HierLevel, SimRun } from './types.ts';

type Target = { net?: string; symbol?: number; pin?: number };

/** Una red sin rango que en el esquemático es un bus (N001 entre pines de 16 bits): "N001[15:0]"; si no, null */
export function implicitBus(lt: LtNetlist, net: string): string | null {
  const n = lt.conn.nets.find((x) => x.name.toLowerCase() === net.toLowerCase());
  const hi = n && n.bits.length > 1 ? /\[(\d+)\]$/.exec(n.bits[0]) : null;
  return hi && n!.bits.every((b, i) => b.toLowerCase() === `${net}[${Number(hi[1]) - i}]`.toLowerCase()) ? `${net}[${hi[1]}:0]` : null;
}

/** ¿El bus va a un pin de una instancia X (un bloque Verilog)? */
function verilogBus(ng: string, bits: string[]): boolean {
  const node = busBitNode(bits[0]).toLowerCase();
  return ng.split('\n').some((l) => /^x/i.test(l.trim()) && l.toLowerCase().split(/\s+/).includes(node));
}

export interface ProbeDeps {
  tool: Tool;
  setTool(tt: Tool): void;
  setToolState: Dispatch<SetStateAction<Tool>>;
  sim: SimRun | null;
  plot: SimPlot | undefined;
  /** hay punto de operación (los valores se anotan en el esquemático) */
  op: unknown;
  setOpTags(f: (tags: OpTags) => OpTags): void;
  simScope: InstScope | undefined;
  resolver(p: SimPlot): Resolver;
  isComplex: boolean | undefined;
  panes: Pane[];
  activePane: number;
  editPanes(next: Pane[]): void;
  setActivePane(i: number): void;
  expanded: Expanded;
  setExpanded(e: Expanded): void;
  setPanel(panel: 'plot'): void;
  pathRef: MutableRefObject<HierLevel[]>;
  plotPanel: RefObject<PlotPanelHandle>;
  traceBox: RefObject<TraceBoxHandle>;
  /** el panel de señales guardadas elige con la punta */
  savesPicking: boolean;
  pickSave(target: Target): void;
  setMessage(m?: string): void;
}

export function useProbe(d: ProbeDeps) {
  const { tool, setTool, setToolState, sim, plot, op, setOpTags, simScope, resolver, isComplex, panes, activePane, editPanes, setActivePane } = d;
  const { expanded, setExpanded, setPanel, pathRef, plotPanel, traceBox, savesPicking, pickSave, setMessage } = d;
  const dftPick = useRef<Tool | null>(null);
  const onDftPicking = (on: boolean) => {
    if (on === !!dftPick.current) return;
    if (on) {
      dftPick.current = tool;
      if (sim) setTool({ kind: 'probe' });
    } else {
      const back = dftPick.current;
      dftPick.current = null;
      setToolState((cur) => (cur.kind === 'probe' && back ? back : cur));
    }
  };
  const onProbe = (target: { net?: string; symbol?: number; pin?: number }) => {
    if (savesPicking) return pickSave(target);
    if (!sim || !plot) return;
    // un punto de operación (sin eje X): se anota el valor en el esquemático y queda fijo (#228)
    if (!scaleOf(plot) && op) return setOpTags((p) => toggleOpTag(p, target));
    // un cable de bus (f[10:0], o uno sin nombre entre pines de bus: N001 con sus bits N001[0]…):
    // una traza por bit, en el testbench
    const bus = target.net && !pathRef.current.length && !dftPick.current ? (isBusName(target.net) ? target.net : implicitBus(sim.built.lt, target.net)) : null;
    if (bus) {
      const sc = scaleOf(plot);
      if (!sc) return;
      // si sale de un bloque Verilog, el bus digital entero (Dig(x1.d[2:0]))
      const dig = digitalProbeExpr(sim.built, busBits(bus), bus);
      if (dig && hasData(dig)) return addDigitalProbe(dig);
      const exprs = busBits(bus)
        .map((b) => probeExpr(sim.built, { net: b }))
        .filter((e): e is string => {
          if (!e) return false;
          try {
            evalTrace(e, { resolve: resolver(plot), scale: sc.real, scaleName: sc.name });
            return true;
          } catch {
            return false;
          }
        });
      if (!exprs.length) {
        // un bus entre bloques Verilog que se simularon juntos en un solo módulo de Icarus (o que no
        // se guardó): la traza digital queda y, como lo que piden las trazas se expone, aparece al
        // volver a simular
        if (verilogBus(sim.built.ng.text, busBits(bus))) {
          addDigitalProbe(`Dig(${bus})`);
          return setMessage(t("{expr} wasn't saved in this simulation: it will be saved when you simulate again", { expr: `Dig(${bus})` }));
        }
        return setMessage(t('No data for {expr} in {name}', { expr: bus, name: plot.name }));
      }
      setPanel('plot');
      if (expanded === 'schematic') setExpanded('');
      const i = Math.min(activePane, panes.length - 1);
      return editPanes(exprs.reduce((ps, e) => addTraceTo(ps, i, e), panes));
    }
    let expr = probeExpr(sim.built, target);
    // adentro de un subcircuito (#180): la red de esta instancia en la netlist del testbench
    const lv = pathRef.current[pathRef.current.length - 1];
    if (lv) {
      if (!lv.inst) return setMessage(t('To probe inside a subcircuit, enter it from an instance (double-click it in the testbench)'));
      // con el subcircuito tal como se simuló: tensiones y corrientes de los de adentro (#199)
      if (simScope) expr = probeExpr(sim.built, target, simScope);
      else {
        if (!target.net || target.net === '0') return setMessage(t('Inside a subcircuit the probe measures voltages (click a wire)'));
        const up = lv.ports.get(target.net.toLowerCase());
        if (up === '0') return;
        expr = `V(${up ?? lv.prefix + target.net})`;
      }
    }
    if (!expr) return;
    if (dftPick.current) {
      const sc = scaleOf(plot);
      try {
        if (sc) evalTrace(expr, { resolve: resolver(plot), scale: sc.real, scaleName: sc.name });
      } catch {
        return setMessage(t('No data for {expr} in {name}', { expr, name: plot.name }));
      }
      return plotPanel.current?.addDft(expr);
    }
    // con el foco en la caja de trazas, se escribe ahí (para armar una expresión)
    if (traceBox.current?.focused()) return traceBox.current.insert(expr);
    // una salida de un bloque Verilog: su versión digital (la tensión se puede pedir con V())
    if (target.net && !lv) {
      const dig = digitalProbeExpr(sim.built, [target.net]);
      if (dig && hasData(dig)) return addDigitalProbe(dig);
    }
    plotExpr(expr);
  };
  /** grafica una expresión en el panel activo (o avisa si no hay datos) */
  const plotExpr = (expr: string) => {
    if (!sim || !plot) return;
    setPanel('plot');
    // con los resultados colapsados, mostrarlos para ver la traza
    if (expanded === 'schematic') setExpanded('');
    const i = Math.min(activePane, panes.length - 1);
    if (panes[i]?.traces.some((tt) => !tt.dft && sameExpr(tt.expr, expr))) return;
    const sc = scaleOf(plot);
    if (!sc) return setMessage(t('{name} has no X axis: choose another analysis to plot', { name: plot.name }));
    try {
      evalTrace(expr, { resolve: resolver(plot), scale: sc.real, scaleName: sc.name });
    } catch {
      // con sólo las señales elegidas (#314) puede no haberse guardado: la traza queda y, como lo
      // que usan las trazas se guarda siempre, aparece al volver a simular
      if (saveSelection(sim.built.lt.texts)) {
        addProbed(i, expr);
        return setMessage(t("{expr} wasn't saved (only the selected signals are): it will be when you run again", { expr }));
      }
      return setMessage(t('No data for {expr} in {name}', { expr, name: plot.name }));
    }
    addProbed(i, expr);
  };
  /**
   * Click en el cuerpo de un transistor o diodo con la punta: en vez de graficar, qué se puede
   * graficar de él (corrientes y parámetros de punto de operación), con lo que no se guardó en
   * esta simulación aparte. null: la punta sigue como siempre.
   */
  const deviceMenu = (target: Target): { items: { expr: string; label?: string; saved: boolean }[] } | null => {
    if (savesPicking || !sim || !plot || !scaleOf(plot) || target.symbol === undefined || target.pin !== undefined) return null;
    if (pathRef.current.length || dftPick.current || traceBox.current?.focused()) return null;
    const el = sim.built.lt.elements.find((e) => e.sym === target.symbol);
    const refs = el && deviceSignals(sim.built, el);
    return refs ? { items: refs.map((r) => ({ expr: r.ref, label: r.label, saved: hasData(r.ref) })) } : null;
  };
  /** ¿La expresión tiene datos en el plot que se ve? (Dig() sólo después de un transitorio) */
  const hasData = (expr: string) => {
    const sc = plot && scaleOf(plot);
    if (!plot || !sc) return false;
    try {
      evalTrace(expr, { resolve: resolver(plot), scale: sc.real, scaleName: sc.name });
      return true;
    } catch {
      return false;
    }
  };
  /** traza digital de la punta: al panel digital (o a uno nuevo), con los resultados a la vista */
  const addDigitalProbe = (expr: string) => {
    setPanel('plot');
    if (expanded === 'schematic') setExpanded('');
    editPanes(addTraceTo(panes, Math.min(activePane, panes.length - 1), expr));
  };
  /** traza medida con la punta: a un eje con su unidad o libre del panel activo, o a uno nuevo (#308) */
  const addProbed = (i: number, expr: string) => {
    if (isComplex) return editPanes(addTraceTo(panes, i, expr));
    const r = placeTrace(panes, i, expr);
    editPanes(r.panes);
    if (r.index !== i) setActivePane(r.index);
  };

  /**
   * Punta de prueba arrastrada de un punto a otro (#308): V−V o I−I es la resta; V/I (Ω) o I/V (S)
   * el cociente
   */
  const onProbePair = (from: { net?: string; symbol?: number; pin?: number }, to: { net?: string; symbol?: number; pin?: number }) => {
    if (savesPicking || !sim || !plot || pathRef.current.length || dftPick.current) return onProbe(from);
    const sc = scaleOf(plot);
    if (!sc) return onProbe(from);
    const isV = (x: typeof from) => x.net !== undefined;
    const ea = probeExpr(sim.built, from);
    const eb = probeExpr(sim.built, to);
    // contra tierra, la resta es la propia tensión
    if (isV(from) && isV(to) && (from.net === '0' || to.net === '0')) return onProbe(from.net === '0' ? to : from);
    if (!ea || !eb) return;
    const ratio = isV(from) !== isV(to);
    const expr = ratio ? `${ea}/${eb}` : `${ea}-${eb}`;
    try {
      evalTrace(expr, { resolve: resolver(plot), scale: sc.real, scaleName: sc.name });
    } catch {
      return setMessage(t('No data for {expr} in {name}', { expr, name: plot.name }));
    }
    setPanel('plot');
    if (expanded === 'schematic') setExpanded('');
    const i = Math.min(activePane, panes.length - 1);
    addProbed(i, expr);
  };
  return { onDftPicking, onProbe, onProbePair, deviceMenu, plotExpr };
}
