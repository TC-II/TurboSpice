// Los módulos del proyecto (#180, #209): crear, renombrar y borrar subcircuitos (esquemático o
// Verilog) y modelos (netlist .subckt/.model con su símbolo), con el nombre que se pide en un diálogo
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { baseName, type AscDoc } from '../asc/model.ts';
import { parseAsc } from '../asc/parse.ts';
import { serializeAsc } from '../asc/serialize.ts';
import { addVerilogModule } from '../hdl/project.ts';
import { t } from '../i18n/i18n.ts';
import { addModelModule, removeModelModule, renameModelModule } from '../project/modelModule.ts';
import { lineOf } from '../project/project.ts';
import { addSubckt, freeSubcktName, removeSubckt, renameSubckt, usages, validSubcktName } from '../project/subckt.ts';
import type { Project } from '../project/turbo.ts';
import type { History } from '../schematic/useHistory.ts';
import { ascText } from './helpers.ts';
import type { Dialog, HierLevel } from './types.ts';

export interface ModuleDeps {
  projectRef: MutableRefObject<Project>;
  editProject(p: Project): void;
  /** el proyecto con lo que se está editando */
  snapshot(): Project;
  docRef: MutableRefObject<AscDoc>;
  history: { reset(d: AscDoc): void };
  /** la pila de deshacer de cada nivel (la de un subcircuito, con la clave `subKey`) */
  stacks: MutableRefObject<Map<string, History<AscDoc>>>;
  subKey(name: string): string;
  pathRef: MutableRefObject<HierLevel[]>;
  go(next: HierLevel[], select?: number): void;
  openSub(name: string, select?: number): void;
  setSubTabs: Dispatch<SetStateAction<string[]>>;
  curModel: string;
  setCurModel(name: string): void;
  setDialog(d: Dialog | null): void;
  synthAndReport(name: string): Promise<void>;
}

export function moduleActions({ projectRef, editProject, snapshot, docRef, history, stacks, subKey, pathRef, go, openSub, setSubTabs, curModel, setCurModel, setDialog, synthAndReport }: ModuleDeps) {
  /** Nombre de subcircuito: válido y libre (salvo `except`, el que se renombra) */
  const checkSubName = (except?: string) => (n: string) =>
    !validSubcktName(n)
      ? t('Invalid name: use letters, digits, _ or -')
      : n.toLowerCase() !== except?.toLowerCase() && projectRef.current.files.some((f) => f.name.replace(/\.[^.]*$/, '').toLowerCase() === n.toLowerCase())
        ? t('There is already a file called {name}', { name: n })
        : null;
  const askSubName = (title: string, initial: string, onOk: (name: string) => void, except?: string) =>
    setDialog({
      kind: 'name',
      title,
      label: t('Name'),
      initial,
      check: checkSubName(except),
      onOk: (n) => {
        setDialog(null);
        onOk(n);
      },
    });
  // módulo nuevo (#209): esquemático o Verilog
  const newSubckt = () => setDialog({ kind: 'newModule', module: 'schematic' });
  const createModule = (name: string, kind: 'schematic' | 'verilog') => {
    setDialog(null);
    if (kind === 'schematic') return createSubckt(name);
    projectRef.current = addVerilogModule(projectRef.current, name);
    editProject(projectRef.current);
    openSub(name);
    // (sintetizar la plantilla: así el módulo ya tiene símbolo para colocarlo)
    synthAndReport(name);
  };
  const createSubckt = (name: string) => {
    editProject(addSubckt(projectRef.current, name));
    // el proyecto nuevo tiene que estar antes de abrirlo
    projectRef.current = addSubckt(projectRef.current, name);
    openSub(name);
  };
  const renameSub = (from: string) => askSubName(t('Rename subcircuit'), from, (to) => to !== from && doRenameSub(from, to), from);
  const doRenameSub = (from: string, to: string) => {
    // guardar lo que se edita, renombrar en todo el proyecto y volver a mostrar el nivel actual
    const cur = pathRef.current;
    const p = renameSubckt(snapshot(), from, to);
    const re = (n: string) => (n.toLowerCase() === from.toLowerCase() ? to : n);
    for (const k of [...stacks.current.keys()]) if (k === subKey(from) || !k.startsWith('sub:')) stacks.current.delete(k);
    setSubTabs((ts) => ts.map(re));
    editProject(p);
    projectRef.current = p;
    const next = cur.map((l) => ({ ...l, sub: re(l.sub) }));
    pathRef.current = [];
    go(next);
  };
  const deleteSub = (name: string) => {
    const n = usages(projectRef.current, name, (asc, nm) => nm || lineOf(asc)).length;
    setDialog({
      kind: 'slide',
      title: t('Delete subcircuit {name}?', { name }),
      message: n ? t('{name} is used {n} times. Delete it anyway? The instances will lose their symbol.', { name, n }) : t('Its schematic and its symbol will be deleted.'),
      onConfirm: () => {
        setDialog(null);
        doDeleteSub(name);
      },
    });
  };
  const doDeleteSub = (name: string) => {
    if (pathRef.current.some((l) => l.sub.toLowerCase() === name.toLowerCase())) go([]);
    stacks.current.delete(subKey(name));
    setSubTabs((ts) => ts.filter((x) => x.toLowerCase() !== name.toLowerCase()));
    const p = removeSubckt(projectRef.current, name);
    projectRef.current = p;
    editProject(p);
  };
  // --- Módulos «Modelo»: netlist (.subckt/.model) + símbolo ---------------------------------
  const newModel = () =>
    askSubName(t('New model'), freeSubcktName(projectRef.current, 'MODEL'), (name) => {
      const p = addModelModule(projectRef.current, name);
      projectRef.current = p;
      editProject(p);
      setCurModel(name);
    });
  const renameModel = (from: string) =>
    askSubName(
      t('Rename model'),
      from,
      (to) => {
        if (to === from) return;
        const retype = (asc: string) => {
          const d = parseAsc(asc);
          let changed = false;
          for (const s of d.symbols)
            if (baseName(s.type).toLowerCase() === from.toLowerCase()) {
              s.type = s.type.slice(0, s.type.length - baseName(s.type).length) + to;
              changed = true;
            }
          return changed ? serializeAsc(d) : asc;
        };
        // lo que se está editando también se renombra (se guarda antes)
        const p = renameModelModule(snapshot(), from, to, retype);
        projectRef.current = p;
        editProject(p);
        history.reset(parseAsc(retype(ascText(docRef.current))));
        if (curModel.toLowerCase() === from.toLowerCase()) setCurModel(to);
      },
      from,
    );
  const deleteModel = (name: string) => {
    const n = usages(projectRef.current, name, (asc, nm) => nm || lineOf(asc)).length;
    setDialog({
      kind: 'slide',
      title: t('Delete model {name}?', { name }),
      message: n ? t('{name} is used {n} times. Delete it anyway? The instances will lose their symbol.', { name, n }) : t('Its netlist and its symbol will be deleted.'),
      onConfirm: () => {
        setDialog(null);
        if (curModel.toLowerCase() === name.toLowerCase()) setCurModel('');
        const p = removeModelModule(projectRef.current, name);
        projectRef.current = p;
        editProject(p);
      },
    });
  };
  return { checkSubName, newSubckt, createModule, renameSub, deleteSub, newModel, renameModel, deleteModel };
}
