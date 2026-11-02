// Lo que comparten las partes del modo esquemático (diálogos, editor, paneles y barras): la librería,
// el circuito que se ve y cómo editarlo, el proyecto, la herramienta, la selección, la simulación y
// los avisos. SchematicMode lo provee; las partes lo leen con useSchematic() en vez de recibirlo por props
import { createContext, useContext, type MutableRefObject } from 'react';
import type { AscDoc } from '../asc/model.ts';
import type { Library } from '../library/library.ts';
import type { Project } from '../project/turbo.ts';
import type { ItemRef } from '../schematic/geometry.ts';
import type { Tool } from '../schematic/SchematicEditor.tsx';
import type { Dialog, SimRun } from './types.ts';

export interface SchematicCtx {
  lib: Library;
  /** el circuito que se ve (el de una corrida vieja, si se está mirando una) */
  doc: AscDoc;
  /** un cambio del circuito, con su paso de deshacer */
  commit(d: AscDoc): void;
  projectRef: MutableRefObject<Project>;
  editProject(p: Project): void;
  /** el subcircuito que se edita ('' en el testbench) */
  curSub: string;
  tool: Tool;
  setTool(tt: Tool): void;
  selection: ItemRef[];
  setSelection(s: ItemRef[]): void;
  sim: SimRun | null;
  setDialog(d: Dialog | null): void;
  setMessage(m?: string): void;
}

export const SchematicContext = createContext<SchematicCtx | null>(null);

export function useSchematic(): SchematicCtx {
  const c = useContext(SchematicContext);
  if (!c) throw new Error('useSchematic outside SchematicMode');
  return c;
}
