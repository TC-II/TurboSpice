// Una corrida del testbench: arma la netlist (con la síntesis de Verilog y sus variantes), la
// simula en ngspice (otra vez sin las corrientes de los pines si la matriz quedó singular) y suma
// a los resultados lo que se calcula después: barridos, Bode del .pz, .meas y gráficos x-y
import type { AscDoc } from '../asc/model.ts';
import type { EngineClient, SimOutcome } from '../engine/client.ts';
import type { SimResult } from '../engine/ngspice.ts';
import { streamPlan } from '../engine/ngspice.ts';
import { t } from '../i18n/i18n.ts';
import type { Library } from '../library/library.ts';
import { prefetchLtspice, type LtspiceIndex } from '../library/ltspiceLib.ts';
import { splitStepRuns } from '../netlist/step.ts';
import { lineOf } from '../project/project.ts';
import { biasCommand, biasParams, type Bias } from '../sim/bias.ts';
import { measuredSizeProblem, simLimits } from '../sim/estimate.ts';
import { blockResultsFromLog, measSweepPlot, measureResults, xyPlotsFromLog } from '../sim/measResults.ts';
import { buildSimulation, type BuiltSimulation, type Variants } from '../sim/schematicSim.ts';
import { analysisProblem, pzLogErrors } from '../sim/simList.ts';
import { pzBodePlots } from '../waveform/pz.ts';
import { stepLabels, stepSweepPlots } from '../waveform/series.ts';

export interface RunOptions {
  doc: AscDoc;
  /** el .asc exacto que se simula (el del historial) */
  simAsc: string;
  lib: Library;
  ltIndex: LtspiceIndex | undefined;
  engine: EngineClient;
  /** «seguir igual» con un transitorio que no entraba, hasta llenar la memoria */
  unlimited: boolean;
  ascName(): string;
  /** las expresiones graficadas: se guardan los parámetros de dispositivo que usen (#202) */
  allTraces(): string[];
  /** sintetiza los módulos Verilog que cambiaron (#209) */
  synthStale(): Promise<void>;
  withVariants: Variants;
  /** llegó el punto de operación de la corrida */
  onBias(built: BuiltSimulation, bias: Bias): void;
}

export async function runTestbench({ doc, simAsc, lib, ltIndex, engine, unlimited, ascName, allTraces, synthStale, withVariants, onBias }: RunOptions) {
  if (ltIndex) await prefetchLtspice(doc, lib, ltIndex);
  // los módulos Verilog que cambiaron se sintetizan antes (#209)
  await synthStale();
  const prepare = async (pinCurrents: boolean) => {
    // (las instancias con otro parameter usan su propia síntesis)
    return buildSimulation(doc, lib, ascName(), allTraces(), { pinCurrents, variants: withVariants });
  };
  let built = await prepare(true);
  // lo que no entra en memoria no llega a ngspice: sólo el error, en Problemas (#58)
  // un componente sin valor tampoco se simula (#256): el error va a Problemas con el link
  // un análisis incompleto (sin fuente, nodo o valor) tampoco: ngspice sólo diría "Error on line N"
  const incomplete = analysisProblem(lineOf(simAsc) ?? '');
  const blocking = [
    ...built.tooBig.map((p) => p.text),
    ...built.ng.missingValues.map((name) => t('{name} has no value assigned', { name })),
    ...built.ng.duplicateNames.map((name) => t('{name} is the name of more than one component: rename one of them', { name })),
    ...(incomplete ? [incomplete] : []),
  ];
  // (un transitorio que al ritmo que va no entra en memoria se corta mientras simula)
  // (punto a punto los datos no se duplican en el motor: entra más, ver simLimits)
  const once = (b: BuiltSimulation, netlist: string) => {
    const lim = simLimits(!!streamPlan(netlist));
    return engine.simulate(netlist, b.files, {
      bias: biasParams(b),
      biasCommand: biasCommand(netlist).cmd,
      digital: b.digitalSaves,
      maxBytes: unlimited ? lim.full : lim.max,
      project: !unlimited,
    });
  };
  const run = async (b: BuiltSimulation): Promise<SimOutcome> => {
    // con Icarus (d_cosim) un .step va corrida por corrida, cada una en un motor nuevo: libvvp no se
    // inicializa dos veces (#366). Los plots se renumeran como los del .step de ngspice (tran1, tran2…)
    const icarus = [b.netlist, ...Object.values(b.files)].some((f) => typeof f === 'string' && /ivlng\.so/i.test(f));
    const parts = icarus ? splitStepRuns(b.netlist) : null;
    if (!parts || parts.length < 2) return once(b, b.netlist);
    const merged: SimResult = { plots: [], log: [], errors: [], aborted: false };
    const count = new Map<string, number>();
    let ms = 0;
    for (const part of parts) {
      const r = await once(b, part);
      ms += r.ms;
      for (const p of r.result.plots) {
        const m = /^([a-z]+)\d+$/i.exec(p.name);
        const n = m ? (count.get(m[1]) ?? 0) + 1 : 0;
        if (m) count.set(m[1], n);
        merged.plots.push(m ? { ...p, name: `${m[1]}${n}` } : p);
      }
      merged.log.push(...r.result.log);
      merged.errors.push(...r.result.errors.filter((e) => !merged.errors.includes(e)));
      merged.sizeStop ??= r.result.sizeStop;
      if (r.result.aborted) {
        merged.aborted = true;
        break;
      }
    }
    return { result: merged, ms };
  };
  let { result, ms } = blocking.length ? { result: { plots: [], log: blocking, errors: blocking, aborted: false }, ms: 0 } : await run(built);
  // las fuentes de 0 V de los pines de los subcircuitos pueden dejar la matriz singular (un
  // modelo que une dos pines por dentro, en redes que afuera une una fuente): otra vez sin ellas
  if (!blocking.length && !result.aborted && [...result.errors, ...result.log].some((l) => /singular/i.test(l))) {
    const plain = await prepare(false);
    if (plain.netlist !== built.netlist) {
      const again = await run(plain);
      if (!again.result.errors.some((l) => /singular/i.test(l))) {
        built = plain;
        ({ result, ms } = again);
        built.warnings.push(t('Simulated without the subcircuit pin currents (Ix): with them the matrix was singular'));
      }
    }
  }
  // cortado porque no iba a entrar: cuánto iba a guardar y qué hacer; los plots traen lo simulado
  if (result.sizeStop) {
    // (cuántas señales o cuánto del final entran: con el límite de una corrida normal, no el de «seguir igual»)
    const big = measuredSizeProblem(lineOf(simAsc) ?? '.tran', result.sizeStop, simLimits(!!streamPlan(built.netlist)).max);
    built.tooBig = [...built.tooBig, big];
    result.errors = [big.text];
  }
  // los errores de un .pz que ngspice deja sólo en el log ("Input is shorted"), explicados
  const pzErrs = pzLogErrors(result.log).filter((e) => !result.errors.includes(e));
  if (pzErrs.length) result.errors.unshift(...pzErrs);
  if (result.bias) onBias(built, result.bias);
  result.plots.push(...stepSweepPlots(result.plots, built.ng.steps));
  // .pz sin otro análisis en frecuencia: su Bode normalizado, con el mapa al lado (#343)
  result.plots.push(...pzBodePlots(result.plots));
  // .meas: se evalúan sobre los resultados de cada corrida
  const cardMeas = measureResults(built, result.plots, stepLabels(result.plots, built.ng.steps));
  const mp = cardMeas && measSweepPlot(cardMeas, built);
  if (mp) result.plots.push(mp);
  // gráficos x-y de un programa de bloques, y sus listas y tabla (#179)
  const blk = built.ng.blocks ? blockResultsFromLog(result.log) : { table: null, plots: [] };
  const xy = [...xyPlotsFromLog(result.log, built.ng.xyPlots), ...blk.plots];
  result.plots.push(...xy);
  const meas = cardMeas ?? blk.table;
  return { built, result, ms, meas, blk, xy };
}
