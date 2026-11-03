// La caja de trazas de la barra de resultados (los nombres y parámetros para elegir, y agregar una
// expresión) y las vistas guardadas por análisis: volver a aplicarlas, la ofrecida del navegador y .plt
import { useMemo } from 'react';
import { decode } from '../asc/encoding.ts';
import { DIGITAL_TYPE, type SimPlot } from '../engine/ngspice.ts';
import { MERGED_INST } from '../hdl/cosimMerge.ts';
import { t } from '../i18n/i18n.ts';
import { download } from '../schematic/exportSchematic.ts';
import { deviceRefs } from '../sim/deviceParams.ts';
import { deviceParamTraces } from '../sim/traces.ts';
import { paneCurves, type ComplexMode } from '../waveform/curves.ts';
import { busNames } from '../waveform/digital.ts';
import type { Resolver } from '../waveform/expr.ts';
import { displayName, scaleOf } from '../waveform/series.ts';
import { addTraceTo, parsePlt, plotKind, serializePlt, type Pane, type PlotView } from '../waveform/view.ts';
import type { SimRun } from './types.ts';

export interface TraceDeps {
  sim: SimRun | null;
  plot: SimPlot | undefined;
  labels: Map<string, string>;
  resolver(p: SimPlot): Resolver;
  mode: ComplexMode;
  panes: Pane[];
  activePane: number;
  editPanes(next: Pane[]): void;
  setPanes(p: Pane[]): void;
  /** las vistas guardadas en el .asc, por tipo de análisis */
  plotView: PlotView;
  setPlotView(v: PlotView): void;
  offerView: PlotView | null;
  setOfferView(v: null): void;
  projectName: string;
  setMessage(m?: string): void;
}

export function useTraces({ sim, plot, labels, resolver, mode, panes, activePane, editPanes, setPanes, plotView, setPlotView, offerView, setOfferView, projectName, setMessage }: TraceDeps) {
  const traceNames = useMemo(() => {
    const sc = plot && scaleOf(plot);
    if (!plot) return [];
    // las redes que quedaron adentro del módulo DSP de Icarus (xdsp.w_3_d, cosimMerge.ts): con su
    // nombre del esquemático (Dig(N001[15:0]), Dig(valid)), no con el del módulo generado
    const merged = (v: { name: string }) => v.name.toLowerCase().startsWith(`${MERGED_INST}.`);
    const named = new Map<string, number[]>();
    const single: string[] = [];
    for (const [name, ev] of sim?.built.digitalAliases ?? []) {
      if (!ev.toLowerCase().startsWith(`${MERGED_INST}.`) || !plot.vectors.some((v) => v.name.toLowerCase() === ev.toLowerCase())) continue;
      const bit = /^([^.]+)\[(\d+)\]$/.exec(name);
      if (bit) named.set(bit[1], [...(named.get(bit[1]) ?? []), Number(bit[2])]);
      else if (!name.includes('.')) single.push(`Dig(${name})`);
    }
    const mergedBuses = [...named].map(([base, bits]) => `Dig(${base}[${Math.max(...bits)}:${Math.min(...bits)}])`);
    // (sin los nodos de las fuentes que miden la corriente de cada pin, pinCurrents.ts: x1__p2 es la
    // misma red que la de afuera del pin)
    const vectors = plot.vectors.filter((v) => v !== sc && !merged(v) && !/__p\d+$/i.test(v.name));
    // y los buses que forman los nodos digitales de los bloques Verilog (#209): Dig(x1.q[3:0])
    return [...new Set([...vectors.map(displayName), ...busNames(vectors.filter((v) => v.type === DIGITAL_TYPE).map((v) => v.name)), ...mergedBuses, ...single])];
  }, [plot, sim]);
  // parámetros de los dispositivos para elegir en la caja de trazas (#202)
  const traceHints = useMemo(() => (sim ? deviceParamTraces(sim.built) : undefined), [sim]);
  /** agrega la expresión al panel activo; devuelve el error si no se puede graficar */
  const addExpr = (expr: string): string | undefined => {
    if (!plot) return;
    const test = paneCurves({ traces: [{ expr }] }, { plot, runs: [plot], labels, resolver, mode });
    if (test.errors.size) {
      // un parámetro de dispositivo que no se guardó (#202): queda la traza y se guarda al simular de nuevo
      if (!deviceRefs(expr).length) return test.errors.get(0);
      const len = scaleOf(plot)?.real.length ?? 0;
      const missingOk = (p: SimPlot): Resolver => {
        const r = resolver(p);
        return (fn, args, run) => r(fn, args, run) ?? (fn === '@' ? { re: new Float64Array(len) } : null);
      };
      const again = paneCurves({ traces: [{ expr }] }, { plot, runs: [plot], labels, resolver: missingOk, mode });
      if (again.errors.size) return again.errors.get(0);
      setMessage(t("{expr} wasn't saved in this simulation: it will be saved when you simulate again", { expr }));
    }
    const next = addTraceTo(panes, activePane, expr);
    if (next !== panes) editPanes(next);
  };

  /** Ctrl+Espacio: volver a aplicar la vista guardada para el análisis (";.plot" o un .plt importado) */
  const reapplyView = () => {
    const v = plot && plotView[plotKind(plot.name)];
    if (v) editPanes(v);
    else setMessage(t("There's no saved view for this analysis (import one with a .plt)"));
  };
  const acceptOfferedView = () => {
    if (offerView) setPlotView({ ...offerView, ...plotView });
    setOfferView(null);
  };
  const importPlt = (bytes: Uint8Array) => {
    const v = parsePlt(decode(bytes).text);
    if (!Object.keys(v).length) return setMessage(t('The .plt has no views TurboSpice understands'));
    setPlotView({ ...plotView, ...v });
    if (plot && v[plotKind(plot.name)]) setPanes(v[plotKind(plot.name)]);
    setMessage(
      t('View imported from the .plt ({p0})', {
        p0: Object.keys(v)
          .map((k) => `.${k}`)
          .join(', '),
      }),
    );
  };
  const exportPlt = () => {
    const v = plot ? { ...plotView, [plotKind(plot.name)]: panes } : plotView;
    download(`${projectName}.plt`, new Blob([serializePlt(v)], { type: 'text/plain' }));
  };
  return { traceNames, traceHints, addExpr, reapplyView, acceptOfferedView, importPlt, exportPlt };
}
