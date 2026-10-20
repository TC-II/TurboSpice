// Diálogos del editor: buscador de componentes, atributos, textos y etiquetas.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Logo } from '../ui/Logo.tsx';
import { PartTable, type PartGroup } from './PartTable.tsx';
import { cmpApply, type CmpPart } from '../library/cmp.ts';
import { baseName, WINDOW_ATTR, type SymbolDef, type SymbolInst, type TextWindow } from '../asc/model.ts';
import { defaultWindows, effectiveAttrs, effectiveWindows, type WindowDefaults } from '../asc/resolve.ts';
import { transformAlign } from '../asc/transform.ts';
import type { LabelPatch } from './edit.ts';
import type { Library } from '../library/library.ts';
import { localBox } from './geometry.ts';
import { LINE_STYLES } from './shapes.ts';
import { LONG_LINK } from './share.ts';
import { fromRkm, parseSpiceNumber } from '../netlist/spicenum.ts';
import { si } from '../waveform/series.ts';

const UNITS: Record<string, string> = { R: 'Ω', C: 'F', L: 'H' };

/**
 * Valor de un R, C o L: normaliza la notación 4k7 → 4.7k y dice cómo se interpreta, o avisa
 * si no parece un valor (las expresiones {…} y los parámetros "R=…" se aceptan tal cual).
 */
export function checkValue(prefix: string, value: string): { value: string; info?: string; warn?: string } {
  const unit = UNITS[prefix.toUpperCase()];
  if (!unit || !value.trim()) return { value };
  const [first, ...rest] = value.trim().split(/\s+/);
  const rkm = fromRkm(first);
  const main = rkm ?? first;
  const v = [main, ...rest].join(' ');
  if (/^\{.*\}$/.test(main) || /=/.test(main)) return { value: v };
  const x = parseSpiceNumber(main);
  if (!Number.isFinite(x)) return { value: v, warn: `"${first}" no parece un valor numérico (ej.: 4.7k, 4k7, 10u, 1meg, {R})` };
  // "1M" es mili en SPICE: avisar, es un error clásico
  const milli = /^[\d.]+M$/.test(main) ? ' — ojo: M es mili; mega es "meg"' : '';
  return { value: v, info: `= ${si(x, 4)}${unit}${milli}` };
}
import { SymbolView } from './SchematicCanvas.tsx';

/** margen mínimo de los diálogos contra los bordes de la ventana */
const MODAL_MARGIN = 16;

/**
 * Diálogo modal. Todos se abren centrados en la ventana y después no se mueven: si cambian de
 * alto (otra pestaña, más o menos resultados) crecen o se achican hacia abajo, y sólo suben lo
 * necesario si dejarían de entrar (#67).
 */
export function Modal({ title, children, onClose, wide, large, hidden }: {
  title: string;
  children: ReactNode;
  onClose(): void;
  wide?: boolean;
  /** casi toda la ventana (exploradores de archivos) */
  large?: boolean;
  /** oculto mientras se elige algo en el esquemático (conserva su estado) */
  hidden?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || hidden) return;
    let t: number | null = null;
    const place = (center: boolean) => {
      const vh = window.innerHeight;
      const h = el.offsetHeight;
      if (center || t === null) t = Math.max(MODAL_MARGIN, (vh - h) / 2);
      else if (t + h > vh - MODAL_MARGIN) t = Math.max(MODAL_MARGIN, vh - MODAL_MARGIN - h);
      setTop(t);
    };
    place(true);
    const ro = new ResizeObserver(() => place(false));
    ro.observe(el);
    const onResize = () => place(true);
    window.addEventListener('resize', onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [hidden]);
  useEffect(() => {
    if (hidden) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, hidden]);
  return (
    <div
      className={`modal-backdrop${hidden ? ' picking' : ''}`}
      style={top !== null ? { paddingTop: top } : undefined}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={box} className={`modal${wide ? ' wide' : ''}${large ? ' large' : ''}`} role="dialog" aria-label={title}>
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
    // la lista tiene alto fijo: la caja de búsqueda no se mueve mientras se escribe
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
interface LabelRow {
  win: number;
  attr: string;
  visible: boolean;
  /** alineación tal como se ve en el esquemático */
  align: string;
  size: number;
  /** distinto de lo que pone el símbolo (se puede volver a la posición por defecto) */
  moved: boolean;
}

const sameWin = (a: TextWindow | undefined, b: TextWindow | undefined) =>
  !!a && !!b && a.x === b.x && a.y === b.y && a.align === b.align && a.size === b.size;

/** Rótulos del componente que muestran un atributo (InstName, Value…), en orden de WINDOW */
export function labelRows(inst: SymbolInst, def: SymbolDef | undefined, table: WindowDefaults): LabelRow[] {
  if (!def) return [];
  const eff = effectiveWindows(inst, def, table);
  const dflt = defaultWindows(def, inst.orient, table);
  const attrs = effectiveAttrs(inst, def);
  const rows: LabelRow[] = [];
  for (const [win, w] of [...eff].sort((a, b) => a[0] - b[0])) {
    const attr = WINDOW_ATTR[win];
    if (!attr || !attrs.has(attr)) continue;
    const d = dflt.get(win);
    const hidden = w.align === 'Invisible';
    // un rótulo oculto se muestra con la alineación por defecto
    const local = hidden ? (d && d.align !== 'Invisible' ? d.align : 'Left') : w.align;
    rows.push({ win, attr, visible: !hidden, align: transformAlign(local, inst.orient), size: w.size, moved: !sameWin(w, d) });
  }
  return rows;
}

/** Atributos de un componente y, a la derecha de cada uno, si su rótulo se ve en el esquemático */
export function AttributeDialog({ inst, def, windowDefaults, focusLabel, parts, onApply, onClose }: {
  inst: SymbolInst;
  def: SymbolDef | undefined;
  windowDefaults: WindowDefaults;
  /** listas de library/cmp de las que se elige el valor (transistores, diodos, capacitores…) */
  parts?: PartGroup[];
  /** rótulo desde el que se abrió (botón derecho o doble click sobre el texto) */
  focusLabel?: number;
  onApply(attrs: Record<string, string>, labels: Map<number, LabelPatch>, toSelection: boolean): void;
  onClose(): void;
}) {
  const eff = effectiveAttrs(inst, def);
  const keys = ['InstName', 'Value', 'Value2', 'SpiceLine', 'SpiceLine2', 'SpiceModel'].filter(
    (k) => k === 'InstName' || k === 'Value' || eff.has(k) || k === 'SpiceLine',
  );
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(keys.map((k) => [k, eff.get(k) ?? ''])));
  const [rows, setRows] = useState(() => labelRows(inst, def, windowDefaults));
  const [patches, setPatches] = useState(new Map<number, LabelPatch>());
  const focusAttr = rows.find((r) => r.win === focusLabel)?.attr ?? 'Value';
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    first.current?.focus();
    first.current?.select();
  }, []);
  const prefix = eff.get('Prefix') ?? '';
  const check = checkValue(prefix, vals.Value ?? '');
  const setVisible = (win: number, visible: boolean) => {
    setPatches(new Map(patches).set(win, { ...patches.get(win), visible }));
    setRows(rows.map((r) => (r.win === win ? { ...r, visible, moved: true } : r)));
  };
  // pieza elegida de la tabla: su nombre (semiconductores) o la que se eligió en esta ventana
  const [picked, setPicked] = useState<string | undefined>(() => parts?.flatMap((g) => g.parts).find((p) => p.name.toLowerCase() === (eff.get('Value') ?? '').toLowerCase())?.name);
  const pick = (p: CmpPart) => {
    const a = cmpApply(p);
    setPicked(p.name);
    const next = { ...vals, Value: a.Value, ...(a.SpiceLine !== null || p.kind !== 'res' ? { SpiceLine: a.SpiceLine ?? '' } : {}) };
    setVals(next);
    return next;
  };
  const submit = (from = vals) => {
    const vals = from;
    const check = checkValue(prefix, vals.Value ?? '');
    const out = { ...vals, ...(vals.Value !== undefined ? { Value: check.value } : {}) };
    // Sólo se guardan los que cambiaron respecto al valor efectivo
    const changed = Object.fromEntries(Object.entries(out).filter(([k, v]) => v !== (eff.get(k) ?? '')));
    onApply(changed, patches, false);
  };
  return (
    <Modal title={`${baseName(inst.type)} — ${eff.get('InstName') ?? ''}`} onClose={onClose} wide={!!parts?.length}>
      <form
        className="attrs"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {!!parts?.length && <PartTable groups={parts} selected={picked} onPick={pick} onPickAndAccept={(p) => submit(pick(p))} />}
        {keys.map((k) => {
          const row = rows.find((r) => r.attr === k);
          return (
            <label key={k} className="attr-row">
              <span>{k}</span>
              <input
                ref={k === focusAttr ? first : undefined}
                value={vals[k]}
                spellCheck={false}
                onChange={(e) => (setVals({ ...vals, [k]: e.target.value }), k === 'Value' && setPicked(undefined))}
              />
              {row ? (
                <input
                  type="checkbox"
                  className="attr-vis"
                  checked={row.visible}
                  title="Visible en el esquemático"
                  aria-label={`${k} visible en el esquemático`}
                  onChange={(e) => setVisible(row.win, e.target.checked)}
                />
              ) : (
                <span className="attr-vis" />
              )}
              {k === 'Value' && (check.warn || check.info) && <small className={check.warn ? 'hint warn' : 'hint'}>{check.warn ?? check.info}</small>}
            </label>
          );
        })}
        {rows.length > 0 && <p className="hint">☑ = visible en el esquemático. Los rótulos se arrastran con el mouse (Shift: libre).</p>}
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
export function FlagDialog({ initial, onApply, onClose }: {
  initial: string;
  onApply(name: string): void;
  onClose(): void;
}) {
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
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary">Aceptar</button>
        </div>
      </form>
    </Modal>
  );
}

/** Estilo de línea de las figuras (Dibujar › Estilo de línea, doble click en una figura) */
export function LineStyleDialog({ initial, count, onApply, onClose }: {
  initial: string;
  /** figuras seleccionadas a las que se aplica (0: sólo las que se dibujen después) */
  count: number;
  onApply(style: string): void;
  onClose(): void;
}) {
  const [style, setStyle] = useState(initial);
  return (
    <Modal title="Estilo de línea" onClose={onClose}>
      <form
        className="attrs line-styles"
        onSubmit={(e) => {
          e.preventDefault();
          onApply(style);
        }}
      >
        <p className="hint">
          {count ? `Se aplica a ${count === 1 ? 'la figura seleccionada' : `las ${count} figuras seleccionadas`} y a las que se dibujen después.` : 'Se aplica a las figuras que se dibujen.'}
        </p>
        {LINE_STYLES.map((ls) => (
          <label key={ls.value} className="line-style">
            <input type="radio" name="line-style" checked={style === ls.value} onChange={() => setStyle(ls.value)} autoFocus={style === ls.value} />
            <svg width="96" height="12" aria-hidden="true">
              <line x1="4" y1="6" x2="92" y2="6" stroke="currentColor" strokeWidth="1.6" strokeDasharray={ls.dash} />
            </svg>
            <span>{ls.label}</span>
          </label>
        ))}
        <div className="buttons">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary">Aceptar</button>
        </div>
      </form>
    </Modal>
  );
}

/** Link para compartir el circuito: se copia al portapapeles al abrir */
export function ShareDialog({ url, onClose }: { url: string; onClose(): void }) {
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
  // el circuito comprimido es el parámetro c= del hash (base64url: 4 caracteres por 3 bytes)
  const packed = new URLSearchParams(url.slice(url.indexOf('#') + 1)).get('c') ?? '';
  const bytes = Math.floor((packed.length * 3) / 4);
  return (
    <Modal title="Compartir circuito" onClose={onClose}>
      <div className="textdlg">
        <input ref={input} readOnly value={url} aria-label="Link" onFocus={(e) => e.target.select()} />
        <p className="hint">El link contiene todo el circuito comprimido en {bytes.toLocaleString('es')} bytes.</p>
        {copied ? (
          <p className="hint ok"><span aria-hidden="true">✓</span> Link copiado en portapapeles</p>
        ) : copied === false ? (
          <p className="hint">Copiá el link con Ctrl+C.</p>
        ) : null}
        {url.length > LONG_LINK && <p className="hint warn">Es un link largo: puede cortarse en algunos chats o mails.</p>}
        <div className="buttons">
          <button type="button" onClick={copy}>Copiar</button>
          <button type="button" className="primary" onClick={onClose}>Listo</button>
        </div>
      </div>
    </Modal>
  );
}

// Los de la configuración de LTspice que usamos (LTspice.ini): dependen de dónde está el mouse
const SHORTCUTS: [string, [string, string][]][] = [
  [
    'Esquemático',
    [
      ['P · F2', 'Componente (buscador)'],
      ['R · C · L · D · V · I', 'Resistencia, capacitor, inductor, diodo, fuente de tensión, fuente de corriente'],
      ['G', 'Tierra'],
      ['W · F3', 'Cable (click derecho o Esc termina)'],
      ['N · F4', 'Etiqueta de red'],
      ['. · T', 'Directiva SPICE · comentario'],
      ['J · K · O · U', 'Línea · rectángulo · círculo · arco (decorativos)'],
      ['M', 'Mover: click en un elemento (o recuadro), sigue al cursor hasta el próximo click; los cables no se estiran'],
      ['S', 'Arrastrar: igual que M, pero los cables se estiran'],
      ['Backspace · F5', 'Borrar la selección (sin selección: modo borrar, con click o recuadro)'],
      ['F6', 'Duplicar la selección'],
      ['Ctrl+C · Ctrl+X · Ctrl+V', 'Copiar · cortar · pegar (también entre pestañas)'],
      ['Ctrl+A', 'Seleccionar todo'],
      ['Ctrl+R · Ctrl+E', 'Rotar · espejar'],
      ['Ctrl+Z · Ctrl+Shift+Z', 'Deshacer · rehacer (también Ctrl+Y)'],
      ['Arrastrar', 'Mover (los cables siguen); con Ctrl, sin arrastrar cables'],
      ['Click repetido', 'Alterna entre elementos superpuestos'],
      ['Arrastrar un rótulo', 'Mueve InstName/Value de un componente seleccionado'],
      ['Rueda', 'Zoom'],
      ['Botón medio · derecho · Espacio+arrastrar', 'Desplazar'],
      ['Espacio · Inicio', 'Ajustar a la vista'],
      ['Z · Shift+Z', 'Zoom a un recuadro · zoom anterior'],
      ['Ctrl+G · Ctrl+U', 'Mostrar/ocultar la grilla · las marcas de pines sueltos'],
      ['Alt+N', 'Mostrar los nombres de las redes'],
      ['A · Alt+E · Alt+C', 'Comando de simulación · estudio · bloque .control'],
      ['Alt+R · Ctrl+Enter', 'Simular'],
      ['Alt+S', 'Abortar la simulación'],
      ['Ctrl+L', 'Ver el log (o los problemas) de la simulación'],
      ['Ctrl+S · Ctrl+O', 'Guardar · abrir'],
      ['?', 'Esta ayuda'],
    ],
  ],
  [
    'Visor de resultados (con el mouse sobre los gráficos)',
    [
      ['Espacio', 'Ajustar (ver todo)'],
      ['Z · Shift+Z', 'Zoom a un recuadro (X e Y) · zoom anterior'],
      ['Ctrl+Y', 'Autoescala vertical'],
      ['Ctrl+G', 'Mostrar/ocultar la grilla'],
      ['A', 'Agregar traza (campo de expresión, con autocompletado)'],
      ['P · B', 'Agregar panel · agregar panel debajo del activo'],
      ['U · D', 'Mover el panel activo arriba · abajo'],
      ['Backspace', 'Quitar trazas: click en el nombre (Esc termina)'],
      ['C · Shift+C', 'Cursores · borrar los cursores'],
      ['Shift+S', 'Elegir qué corridas de un .step mostrar'],
      ['O · Ctrl+Espacio', 'Abrir una vista .plt · volver a aplicar la vista recordada'],
      ['Ctrl+Z · Ctrl+Shift+Z', 'Deshacer · rehacer los cambios de la vista (trazas, paneles, colores)'],
      ['Alt+R · Alt+S · Ctrl+L', 'Simular · abortar · log'],
    ],
  ],
  [
    'Modo Netlist',
    [
      ['Alt+R · Ctrl+Enter', 'Simular'],
      ['Alt+S', 'Abortar'],
      ['Ctrl+L', 'Ver el log'],
      ['Ctrl+G', 'Ir a una línea'],
    ],
  ],
];

export function HelpDialog({ onClose }: { onClose(): void }) {
  return (
    <Modal title="Atajos de teclado" onClose={onClose} wide>
      {SHORTCUTS.map(([section, rows]) => (
        <section key={section}>
          <h3>{section}</h3>
          <table className="shortcuts">
            <tbody>
              {rows.map(([k, d]) => (
                <tr key={k}>
                  <th>
                    {k.split(' · ').map((x, i) => (
                      <span key={i}>
                        {i > 0 && ' · '}
                        <kbd>{x}</kbd>
                      </span>
                    ))}
                  </th>
                  <td>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <p className="hint">En táctil: pellizcar para zoom, dos dedos para desplazar, mantener apretado para editar.</p>
      <div className="buttons">
        <button className="primary" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  );
}

/** Shift+S en el visor: qué corridas de un .step se muestran */
export function RunsDialog({ runs, hidden, onApply, onClose }: {
  runs: { name: string; label: string }[];
  hidden: Set<string>;
  onApply(hidden: Set<string>): void;
  onClose(): void;
}) {
  const [off, setOff] = useState(() => new Set(hidden));
  const toggle = (name: string) => {
    const next = new Set(off);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setOff(next);
  };
  return (
    <Modal title="Corridas a mostrar" onClose={onClose}>
      <div className="runs-list">
        {runs.map((r) => (
          <label key={r.name} className="check">
            <input type="checkbox" checked={!off.has(r.name)} onChange={() => toggle(r.name)} /> {r.label}
          </label>
        ))}
      </div>
      <div className="buttons">
        <button onClick={() => setOff(new Set())}>Todas</button>
        <button onClick={() => setOff(new Set(runs.map((r) => r.name)))}>Ninguna</button>
        <button onClick={onClose}>Cancelar</button>
        <button className="primary" disabled={off.size === runs.length} onClick={() => onApply(off)}>
          Aceptar
        </button>
      </div>
    </Modal>
  );
}

export function AboutDialog({ repo, onClose }: { repo: string; onClose(): void }) {
  return (
    <Modal title="Acerca de TurboSpice" onClose={onClose}>
      <div className="welcome about">
        <h3><Logo size={28} /> <span><span className="logo">Turbo</span>Spice</span></h3>
        <p>
          Un simulador de circuitos tipo LTspice que corre entero en tu navegador (ngspice en WebAssembly): nada se sube a
          ningún servidor. Abre y guarda <code>.asc</code> de LTspice, así que podés ir y volver entre los dos.
        </p>
        <ul>
          <li>
            <a href={repo} target="_blank" rel="noopener noreferrer">Código fuente y reporte de problemas</a>
          </li>
          <li>
            <a href="privacidad.html" target="_blank" rel="noopener noreferrer">Política de privacidad</a>
          </li>
          <li>Simulación con <strong>ngspice</strong>; formato de esquemáticos <code>.asc</code> de LTspice.</li>
        </ul>
      </div>
      <div className="buttons">
        <button className="primary" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  );
}

export interface UserFileInfo {
  name: string;
  kind: 'symbol' | 'model' | 'schematic';
  /** .subckt definidos (modelos) o puertos (bloques) */
  items: string[];
}

/** Símbolos, modelos y bloques propios del usuario (guardados en el navegador) */
export function UserFilesDialog({ files, hasSymbol, onAdd, onRemove, onMakeSymbol, onClose }: {
  files: UserFileInfo[];
  hasSymbol(name: string): boolean;
  onAdd(files: File[]): void;
  onRemove(name: string): void;
  onMakeSymbol(file: string, name: string): void;
  onClose(): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const section = (kind: UserFileInfo['kind'], title: string, empty: string) => {
    const list = files.filter((f) => f.kind === kind);
    return (
      <section className="userfiles-section">
        <h3>{title}</h3>
        {list.length ? (
          <ul>
            {list.map((f) => (
              <li key={f.name}>
                <div className="uf-head">
                  <code>{f.name}</code>
                  <button className="danger small" onClick={() => onRemove(f.name)} aria-label={`Quitar ${f.name}`}>Quitar</button>
                </div>
                {kind === 'model' && f.items.length > 0 && (
                  <div className="uf-items">
                    {f.items.map((sub) =>
                      hasSymbol(sub) ? (
                        <span key={sub} className="uf-done" title="Ya hay un símbolo con este nombre">✓ {sub}</span>
                      ) : (
                        <button key={sub} onClick={() => onMakeSymbol(f.name, sub)} title={`Crear un símbolo para el subcircuito ${sub}`}>
                          Crear símbolo de {sub}
                        </button>
                      ),
                    )}
                  </div>
                )}
                {kind === 'schematic' && (
                  <div className="uf-items">
                    <span className="hint">Puertos: {f.items.join(', ') || '(sin etiquetas)'}</span>
                    {hasSymbol(f.name.replace(/\.asc$/i, '')) ? (
                      <span className="uf-done">✓ símbolo de bloque</span>
                    ) : (
                      <button onClick={() => onMakeSymbol(f.name, f.name.replace(/\.asc$/i, ''))}>Crear símbolo de bloque</button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">{empty}</p>
        )}
      </section>
    );
  };
  return (
    <Modal title="Mis símbolos y modelos" onClose={onClose} wide>
      <p className="hint">
        Se guardan en este navegador. Los símbolos (<code>.asy</code>) aparecen en el buscador (F2); los modelos (<code>.lib</code>,{' '}
        <code>.sub</code>, <code>.mod</code>) se usan al simular como si estuvieran junto al <code>.asc</code>; un <code>.asc</code> con
        su símbolo de bloque se usa como subcircuito (jerarquía, como en LTspice).
      </p>
      <div className="buttons left">
        <button className="primary" onClick={() => input.current?.click()}>Agregar archivos…</button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept=".asy,.lib,.sub,.mod,.inc,.cir,.txt,.lb,.asc"
          aria-label="Archivos de símbolos y modelos"
          onChange={(e) => {
            if (e.target.files?.length) onAdd([...e.target.files]);
            e.target.value = '';
          }}
        />
      </div>
      {section('symbol', 'Símbolos', 'Ninguno todavía.')}
      {section('model', 'Modelos y subcircuitos', 'Ninguno todavía.')}
      {section('schematic', 'Bloques jerárquicos (.asc)', 'Ninguno todavía.')}
      <div className="buttons">
        <button className="primary" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  );
}
