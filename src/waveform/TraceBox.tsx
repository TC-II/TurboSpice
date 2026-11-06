// Caja para agregar trazas (en la barra de resultados): una expresión que se agrega con Enter o
// con el "+" del final. Con el foco en la caja, la punta de prueba escribe en ella en lugar de
// graficar (para armar expresiones sin tipear los nombres). Mientras se escribe, como en una
// planilla, sugiere funciones y señales y muestra la firma de la función en la que está el cursor.
// El error de una expresión va a la barra de avisos (lo muestra quien llama a onAdd).
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { t } from '../i18n/i18n.ts';
import { functionHelp, type FunctionHelp } from './expr.ts';

interface Suggestion {
  text: string;
  /** función: se escribe con su paréntesis */
  fn?: FunctionHelp;
  label?: string;
}

const MAX_SUGGESTIONS = 12;

/** lo que se está escribiendo antes del cursor y qué se puede poner en su lugar */
function suggestionsAt(before: string, names: string[], hints: Map<string, string> | undefined, help: FunctionHelp[], all = false): { from: number; items: Suggestion[] } {
  const signals: Suggestion[] = [...names.map((n) => ({ text: n })), ...[...(hints ?? [])].filter(([n]) => !names.includes(n)).map(([n, label]) => ({ text: n, label }))];
  const starts = (s: string, w: string) => s.toLowerCase().startsWith(w.toLowerCase());
  // V(o, I(R…: los nombres que ya traen su V( o I(
  const call = /(?:^|[^\w@])([A-Za-z]+\([\w.[\]:]*)$/.exec(before);
  if (call) {
    const items = signals.filter((s) => starts(s.text, call[1]) && s.text.length > call[1].length);
    if (items.length) return { from: before.length - call[1].length, items: items.slice(0, MAX_SUGGESTIONS) };
  }
  const word = /[A-Za-z_@][\w@.[\]]*$/.exec(before);
  // Ctrl+Espacio sin nada escrito: todo el catálogo (la lista se desplaza)
  if (all && !word) return { from: before.length, items: [...help.map((f) => ({ text: f.name, fn: f })), ...signals] };
  if (!word || (word.index > 0 && /[\w.]/.test(before[word.index - 1]))) return { from: before.length, items: [] };
  const w = word[0];
  const fns = help.filter((f) => starts(f.name, w) && f.name.length >= w.length).map((f) => ({ text: f.name, fn: f }));
  const items = [...fns, ...signals.filter((s) => starts(s.text, w) && s.text.length > w.length)];
  // ya escrito entero y sin otra opción: no hace falta la lista
  if (items.length === 1 && !items[0].fn && items[0].text.toLowerCase() === w.toLowerCase()) return { from: word.index, items: [] };
  return { from: word.index, items: all ? items : items.slice(0, MAX_SUGGESTIONS) };
}

/** la función cuyo paréntesis está abierto en el cursor, y en qué argumento está */
function callAt(before: string, help: FunctionHelp[]): { fn: FunctionHelp; arg: number } | undefined {
  let depth = 0;
  let arg = 0;
  for (let k = before.length - 1; k >= 0; k--) {
    const c = before[k];
    if (c === ')') depth++;
    else if (c === ',' && depth === 0) arg++;
    else if (c === '(') {
      if (depth) {
        depth--;
        continue;
      }
      const name = /[A-Za-z_]\w*$/.exec(before.slice(0, k))?.[0];
      const fn = name && help.find((f) => f.name.toLowerCase() === name.toLowerCase());
      return fn ? { fn, arg } : undefined;
    }
  }
}

export interface TraceBoxHandle {
  focus(): void;
  /** ¿tiene el foco? (la punta de prueba escribe acá) */
  focused(): boolean;
  /** escribe en la posición del cursor (reemplaza lo seleccionado) */
  insert(text: string): void;
  /** el campo (para no perder el foco al hacer click en el esquemático) */
  input(): HTMLInputElement | null;
}

export function TraceBox({
  names,
  hints,
  onAdd,
  handle,
  onFocusChange,
}: {
  /** el foco entra o sale de la caja (con el foco, el esquemático está en modo punta de prueba, #341) */
  onFocusChange?(focused: boolean): void;
  /** nombres para autocompletar */
  names: string[];
  /** más nombres con su descripción (parámetros de dispositivo, #202) */
  hints?: Map<string, string>;
  /** agrega la traza; devuelve el error si no se puede graficar */
  onAdd(expr: string): string | undefined;
  handle?: Ref<TraceBoxHandle>;
}) {
  const [expr, setExpr] = useState('');
  const [error, setError] = useState<string>();
  const [cursor, setCursor] = useState(0);
  // la lista aparece al escribir y se cierra al elegir, con Esc o al salir de la caja
  const [open, setOpen] = useState(false);
  // abierta con Ctrl+Espacio: sin límite de opciones
  const [all, setAll] = useState(false);
  const [sel, setSel] = useState(0);
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const help = useMemo(functionHelp, []);
  const before = expr.slice(0, cursor);
  const sugg = useMemo(() => suggestionsAt(before, names, hints, help, all), [before, names, hints, help, all]);
  const list = open ? sugg.items : [];
  const call = useMemo(() => callAt(before, help), [before, help]);
  const syncCursor = () => setCursor(input.current?.selectionStart ?? expr.length);
  const moveCursor = (el: HTMLInputElement | null, at: number) =>
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at, at);
      setCursor(at);
    });

  const accept = (s: Suggestion, from = sugg.from) => {
    const text = s.fn ? `${s.text}(` : s.text;
    setExpr(expr.slice(0, from) + text + expr.slice(cursor));
    setOpen(false);
    setAll(false);
    setError(undefined);
    moveCursor(input.current, from + text.length);
  };
  // si la caja desaparece con el foco adentro, no llega el blur
  const focusChange = useRef(onFocusChange);
  focusChange.current = onFocusChange;
  useEffect(() => () => focusChange.current?.(false), []);

  useImperativeHandle(handle, () => ({
    focus: () => input.current?.focus(),
    focused: () => !!input.current && input.current.ownerDocument.activeElement === input.current,
    input: () => input.current,
    insert: (text) => {
      const el = input.current;
      const a = el?.selectionStart ?? expr.length;
      const b = el?.selectionEnd ?? a;
      setExpr(expr.slice(0, a) + text + expr.slice(b));
      setError(undefined);
      setOpen(false);
      setAll(false);
      // el cursor queda después de lo escrito
      moveCursor(el, a + text.length);
    },
  }));

  const add = () => {
    const e = expr.trim();
    if (!e) return;
    const err = onAdd(e);
    setError(err);
    setOpen(false);
    setAll(false);
    if (!err) {
      setExpr('');
      setCursor(0);
    }
  };

  return (
    <form
      className="expr-form"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <span className="expr-box">
        <input
          ref={input}
          value={expr}
          spellCheck={false}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={list.length > 0}
          aria-controls="trace-suggest"
          aria-activedescendant={list.length ? `trace-suggest-${Math.min(sel, list.length - 1)}` : undefined}
          aria-invalid={!!error}
          placeholder={t('Add trace: V(out)/V(in), I(R1), @Q1[gm]…')}
          aria-label={t('Expression')}
          title={t('Enter or + adds the trace (T: go to the box; Ctrl+Space: list of functions and signals). With the focus here, clicking a node or component on the schematic types its name')}
          onChange={(e) => {
            setExpr(e.target.value);
            setCursor(e.target.selectionStart ?? e.target.value.length);
            setError(undefined);
            setOpen(true);
            setSel(0);
          }}
          onSelect={syncCursor}
          onKeyDown={(e) => {
            if (e.key === ' ' && e.ctrlKey) {
              e.preventDefault();
              // una sola opción: se completa sin abrir la lista
              const only = suggestionsAt(before, names, hints, help, true);
              if (only.items.length === 1) return accept(only.items[0], only.from);
              setOpen(true);
              setAll(true);
              setSel(0);
              return;
            }
            if (!list.length) return;
            const k = Math.min(sel, list.length - 1);
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((k + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length);
            } else if (e.key === 'Tab' || (e.key === 'Enter' && sel > 0)) {
              // Tab elige siempre; Enter, sólo si se movió por la lista (si no, agrega la traza)
              e.preventDefault();
              accept(list[k]);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              setAll(false);
            }
          }}
          onFocus={() => {
            setFocused(true);
            onFocusChange?.(true);
          }}
          onBlur={() => {
            setOpen(false);
            setAll(false);
            setFocused(false);
            onFocusChange?.(false);
          }}
        />
        <button type="submit" className="expr-add" aria-label={t('Add trace')} title={t('Add the trace (Enter)')} disabled={!expr.trim()}>
          +
        </button>
        {list.length > 0 && (
          <ul className="expr-suggest" id="trace-suggest" role="listbox" aria-label={t('Functions and signals')}>
            {list.map((s, k) => (
              <li
                key={s.text}
                id={`trace-suggest-${k}`}
                role="option"
                aria-selected={k === Math.min(sel, list.length - 1)}
                // sin perder el foco de la caja
                onMouseDown={(e) => {
                  e.preventDefault();
                  accept(s);
                }}
                onMouseEnter={() => setSel(k)}
              >
                <span className="expr-suggest-name">{s.fn ? `${s.text}(${s.fn.args.join(', ')})` : s.text}</span>
                {(s.fn?.desc ?? s.label) && <span className="expr-suggest-desc">{s.fn?.desc ?? s.label}</span>}
              </li>
            ))}
          </ul>
        )}
        {!list.length && call && focused && (
          <span className="expr-signature" role="tooltip">
            <span className="expr-suggest-name">
              {call.fn.name}(
              {call.fn.args.map((a, k) => (
                <span key={a}>
                  {k > 0 && ', '}
                  {k === Math.min(call.arg, call.fn.args.length - 1) ? <b>{a}</b> : a}
                </span>
              ))}
              )
            </span>
            <span className="expr-suggest-desc">{call.fn.desc}</span>
          </span>
        )}
      </span>
    </form>
  );
}
