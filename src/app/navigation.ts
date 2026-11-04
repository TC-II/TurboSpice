// Moverse por el proyecto: cambiar de testbench (cada uno con su circuito, su pila de deshacer y sus
// resultados, #151 #154) y de nivel de la jerarquía (#180), guardando lo que se estaba editando
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import { baseName, type AscDoc } from '../asc/model.ts';
import { parseAsc } from '../asc/parse.ts';
import { verilogFile } from '../hdl/project.ts';
import { t } from '../i18n/i18n.ts';
import type { Library } from '../library/library.ts';
import type { ltNetlist } from '../netlist/ltnetlist.ts';
import { activeAsc, selectSim as selectProjectSim, simOf, variantOf } from '../project/project.ts';
import { moduleFile, subName, subcktFile, subcktPorts, symbolOutdated, updateSymbol, type usages } from '../project/subckt.ts';
import { EMPTY_ASC, type Project } from '../project/turbo.ts';
import { symbolBox, type ItemRef } from '../schematic/geometry.ts';
import type { EditorHandle, Tool, View as EditorView } from '../schematic/SchematicEditor.tsx';
import type { History } from '../schematic/useHistory.ts';
import { keepResult, type SimList, type SimView } from '../sim/simList.ts';
import { ascText } from './helpers.ts';
import type { HierLevel, SimRun } from './types.ts';

export interface NavigationDeps {
  history: { state: History<AscDoc>; restore(h: History<AscDoc>): void; reset(d: AscDoc): void };
  /** la pila de deshacer de cada testbench y de cada subcircuito */
  stacks: MutableRefObject<Map<string, History<AscDoc>>>;
  /** la posición y el zoom de cada nivel */
  levelViews: MutableRefObject<Map<string, EditorView>>;
  /** el próximo cambio de documento no es una edición */
  quietDoc: MutableRefObject<boolean>;
  /** los resultados de los testbenches que no se están viendo */
  kept: MutableRefObject<Map<string, SimRun>>;
  projectRef: MutableRefObject<Project>;
  pathRef: MutableRefObject<HierLevel[]>;
  docRef: MutableRefObject<AscDoc>;
  editor: RefObject<EditorHandle>;
  snapshot(): Project;
  sim: SimRun | null;
  sims: SimList;
  lt: ReturnType<typeof ltNetlist>;
  lib: Library;
  setProjectState(p: Project): void;
  setPath(p: HierLevel[]): void;
  setSubTabs: Dispatch<SetStateAction<string[]>>;
  setSim(s: SimRun | null): void;
  showView(v?: SimView): void;
  restoreCached(simId: string, asc: string): void;
  setSelection(s: ItemRef[]): void;
  setTool(tt: Tool): void;
  setValueOffer(v: null): void;
  setViewRun(id: string): void;
  setDocKey: Dispatch<SetStateAction<number>>;
  setKeepKey: Dispatch<SetStateAction<number>>;
  setMessage(m?: string): void;
}

export function navigation(d: NavigationDeps) {
  const { history, stacks, levelViews, quietDoc, kept, projectRef, pathRef, docRef, editor, snapshot, sim, sims, lt, lib } = d;
  const { setProjectState, setPath, setSubTabs, setSim, showView, restoreCached, setSelection, setTool, setValueOffer, setViewRun, setDocKey, setKeepKey, setMessage } = d;
  const keyOf = (p: Project) => {
    const v = variantOf(p);
    return `${v.id}/${v.activeSim || 'base'}`;
  };
  /** Deja la simulación que se está viendo: devuelve el proyecto con su estado guardado */
  const leave = (): Project => {
    let p = snapshot();
    const lv = pathRef.current[pathRef.current.length - 1];
    stacks.current.set(lv ? subKey(lv.sub) : keyOf(p), history.state);
    if (lv) p = syncSymbol(p, lv.sub);
    if (sim && sims.active) keepResult(kept.current, sims.active, sim);
    return p;
  };
  /** Muestra la simulación activa del proyecto (o la base): su circuito, pila, vista y resultados */
  const enter = (p: Project, refit = false) => {
    pathRef.current = [];
    setPath([]);
    const v = variantOf(p);
    const s = simOf(v);
    const h = stacks.current.get(keyOf(p));
    quietDoc.current = true;
    if (h && ascText(h.present) === activeAsc(v)) history.restore(h);
    else history.reset(parseAsc(activeAsc(v)));
    setProjectState(p);
    const r = s ? kept.current.get(s.id) : undefined;
    if (s) kept.current.delete(s.id);
    setSim(r ?? null);
    showView(s?.view);
    setSelection([]);
    setValueOffer(null);
    setViewRun('');
    if (refit) setDocKey((k) => k + 1);
    // (sin encuadrar, la vista sigue la del testbench anterior: si su circuito no entra entero, se encuadra)
    else setKeepKey((k) => k + 1);
    if (s && !r) restoreCached(s.id, s.asc);
  };
  /** Pasa a otra simulación de la variante ('' = el circuito base) */
  const goSim = (id: string) => id !== sims.active && enter(selectProjectSim(leave(), id));

  // --- Jerarquía (#180) ---------------------------------------------------------------------
  const subKey = (name: string) => `sub:${name.toLowerCase()}`;
  const levelKey = (ls: HierLevel[]) => (ls.length ? ls.map((l) => `${l.inst ?? ''}:${l.sub}`.toLowerCase()).join('/') : `tb:${keyOf(projectRef.current)}`);
  /** Si cambiaron los puertos del subcircuito, regenera su símbolo (y avisa) */
  const syncSymbol = (p: Project, name: string): Project => {
    if (!symbolOutdated(p, name)) return p;
    // (un módulo Verilog pone su símbolo al día al sintetizarse)
    if (verilogFile(p, name)) return updateSymbol(p, name);
    const f = subcktFile(p, name);
    setMessage(t('Symbol {name} updated with the ports: {ports}', { name, ports: f ? subcktPorts(parseAsc(f.text)).join(', ') : '' }));
    return updateSymbol(p, name);
  };
  /** Pasa a otro nivel de la jerarquía (vacío = el testbench), guardando lo que se edita */
  const go = (next: HierLevel[], select?: number) => {
    const cur = pathRef.current;
    const v = editor.current?.view();
    if (v) levelViews.current.set(levelKey(cur), v);
    let p = snapshot();
    const lv = cur[cur.length - 1];
    stacks.current.set(lv ? subKey(lv.sub) : keyOf(p), history.state);
    if (lv && !next.some((l) => l.sub.toLowerCase() === lv.sub.toLowerCase())) p = syncSymbol(p, lv.sub);
    const target = next[next.length - 1];
    const mf = target ? moduleFile(p, target.sub) : undefined;
    // un módulo Verilog no tiene esquemático (se ve su código): el editor queda con uno vacío
    const text = target ? (mf?.kind === 'verilog' ? EMPTY_ASC : mf?.text) : activeAsc(variantOf(p));
    if (text === undefined) return;
    const h = stacks.current.get(target ? subKey(target.sub) : keyOf(p));
    quietDoc.current = true;
    if (h && ascText(h.present) === text) history.restore(h);
    else history.reset(parseAsc(text));
    if (p !== projectRef.current) {
      setProjectState(p);
      projectRef.current = p;
    }
    if (target) setSubTabs((ts) => (ts.some((x) => x.toLowerCase() === target.sub.toLowerCase()) ? ts : [...ts, target.sub]));
    pathRef.current = next;
    setPath(next);
    setSelection(select === undefined ? [] : [{ kind: 'symbol', index: select }]);
    setTool({ kind: 'select' });
    setViewRun('');
    setValueOffer(null);
    // misma posición y zoom que la última vez en ese nivel (si no, ajustar)
    setDocKey((k) => k + 1);
    const saved = levelViews.current.get(levelKey(next));
    if (saved) requestAnimationFrame(() => requestAnimationFrame(() => editor.current?.setView(saved)));
    // al entrar a un subcircuito aparece el panel del símbolo y el esquemático se angosta después de
    // ajustar: se vuelve a ajustar con el ancho final (si no, lo dibujado queda detrás del panel)
    else setTimeout(() => editor.current?.fit(), 120);
  };
  const goUp = () => pathRef.current.length && go(pathRef.current.slice(0, -1));
  /** Abre un subcircuito sin instancia (desde el panel, una pestaña o Ctrl+P) */
  const openSub = (name: string, select?: number) => {
    const cur = pathRef.current;
    const i = cur.findIndex((l) => l.sub.toLowerCase() === name.toLowerCase());
    go(i >= 0 ? cur.slice(0, i + 1) : [{ sub: name, prefix: '', ports: new Map() }], select);
  };
  /** Doble clic / E / Enter sobre una instancia de un subcircuito del proyecto: bajar */
  const descend = (si: number): boolean => {
    const s = docRef.current.symbols[si];
    const f = s && moduleFile(projectRef.current, s.type);
    if (!f) return false;
    const parent = pathRef.current[pathRef.current.length - 1];
    const el = lt.elements.find((e) => e.sym === si);
    const ng = el ? el.name.replace(/§/g, '_').toLowerCase() : '';
    const up = (node: string) => (node === '0' ? '0' : (parent?.ports.get(node.toLowerCase()) ?? `${parent?.prefix ?? ''}${node}`));
    const ports = new Map<string, string>();
    el?.pinNames.forEach((pn, i) => pn && ports.set(pn.toLowerCase(), up(el.nodes[i])));
    go([
      ...pathRef.current,
      {
        sub: subName(f.name),
        inst: s.attrs.get('InstName') ?? el?.name ?? '?',
        prefix: parent && !parent.inst ? '' : `${parent?.prefix ?? ''}${ng}.`,
        ports: parent && !parent.inst ? new Map() : ports,
      },
    ]);
    return true;
  };
  /** Ir a una instancia de un subcircuito (desde «usado en») */
  const goUsage = (u: ReturnType<typeof usages>[number], name: string) => {
    const find = (asc: string) => parseAsc(asc).symbols.findIndex((s) => s.attrs.get('InstName') === u.inst && subName(baseName(s.type)).toLowerCase() === name.toLowerCase());
    if (u.where.kind === 'subckt') {
      const f = subcktFile(projectRef.current, u.where.name);
      return f && openSub(u.where.name, find(f.text));
    }
    const w = u.where;
    if (w.kind === 'sim' && w.sim !== variantOf(projectRef.current).activeSim) goSim(w.sim);
    else if (pathRef.current.length) go([]);
    requestAnimationFrame(() => {
      const i = find(ascText(docRef.current));
      if (i >= 0) {
        setSelection([{ kind: 'symbol', index: i }]);
        const s = docRef.current.symbols[i];
        editor.current?.centerOn(symbolBox(s, lib.symbol(s.type), lib));
      }
    });
  };
  return { leave, enter, goSim, subKey, go, goUp, openSub, descend, goUsage };
}
