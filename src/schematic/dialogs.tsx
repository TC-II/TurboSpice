// Diálogos del editor: buscador de componentes, atributos, textos y etiquetas.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { baseName, type SymbolDef, type SymbolInst } from '../asc/model.ts';
import { effectiveAttrs } from '../asc/resolve.ts';
import type { Library } from '../library/library.ts';
import { localBox } from './geometry.ts';
import { LONG_LINK } from './share.ts';
import { SymbolView } from './SchematicCanvas.tsx';

export function Modal({ title, children, onClose, wide, hidden }: {
  title: string;
  children: ReactNode;
  onClose(): void;
  wide?: boolean;
  /** oculto mientras se elige algo en el esquemático (conserva su estado) */
  hidden?: boolean;
}) {
  useEffect(() => {
    if (hidden) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, hidden]);
  return (
    <div className={`modal-backdrop${hidden ? ' picking' : ''}`} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** Dibujo del símbolo (cuerpo, sin rótulos salvo `labels`), ajustado a su caja */
function SymbolPreview({ path, lib, className, labels }: { path: string; lib: Library; className: string; labels?: boolean }) {
  const def = lib.symbol(path);
  if (!def) return <svg className={className} />;
  const b = localBox(def, lib.skin(path)?.viewBox);
  const pad = Math.max(8, 0.12 * Math.max(b.x2 - b.x1, b.y2 - b.y1));
  const inst: SymbolInst = { type: path, x: 0, y: 0, orient: 'R0', windows: new Map(), attrs: new Map() };
  return (
    <svg className={`schematic-mini ${className}`} viewBox={`${b.x1 - pad} ${b.y1 - pad} ${b.x2 - b.x1 + 2 * pad} ${b.y2 - b.y1 + 2 * pad}`}>
      <g className="schematic">
        <SymbolView inst={inst} def={def} lib={lib} hideLabels={!labels} />
        {def.pins.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} className="pin-dot" />
        ))}
      </g>
    </svg>
  );
}

/** F2: buscar y elegir un componente de la librería */
export function ComponentPicker({ lib, onPick, onClose }: { lib: Library; onPick(path: string): void; onClose(): void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const items = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return lib
      .symbolPaths()
      .map((p) => ({ path: p, desc: lib.symbol(p)?.attrs.get('Description') ?? '' }))
      .filter((it) => words.every((w) => `${it.path} ${it.desc}`.toLowerCase().includes(w)))
      .slice(0, 300);
  }, [q, lib]);
  const current = items[Math.min(sel, items.length - 1)];
  return (
    <Modal title="Componente" onClose={onClose} wide>
      <div className="picker">
        <div className="picker-list">
          <input
            ref={input}
            placeholder="Buscar (p.ej. res, cap, OA_Ideal, npn)…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') setSel((s) => Math.min(s + 1, items.length - 1));
              if (e.key === 'ArrowUp') setSel((s) => Math.max(s - 1, 0));
              if (e.key === 'Enter' && current) onPick(current.path);
            }}
          />
          <ul>
            {items.map((it, i) => (
              <li
                key={it.path}
                className={it === current ? 'active' : undefined}
                onPointerEnter={() => setSel(i)}
                onClick={() => onPick(it.path)}
              >
                <SymbolPreview path={it.path} lib={lib} className="thumb" />
                <span className="path">{it.path.split('/').pop()}</span>
                <span className="desc">{it.path.includes('/') ? `${it.path.split('/').slice(0, -1).join('/')} · ` : ''}{it.desc}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="picker-preview">
          {current && <SymbolPreview path={current.path} lib={lib} className="big" labels />}
          {current && <strong>{current.path}</strong>}
          {current && <p>{current.desc}</p>}
          {current && (
            <p className="pins">
              Pines: {lib.symbol(current.path)?.pins.map((p) => p.attrs.get('PinName') || '?').join(', ')}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Atributos de un componente (InstName, Value, SpiceLine…) */
export function AttributeDialog({ inst, def, onApply, onClose }: {
  inst: SymbolInst;
  def: SymbolDef | undefined;
  onApply(attrs: Record<string, string>): void;
  onClose(): void;
}) {
  const eff = effectiveAttrs(inst, def);
  const keys = ['InstName', 'Value', 'Value2', 'SpiceLine', 'SpiceLine2', 'SpiceModel'].filter(
    (k) => k === 'InstName' || k === 'Value' || eff.has(k) || k === 'SpiceLine',
  );
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(keys.map((k) => [k, eff.get(k) ?? ''])));
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    first.current?.focus();
    first.current?.select();
  }, []);
  const submit = () => {
    // Sólo se guardan los que cambiaron respecto al valor efectivo
    const changed = Object.fromEntries(Object.entries(vals).filter(([k, v]) => v !== (eff.get(k) ?? '')));
    onApply(changed);
  };
  return (
    <Modal title={`${baseName(inst.type)} — ${eff.get('InstName') ?? ''}`} onClose={onClose}>
      <form
        className="attrs"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {keys.map((k) => (
          <label key={k}>
            <span>{k}</span>
            <input
              ref={k === 'Value' ? first : undefined}
              value={vals[k]}
              spellCheck={false}
              onChange={(e) => setVals({ ...vals, [k]: e.target.value })}
            />
          </label>
        ))}
        {def?.attrs.get('Description') && <p className="hint">{def.attrs.get('Description')}</p>}
        <div className="buttons">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary">Aceptar</button>
        </div>
      </form>
    </Modal>
  );
}

/** Texto libre: directiva SPICE (S) o comentario (T) */
export function TextDialog({ initial, kind, onApply, onClose }: {
  initial: string;
  kind: 'directive' | 'comment';
  onApply(text: string, kind: 'directive' | 'comment'): void;
  onClose(): void;
}) {
  // En el archivo los saltos de línea se guardan como "\n" literal
  const [text, setText] = useState(initial.split('\\n').join('\n'));
  const [k, setK] = useState(kind);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ta.current?.focus(), []);
  const submit = () => text.trim() && onApply(text.replace(/\r?\n/g, '\\n'), k);
  return (
    <Modal title={k === 'directive' ? 'Directiva SPICE' : 'Comentario'} onClose={onClose}>
      <div className="textdlg">
        <div className="seg">
          <label>
            <input type="radio" checked={k === 'directive'} onChange={() => setK('directive')} /> Directiva SPICE
          </label>
          <label>
            <input type="radio" checked={k === 'comment'} onChange={() => setK('comment')} /> Comentario
          </label>
        </div>
        <textarea
          ref={ta}
          rows={6}
          spellCheck={false}
          value={text}
          placeholder={k === 'directive' ? '.tran 10m\n.ac dec 100 1 1meg' : 'Texto'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
          }}
        />
        <p className="hint">Ctrl+Enter para aceptar. Una directiva por línea.</p>
        <div className="buttons">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="button" className="primary" onClick={submit}>Aceptar</button>
        </div>
      </div>
    </Modal>
  );
}

/** F4: nombre de red (o tierra) */
export function FlagDialog({ initial, onApply, onClose }: { initial: string; onApply(name: string): void; onClose(): void }) {
  const [name, setName] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <Modal title="Nombre de red" onClose={onClose}>
      <form
        className="attrs"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onApply(name.trim());
        }}
      >
        <label>
          <span>Nombre</span>
          <input ref={input} value={name} spellCheck={false} onChange={(e) => setName(e.target.value.replace(/\s/g, ''))} />
        </label>
        <div className="buttons">
          <button type="button" onClick={() => onApply('0')}>Tierra (0)</button>
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary">Aceptar</button>
        </div>
      </form>
    </Modal>
  );
}

/** Link para compartir el circuito: se copia al portapapeles al abrir */
export function ShareDialog({ url, onClose, onDownload }: { url: string; onClose(): void; onDownload(): void }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const copy = () =>
    navigator.clipboard.writeText(url).then(
      () => setCopied(true),
      () => {
        setCopied(false);
        input.current?.select();
      },
    );
  useEffect(() => {
    input.current?.select();
    copy();
  }, []);
  const kb = (url.length / 1024).toFixed(1);
  return (
    <Modal title="Compartir circuito" onClose={onClose}>
      <div className="textdlg">
        <input ref={input} readOnly value={url} aria-label="Link" onFocus={(e) => e.target.select()} />
        <p className="hint">
          {copied ? 'Link copiado al portapapeles. ' : copied === false ? 'Copiá el link con Ctrl+C. ' : ''}
          El circuito va dentro del link ({kb} KB): no se sube a ningún servidor.
        </p>
        {url.length > LONG_LINK && (
          <p className="hint warn">Es un link largo: puede cortarse en algunos chats o mails. Si pasa, mandá el archivo .asc.</p>
        )}
        <div className="buttons">
          <button type="button" onClick={onDownload}>Descargar .asc</button>
          <button type="button" onClick={copy}>Copiar</button>
          <button type="button" className="primary" onClick={onClose}>Listo</button>
        </div>
      </div>
    </Modal>
  );
}
