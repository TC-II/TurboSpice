// Caja para agregar trazas (en la barra de resultados): una expresión que se agrega con Enter o
// con el "+" del final. Con el foco en la caja, la punta de prueba escribe en ella en lugar de
// graficar (para armar expresiones sin tipear los nombres).
import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { t } from '../i18n/i18n.ts';

export interface TraceBoxHandle {
  focus(): void;
  /** ¿tiene el foco? (la punta de prueba escribe acá) */
  focused(): boolean;
  /** escribe en la posición del cursor (reemplaza lo seleccionado) */
  insert(text: string): void;
  /** el campo (para no perder el foco al hacer click en el esquemático) */
  input(): HTMLInputElement | null;
}

export function TraceBox({ names, hints, onAdd, handle }: {
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
  const input = useRef<HTMLInputElement>(null);

  useImperativeHandle(handle, () => ({
    focus: () => input.current?.focus(),
    focused: () => !!input.current && document.activeElement === input.current,
    input: () => input.current,
    insert: (text) => {
      const el = input.current;
      const a = el?.selectionStart ?? expr.length;
      const b = el?.selectionEnd ?? a;
      setExpr(expr.slice(0, a) + text + expr.slice(b));
      setError(undefined);
      // el cursor queda después de lo escrito
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(a + text.length, a + text.length);
      });
    },
  }));

  const add = () => {
    const e = expr.trim();
    if (!e) return;
    const err = onAdd(e);
    setError(err);
    if (!err) setExpr('');
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
          list="trace-names"
          value={expr}
          spellCheck={false}
          placeholder={t('Add trace: V(out)/V(in), I(R1), @Q1[gm]…')}
          aria-label={t('Expression')}
          title={t('Enter or + adds the trace (A: go to the box). With the focus here, clicking a node or component on the schematic types its name')}
          onChange={(e) => {
            setExpr(e.target.value);
            setError(undefined);
          }}
        />
        <button type="submit" className="expr-add" aria-label={t('Add trace')} title={t('Add the trace (Enter)')} disabled={!expr.trim()}>
          +
        </button>
      </span>
      <datalist id="trace-names">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
        {[...(hints ?? [])].filter(([n]) => !names.includes(n)).map(([n, label]) => (
          <option key={n} value={n} label={label} />
        ))}
      </datalist>
      {error && <span className="hint warn">{error}</span>}
    </form>
  );
}
