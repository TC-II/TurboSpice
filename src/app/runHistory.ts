// El historial de corridas de un testbench (#152): traer una al presente, clonarla en un testbench
// nuevo o abrir el historial; y «Aplicar» en los otros testbenches un valor cambiado en éste
import type { MutableRefObject } from 'react';
import type { AscDoc } from '../asc/model.ts';
import { parseAsc } from '../asc/parse.ts';
import { locale, t } from '../i18n/i18n.ts';
import { addSim as addProjectSim, applyValues, setSimAsc, simOf, variantOf, type ValueChange } from '../project/project.ts';
import type { Project } from '../project/turbo.ts';
import type { History } from '../schematic/useHistory.ts';
import { simName, type SimList } from '../sim/simList.ts';
import { ascText } from './helpers.ts';

type RunRecord = NonNullable<ReturnType<typeof simOf>>['runs'][number];

export interface RunHistoryDeps {
  curRuns: RunRecord[];
  curSim: SimList['items'][number] | undefined;
  history: { commit(d: AscDoc): void };
  stacks: MutableRefObject<Map<string, History<AscDoc>>>;
  /** se está mirando una corrida vieja (sólo lectura) */
  viewingRef: MutableRefObject<boolean>;
  projectRef: MutableRefObject<Project>;
  editProject(p: Project): void;
  leave(): Project;
  enter(p: Project): void;
  goSim(id: string): void;
  markDirty(): void;
  setViewRun(id: string): void;
  setHistoryOpen(open: boolean): void;
  valueOffer: { changes: ValueChange[]; sims: string[] } | null;
  setValueOffer(v: null): void;
  setMessage(m?: string): void;
}

export function runHistoryActions({ curRuns, curSim, history, stacks, viewingRef, projectRef, editProject, leave, enter, goSim, markDirty, setViewRun, setHistoryOpen, valueOffer, setValueOffer, setMessage }: RunHistoryDeps) {
  /** Restore: la corrida pasa a ser el circuito actual (un paso más de deshacer) */
  const restoreRun = (id: string) => {
    const r = curRuns.find((x) => x.id === id);
    if (!r) return;
    setViewRun('');
    viewingRef.current = false;
    setValueOffer(null);
    history.commit(parseAsc(r.asc));
    setMessage(t('Brought the run from {p0} to the present (Ctrl+Z undoes it)', { p0: new Date(r.time).toLocaleString(locale()) }));
  };
  /** Clonar: una simulación nueva con el circuito de esa corrida */
  const cloneRun = (id: string) => {
    const r = curRuns.find((x) => x.id === id);
    if (!r || !curSim) return;
    const res = addProjectSim(leave(), r.asc, `${simName(curSim) || t('No analysis')} (${new Date(r.time).toLocaleString(locale())})`);
    enter(res.project);
    markDirty();
  };
  const openHistory = (id: string) => {
    goSim(id);
    setViewRun('');
    setHistoryOpen(true);
  };
  /** «Aplicar»: el valor nuevo va a las otras simulaciones, cada una con su paso de deshacer */
  const applyValueOffer = () => {
    if (!valueOffer) return;
    let p = projectRef.current;
    const v = variantOf(p);
    let n = 0;
    for (const id of valueOffer.sims) {
      const s = simOf(v, id);
      if (!s) continue;
      const key = `${v.id}/${id}`;
      const h = stacks.current.get(key);
      const cur = h?.present ?? parseAsc(s.asc);
      const next = applyValues(cur, valueOffer.changes);
      if (next === cur) continue;
      stacks.current.set(key, { past: [...(h?.past ?? []), cur], present: next, future: [] });
      p = setSimAsc(p, id, ascText(next));
      n++;
    }
    editProject(p);
    setValueOffer(null);
    setMessage(t('Applied to {p0}', { p0: n === 1 ? t('1 simulation') : t('{n} simulations', { n }) }));
  };
  return { restoreRun, cloneRun, openHistory, applyValueOffer };
}
