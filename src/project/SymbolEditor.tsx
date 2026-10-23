// Vista partida de un subcircuito (#180): a la derecha del esquemático, su símbolo (los pines se
// arrastran, el cuerpo se agranda desde las esquinas) y sus parámetros con su valor por defecto.
import { useEffect, useMemo, useRef, useState } from 'react';
import { GRID } from '../asc/model.ts';
import { parseAsy } from '../asc/parse.ts';
import { formatParamList, movePin, resizeBody, symBody, symParams, symPins } from './symbolEdit.ts';
import { t } from '../i18n/i18n.ts';

type Drag = { kind: 'pin'; index: number } | { kind: 'corner'; cx: 0 | 1; cy: 0 | 1 };

const snap = (v: number) => Math.round(v / GRID) * GRID;

export function SymbolEditor({ name, text, ports, onChange, onParams, onReset }: {
  name: string;
  text: string;
  /** puertos del esquemático (para avisar los que no tienen pin) */
  ports: string[];
  onChange(text: string): void;
  onParams(ps: [string, string][]): void;
  /** volver al símbolo generado (rectángulo con los puertos a los costados) */
  onReset(): void;
}) {
  // mientras se arrastra se dibuja una copia local; al soltar se guarda
  const [live, setLive] = useState(text);
  useEffect(() => setLive(text), [text]);
  const drag = useRef<Drag | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const def = useMemo(() => parseAsy(live, name), [live, name]);
  const pins = useMemo(() => symPins(live), [live]);
  const body = symBody(live);
  // vista: lo que ocupa el símbolo (fija mientras se arrastra, para que no salte)
  const [box, setBox] = useState<[number, number, number, number]>([0, 0, 0, 0]);
  useEffect(() => {
    if (drag.current) return;
    const xs = [...def.shapes.flatMap((s) => [s.coords[0], s.coords[2]]), ...pins.map((p) => p.x)];
    const ys = [...def.shapes.flatMap((s) => [s.coords[1], s.coords[3]]), ...pins.map((p) => p.y)];
    const x1 = Math.min(0, ...xs) - 48;
    const y1 = Math.min(0, ...ys) - 40;
    setBox([x1, y1, Math.max(0, ...xs) + 48 - x1, Math.max(0, ...ys) + 48 - y1]);
  }, [def, pins]);

  const toDoc = (e: React.PointerEvent) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: snap(p.x), y: snap(p.y) };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toDoc(e);
    if (d.kind === 'pin') setLive((tt) => movePin(tt, d.index, p.x, p.y));
    else if (body) {
      const b = { ...body };
      if (d.cx) b.x2 = Math.max(p.x, b.x1 + 2 * GRID);
      else b.x1 = Math.min(p.x, b.x2 - 2 * GRID);
      if (d.cy) b.y2 = Math.max(p.y, b.y1 + 2 * GRID);
      else b.y1 = Math.min(p.y, b.y2 - 2 * GRID);
      setLive((tt) => resizeBody(tt, b));
    }
  };
  const up = () => {
    if (!drag.current) return;
    drag.current = null;
    if (live !== text) onChange(live);
  };
  const start = (d: Drag) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = d;
  };

  const shape = (s: (typeof def.shapes)[number], i: number) => {
    const [a, b, c, d] = s.coords;
    if (s.kind === 'LINE') return <line key={i} x1={a} y1={b} x2={c} y2={d} />;
    if (s.kind === 'RECTANGLE') return <rect key={i} x={Math.min(a, c)} y={Math.min(b, d)} width={Math.abs(c - a)} height={Math.abs(d - b)} />;
    if (s.kind === 'CIRCLE') return <ellipse key={i} cx={(a + c) / 2} cy={(b + d) / 2} rx={Math.abs(c - a) / 2} ry={Math.abs(d - b) / 2} />;
    return null;
  };
  const label = (p: (typeof pins)[number]) => {
    const pos = { LEFT: [p.x + 6, p.y + 4, 'start'], RIGHT: [p.x - 6, p.y + 4, 'end'], TOP: [p.x, p.y + 14, 'middle'], BOTTOM: [p.x, p.y - 6, 'middle'] }[p.align] ?? [p.x + 6, p.y + 4, 'start'];
    return { x: pos[0] as number, y: pos[1] as number, anchor: pos[2] as 'start' | 'end' | 'middle' };
  };
  const missing = ports.filter((n) => !pins.some((p) => p.name.toLowerCase() === n.toLowerCase()));

  return (
    <aside className="sym-pane" aria-label={t('Symbol of {name}', { name })}>
      <header>
        <strong>{t('Symbol')}</strong>
        <span className="tree-meta">{t('drag the pins and the corners')}</span>
        <button className="tree-add" onClick={onReset} title={t('Back to the generated symbol: a rectangle with the ports on the sides')}>
          {t('Redo')}
        </button>
      </header>
      <svg ref={svg} className="sym-canvas" viewBox={box.join(' ')} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <defs>
          <pattern id="sym-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse" x={0} y={0}>
            <circle cx={0} cy={0} r={0.9} className="sym-dot" />
          </pattern>
        </defs>
        <rect x={box[0]} y={box[1]} width={box[2]} height={box[3]} fill="url(#sym-grid)" />
        <g className="sym-shapes">{def.shapes.map(shape)}</g>
        <text x={0} y={(body?.y1 ?? 0) - 10} className="sym-title" textAnchor="middle">
          {name}
        </text>
        {body &&
          ([0, 1] as const).flatMap((cx) =>
            ([0, 1] as const).map((cy) => (
              <rect
                key={`${cx}${cy}`}
                className="sym-corner"
                x={(cx ? body.x2 : body.x1) - 4}
                y={(cy ? body.y2 : body.y1) - 4}
                width={8}
                height={8}
                onPointerDown={start({ kind: 'corner', cx, cy })}
              >
                <title>{t('Resize')}</title>
              </rect>
            )),
          )}
        {pins.map((p, i) => {
          const l = label(p);
          return (
            <g key={i} className="sym-pin" onPointerDown={start({ kind: 'pin', index: i })}>
              <rect x={p.x - 5} y={p.y - 5} width={10} height={10} />
              <text x={l.x} y={l.y} textAnchor={l.anchor}>
                {p.name}
              </text>
              <title>{t('{name} (order {n})', { name: p.name, n: p.order })}</title>
            </g>
          );
        })}
      </svg>
      {missing.length > 0 && <p className="tree-warn">{t('Ports without a pin: {ports}', { ports: missing.join(', ') })}</p>}
      <ParamsEditor key={formatParamList(symParams(text))} params={symParams(text)} onChange={onParams} />
    </aside>
  );
}

/** Parámetros del subcircuito: nombre y valor por defecto; adentro se usan como {nombre} */
function ParamsEditor({ params, onChange }: { params: [string, string][]; onChange(ps: [string, string][]): void }) {
  const [rows, setRows] = useState(params);
  const valid = (ps: [string, string][]) => ps.filter(([k, v]) => /^[A-Za-z_]\w*$/.test(k.trim()) && v.trim());
  const commit = (ps = rows) => {
    const next = valid(ps).map(([k, v]) => [k.trim(), v.trim()] as [string, string]);
    if (formatParamList(next) !== formatParamList(params)) onChange(next);
  };
  return (
    <div className="sym-params">
      <h4>
        {t('Parameters')}
        <button className="tree-add" onClick={() => setRows([...rows, ['', '']])}>
          + {t('Add')}
        </button>
      </h4>
      {rows.length ? (
        <table>
          <thead>
            <tr>
              <th>{t('Name')}</th>
              <th>{t('Default value')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, v], i) => (
              <tr key={i}>
                <td>
                  <input value={k} aria-label={t('Parameter name')} spellCheck={false} onChange={(e) => setRows(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} onBlur={() => commit()} />
                </td>
                <td>
                  <input value={v} aria-label={t('Default value of {name}', { name: k })} spellCheck={false} onChange={(e) => setRows(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} onBlur={() => commit()} onKeyDown={(e) => e.key === 'Enter' && commit()} />
                </td>
                <td>
                  <button
                    className="icon-x"
                    aria-label={t('Remove {name}', { name: k })}
                    onClick={() => {
                      const next = rows.filter((_, j) => j !== i);
                      setRows(next);
                      commit(next);
                    }}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="tree-meta">{t('None. Inside the subcircuit they are used as {name} (e.g. a resistor of value {R}); each instance can change them.')}</p>
      )}
    </div>
  );
}
