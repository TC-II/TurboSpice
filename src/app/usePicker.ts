// Elegir en el esquemático para un diálogo (#187): una red, un componente, una fuente o una sonda de
// lazo; mientras tanto el esquemático está en la herramienta «pick» y Esc cancela
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { AscDoc } from '../asc/model.ts';
import { effectiveAttrs } from '../asc/resolve.ts';
import type { Library } from '../library/library.ts';
import { spiceName } from '../netlist/spiceName.ts';
import type { Tool } from '../schematic/SchematicEditor.tsx';
import type { Picker, PickWhat } from '../schematic/simDialogs.tsx';

export function usePicker(doc: AscDoc, lib: Library, tool: Tool, setToolState: Dispatch<SetStateAction<Tool>>) {
  const [picking, setPicking] = useState<{ what: PickWhat; ground?: boolean; resolve(v: string | null): void; prev: Tool } | null>(null);
  const picker: Picker = (what, opts) =>
    new Promise((resolve) => {
      // si ya se estaba eligiendo para otro campo, ése queda sin valor y la herramienta a la que
      // se vuelve sigue siendo la de antes de empezar
      picking?.resolve(null);
      setPicking({ what, ground: opts?.ground, resolve, prev: picking ? picking.prev : tool });
      setToolState({ kind: 'pick', what });
    });
  const endPick = (v: string | null) => {
    if (!picking) return;
    picking.resolve(v);
    setToolState(picking.prev);
    setPicking(null);
  };
  const pickValue = ({ net, symbol }: { net?: string; symbol?: number }): string | null => {
    if (!picking) return null;
    if (picking.what === 'net') return net && (net !== '0' || picking.ground) ? net : null;
    if (symbol === undefined) return null;
    const a = effectiveAttrs(doc.symbols[symbol], lib.symbol(doc.symbols[symbol].type));
    // (el nombre que ve el simulador: uno con $…$ va simple, spiceName)
    const inst = a.get('InstName');
    const name = inst === undefined ? null : spiceName(inst);
    if (picking.what === 'component') return a.get('Prefix') ? name : null;
    if (picking.what === 'probe') return /^(LoopProbe|LoopProbe_Dif|DiffLoopProbe)$/i.test(a.get('SpiceModel') ?? '') ? name : null;
    return /^[VI]$/i.test(a.get('Prefix') ?? '') ? name : null;
  };
  useEffect(() => {
    if (!picking) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        endPick(null);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  return { picking, picker, endPick, pickValue };
}
