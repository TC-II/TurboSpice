// El punto de operación (.op, o t = 0 en un .tran): el de la última corrida o el que se guardó, con
// su alcance adentro de un subcircuito (#199), lo que dice el mouse sobre cada red o componente y
// los valores anotados en el esquemático (#228, #306)
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AscDoc } from '../asc/model.ts';
import { readData, writeData } from '../asc/dataText.ts';
import type { Library } from '../library/library.ts';
import type { Connectivity } from '../netlist/connectivity.ts';
import { netNames, type Annotation } from '../schematic/NetNames.tsx';
import { pinPoints, symbolBox, type ItemRef } from '../schematic/geometry.ts';
import { elementBias, netBias, pinBias, sameCircuit, scopedNetBias, type Bias } from '../sim/bias.ts';
import { instScope, scopeElementOf, type InstScope } from '../sim/context.ts';
import { noOpTags, opPinKey, opTagsData, opTagsFromData, opTagVisible, unhideOpTags, type OpPinTarget, type OpTags } from '../sim/opPins.ts';
import type { BuiltSimulation } from '../sim/schematicSim.ts';
import { multiPinPrefix } from '../sim/traces.ts';
import { ascText } from './helpers.ts';
import type { HierLevel, SimRun } from './types.ts';

export interface OpPointDeps {
  /** el nivel de la jerarquía que se ve (sin nada, el testbench) */
  lvNow: HierLevel | undefined;
  sim: SimRun | null;
  /** el último punto de operación (lo deja cada corrida que lo calcula) */
  opPoint: { doc: AscDoc; built: BuiltSimulation; bias: Bias } | null;
  doc: AscDoc;
  conn: Connectivity;
  lib: Library;
  /** el botón OP: todos los valores a la vista */
  showOp: boolean;
  docKey: number;
  selection: ItemRef[];
  commit(d: AscDoc): void;
}

export function useOpPoint({ lvNow, sim, opPoint, doc, conn, lib, showOp, docKey, selection, commit }: OpPointDeps) {
  const docText = useMemo(() => (lvNow?.inst ? ascText(doc) : ''), [lvNow, doc]);
  const scopeIn = useCallback(
    (built: BuiltSimulation | undefined): InstScope | undefined => {
      if (!built || !lvNow?.inst) return undefined;
      const sc = instScope(built, lvNow.sub, lvNow.prefix, lvNow.ports);
      return sc && ascText(sc.block.doc) === docText ? sc : undefined;
    },
    [lvNow, docText],
  );
  const simScope = useMemo(() => scopeIn(sim?.built), [scopeIn, sim]);
  const op = useMemo((): { built: BuiltSimulation; bias: Bias; scope?: InstScope } | undefined => {
    if (lvNow) {
      for (const c of [sim?.result.bias ? { built: sim.built, bias: sim.result.bias } : null, opPoint]) {
        const scope = c ? scopeIn(c.built) : undefined;
        if (c && scope) return { built: c.built, bias: c.bias, scope };
      }
      return undefined;
    }
    return sim?.result.bias && sameCircuit(sim.doc, doc)
      ? { built: sim.built, bias: sim.result.bias }
      : opPoint && sameCircuit(opPoint.doc, doc)
        ? opPoint
        : undefined;
  }, [sim, opPoint, doc, lvNow, scopeIn]);
  const bias = op?.bias;
  const describe = useMemo(() => {
    if (!op) return undefined;
    return ({ net, symbol }: { net?: string; symbol?: number }) => {
      if (net) return net === '0' ? null : op.scope ? scopedNetBias(op.bias, op.scope, net) : netBias(op.bias, net);
      const el = symbol === undefined ? undefined : op.scope ? scopeElementOf(op.scope, symbol) : op.built.lt.elements.find((e) => e.sym === symbol);
      return el ? elementBias(op.built, op.bias, el, op.scope) : null;
    };
  }, [op]);
  // valores del OP fijados con la punta de prueba (#228); se borran con otro punto de operación
  // #306: siguen entre corridas, se pueden mover y borrar; se reinician al abrir otro circuito
  // las fijadas y las movidas van en el documento (y así en el .turbo); las borradas, sólo en la sesión
  const [opHidden, setOpHidden] = useState<ReadonlySet<string>>(() => new Set());
  const opTags = useMemo(() => opTagsFromData(readData(doc, 'optags'), opHidden), [doc, opHidden]);
  const setOpTags = (f: (t: OpTags) => OpTags) => {
    const next = f(opTags);
    if (next.hidden !== opTags.hidden) setOpHidden(next.hidden);
    const data = opTagsData(next);
    if (JSON.stringify(data) !== JSON.stringify(opTagsData(opTags))) commit(writeData(doc, 'optags', data));
  };
  const [opSel, setOpSel] = useState<string>();
  useEffect(() => (setOpHidden(new Set()), setOpSel(undefined)), [docKey]);
  useEffect(() => {
    if (showOp) setOpHidden((h) => unhideOpTags({ ...noOpTags(), hidden: h }).hidden);
  }, [showOp]);
  useEffect(() => {
    if (selection.length) setOpSel(undefined);
  }, [selection]);
  // los valores del OP con `all` (el botón OP) o sólo los elegidos a mano; Exportar los pide todos
  const opAnnotations = useCallback((all: boolean): Annotation[] | undefined => {
    if (!op || (!all && !opTags.pins.size && !opTags.moved.size)) return undefined;
    const { built, bias, scope } = op;
    const out: Annotation[] = [];
    const shown = (target: OpPinTarget) => {
      const key = opPinKey(target);
      return opTagVisible(opTags, key, all) ? key : undefined;
    };
    const push = (a: Omit<Annotation, 'offset'>) => out.push({ ...a, offset: opTags.moved.get(a.key) });
    for (const n of netNames(doc, conn, new Map())) {
      const key = shown({ net: n.name });
      if (!key) continue;
      const b = scope ? scopedNetBias(bias, scope, n.name) : netBias(bias, n.name);
      if (b?.short) push({ key, at: n.at, text: b.short, kind: 'v' });
    }
    for (const el of scope ? scope.block.lt.elements : built.lt.elements) {
      // transistores: la corriente de cada pin, junto al pin (como la punta de prueba en los demás análisis)
      if (multiPinPrefix(el.prefix)) {
        const s = doc.symbols[el.sym];
        const def = s && lib.symbol(s.type);
        if (!def) continue;
        pinPoints(s, def).forEach((at, k) => {
          const pin = Number(def.pins[k].attrs.get('SpiceOrder') ?? k + 1);
          const key = shown({ symbol: el.sym, pin });
          if (!key) return;
          const text = pinBias(built, bias, el, pin, scope);
          if (text) push({ key, at: { x: at.x + 4, y: at.y - 4 }, text, kind: 'i' });
        });
        continue;
      }
      const key = /^[RLVIDQMJ]/i.test(el.prefix) ? shown({ symbol: el.sym }) : undefined;
      if (!key) continue;
      const b = elementBias(built, bias, el, scope);
      const s = doc.symbols[el.sym];
      if (!b?.short || !s) continue;
      const box = symbolBox(s, lib.symbol(s.type), lib);
      push({ key, at: { x: box.x2 + 4, y: (box.y1 + box.y2) / 2 }, text: b.short, kind: 'i' });
    }
    return out;
  }, [opTags, op, doc, conn, lib]);
  const annotations = useMemo(() => opAnnotations(showOp), [opAnnotations, showOp]);
  return { simScope, op, bias, describe, setOpTags, opSel, setOpSel, opAnnotations, annotations };
}
