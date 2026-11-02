// Lo que se resalta en el esquemático con los resultados: la red o el componente de la fila de la
// tabla bajo el mouse (y al revés), las flechas de corriente con el color de su traza, las redes con
// una traza V() visible y, con sólo las señales elegidas (#314), lo que no se guardó
import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from 'react';
import type { AscDoc } from '../asc/model.ts';
import type { SimPlot } from '../engine/ngspice.ts';
import type { Library } from '../library/library.ts';
import type { Connectivity } from '../netlist/connectivity.ts';
import { spiceName } from '../netlist/spiceName.ts';
import { currentArrows } from '../schematic/currentArrows.tsx';
import type { Tool } from '../schematic/SchematicEditor.tsx';
import type { InstScope } from '../sim/context.ts';
import { saveSelection } from '../sim/saves.ts';
import { elementVector, netVector } from '../sim/schematicSim.ts';
import { probeExpr } from '../sim/traces.ts';
import { rowDevice } from '../waveform/ScalarViews.tsx';
import { sameExpr, traceColor, type Pane } from '../waveform/view.ts';
import type { HierLevel, SavesState, SimRun } from './types.ts';

export interface HighlightDeps {
  doc: AscDoc;
  docRef: MutableRefObject<AscDoc>;
  lib: Library;
  conn: Connectivity;
  path: HierLevel[];
  lvNow: HierLevel | undefined;
  curSub: string;
  sim: SimRun | null;
  simScope: InstScope | undefined;
  plot: SimPlot | undefined;
  panes: Pane[];
  tool: Tool;
  showOp: boolean;
  saves: SavesState | null;
  savesPicking: boolean;
  /** la red de la traza bajo el mouse */
  traceNet: string | undefined;
  setTraceNet(net?: string): void;
}

export function useHighlights({ doc, docRef, lib, conn, path, lvNow, curSub, sim, simScope, plot, panes, tool, showOp, saves, savesPicking, traceNet, setTraceNet }: HighlightDeps) {
  // Sentido positivo de la corriente en los pines (punta de prueba y anotación del OP)
  // fila de la tabla de resultados bajo el mouse: su red o sus flechas se resaltan en el esquemático
  const [rowHover, setRowHover] = useState<string | null>(null);
  const rowNet = rowHover ? /^V\(([^,()]+)\)$/i.exec(rowHover)?.[1] : undefined;
  // …y el componente de la fila (@Q1[gm], Ic(Q1), I(R1)); al revés, el componente bajo el mouse resalta sus filas
  const rowDev = rowHover ? rowDevice(rowHover) : null;
  const rowSymbol = rowDev && !lvNow ? doc.symbols.findIndex((s) => spiceName(s.attrs.get('InstName') ?? '').toUpperCase() === rowDev) : -1;
  // (en el panel de señales guardadas, un subcircuito U1 es XU1, como en la netlist)
  const rowElement = rowDev && rowSymbol < 0 && !curSub ? saves?.built?.lt.elements.find((e) => e.name.replace(/§/g, '').toUpperCase() === rowDev) : undefined;
  const [hoverDev, setHoverDev] = useState<string>();
  const onHoverSymbol = useCallback((i: number | undefined) => setHoverDev(i === undefined ? undefined : spiceName(docRef.current.symbols[i]?.attrs.get('InstName') ?? '') || undefined), [docRef]);
  const arrows = useMemo(() => {
    const rowCurrent = !!rowHover && /^I/i.test(rowHover);
    if (!sim || (lvNow ? !simScope : sim.doc.symbols !== doc.symbols) || !(showOp || tool.kind === 'probe' || rowCurrent)) return undefined;
    const traces = panes.flatMap((p) => p.traces.map((tt, i) => ({ t: tt, color: traceColor(tt, i) }))).filter((x) => !x.t.hidden);
    // la flecha toma el color de la traza de su corriente (la del pin o la del componente)
    const colorOf = (target: { symbol: number; pin?: number }) => {
      const expr = probeExpr(sim.built, target, simScope);
      return expr ? traces.find((x) => sameExpr(x.t.expr, expr))?.color : undefined;
    };
    const all = currentArrows(doc, lib, simScope ? simScope.block.lt.elements : sim.built.lt.elements);
    const perSym = new Map<number, number>();
    for (const a of all) perSym.set(a.sym, (perSym.get(a.sym) ?? 0) + 1);
    return all.map((a) => {
      // la corriente del componente (sin pin) sólo colorea la flecha si es la única: en uno con
      // varios terminales (Q, M, X…) pintaría todas, y es la de un solo terminal
      const color = colorOf({ symbol: a.sym, pin: a.pin }) ?? (perSym.get(a.sym) === 1 ? colorOf({ symbol: a.sym }) : undefined);
      const isRow = (target: { symbol: number; pin?: number }) => {
        const expr = rowCurrent ? probeExpr(sim.built, target, simScope) : undefined;
        return !!expr && sameExpr(expr, rowHover!);
      };
      const hl = isRow({ symbol: a.sym, pin: a.pin }) || (perSym.get(a.sym) === 1 && isRow({ symbol: a.sym }));
      return { ...a, ...(color ? { color } : {}), ...(hl ? { hl } : {}) };
    }).filter((a) => showOp || tool.kind === 'probe' || a.hl);
  }, [sim, doc, lib, showOp, tool.kind, panes, lvNow, simScope, rowHover]);


  // Color de cada red con una traza V(red) visible en los paneles (el cable toma el color de la
  // traza); sólo con la punta de prueba
  // Con la punta de prueba y sólo las señales elegidas (#314): lo que no se guardó, atenuado (no
  // mientras se elige qué guardar: ahí lo elegido son las marcas del panel, #364)
  const unsaved = useMemo(() => {
    if (tool.kind !== 'probe' || savesPicking || !sim || !plot || path.length || !saveSelection(sim.built.lt.texts)) return undefined;
    const names = new Set(plot.vectors.map((v) => v.name.toLowerCase()));
    const nets = new Set(conn.nets.map((n) => n.name).filter((n) => n && n !== '0' && !names.has(netVector(n))).map((n) => n.toLowerCase()));
    const symbols = new Set(
      sim.built.lt.elements.filter((e) => {
        const v = elementVector(sim.built, e.name);
        return v && !names.has(v) && ![...names].some((n) => n.startsWith(`${v.replace(/\[.*$/, '')}[`));
      }).map((e) => e.sym),
    );
    return { nets, symbols };
  }, [tool.kind, savesPicking, sim, plot, path.length, conn]);
  const netColors = useMemo(() => {
    const m = new Map<string, string>();
    if (tool.kind !== 'probe') return m;
    // adentro de una instancia (#180): V(x_u1.red) colorea «red» y la red de arriba, su puerto
    const lv = path[path.length - 1];
    const local = (n: string) => {
      if (!lv) return n;
      if (!lv.inst) return undefined;
      if (n.startsWith(lv.prefix)) return n.slice(lv.prefix.length);
      return [...lv.ports].find(([, up]) => up.toLowerCase() === n)?.[0];
    };
    for (const p of panes) p.traces.forEach((tt, i) => {
      const n = /^V\(([^()]+)\)$/i.exec(tt.expr.trim());
      const name = n && local(n[1].toLowerCase());
      if (name && !tt.hidden && !m.has(name)) m.set(name, traceColor(tt, i));
    });
    return m;
  }, [panes, tool.kind, path]);
  // la red resaltada al pasar sobre una traza deja de estarlo si la traza se borra (al borrarla
  // no llega el pointerleave)
  // (tampoco si el renglón de la leyenda se reacomoda o se pasa a otro panel bajo el cursor, ni si
  // la ventana pierde el foco: el pointerleave de un elemento que desaparece nunca llega)
  useEffect(() => setTraceNet(undefined), [panes, setTraceNet]);
  useEffect(() => {
    const off = () => setTraceNet(undefined);
    window.addEventListener('blur', off);
    return () => window.removeEventListener('blur', off);
  }, [setTraceNet]);
  const traceNetShown = traceNet && panes.some((p) => p.traces.some((tt) => sameExpr(tt.expr, `V(${traceNet})`))) ? traceNet : undefined;
  return { setRowHover, rowNet, rowSymbol, rowElement, hoverDev, onHoverSymbol, arrows, unsaved, netColors, traceNetShown };
}
