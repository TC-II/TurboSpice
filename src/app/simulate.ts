// Una corrida del testbench: arma la netlist (con la síntesis de Verilog y sus variantes), la
// simula en ngspice (otra vez sin las corrientes de los pines si la matriz quedó singular) y suma
// a los resultados lo que se calcula después: barridos, Bode del .pz, .meas y gráficos x-y
import type { AscDoc } from '../asc/model.ts';
import type { EngineClient } from '../engine/client.ts';
import { streamPlan } from '../engine/ngspice.ts';
import { t } from '../i18n/i18n.ts';
import type { Library } from '../library/library.ts';
import { prefetchLtspice, type LtspiceIndex } from '../library/ltspiceLib.ts';
import { lineOf } from '../project/project.ts';
import { biasCommand, biasParams, type Bias } from '../sim/bias.ts';
import { measuredSizeProblem, simLimits } from '../sim/estimate.ts';
import { blockResultsFromLog, measSweepPlot, measureResults, xyPlotsFromLog } from '../sim/measResults.ts';
import { buildSimulation, type BuiltSimulation } from '../sim/schematicSim.ts';
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
  withVariants(netlist: string): Promise<{ netlist: string; files: Record<string, string>; warnings: string[] }>;
  /** llegó el punto de operación de la corrida */
  onBias(built: BuiltSimulation, bias: Bias): void;
}

export async function runTestbench({ doc, simAsc, lib, ltIndex, engine, unlimited, ascName, allTraces, synthStale, withVariants, onBias }: RunOptions) {
  if (ltIndex) await prefetchLtspice(doc, lib, ltIndex);
  // los módulos Verilog que cambiaron se sintetizan antes (#209)
  await synthStale();
  const prepare = async (pinCurrents: boolean) => {
    const b = await buildSimulation(doc, lib, ascName(), allTraces(), { pinCurrents });
    // y las instancias con otro parameter usan su propia síntesis
    const vv = await withVariants(b.netlist);
    b.netlist = vv.netlist;
    b.files = { ...b.files, ...vv.files };
    b.warnings.push(...vv.warnings);
    return b;
  };
  let built = await prepare(true);
  // lo que no entra en memoria no llega a ngspice: sólo el error, en Problemas (#58)
  // un componente sin valor tampoco se simula (#256): el error va a Problemas con el link
  // un análisis incompleto (sin fuente, nodo o valor) tampoco: ngspice sólo diría "Error on line N"
  const incomplete = analysisProblem(lineOf(simAsc) ?? '');
  const blocking = [...built.tooBig.map((p) => p.text), ...built.ng.missingValues.map((name) => t('{name} has no value assigned', { name })), ...(incomplete ? [incomplete] : [])];
  // (un transitorio que al ritmo que va no entra en memoria se corta mientras simula)
  // (punto a punto los datos no se duplican en el motor: entra más, ver simLimits)
  const run = (b: BuiltSimulation) => {
    const lim = simLimits(!!streamPlan(b.netlist));
    return engine.simulate(b.netlist, b.files, {
      bias: biasParams(b),
      biasCommand: biasCommand(b.netlist).cmd,
      digital: b.digitalSaves,
      maxBytes: unlimited ? lim.full : lim.max,
      project: !unlimited,
    });
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
