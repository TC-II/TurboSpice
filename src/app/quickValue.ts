// Valor que se edita en el mismo menú del botón derecho (sin abrir la ventana del componente):
// R, L, C, fuentes V e I de continua y la fuente Vcc de TCLib.
import { baseName } from '../asc/model.ts';
import { parseSource } from '../sim/sources.ts';

export interface QuickValue {
  /** lo que se muestra en el campo */
  shown: string;
  /** lo que se guarda en Value al confirmar */
  store(typed: string): string;
}

interface Attrs {
  Value?: string;
  Value2?: string;
  SpiceLine?: string;
}

const same = (v: string) => v;

/** Vcc de TCLib: su Value es "V=15" (parámetro del subcircuito); se muestra sólo el 15 */
export const isVccSymbol = (type: string) => baseName(type).toLowerCase() === 'vcc';

/**
 * El valor que se puede editar rápido, o null si el componente pide su ventana.
 * `value` es el Value efectivo (el del componente o, si no tiene, el del símbolo).
 */
export function quickValue(prefix: string, type: string, attrs: Attrs, value: string): QuickValue | null {
  const P = prefix.toUpperCase();
  if (/^[RLC]$/.test(P)) return { shown: value, store: same };
  if (P === 'X' && isVccSymbol(type)) {
    const m = /^\s*V\s*=\s*(.*)$/i.exec(value);
    return { shown: (m ? m[1] : value).trim(), store: (typed) => `V=${typed.trim().replace(/^V\s*=\s*/i, '')}` };
  }
  if (P === 'V' || P === 'I') {
    const v = (attrs.Value ?? '').trim();
    // una fuente de corriente recién colocada (Value "I") es una continua sin valor
    if (P === 'I' && !attrs.Value2 && !attrs.SpiceLine && (v === '' || /^i$/i.test(v))) return { shown: '', store: same };
    return parseSource(attrs)?.kind === 'dc' ? { shown: value, store: same } : null;
  }
  return null;
}
