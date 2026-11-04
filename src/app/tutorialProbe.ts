// Lo que mira el tutorial (Academia) para saber si se cumplió cada paso
import type { MutableRefObject } from 'react';
import type { AscDoc, SymbolInst } from '../asc/model.ts';
import { effectiveAttrs } from '../asc/resolve.ts';
import type { SimPlot } from '../engine/ngspice.ts';
import type { Library } from '../library/library.ts';
import type { Connectivity } from '../netlist/connectivity.ts';
import { modelModuleName, modelModules } from '../project/modelModule.ts';
import type { variantOf } from '../project/project.ts';
import { modules, subName } from '../project/subckt.ts';
import type { Project } from '../project/turbo.ts';
import type { Tool } from '../schematic/SchematicEditor.tsx';
import type { SimList } from '../sim/simList.ts';
import type { Probe as TutorialProbe } from '../tutorial/lessons.ts';
import { plotKind, type Pane, type PlotState } from '../waveform/view.ts';
import type { Dialog, SimRun } from './types.ts';

export interface TutorialDeps {
  lib: Library;
  doc: AscDoc;
  /** el circuito del testbench, si se está en un subcircuito */
  tbDoc: AscDoc | null;
  conn: Connectivity;
  plotState: MutableRefObject<PlotState | undefined>;
  project: Project;
  dirty: boolean;
  variant: ReturnType<typeof variantOf>;
  sims: SimList;
  curSub: string;
  docLine: string;
  tool: Tool;
  dialog: Dialog | null;
  sim: SimRun | null;
  plot: SimPlot | undefined;
  allRuns: SimPlot[];
  panes: Pane[];
  panel: string;
  treeOpen: boolean;
  historyOpen: boolean;
  showOp: boolean;
  bias: unknown;
  showNets: boolean;
  hasNets: boolean;
  netHover: boolean;
  savesOpen: boolean;
  pdk: { name: string; corner: string } | undefined;
}

export function tutorialState({
  lib,
  doc,
  tbDoc,
  conn,
  plotState,
  project,
  dirty,
  variant,
  sims,
  curSub,
  docLine,
  tool,
  dialog,
  sim,
  plot,
  allRuns,
  panes,
  panel,
  treeOpen,
  historyOpen,
  showOp,
  bias,
  showNets,
  hasNets,
  netHover,
  savesOpen,
  pdk,
}: TutorialDeps): TutorialProbe {
  const effective = (s: SymbolInst) => effectiveAttrs(s, lib.symbol(s.type));
  const benchDoc = tbDoc ?? doc;
  let loose = 0;
  for (const n of conn.pinNet.values()) if (n.pins.length === 1 && !n.labels.length) loose++;
  loose += doc.symbols.reduce((k, s, si) => k + (lib.symbol(s.type)?.pins.filter((_, pi) => !conn.pinNet.has(`${si}:${pi}`)).length ?? 0), 0);
  const ps = plotState.current;
  return {
    projectName: project.name,
    dirty,
    benches: variant.sims.map((x) => ({ id: x.id, custom: !!x.name, ...(x.group ? { group: x.group } : {}), line: sims.items.find((y) => y.id === x.id)?.line ?? '', runs: x.runs.length })),
    activeBench: sims.active,
    groups: project.groups.length,
    modules: [
      ...modules(project).map((f) => ({ name: subName(f.name), kind: f.kind === 'verilog' ? ('verilog' as const) : ('schematic' as const) })),
      ...modelModules(project).map((f) => ({ name: modelModuleName(f), kind: 'model' as const })),
    ],
    inSub: curSub,
    symbols: doc.symbols.map((s) => {
      const e = effective(s);
      return { type: s.type, prefix: e.get('Prefix') ?? '', value: s.attrs.get('Value') ?? e.get('Value') ?? '', name: s.attrs.get('InstName') ?? e.get('InstName') ?? '' };
    }),
    wires: doc.wires.length,
    grounds: doc.flags.filter((f) => f.name === '0').length,
    labels: doc.flags.filter((f) => f.name !== '0' && !f.ioPin).map((f) => f.name),
    ports: doc.flags.filter((f) => f.ioPin).length,
    loose,
    directives: benchDoc.texts.filter((x) => x.kind === 'directive').map((x) => x.text),
    line: docLine,
    tool: tool.kind,
    dialog: dialog?.kind ?? null,
    hasResult: !!sim,
    resultKind: plot ? plotKind(plot.name) : '',
    runs: allRuns.length,
    panes: panes.map((p) => p.traces.map((x) => x.expr)),
    zoomed: !!ps?.xRange,
    cursors: ps ? [ps.cursors.a, ps.cursors.b].filter((x) => x !== undefined).length : 0,
    markers: ps?.markers?.map((m) => m.kind) ?? [],
    panel,
    treeOpen,
    historyOpen,
    showOp: showOp && !!bias,
    showNets: showNets && hasNets,
    netHover,
    savesOpen,
    ...(pdk ? { pdk: { name: pdk.name, corner: pdk.corner } } : {}),
  };
}
