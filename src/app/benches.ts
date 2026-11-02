// Testbenches, workbenches (sus grupos, #180) y variantes (#150): crear, renombrar, mover,
// duplicar y borrar, y abrir una parte de un testbench desde el panel del proyecto
import type { MutableRefObject } from 'react';
import type { AscDoc } from '../asc/model.ts';
import { t } from '../i18n/i18n.ts';
import { PDK_CORNERS } from '../library/pdk.ts';
import type { BenchItem } from '../project/Hierarchy.tsx';
import { addGroup, addSim as addProjectSim, cornerSims, duplicateSim as duplicateProjectSim, placeBench, removeGroup, removeSim as removeProjectSim, removeVariant, renameGroup, renameSim as renameProjectSim, setBenchGroup, variantOf } from '../project/project.ts';
import { EMPTY_ASC, type Project } from '../project/turbo.ts';
import { dropResult } from '../schematic/autosave.ts';
import { setAnalysisLine } from '../schematic/directivesEdit.ts';
import type { CircuitInfo } from '../schematic/simDialogs.tsx';
import type { History } from '../schematic/useHistory.ts';
import { ANALYSIS_LINE, type AnalysisKind } from '../sim/analyses.ts';
import { isComplexLine, parkControl } from '../sim/complexSim.ts';
import { defaultLine, reuseLine, type SimList } from '../sim/simList.ts';
import { ascText } from './helpers.ts';
import type { Dialog, HierLevel, SimRun } from './types.ts';

export interface BenchDeps {
  doc: AscDoc;
  docLine: string;
  curSub: string;
  sims: SimList;
  commit(d: AscDoc): void;
  projectRef: MutableRefObject<Project>;
  pathRef: MutableRefObject<HierLevel[]>;
  stacks: MutableRefObject<Map<string, History<AscDoc>>>;
  kept: MutableRefObject<Map<string, SimRun>>;
  editProject(p: Project): void;
  setProjectState(p: Project): void;
  snapshot(): Project;
  markDirty(): void;
  leave(): Project;
  enter(p: Project, refit?: boolean): void;
  go(next: HierLevel[]): void;
  goSim(id: string): void;
  circuitInfo(): CircuitInfo;
  openHistory(id: string): void;
  openStudy(): void;
  openSimulation(): void;
  setDialog(d: Dialog | null): void;
  setMessage(m?: string): void;
}

export function benchActions(d: BenchDeps) {
  const { doc, docLine, curSub, sims, commit, projectRef, pathRef, stacks, kept, editProject, setProjectState, snapshot, markDirty, leave, enter, go, goSim } = d;
  const { circuitInfo, openHistory, openStudy, openSimulation, setDialog, setMessage } = d;
  /** Simulación nueva de ese tipo, con el circuito que está en pantalla */
  // Cada testbench tiene una configuración de simulación: elegir un análisis la cambia
  const newSim = (kind: AnalysisKind) => {
    if (curSub) return setMessage(t('The analysis belongs to the testbench: go up (Alt+↑) to change it'));
    // si ya es de ese tipo queda como está; si otro testbench usa ese tipo, se parte de sus parámetros
    const same = [...sims.items].reverse().find((s) => ANALYSIS_LINE.exec(s.line)?.[1].toLowerCase() === kind);
    // (sus redes y fuentes se adaptan a este circuito)
    const line = same ? reuseLine(same.line, kind, circuitInfo()) : defaultLine(kind, circuitInfo());
    // una Complex simulation (#241) pasa a este análisis en el mismo testbench: el .control queda
    // guardado y vuelve al elegir otra vez Complex simulation
    if (isComplexLine(docLine)) return commit(setAnalysisLine(parkControl(doc), line));
    // un testbench tiene una sola simulación: sin análisis se la pone; si ya tiene, se crea otro
    // testbench (en el mismo grupo) con el mismo circuito y ésta
    if (!docLine) return commit(setAnalysisLine(doc, line));
    const p1 = leave();
    const r = addProjectSim(p1, ascText(setAnalysisLine(doc, line)));
    enter(r.project);
    markDirty();
  };
  /** Testbench nuevo, vacío, con el nombre automático (sigue a su análisis hasta que se lo renombra) */
  const newEmptyBench = (group?: string) => {
    const r = addProjectSim(leave(), EMPTY_ASC);
    enter(group ? setBenchGroup(r.project, r.id, group) : r.project, true);
    markDirty();
  };
  // (el nombre se edita en su misma fila del panel: el campo ya valida que no se repita)
  const renameBench = (id: string, n: string) => editProject(renameProjectSim(projectRef.current, id, n));
  // Grupos de testbenches y partes de cada uno (#180)
  // se crea con el nombre sugerido y el panel deja el campo listo para renombrarlo
  const newGroup = () => {
    // un workbench nuevo viene con un testbench vacío adentro
    const g = addGroup(leave(), uniqueGroupName());
    const r = addProjectSim(g.project, EMPTY_ASC);
    enter(setBenchGroup(r.project, r.id, g.id), true);
    markDirty();
    return g.id;
  };
  const uniqueGroupName = () => {
    const names = new Set(projectRef.current.groups.map((g) => g.name.toLowerCase()));
    for (let i = 1; ; i++) if (!names.has(t('Workbench {n}', { n: i }).toLowerCase())) return t('Workbench {n}', { n: i });
  };
  const renameGroupTo = (id: string, n: string) => editProject(renameGroup(snapshot(), id, n));
  const groupAction = (id: string) => {
    const g = projectRef.current.groups.find((x) => x.id === id);
    if (!g) return;
    if (projectRef.current.groups.length < 2) return setMessage(t('A project always has at least one workbench'));
    setDialog({
      kind: 'slide',
      title: t('Delete the workbench {name}?', { name: g.name }),
      message: t('Its testbenches are not deleted: they move to {name}.', { name: projectRef.current.groups.find((x) => x.id !== id)?.name ?? '' }),
      onConfirm: () => {
        setDialog(null);
        editProject(removeGroup(snapshot(), id));
      },
    });
  };
  const moveBench = (id: string, group: string, before?: string) => {
    const p0 = snapshot();
    const p = placeBench(p0, id, group, before);
    if (p !== p0) editProject(p);
  };
  /** Abrir una parte de un testbench: su configuración de simulación, su esquemático o sus parámetros */
  const benchItem = (id: string, item: BenchItem) => {
    if (id !== sims.active) goSim(id);
    else if (pathRef.current.length) go([]);
    // el diálogo, cuando ya se ve el testbench
    if (item === 'history') return setTimeout(() => openHistory(id), 0);
    if (item === 'study') return setTimeout(openStudy, 0);
    if (item !== 'schematic') setTimeout(() => (item === 'sim' ? openSimulation() : setDialog({ kind: 'benchParams' })), 0);
  };
  const benchAction = (id: string, action: 'duplicate' | 'delete') =>
    action === 'duplicate' ? duplicateSim(id) : sims.items.length > 1 && setDialog({ kind: 'deleteSim', id });
  const deleteSim = (id: string) => {
    const p0 = leave();
    stacks.current.delete(`${variantOf(p0).id}/${id}`);
    kept.current.delete(id);
    dropResult(id);
    enter(removeProjectSim(p0, id));
    markDirty();
  };
  const duplicateSim = (id: string) => {
    const r = duplicateProjectSim(leave(), id);
    if (!r) return;
    enter(r.project);
    markDirty();
  };

  const simAllCorners = (id: string, name: string, corner: string) => {
    enter(cornerSims(leave(), id, name, corner, PDK_CORNERS));
    markDirty();
  };

  // --- Variantes (#150): la cápsula Proyecto · Variante ---
  const deleteVariant = (id: string) => {
    const p0 = leave();
    for (const s of variantOf(p0, id).sims) {
      kept.current.delete(s.id);
      dropResult(s.id);
    }
    for (const k of [...stacks.current.keys()]) if (k.startsWith(`${id}/`)) stacks.current.delete(k);
    const p = removeVariant(p0, id);
    if (p.activeVariant !== p0.activeVariant) enter(p, true);
    else setProjectState(p);
    markDirty();
  };

  return { newSim, newEmptyBench, renameBench, newGroup, renameGroupTo, groupAction, moveBench, benchItem, benchAction, deleteSim, simAllCorners, deleteVariant };
}
