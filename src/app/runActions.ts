// Simular (Alt+R): la corrida va al historial del testbench, se arma y se corre (runTestbench) y los
// resultados se muestran: qué plot, qué trazas (la vista recordada, el .control o el .stb), el estado,
// los avisos y qué vista del panel
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { AscDoc } from '../asc/model.ts';
import { parseAsc } from '../asc/parse.ts';
import type { EngineClient } from '../engine/client.ts';
import { t } from '../i18n/i18n.ts';
import type { Library } from '../library/library.ts';
import type { LtspiceIndex } from '../library/ltspiceLib.ts';
import type { Status } from '../NetlistMode.tsx';
import { diffCircuits } from '../project/diff.ts';
import { runFilesOf, runSummary } from '../project/exchange.ts';
import { recordRun, type simOf } from '../project/project.ts';
import type { Project } from '../project/turbo.ts';
import { dropResult, saveResult } from '../schematic/autosave.ts';
import type { EditorHandle, Tool } from '../schematic/SchematicEditor.tsx';
import type { Bias } from '../sim/bias.ts';
import type { BuiltSimulation } from '../sim/schematicSim.ts';
import { keepResult, type SimList } from '../sim/simList.ts';
import type { Expanded } from '../ui/ResultsSplitter.tsx';
import { isPzBodePlot } from '../waveform/pz.ts';
import { isPzPlot } from '../waveform/ScalarViews.tsx';
import { scaleOf } from '../waveform/series.ts';
import { isStbPlot, stbMainTraces } from '../waveform/StbView.tsx';
import { plotKind, type Pane, type PlotView } from '../waveform/view.ts';
import { MAX_CACHED_BYTES } from './constants.ts';
import { ascText } from './helpers.ts';
import type { ResultsView } from './ResultsPanel.tsx';
import { runTestbench } from './simulate.ts';
import type { HierLevel, SavesState, SimRun } from './types.ts';

type RunRecord = NonNullable<ReturnType<typeof simOf>>['runs'][number];

export interface RunDeps {
  engine: EngineClient;
  lib: Library;
  ltIndex: LtspiceIndex | undefined;
  liveDoc: AscDoc;
  pathRef: MutableRefObject<HierLevel[]>;
  sims: SimList;
  simsRef: MutableRefObject<SimList>;
  sim: SimRun | null;
  kept: MutableRefObject<Map<string, SimRun>>;
  /** se abortó a mano: el error de la corrida no se muestra */
  aborting: MutableRefObject<boolean>;
  paneUndo: MutableRefObject<{ past: Pane[][]; future: Pane[][] }>;
  editor: RefObject<EditorHandle>;
  savesPicking: boolean;
  setSaves: Dispatch<SetStateAction<SavesState | null>>;
  setStatus(s: Status): void;
  setViewRun(id: string): void;
  setMessage(m?: string): void;
  /** la corrida anterior del testbench (para el resumen de cambios) */
  prevRun(): RunRecord | undefined;
  snapshot(): Project;
  editProject(p: Project): void;
  setAutoDrive: Dispatch<SetStateAction<number>>;
  ascName(): string;
  allTraces(): string[];
  synthStale(): Promise<void>;
  withVariants(netlist: string): Promise<{ netlist: string; files: Record<string, string>; warnings: string[] }>;
  setOpPoint(o: { doc: AscDoc; built: BuiltSimulation; bias: Bias }): void;
  expanded: Expanded;
  setExpanded(e: Expanded): void;
  setSim(s: SimRun | null): void;
  setHiddenRuns(h: Set<string>): void;
  setPlotName(name: string): void;
  plotView: PlotView;
  panes: Pane[];
  setPanes(p: Pane[]): void;
  setStopPlotted(on: boolean): void;
  setPanel(p: ResultsView): void;
  setTool(tt: Tool): void;
}

export function runActions(d: RunDeps) {
  const {
    engine,
    lib,
    ltIndex,
    liveDoc,
    pathRef,
    sims,
    simsRef,
    sim,
    kept,
    aborting,
    paneUndo,
    editor,
    savesPicking,
    setSaves,
    setStatus,
    setViewRun,
    setMessage,
    prevRun,
    snapshot,
    editProject,
    setAutoDrive,
  } = d;
  const { ascName, allTraces, synthStale, withVariants, setOpPoint, expanded, setExpanded, setSim, setHiddenRuns, setPlotName, plotView, panes, setPanes, setStopPlotted, setPanel, setTool } = d;
  /** `unlimited`: «seguir igual» con un transitorio que no entraba, hasta llenar la memoria */
  const run = async ({ unlimited = false }: { unlimited?: boolean } = {}) => {
    // se simula el circuito actual (aunque se esté mirando una corrida vieja)
    // los subcircuitos no se simulan solos (#180): se simula desde un testbench
    if (pathRef.current.length) return setMessage(t('Subcircuits are not simulated on their own: go up to a testbench (Alt+↑) to simulate'));
    const doc = liveDoc;
    setViewRun('');
    // el panel de señales guardadas queda para la próxima corrida: la punta de prueba grafica (#364)
    setSaves((s) => s && { ...s, inactive: true, picking: savesPicking });
    aborting.current = false;
    setStatus({ kind: 'running', percent: 0, text: '' });
    setMessage(undefined);
    engine.onStatus = (text, percent) => setStatus({ kind: 'running', percent, text });
    // simulación de la lista a la que van los resultados
    const id = sims.active;
    // el circuito exacto que se simula queda en el historial de la simulación (#152)
    const simAsc = ascText(doc);
    if (id) {
      const last = prevRun();
      const p0 = snapshot();
      const files = runFilesOf(p0, simAsc);
      editProject(recordRun(p0, id, simAsc, Date.now(), last ? runSummary(diffCircuits(parseAsc(last.asc), doc).summary, last.files, files) : undefined, files).project);
      setAutoDrive((n) => n + 1);
    }
    try {
      const { built, result, ms, meas, blk, xy } = await runTestbench({
        ...{ doc, simAsc, lib, ltIndex, engine, unlimited, ascName, allTraces, synthStale, withVariants },
        onBias: (built, bias) => setOpPoint({ doc, built, bias }),
      });
      // los resultados de la última corrida quedan en el navegador (no van en el .turbo); los muy
      // grandes no: guardarlos los copia entera otra vez (y la base del navegador puede no admitirlos)
      if (id) {
        const bytes = result.plots.reduce((n, pl) => n + pl.vectors.reduce((k, v) => k + v.real.byteLength + (v.imag?.byteLength ?? 0), 0), 0);
        if (bytes <= MAX_CACHED_BYTES) saveResult(id, { asc: simAsc, result: { result, meas }, time: Date.now() });
        else dropResult(id);
      }
      // si mientras tanto se eligió otra simulación, los resultados quedan guardados para ésta
      if (simsRef.current.active !== id) {
        if (simsRef.current.items.some((s) => s.id === id)) keepResult(kept.current, id, { built, result, doc, meas });
        setStatus({ kind: 'done', ms });
        return;
      }
      // Al abrirse el panel de resultados el lienzo se achica: reajustar la vista
      if (!sim) setTimeout(() => editor.current?.fit(), 50);
      // al simular se ven los dos: esquemático y resultados en pantalla partida
      if (expanded) setExpanded('');
      setSim({ built, result, doc, meas });
      setHiddenRuns(new Set());
      paneUndo.current = { past: [], future: [] };
      // se muestra la última corrida con eje X; los plots sintéticos ("op vs R", "meas vs R")
      // sólo si no hay otra cosa
      const realRuns = result.plots.filter((p) => scaleOf(p) && /^[a-z]+\d+$/i.test(p.name));
      const withScale = xy.length ? xy : realRuns.length ? realRuns : result.plots.filter((p) => scaleOf(p));
      // con .pz se abre el mapa de polos y ceros aunque haya otros análisis
      const pzs = result.plots.filter(isPzPlot);
      const pzBodes = result.plots.filter(isPzBodePlot);
      const shown = pzBodes[pzBodes.length - 1] ?? pzs[pzs.length - 1] ?? withScale[withScale.length - 1] ?? result.plots[result.plots.length - 1];
      setPlotName(shown?.name ?? '');
      // Qué graficar: la vista recordada para este análisis, o lo que pida el .control con
      // "plot", o lo que ya se estaba mirando (las trazas que no existan avisan en su chip)
      const remembered = shown && plotView[plotKind(shown.name)];
      // .stb: la ganancia de lazo, R (GFT) o T (Tian); con la sonda diferencial, un pane por modo (#333)
      const stbMain = isStbPlot(shown) ? stbMainTraces(shown) : [];
      // vistas guardadas antes de que existieran T y R: la vieja "loopgain" pasa a la de ahora
      const keptView =
        remembered && stbMain.length ? remembered.map((pn) => ({ ...pn, traces: pn.traces.map((tr) => (/^\s*loopgain\s*$/i.test(tr.expr) ? { ...tr, expr: stbMain[0] } : tr)) })) : remembered;
      // (la vista que se usa tiene que traer alguna traza de este .stb: la de la sonda simple no sirve con la diferencial)
      const fits = (pns: typeof panes) => pns.some((pn) => pn.traces.some((tr) => shown!.vectors.some((v) => v.name === tr.expr.trim().toLowerCase())));
      if (xy.length && shown === xy[xy.length - 1]) setPanes([{ traces: [{ expr: shown.vectors[1].name }] }]);
      else if (stbMain.length && !fits(keptView ?? panes)) setPanes(stbMain.map((expr) => ({ traces: [{ expr }] })));
      else if (isPzBodePlot(shown) && !fits(keptView ?? panes)) setPanes([{ traces: [{ expr: 'h' }] }]);
      else if (keptView) {
        setPanes(keptView);
        if (built.controlPanes.length) built.warnings.push(t('Using the remembered view instead of the .control "plot" commands'));
      } else if (built.controlPanes.length) setPanes(built.controlPanes);
      const errs = result.errors.length ? result.errors : [];
      setStatus(errs.length && (!result.plots.length || result.sizeStop) ? { kind: 'error', message: errs[0] } : { kind: 'done', ms });
      // símbolos faltantes: el circuito simulado no es el del esquemático, el aviso va primero (#108)
      const missing = built.missingSymbols;
      setMessage(
        errs.length && (!result.plots.length || result.sizeStop)
          ? t('{p0} — see the Errors tab', { p0: errs[0] })
          : missing.length
            ? missing.length === 1
              ? t("Incomplete simulation: symbol {names} wasn't found and was left out of the circuit. The results don't match the schematic.", { names: missing[0] })
              : t("Incomplete simulation: symbols {names} weren't found and were left out of the circuit. The results don't match the schematic.", { names: missing.join(', ') })
            : built.warnings.length
              ? t('{p0} — see the Errors tab', { p0: built.warnings.length === 1 ? built.warnings[0] : t('{n} warnings', { n: built.warnings.length }) })
              : undefined,
      );
      setStopPlotted(false);
      // frenado por memoria: la punta de prueba recién con «Plot up to here» (que lleva al gráfico)
      if (result.plots.length && result.sizeStop) setPanel('problems');
      else if (result.plots.length) {
        setTool({ kind: 'probe' });
        const nothingPlotted = !(remembered ?? panes).some((p) => p.traces.length) && !built.controlPanes.length;
        setPanel(errs.length ? 'problems' : meas?.rows.length && (nothingPlotted || (blk.table && !xy.length)) ? 'meas' : 'plot');
      } else setPanel(errs.length ? 'problems' : 'log');
    } catch (e) {
      // (abortar rechaza la simulación en curso: el estado ya lo puso abort)
      if (!aborting.current) setStatus({ kind: 'error', message: (e as Error).message });
    }
  };
  return run;
}
