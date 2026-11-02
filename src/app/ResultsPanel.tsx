// El panel de resultados: su barra (vistas, caja de trazas, plot, modo, corridas) y lo que muestra
// (gráfico, Smith, polos y ceros, Stability, tabla, netlist, log, medidas y problemas)
import { Suspense, type ComponentProps, type MutableRefObject, type RefObject } from 'react';
import type { AscDoc } from '../asc/model.ts';
import type { SimPlot } from '../engine/ngspice.ts';
import { t } from '../i18n/i18n.ts';
import type { Connectivity } from '../netlist/connectivity.ts';
import { MeasPanel } from '../sim/MeasPanel.tsx';
import type { SimList } from '../sim/simList.ts';
import { ErrorBoundary } from '../ui/ErrorBoundary.tsx';
import { Icon } from '../ui/icons.tsx';
import { MenuButton, type MenuItem } from '../ui/Menu.tsx';
import { SideSplit, type useSideSize } from '../ui/SideSplit.tsx';
import type { ComplexMode } from '../waveform/curves.ts';
import type { Resolver } from '../waveform/expr.ts';
import { PlotPanel } from '../waveform/lazy.ts';
import type { PlotPanelHandle } from '../waveform/PlotPanel.tsx';
import { PzPlane, ResultTable } from '../waveform/ScalarViews.tsx';
import type { scaleOf } from '../waveform/series.ts';
import { SmithChart } from '../waveform/SmithChart.tsx';
import { isStbPlot, StbView } from '../waveform/StbView.tsx';
import { TraceBox, type TraceBoxHandle } from '../waveform/TraceBox.tsx';
import type { Pane, PlotState } from '../waveform/view.ts';
import { PANEL_NAMES } from './constants.ts';
import { ProblemsList, type Problem } from './Problems.tsx';
import type { Dialog, HierLevel, SimRun } from './types.ts';

export type ResultsView = 'plot' | 'netlist' | 'log' | 'problems' | 'meas';
type SideSize = ReturnType<typeof useSideSize>;

export interface ResultsPanelProps {
  sim: SimRun;
  resultsH: number;
  pltInput: RefObject<HTMLInputElement>;
  importPlt(bytes: Uint8Array): void;
  panel: ResultsView;
  setPanel(p: ResultsView): void;
  resultsItems: MenuItem[];
  plot: SimPlot | undefined;
  scale: ReturnType<typeof scaleOf> | null;
  traceBox: RefObject<TraceBoxHandle>;
  traceNames: string[];
  traceHints: ComponentProps<typeof TraceBox>['hints'];
  addExpr(expr: string): string | undefined;
  setTraceFocus(on: boolean): void;
  plotName: string;
  selectPlot(name: string): void;
  labels: Map<string, string>;
  isComplex: boolean | undefined;
  mode: ComplexMode;
  setMode(m: ComplexMode): void;
  viewerTools: HTMLElement | null;
  setViewerTools(el: HTMLElement | null): void;
  withPz: boolean;
  pzSide: boolean;
  setPzSide(on: boolean): void;
  allRuns: SimPlot[];
  visibleRuns: SimPlot[];
  hiddenRuns: Set<string>;
  overlay: boolean;
  setOverlay(on: boolean): void;
  setDialog(d: Dialog | null): void;
  sims: SimList;
  plotState: MutableRefObject<PlotState | undefined>;
  onPlotState(s: PlotState): void;
  plotPanel: RefObject<PlotPanelHandle>;
  runs: SimPlot[];
  panes: Pane[];
  editPanes(next: Pane[]): void;
  resolver(p: SimPlot): Resolver;
  activePane: number;
  setActivePane(i: number): void;
  onDftPicking(on: boolean): void;
  resultsSide: boolean;
  marks: ComponentProps<typeof PlotPanel>['marks'];
  setTraceNet(net?: string): void;
  conn: Connectivity;
  splitDir: 'row' | 'column';
  pzSplit: SideSize;
  stbSplit: SideSize;
  pzAll: ComponentProps<typeof PzPlane>['runs'];
  pzShown: ComponentProps<typeof PzPlane>['runs'];
  projectName: string;
  setRowHover(row: string | null): void;
  lvNow: HierLevel | undefined;
  hoverDev: string | undefined;
  problems: Problem[];
  doc: AscDoc;
  stopTime: number | undefined;
  goTo(sym: number): void;
  openSaves(choose?: boolean): void;
  plotStop(): void;
  commit(d: AscDoc): void;
  setRunQueued(q: boolean): void;
  run(o?: { unlimited?: boolean }): void;
  setMessage(m?: string): void;
}

export function ResultsPanel(props: ResultsPanelProps) {
  const { sim, resultsH, pltInput, importPlt, panel, setPanel, resultsItems, plot, scale, traceBox, traceNames, traceHints, addExpr, setTraceFocus, plotName, selectPlot, labels, isComplex, mode, setMode } = props;
  const { viewerTools, setViewerTools, withPz, pzSide, setPzSide, allRuns, visibleRuns, hiddenRuns, overlay, setOverlay, setDialog, sims, plotState, onPlotState, plotPanel, runs, panes, editPanes, resolver } = props;
  const { activePane, setActivePane, onDftPicking, resultsSide, marks, setTraceNet, conn, splitDir, pzSplit, stbSplit, pzAll, pzShown, projectName, setRowHover, lvNow, hoverDev } = props;
  const { problems, doc, stopTime, goTo, openSaves, plotStop, commit, setRunQueued, run, setMessage } = props;
  return (
    <>
    <section className="results-panel" style={resultsH ? { flexBasis: resultsH } : undefined}>
      <input
        ref={pltInput}
        type="file"
        accept=".plt"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) importPlt(new Uint8Array(await f.arrayBuffer()));
          e.target.value = '';
        }}
      />
      <div className="toolbar small results-bar">
        {/* como Simular: el botón vuelve al gráfico; la flecha, a exportar y al resto de las vistas */}
        <div className="split" role="group" aria-label={t('Results view')}>
          <button className="active" onClick={() => setPanel('plot')} title={t('Back to the results plot')}>
            {t('Results')}
          </button>
          <MenuButton items={resultsItems} label={t('More results views')} title={t('Export, netlist, log and problems')} className="active">
            <Icon name="caret" size={14} />
          </MenuButton>
        </div>
        {/* queda a la vista mientras se miran estos resultados, aunque se cierre el aviso (#108) */}
        {(sim.built.missingSymbols?.length ?? 0) > 0 && (
          <button
            className="incomplete-badge"
            onClick={() => setPanel('problems')}
            title={t('Missing {p0}: they were left out of the circuit and the results don\'t match the schematic', { p0: sim.built.missingSymbols.join(', ') })}
          >
            {t('Incomplete simulation')}
          </button>
        )}
        {/* la vista elegida en el menú (netlist, log…); el botón no cambia */}
        {panel !== 'plot' && <span className="results-view">{PANEL_NAMES[panel]}</span>}
        {/* en un .stb, el selector muestra sólo las magnitudes del lazo, sin los parámetros de los dispositivos (#337) */}
        {panel === 'plot' && plot && scale && <TraceBox handle={traceBox} names={traceNames} hints={isStbPlot(plot) ? undefined : traceHints} onAdd={addExpr} onFocusChange={setTraceFocus} />}
        {panel === 'plot' && (
          <>
            {/* varios plots: un .control con varios análisis, .step (op vs R), .meas, fft de ngspice, gráficos x-y */}
            {sim.result.plots.length > 1 && (
              <select value={plotName} onChange={(e) => selectPlot(e.target.value)} aria-label={t('Result plot')} title={t('Result to view (the simulation returned several)')}>
                {sim.result.plots.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                    {labels.has(p.name) ? ` (${labels.get(p.name)})` : ''}
                  </option>
                ))}
              </select>
            )}
            {isComplex && scale && (
              <select value={mode} onChange={(e) => setMode(e.target.value as ComplexMode)} aria-label={t('Display')}>
                <option value="bode">{t('Bode (dB and phase)')}</option>
                <option value="db">{t('Magnitude (dB)')}</option>
                <option value="phase">{t('Phase (°)')}</option>
                <option value="mag">{t('Magnitude')}</option>
                <option value="reim">{t('Real and imaginary')}</option>
                <option value="smith">{t('Smith chart')}</option>
              </select>
            )}
            {/* Cursores, DFT, Medidas y Ajustar (los pone el visor) */}
            <span className="viewer-tools" ref={setViewerTools} />
            {withPz && (
              <label className="check inline" title={t('Pole-zero map (.pz) next to the plot; its f₀ are marked on the axis')}>
                <input type="checkbox" checked={pzSide} onChange={(e) => setPzSide(e.target.checked)} /> {t('Poles and zeros')}
              </label>
            )}
            {allRuns.length > 1 && (
              <label className="check inline">
                <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} /> {t('Overlay the')}{' '}
                {allRuns.length} {t('runs')}
              </label>
            )}
            {allRuns.length > 1 && overlay && (
              <button onClick={() => setDialog({ kind: 'runs' })} title={t('Choose which runs to show (Shift+S)')}>
                {t('Runs')}{hiddenRuns.size ? ` (${visibleRuns.length}/${allRuns.length})` : ''}…
              </button>
            )}
          </>
        )}
      </div>
      <div className="results-body">
        {/* un error al dibujar el gráfico (o el visor que no bajó sin red) no se lleva el resto */}
        <ErrorBoundary resetKeys={[panel, plot, panes, mode]}>
        {panel === 'plot' && plot && scale && isComplex && mode === 'smith' && <SmithChart plot={plot} panes={panes} resolver={resolver} />}
        {panel === 'plot' && plot && scale && !(isComplex && mode === 'smith') && (
          <Suspense fallback={null}>
          <PlotPanel
            key={sims.active}
            initial={plotState.current}
            onState={onPlotState}
            handle={plotPanel}
            plot={plot}
            runs={runs}
            labels={labels}
            panes={panes}
            setPanes={editPanes}
            resolver={resolver}
            mode={mode}
            active={activePane}
            setActive={setActivePane}
            onFocusTrace={() => traceBox.current?.focus()}
            onDftPicking={onDftPicking}
            side={resultsSide}
            toolsHost={viewerTools}
            marks={withPz && pzSide ? marks : undefined}
            onHoverExpr={(e) => {
              const net = e && /^\s*V\(([^,()]+)\)\s*$/i.exec(e)?.[1];
              setTraceNet(net ? conn.nets.find((n) => n.name.toLowerCase() === net.toLowerCase())?.name : undefined);
            }}
          />
          </Suspense>
        )}
        {/* el mapa de polos o el de Stability al lado (o debajo) del gráfico, con un divisor (#336) */}
        {panel === 'plot' && plot && scale && withPz && pzSide && mode !== 'smith' && (
          <>
            <SideSplit dir={splitDir} onSize={pzSplit.set} label={t('Resize the pole-zero map')} />
            <PzPlane runs={pzAll} labels={labels} name={projectName} compact style={pzSplit.style} />
          </>
        )}
        {panel === 'plot' && plot && scale && isStbPlot(plot) && mode !== 'smith' && (
          <>
            <SideSplit dir={splitDir} onSize={stbSplit.set} label={t('Resize the stability view')} />
            <StbView plot={plot} name={projectName} style={stbSplit.style} />
          </>
        )}
        {panel === 'plot' && plot && !scale &&
          (pzShown.length ? <PzPlane runs={pzShown} labels={labels} name={projectName} /> : <ResultTable plot={plot} maxCols={resultsSide ? 2 : 4} onHoverRow={setRowHover} highlightDevice={lvNow ? undefined : hoverDev} />)}
        </ErrorBoundary>
        {panel === 'netlist' && <pre className="code">{sim.built.netlist}</pre>}
        {panel === 'log' && <pre className="code">{sim.result.log.join('\n')}</pre>}
        {panel === 'meas' && sim.meas && <MeasPanel table={sim.meas} />}
        {panel === 'problems' && <ProblemsList {...{ problems, sim, doc, stopTime, goTo, openSaves, plotStop, commit, setRunQueued, run, setMessage }} />}
      </div>
    </section>
    </>
  );
}
