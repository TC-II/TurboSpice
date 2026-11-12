// Portapapeles: la selección como texto .asc (se puede pegar en otra pestaña o en un editor), una
// imagen pegada como fondo del esquemático, y borrar la selección (o un valor anotado del OP)
import type { MutableRefObject, RefObject } from 'react';
import type { AscDoc } from '../asc/model.ts';
import { parseAsc } from '../asc/parse.ts';
import { serializeAsc } from '../asc/serialize.ts';
import { t } from '../i18n/i18n.ts';
import type { Library } from '../library/library.ts';
import { placingCycle } from '../project/subckt.ts';
import type { Project } from '../project/turbo.ts';
import { deleteItems, extractItems, pasteItems } from '../schematic/edit.ts';
import type { ItemRef } from '../schematic/geometry.ts';
import type { EditorHandle, Tool } from '../schematic/SchematicEditor.tsx';
import { hideOpTag, type OpTags } from '../sim/opPins.ts';
import { clipboardImage } from './helpers.ts';
import type { HierLevel } from './types.ts';

/** Copia interna por si el navegador no deja leer el portapapeles */
let clipboardFallback = '';

export interface ClipboardDeps {
  doc: AscDoc;
  lib: Library;
  selection: ItemRef[];
  setSelection(s: ItemRef[]): void;
  setTool(tt: Tool): void;
  commit(d: AscDoc): void;
  editor: RefObject<EditorHandle>;
  pathRef: MutableRefObject<HierLevel[]>;
  projectRef: MutableRefObject<Project>;
  /** el valor anotado del OP elegido (se borra ése en vez de la selección) */
  opSel: string | undefined;
  setOpSel(key: string | undefined): void;
  setOpTags(f: (tags: OpTags) => OpTags): void;
  showOp: boolean;
  setMessage(m?: string): void;
}

export function clipboardActions({ doc, lib, selection, setSelection, setTool, commit, editor, pathRef, projectRef, opSel, setOpSel, setOpTags, showOp, setMessage }: ClipboardDeps) {
  const copySelection = async (cut = false) => {
    if (!selection.length) return;
    const text = serializeAsc(extractItems(doc, selection));
    clipboardFallback = text;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // sin permiso: queda la copia interna
    }
    if (cut) {
      commit(deleteItems(doc, selection, lib));
      setSelection([]);
    }
  };
  /** Ciclos (#199): un subcircuito no se puede colocar adentro de sí mismo, ni indirectamente */
  const makesCycle = (types: string[]): boolean => {
    const host = pathRef.current[pathRef.current.length - 1]?.sub;
    const c = host ? placingCycle(projectRef.current, host, types) : null;
    if (c)
      setMessage(
        c.toLowerCase() === host!.toLowerCase() ? t("{name} can't contain itself", { name: c }) : t("{name} can't go inside {host}: {name} already contains {host}", { name: c, host: host! }),
      );
    return !!c;
  };
  /**
   * Pega. Con `data` (el evento paste de Ctrl+V) se usa lo que trae, sin pedir nada al navegador;
   * sin él (menú Editar › Pegar) hay que leer el portapapeles, y el navegador puede mostrar su cartel.
   */
  const paste = async (data?: DataTransfer | null) => {
    // una imagen en el portapapeles se pega como imagen del esquemático (figura IMAGE, en base64)
    const putImage = async (blob: Blob) => {
      const img = await clipboardImage(blob);
      const at = editor.current?.cursor() ?? { x: 0, y: 0 };
      const shape = { kind: 'IMAGE' as const, coords: [at.x, at.y, at.x + img.w, at.y + img.h], data: img.data };
      commit({ ...doc, shapes: [...doc.shapes, shape] });
      setTool({ kind: 'select' });
      setSelection([{ kind: 'shape', index: doc.shapes.length }]);
    };
    try {
      if (data) {
        const file = Array.from(data.files).find((f) => f.type.startsWith('image/'));
        if (file) return await putImage(file);
      } else {
        for (const item of await navigator.clipboard.read()) {
          const type = item.types.find((ty) => ty.startsWith('image/'));
          if (type) return await putImage(await item.getType(type));
        }
      }
    } catch {
      // sin permiso o sin API de imágenes: se sigue con el texto
    }
    let text: string;
    try {
      text = data ? data.getData('text/plain') : await navigator.clipboard.readText();
    } catch {
      text = clipboardFallback;
    }
    if (!/^\s*Version\s/.test(text)) text = clipboardFallback;
    if (!text) return;
    const frag = parseAsc(text);
    if (makesCycle(frag.symbols.map((x) => x.type))) return;
    // lo pegado queda pegado al cursor como con M: el click lo suelta (y conecta), Esc lo descarta
    const at = editor.current?.cursor() ?? { x: 0, y: 0 };
    const r = pasteItems(doc, frag, at, lib, true);
    if (!r.refs.length) return;
    setSelection([]);
    setTool({ kind: 'move', stretch: false, refs: r.refs, start: at, base: r.doc });
  };
  const deleteSelection = () => {
    if (opSel) {
      setOpTags((p) => hideOpTag(p, opSel, showOp));
      setOpSel(undefined);
    } else if (selection.length) {
      commit(deleteItems(doc, selection, lib));
      setSelection([]);
    } else setTool({ kind: 'delete' });
  };
  return { copySelection, makesCycle, paste, deleteSelection };
}
