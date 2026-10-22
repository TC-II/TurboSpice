// Nombre que se renombra con doble clic (#150): pasa a un campo con todo seleccionado; Enter o
// clic afuera guardan, Esc cancela. Un nombre vacío o repetido marca el borde en rojo y no se
// guarda (al salir del campo se descarta).
import { useEffect, useRef, useState } from 'react';

/** Error del nombre propuesto, o null si sirve */
export function nameError(name: string, taken: string[] = []): string | null {
  const n = name.trim();
  if (!n) return 'El nombre no puede estar vacío';
  if (taken.some((t) => t.trim().toLowerCase() === n.toLowerCase())) return `Ya hay uno que se llama «${n}»`;
  return null;
}

export function NameInput({ value, taken, onDone, label }: {
  value: string;
  /** nombres de los demás (no se pueden repetir) */
  taken?: string[];
  /** el nombre nuevo, o null si se canceló */
  onDone(name: string | null): void;
  label: string;
}) {
  const [text, setText] = useState(value);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);
  const err = nameError(text, taken);
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <input
      ref={input}
      className={`name-input${err ? ' invalid' : ''}`}
      value={text}
      aria-label={label}
      aria-invalid={!!err}
      title={err ?? 'Enter guarda · Esc cancela'}
      size={Math.max(6, text.length + 1)}
      autoFocus
      onChange={(e) => setText(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          if (!err) finish(text.trim() === value ? null : text.trim());
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(null);
        }
      }}
      onBlur={() => finish(err || text.trim() === value ? null : text.trim())}
    />
  );
}

/** Texto que con doble clic se vuelve un NameInput */
export function EditableName({ value, taken, onRename, label, className, title }: {
  value: string;
  taken?: string[];
  onRename(name: string): void;
  label: string;
  className?: string;
  title?: string;
}) {
  const [editing, setEditing] = useState(false);
  if (editing)
    return (
      <NameInput
        value={value}
        taken={taken}
        label={label}
        onDone={(n) => {
          setEditing(false);
          if (n) onRename(n);
        }}
      />
    );
  return (
    <span
      className={`editable-name${className ? ` ${className}` : ''}`}
      title={title ?? `${value} (doble clic para renombrar)`}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
    >
      {value}
    </span>
  );
}
