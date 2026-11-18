// Editor del netlist de un modelo: un textarea con los números de línea y el texto resaltado debajo
// (comandos, nombres, parámetros, expresiones y comentarios), y las líneas con problemas marcadas
// (en el número y con el fondo de la línea). El texto lo tiene quien lo usa; esto sólo lo muestra.
import { forwardRef, memo, useImperativeHandle, useMemo, useRef } from 'react';

export interface NetlistEditorHandle {
  /** selecciona la línea `line` (1…) y la trae a la vista */
  reveal(line: number): void;
  focus(): void;
}

type Tok = { c?: string; s: string };

/** Hasta cuántas líneas se resalta (más es un archivo de modelos enorme: se ve como texto) */
const MAX_HIGHLIGHT = 5000;
/** Dónde empieza el comentario del final de la línea (; de LTspice, «$ » y // de ngspice) */
const COMMENT = /;|(?:^|\s)\$(?=\s|$)|(?:^|\s)\/\//;

/** Las partes de una línea con su clase de resaltado */
export function tokens(line: string): Tok[] {
  if (/^\s*\*/.test(line)) return [{ c: 'c', s: line }];
  const m = COMMENT.exec(line);
  const code = m ? line.slice(0, m.index) : line;
  const out: Tok[] = [];
  const re = /(^\s*\+)|(^\s*\.[A-Za-z]\w*)|(\{[^}]*\}?)|(params:)|([A-Za-z_][\w.]*)(?=\s*=)|([^\s{]+)|(\s+)/gi;
  let named = false;
  let first = true;
  for (const x of code.matchAll(re)) {
    const s = x[0];
    if (x[7]) out.push({ s });
    else if (x[1]) out.push({ c: 'p', s });
    else if (x[2]) {
      out.push({ c: 'k', s });
      named = /^\s*\.(subckt|model|ends)$/i.test(s);
    } else if (x[3]) out.push({ c: 'e', s });
    else if (x[4]) out.push({ c: 'k', s });
    else if (x[5]) out.push({ c: 'a', s });
    else if (named) {
      out.push({ c: 'n', s });
      named = false;
    } else out.push({ c: first && /^[A-Za-z]/.test(s) ? 'el' : undefined, s });
    if (!x[7]) first = false;
  }
  if (m) out.push({ c: 'c', s: line.slice(m.index) });
  return out;
}

const Line = memo(function Line({ text, mark, plain }: { text: string; mark?: string; plain: boolean }) {
  return (
    <div className={mark ? `ne-line ${mark}` : 'ne-line'}>
      {plain || !text
        ? text || ' '
        : tokens(text).map((tk, i) =>
            tk.c ? (
              <span key={i} className={`ne-${tk.c}`}>
                {tk.s}
              </span>
            ) : (
              tk.s
            ),
          )}
    </div>
  );
});

export const NetlistEditor = forwardRef<
  NetlistEditorHandle,
  {
    id?: string;
    value: string;
    /** severidad del problema de cada línea (1…) */
    marks: Map<number, 'error' | 'warning'>;
    label: string;
    placeholder?: string;
    onChange(v: string): void;
    onBlur(): void;
  }
>(function NetlistEditor({ id, value, marks, label, placeholder, onChange, onBlur }, ref) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const hl = useRef<HTMLDivElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => value.split(/\r\n|\r|\n/), [value]);
  const plain = lines.length > MAX_HIGHLIGHT;
  const sync = () => {
    const el = ta.current;
    if (!el) return;
    if (hl.current) {
      hl.current.scrollTop = el.scrollTop;
      hl.current.scrollLeft = el.scrollLeft;
    }
    if (gutter.current) gutter.current.scrollTop = el.scrollTop;
  };
  useImperativeHandle(ref, () => ({
    focus: () => ta.current?.focus(),
    reveal(line: number) {
      const el = ta.current;
      if (!el) return;
      const ls = el.value.split('\n');
      const n = Math.min(Math.max(line, 1), ls.length);
      const start = ls.slice(0, n - 1).reduce((a, l) => a + l.length + 1, 0);
      el.focus();
      el.setSelectionRange(start, start + ls[n - 1].length);
      // la línea, a un tercio de la altura
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 19.5;
      el.scrollTop = Math.max(0, (n - 1) * lh - el.clientHeight / 3);
      sync();
    },
  }));
  return (
    <div className="ne">
      <div className="ne-gutter" ref={gutter} aria-hidden>
        {lines.map((_, i) => (
          <div key={i} className={marks.get(i + 1)}>
            {i + 1}
          </div>
        ))}
      </div>
      <div className="ne-code">
        <div className="ne-hl" ref={hl} aria-hidden>
          {lines.map((l, i) => (
            <Line key={i} text={l} mark={marks.get(i + 1)} plain={plain} />
          ))}
        </div>
        <textarea
          id={id}
          ref={ta}
          className="ne-input"
          aria-label={label}
          placeholder={placeholder}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          wrap="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onScroll={sync}
          onSelect={sync}
        />
      </div>
    </div>
  );
});
