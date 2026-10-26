// Modelo del switch nativo de SPICE (S… SW, #307): sus parámetros no van en el componente sino en
// una directiva ".model <nombre> SW(Ron=… Roff=… Vt=… Vh=…)" del esquemático. Acá se lee y se
// escribe esa directiva (la primera que define el nombre; si no hay, una nueva abajo del componente).
import type { AscDoc } from '../asc/model.ts';
import { formatParamList, parseParamList } from '../project/symbolEdit.ts';

// los saltos de línea de una directiva se guardan como "\n" literal
const lines = (text: string) => text.split('\\n');
const modelRe = (name: string) => new RegExp(`^\\s*\\.model\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(v?switch|sw)\\b\\s*\\(?([^)]*)\\)?\\s*$`, 'i');

/** Dónde está el .model del switch y sus parámetros (null si el esquemático no lo define) */
export function findSwModel(doc: AscDoc, name: string): { text: number; line: number; params: [string, string][] } | null {
  if (!name.trim()) return null;
  const re = modelRe(name.trim());
  for (let ti = 0; ti < doc.texts.length; ti++) {
    const tt = doc.texts[ti];
    if (tt.kind !== 'directive') continue;
    const ls = lines(tt.text);
    for (let li = 0; li < ls.length; li++) {
      const m = re.exec(ls[li]);
      if (m) return { text: ti, line: li, params: parseParamList(m[2]) };
    }
  }
  return null;
}

/** Escribe (o reemplaza) el .model del switch; `at` es dónde va la directiva si es nueva */
export function setSwModel(doc: AscDoc, name: string, params: [string, string][], at: { x: number; y: number }): AscDoc {
  const line = `.model ${name} SW(${formatParamList(params)})`;
  const found = findSwModel(doc, name);
  if (!found) return { ...doc, texts: [...doc.texts, { ...at, align: 'Left', size: 2, kind: 'directive', text: line }] };
  const texts = doc.texts.map((tt, i) => {
    if (i !== found.text) return tt;
    const ls = lines(tt.text);
    ls[found.line] = line;
    return { ...tt, text: ls.join('\\n') };
  });
  return { ...doc, texts };
}
