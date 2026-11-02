// El panel de señales guardadas (#314, #364), a la derecha de la simulación: abrirlo y cerrarlo, las
// señales que tiene el circuito, elegir con la punta de prueba y la fila de lo que está bajo el mouse
import { useEffect, useMemo, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { AscDoc } from '../asc/model.ts';
import { t } from '../i18n/i18n.ts';
import type { Library } from '../library/library.ts';
import type { Tool } from '../schematic/SchematicEditor.tsx';
import { savableSignals, saveSelection, setSaveSelection, targetRefs, toggleRefs } from '../sim/saves.ts';
import { buildSimulation } from '../sim/schematicSim.ts';
import type { SavesState, SimRun } from './types.ts';
import { useEvent } from './useEvent.ts';

export interface SavesPanelDeps {
  saves: SavesState | null;
  setSaves: Dispatch<SetStateAction<SavesState | null>>;
  /** el panel se ve (en un testbench) */
  savesOpen: boolean;
  curSub: string;
  doc: AscDoc;
  docRef: MutableRefObject<AscDoc>;
  lib: Library;
  sim: SimRun | null;
  tool: Tool;
  setTool(tt: Tool): void;
  setRowHover(row: string | null): void;
  commit(d: AscDoc): void;
  ascName(): string;
  setMessage(m?: string): void;
}

export function useSavesPanel({ saves, setSaves, savesOpen, curSub, doc, docRef, lib, sim, tool, setTool, setRowHover, commit, ascName, setMessage }: SavesPanelDeps) {
  /**
   * Panel de señales guardadas (#314, #364), a la derecha de la simulación; `choose`: para elegir
   * (desde «Choose signals»), con «sólo lo elegido» y la punta de prueba
   */
  const openSaves = (choose?: boolean) => {
    if (curSub) return setMessage(t('The saved signals belong to the testbench: go up (Alt+↑) to change them'));
    setSaves((s) => ({ ...s, inactive: false, mode: choose ? 'some' : (s?.mode ?? (saveSelection(doc.texts) ? 'some' : 'all')) }));
    if (choose) setTool({ kind: 'probe' });
  };
  const closeSaves = () => {
    setSaves(null);
    setRowHover(null);
    if (tool.kind === 'probe' && !sim) setTool({ kind: 'select' });
  };
  // las señales del circuito, de nuevo cuando cambia (no al cambiar sólo lo elegido)
  const fileName = useEvent(ascName);
  useEffect(() => {
    if (!savesOpen) return;
    let live = true;
    const id = setTimeout(() => {
      buildSimulation(docRef.current, lib, fileName())
        .then((b) => live && setSaves((s) => s && { ...s, signals: savableSignals(b), built: b }))
        .catch(() => live && setSaves((s) => s && { ...s, signals: [], built: undefined }));
    }, 150);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [savesOpen, doc.symbols, doc.wires, doc.flags, lib, docRef, setSaves, fileName]);
  const pickSave = (target: { net?: string; symbol?: number; pin?: number }) => {
    const b = saves?.built;
    if (!b) return;
    const refs = targetRefs(b, target);
    if (!refs.length) return setMessage(t('Nothing to save there: click a wire (voltage) or a component (current)'));
    commit(setSaveSelection(doc, toggleRefs(saveSelection(doc.texts) ?? [], refs)));
  };
  // lo que está bajo el mouse en el esquemático, para resaltar su fila
  const [hoverTarget, setHoverTarget] = useState<{ net?: string; symbol?: number; pin?: number }>();
  const savesHover = useMemo(() => {
    const b = saves?.built;
    const refs = hoverTarget && b ? targetRefs(b, hoverTarget) : [];
    // el cuerpo de un componente: todas sus filas (con el nombre de la lista: XU1, no U1)
    const el = hoverTarget?.symbol !== undefined && hoverTarget.pin === undefined ? b?.lt.elements.find((e) => e.sym === hoverTarget.symbol) : undefined;
    return { refs, device: el?.name.replace(/§/g, '') };
  }, [hoverTarget, saves?.built]);
  return { openSaves, closeSaves, pickSave, setHoverTarget, savesHover };
}
