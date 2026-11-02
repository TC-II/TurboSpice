// LaTeX en el esquemático (#328): un rótulo o comentario con $…$ se compone con MathJax (salida
// SVG). Las reglas de qué es LaTeX son las de ASC-Parser (engine/latex_text.js, modo «dollar»):
// un `\$` escapado no abre ni cierra, y con una cantidad impar de `$` todo queda literal. En el
// texto común, `\$ \% \& \_ \# \{ \} \\` son esos caracteres, como en LaTeX.
//
// MathJax se carga sólo la primera vez que aparece un $…$; mientras tanto se ve el texto crudo.
import { useSyncExternalStore } from 'react';

export type Span = { latex: boolean; text: string };

/** Separa en los `$` sin escapar; null si son impares (el rótulo no está marcado: queda literal) */
export function splitDollarSpans(str: string): Span[] | null {
  const spans: Span[] = [];
  let buf = '';
  let inMath = false;
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\\' && i + 1 < str.length) {
      buf += ch + str[i + 1];
      i++;
      continue;
    }
    if (ch === '$') {
      count++;
      spans.push({ latex: inMath, text: buf });
      buf = '';
      inMath = !inMath;
      continue;
    }
    buf += ch;
  }
  spans.push({ latex: inMath, text: buf });
  if (count % 2 !== 0) return null;
  return spans.filter((s) => s.text.length > 0);
}

/** Los tramos de un rótulo: LaTeX los que están entre $…$, el resto texto */
export function latexSpans(str: string): Span[] {
  if (!str.includes('$')) return [{ latex: false, text: str }];
  return splitDollarSpans(str) ?? [{ latex: false, text: str }];
}

/** ¿Tiene algo que componer con LaTeX? */
export const hasLatex = (s: string) => s.includes('$') && latexSpans(s).some((x) => x.latex);

/** El texto común con los escapes de LaTeX resueltos (`\%` → `%`) */
export const plainText = (s: string) => s.replace(/\\([{}$&#_%\\])/g, '$1');

/**
 * Cómo se ve un rótulo sin fórmulas: si usa la notación de LaTeX (algún `$`, con los `$` sin
 * escapar en pares) sus escapes se resuelven ("\$ 50\%" se ve "$ 50%"); si no, tal cual (una
 * ruta "C:\lib" o un "$" suelto no cambian)
 */
export const labelPlain = (s: string) => (s.includes('$') && splitDollarSpans(s) ? plainText(s) : s);

/** Un tramo de texto común dentro de una fórmula de MathJax (\text no lee comandos) */
function textTex(s: string): string {
  let out = '';
  let run = '';
  const flush = () => {
    if (run) out += `\\text{${run}}`;
    run = '';
  };
  for (const ch of plainText(s)) {
    const sym = ch === '{' ? '\\lbrace ' : ch === '}' ? '\\rbrace ' : ch === '$' ? '\\$' : ch === '\\' ? '\\backslash ' : null;
    if (sym) {
      flush();
      out += sym;
    } else run += ch;
  }
  flush();
  return out;
}

/** El rótulo entero como una fórmula: el texto común va en \text{} */
export function labelTex(str: string): string {
  return latexSpans(str)
    .map((s) => (s.latex ? `{${s.text}}` : textTex(s.text)))
    .join('');
}

// --- MathJax --------------------------------------------------------------------------------------

/** Una fórmula compuesta: el viewBox de MathJax (1000 unidades por em, línea de base en y = 0) */
export interface MathSvg {
  minX: number;
  minY: number;
  w: number;
  h: number;
  /** el contenido del <svg>, sin color propio (lo toma del rótulo) */
  body: string;
}

let convert: ((tex: string) => string) | null = null;
let loading: Promise<void> | null = null;
let version = 0;
const listeners = new Set<() => void>();

/** Carga MathJax (una vez); avisa a los rótulos que esperaban para dibujarse */
export function loadMathJax(): Promise<void> {
  loading ??= (async () => {
    const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }, { AllPackages }] = await Promise.all([
      import('mathjax-full/js/mathjax.js'),
      import('mathjax-full/js/input/tex.js'),
      import('mathjax-full/js/output/svg.js'),
      import('mathjax-full/js/adaptors/liteAdaptor.js'),
      import('mathjax-full/js/handlers/html.js'),
      import('mathjax-full/js/input/tex/AllPackages.js'),
    ]);
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    // fontCache 'none': cada fórmula trae sus caminos (sin <use> a un <defs> compartido), así sale
    // igual en el SVG, el PNG y el PDF de la hoja
    // sin noundefined ni noerrors: un comando mal escrito es un error (y queda el texto crudo),
    // no la palabra en rojo dentro del dibujo
    const packages = AllPackages.filter((p) => !['bussproofs', 'noundefined', 'noerrors'].includes(p));
    const doc = mathjax.document('', { InputJax: new TeX({ packages }), OutputJax: new SVG({ fontCache: 'none' }) });
    convert = (tex) => adaptor.innerHTML(doc.convert(tex, { display: false }) as never);
    version++;
    listeners.forEach((l) => l());
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

const cache = new Map<string, MathSvg | null>();

/** La fórmula del rótulo, o undefined si MathJax todavía no está (y lo empieza a cargar) */
export function mathSvg(str: string): MathSvg | null | undefined {
  if (!convert) {
    loadMathJax().catch(() => {});
    return undefined;
  }
  let out = cache.get(str);
  if (out === undefined) {
    out = null;
    try {
      const svg = convert(labelTex(str));
      const vb = /viewBox="([^"]+)"/.exec(svg)?.[1].split(/\s+/).map(Number);
      // un error de TeX (comando que no existe): MathJax lo marca en rojo; se deja el texto crudo
      if (vb?.length === 4 && !svg.includes('data-mjx-error') && !svg.includes('merror')) {
        const body = svg
          .replace(/^<svg[^>]*>/, '')
          .replace(/<\/svg>\s*$/, '')
          .replace(/\s(stroke|fill)="currentColor"/g, '');
        out = { minX: vb[0], minY: vb[1], w: vb[2], h: vb[3], body };
      }
    } catch {
      // queda el texto crudo
    }
    if (cache.size > 5000) cache.clear();
    cache.set(str, out);
  }
  return out;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
/** Vuelve a dibujar cuando termina de cargar MathJax */
export function useMathJax(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );
}
