// Problemas de la última simulación (avisos de la traducción y errores de ngspice) y su lista en el
// panel de resultados, con lo que se puede hacer con cada uno
import type { AscDoc } from '../asc/model.ts';
import { streamPlan } from '../engine/ngspice.ts';
import { t } from '../i18n/i18n.ts';
import { missingSymbolIn } from '../netlist/ltnetlist.ts';
import { DISPLAY_PREFIXES, formatSi } from '../netlist/spicenum.ts';
import { replaceLine } from '../schematic/directivesEdit.ts';
import { fmtBytes, simLimits } from '../sim/estimate.ts';
import { saveSelection } from '../sim/saves.ts';
import type { SimRun } from './types.ts';

/** Los problemas de la corrida; los que nombran un componente llevan a él */
export const simProblems = (sim: SimRun | null) =>
  sim
    ? [
        ...sim.result.errors.map((text) => ({ kind: 'err' as const, text })),
        ...sim.built.warnings.filter((text) => !sim.result.errors.includes(text)).map((text) => ({ kind: missingSymbolIn(text) !== null ? ('err' as const) : ('warn' as const), text })),
      ].map((p) => {
        const name = /^([^\s:]+)/.exec(p.text)?.[1]?.toLowerCase();
        const el = name ? sim.built.lt.elements.find((e) => e.name.toLowerCase() === name || e.name.replace(/§/g, '').toLowerCase() === name) : undefined;
        const big = sim.built.tooBig?.find((f) => f.text === p.text);
        // demasiado grande con todo guardado: elegir qué guardar (#314)
        return { ...p, sym: el?.sym, fix: big?.fix, size: big, big: !!big && (!!big.chooseSignals || !saveSelection(sim.built.lt.texts)) };
      })
    : [];

export type Problem = ReturnType<typeof simProblems>[number];

export function ProblemsList({ problems, sim, doc, stopTime, goTo, openSaves, plotStop, commit, setRunQueued, run, setMessage }: {
  problems: Problem[];
  sim: SimRun;
  doc: AscDoc;
  /** hasta dónde llegó un transitorio frenado por memoria */
  stopTime: number | undefined;
  goTo(sym: number): void;
  openSaves(choose?: boolean): void;
  plotStop(): void;
  commit(d: AscDoc): void;
  setRunQueued(q: boolean): void;
  run(o?: { unlimited?: boolean }): void;
  setMessage(m?: string): void;
}) {
  return problems.length ? (
    <ul className="problems">
      {problems.map((p, i) => (
        <li key={i}>
          <span className={`kind ${p.kind}`}>{p.kind === 'err' ? 'error' : t('warning')}</span>
          <span>{p.text}</span>
          {p.sym !== undefined && (
            <button className="link" onClick={() => goTo(p.sym!)}>
              {t('show on the schematic')}
            </button>
          )}
          {p.size?.fit !== undefined ? (
            // el transitorio que se cortó mientras simulaba: qué se puede hacer, como botones
            <span className="size-actions">
              {p.size.chooseSignals && (
                <button className="primary" onClick={() => openSaves(true)} title={t('Save only some signals: the plotted ones count too')}>
                  {t('Choose signals (up to {n})', { n: p.size.fit })}
                </button>
              )}
              {stopTime !== undefined && (
                <button className={p.size.chooseSignals ? '' : 'primary'} onClick={plotStop} title={t('Show in the plotter what was simulated up to the stop, with the probe to pick what to plot')}>
                  {t('Plot up to {time}', { time: `${formatSi(stopTime, 3, DISPLAY_PREFIXES)}s` })}
                </button>
              )}
              {p.fix && p.size.keep && (
                <button
                  onClick={() => {
                    commit(replaceLine(doc, p.fix!.from, p.fix!.to));
                    setRunQueued(true);
                  }}
                  title={t('Change the analysis to «{p0}» and simulate again', { p0: p.fix.to })}
                >
                  {t('Save only the last {keep}', { keep: p.size.keep })}
                </button>
              )}
              {p.size.resume && (
                <button onClick={() => run({ unlimited: true })} title={t("Simulate again without stopping until the results fill {size} (ngspice can't resume where it stopped: it starts over)", { size: fmtBytes(simLimits(!!streamPlan(sim.built.netlist)).full) })}>
                  {t('Continue anyway')}
                </button>
              )}
            </span>
          ) : p.big && (
            <button className="link" onClick={() => openSaves(true)}>
              {t('choose saved signals')}
            </button>
          )}
          {p.fix && p.size?.fit === undefined && (
            <button
              className="link"
              onClick={() => {
                commit(replaceLine(doc, p.fix!.from, p.fix!.to));
                setMessage(t('Changed to «{p0}»: simulate again with Alt+R', { p0: p.fix!.to }));
              }}
            >
              {t('use «')}{p.fix.to}»
            </button>
          )}
        </li>
      ))}
    </ul>
  ) : (
    <p className="empty pad">{t('No problems.')}</p>
  );
}
