// Botón derecho en el esquemático: en un componente, editar su valor y propagarlo a los otros
// testbenches del workbench (#229); en una red o un componente, guardar o no sus señales (#314)
import type { AscDoc } from '../asc/model.ts';
import { effectiveAttrs } from '../asc/resolve.ts';
import { t } from '../i18n/i18n.ts';
import type { Library } from '../library/library.ts';
import { groupPeersWith, propagateAttrs, variantOf } from '../project/project.ts';
import type { Project } from '../project/turbo.ts';
import { setSymbolAttrs } from '../schematic/edit.ts';
import type { ItemRef } from '../schematic/geometry.ts';
import { elementRefs, saveSelection, setSaveSelection, toggleRefs } from '../sim/saves.ts';
import type { SimList } from '../sim/simList.ts';
import { parseSource } from '../sim/sources.ts';
import type { ContextItem } from '../ui/ContextMenu.tsx';

export interface ContextMenuDeps {
  doc: AscDoc;
  lib: Library;
  curSub: string;
  sims: SimList;
  commit(d: AscDoc): void;
  snapshot(): Project;
  editProject(p: Project): void;
  editItem(ref: ItemRef): void;
  setCtxMenu(m: { at: { x: number; y: number }; items: ContextItem[] }): void;
  setMessage(m?: string): void;
}

export function contextMenus({ doc, lib, curSub, sims, commit, snapshot, editProject, editItem, setCtxMenu, setMessage }: ContextMenuDeps) {
  /**
   * Ítem del botón derecho para guardar o dejar de guardar unas señales, sólo si el testbench
   * guarda lo elegido (#314)
   */
  const saveItem = (refs: string[]): ContextItem | null => {
    const sel = curSub ? null : saveSelection(doc.texts);
    if (!sel || !refs.length) return null;
    const next = toggleRefs(sel, refs)!;
    const saved = next.length < sel.length;
    const what = refs.join(' ');
    return {
      label: saved ? t('Don\'t save {what}', { what }) : t('Save {what}', { what }),
      disabled: saved && !next.length,
      onClick: () => {
        commit(setSaveSelection(doc, next));
        setMessage(t('Saved signals changed: simulate again with Alt+R'));
      },
    };
  };
  const netMenu = (net: string, at: { x: number; y: number }): boolean => {
    if (net === '0') return false;
    const item = saveItem([`V(${net})`]);
    if (!item) return false;
    setCtxMenu({ at, items: [item] });
    return true;
  };
  const symbolMenu = (index: number, at: { x: number; y: number }): boolean => {
    const s = doc.symbols[index];
    const inst = s?.attrs.get('InstName');
    if (!s || !inst) return false;
    const eff = effectiveAttrs(s, lib.symbol(s.type));
    const value = s.attrs.get('Value') ?? eff.get('Value') ?? '';
    const prefix = (eff.get('Prefix') ?? '').toUpperCase();
    // R, L, C y fuentes V de continua: el valor se edita en el mismo menú
    const quick =
      /^[RLC]$/.test(prefix) ||
      (prefix === 'V' && parseSource({ Value: s.attrs.get('Value'), Value2: s.attrs.get('Value2'), SpiceLine: s.attrs.get('SpiceLine') })?.kind === 'dc');
    const p0 = snapshot();
    const inBench = !curSub && !!sims.active;
    const peers = inBench ? groupPeersWith(p0, sims.active, inst, s.type) : [];
    const me = inBench ? variantOf(p0).sims.find((x) => x.id === sims.active) : undefined;
    const canPropagate = !!me?.group && peers.length > 0;
    // con sólo las señales elegidas (#314): guardar (o no) sus corrientes
    const save = saveItem(elementRefs(inst, prefix));
    // fuera de los casos rápidos, el menú sólo aparece si hay a quién propagarle (o qué guardar)
    if (!quick && !canPropagate) {
      if (!save) return false;
      setCtxMenu({ at, items: [save] });
      return true;
    }
    const group = p0.groups.find((g) => g.id === me?.group)?.name ?? '';
    setCtxMenu({
      at,
      items: [
        quick
          ? { label: `${inst} =`, onClick: () => {}, edit: { value, onCommit: (v) => commit(setSymbolAttrs(doc, index, { Value: v })) } }
          : { label: t('Edit {inst}…', { inst }), onClick: () => editItem({ kind: 'symbol', index }) },
        {
          // con el valor que se está escribiendo (#229): se aplica primero y después se propaga
          label: (v = value) =>
            !canPropagate
              ? t('Propagate {inst} across the other testbenches of the workbench', { inst })
              : t('Propagate {inst}={value} across «{group}»', { inst, value: v, group }),
          short: t('Propagate'),
          disabled: !canPropagate,
          primary: true,
          onClick: (edited) => {
            const v = edited?.trim() || value;
            const attrs = new Map(s.attrs);
            if (quick && v !== value) {
              commit(setSymbolAttrs(doc, index, { Value: v }));
              attrs.set('Value', v);
            }
            editProject(propagateAttrs(snapshot(), peers, inst, s.type, attrs));
            setMessage(t('{inst} = {value} propagated to {n} testbenches of «{group}»', { inst, value: v, n: peers.length, group }));
          },
        },
        ...(save ? [save] : []),
      ],
    });
    return true;
  };
  return { netMenu, symbolMenu };
}
