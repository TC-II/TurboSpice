// Render SVG de un esquemático LTspice (sin interacción: la maneja SchematicEditor).
import { memo, type ReactNode } from 'react';
import { WINDOW_ATTR, type AscDoc, type Flag, type Orient, type Shape, type SymbolDef, type SymbolInst } from '../asc/model.ts';
import { effectiveAttrs, effectiveWindows } from '../asc/resolve.ts';
import { orientMatrix, toWorld, transformAlign } from '../asc/transform.ts';
import type { Library } from '../library/library.ts';
import type { Connectivity } from '../netlist/connectivity.ts';
import { isNgspiceComment } from '../netlist/directives.ts';
import { flagDirection, fontSize, junctionPoints, pinPoints, sameRef, visibleText, type ItemRef } from './geometry.ts';

// Transistores: el Value por defecto del .asy ("NPN") no se muestra (spec §10)
const HIDE_DEFAULT_VALUE = /^(QN|QP|MN|MP|JN|JP)$/i;

/** <text> con la semántica de alineación de LTspice (Left…VBottom, spec §7) */
export function AlignedText({ x, y, align, size, children, className }: {
  x: number;
  y: number;
  align: string;
  size: number;
  children: ReactNode;
  className?: string;
}) {
  if (align === 'Invisible' || size <= 0) return null;
  const vertical = align.startsWith('V');
  const base = vertical ? align.slice(1) : align;
  const anchor = base === 'Left' ? 'start' : base === 'Right' ? 'end' : 'middle';
  const baseline = base === 'Top' ? 'hanging' : base === 'Bottom' ? 'text-after-edge' : 'central';
  return (
    <text
      x={x}
      y={y}
      fontSize={fontSize(size)}
      textAnchor={anchor}
      dominantBaseline={baseline}
      transform={vertical ? `rotate(-90 ${x} ${y})` : undefined}
      className={className}
    >
      {children}
    </text>
  );
}

const STYLE_DASH: Record<string, string> = { '1': '10 5', '2': '2 5', '3': '10 5 2 5', '4': '10 5 2 5 2 5' };

/** Arco de LTspice: caja de la elipse, (xs,ys) es el FINAL y (xe,ye) el INICIO, antihorario */
function arcPath(c: number[]): string {
  const [x1, y1, x2, y2, xEnd, yEnd, xStart, yStart] = c;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rx = Math.abs(x2 - x1) / 2;
  const ry = Math.abs(y2 - y1) / 2;
  const a0 = Math.atan2(yStart - cy, xStart - cx);
  const a1 = Math.atan2(yEnd - cy, xEnd - cx);
  const p0 = { x: cx + rx * Math.cos(a0), y: cy + ry * Math.sin(a0) };
  const p1 = { x: cx + rx * Math.cos(a1), y: cy + ry * Math.sin(a1) };
  const span = (((a0 - a1) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (span < 1e-9) return `M ${x1} ${cy} A ${rx} ${ry} 0 1 0 ${x2} ${cy} A ${rx} ${ry} 0 1 0 ${x1} ${cy}`;
  return `M ${p0.x} ${p0.y} A ${rx} ${ry} 0 ${span > Math.PI ? 1 : 0} 0 ${p1.x} ${p1.y}`;
}

export function ShapeView({ s }: { s: Shape }) {
  const c = s.coords;
  const dash = s.style ? STYLE_DASH[s.style] : undefined;
  switch (s.kind) {
    case 'LINE':
      return <line x1={c[0]} y1={c[1]} x2={c[2]} y2={c[3]} strokeDasharray={dash} />;
    case 'RECTANGLE':
      return <rect x={Math.min(c[0], c[2])} y={Math.min(c[1], c[3])} width={Math.abs(c[2] - c[0])} height={Math.abs(c[3] - c[1])} strokeDasharray={dash} />;
    case 'CIRCLE':
      return <ellipse cx={(c[0] + c[2]) / 2} cy={(c[1] + c[3]) / 2} rx={Math.abs(c[2] - c[0]) / 2} ry={Math.abs(c[3] - c[1]) / 2} strokeDasharray={dash} />;
    case 'ARC':
      return <path d={arcPath(c)} strokeDasharray={dash} />;
  }
}

const matrix = (o: Orient, x: number, y: number) => `matrix(${orientMatrix(o).join(' ')} ${x} ${y})`;

export const SymbolView = memo(function SymbolView({ inst, def, lib, selected, hover, hideLabels }: {
  inst: SymbolInst;
  def: SymbolDef | undefined;
  lib: Library;
  selected?: boolean;
  /** el cursor está sobre uno de sus rótulos */
  hover?: boolean;
  /** sin rótulos (miniaturas) */
  hideLabels?: boolean;
}) {
  const skin = lib.skin(inst.type);
  const cls = `sym${selected ? ' sel' : ''}${hover ? ' hover' : ''}${def ? '' : ' missing'}`;
  if (!def) {
    return (
      <g className={cls}>
        <rect x={inst.x - 16} y={inst.y - 16} width={32} height={32} />
        <text x={inst.x} y={inst.y} fontSize={10} textAnchor="middle" dominantBaseline="central">?</text>
      </g>
    );
  }
  const attrs = effectiveAttrs(inst, def);
  const prefix = attrs.get('Prefix') ?? '';
  const labels: ReactNode[] = [];
  for (const [idx, w] of hideLabels ? [] : effectiveWindows(inst, def, lib.windowDefaults)) {
    const key = WINDOW_ATTR[idx];
    if (!key) continue;
    if (idx === 3 && !inst.attrs.has('Value') && HIDE_DEFAULT_VALUE.test(prefix)) continue;
    const text = attrs.get(key);
    if (!text) continue;
    const p = toWorld(inst, w.x, w.y);
    labels.push(
      <AlignedText key={idx} x={p.x} y={p.y} align={transformAlign(w.align, inst.orient)} size={w.size} className="win">
        {text}
      </AlignedText>,
    );
  }
  return (
    <g className={cls}>
      <g transform={matrix(inst.orient, inst.x, inst.y)} className="body">
        {skin ? (
          <g dangerouslySetInnerHTML={{ __html: skin.body }} />
        ) : (
          <>
            {def.shapes.map((s, i) => <ShapeView key={i} s={s} />)}
            {def.texts.map((t, i) => (
              <AlignedText key={`t${i}`} x={t.x} y={t.y} align={t.align} size={t.size}>{t.text}</AlignedText>
            ))}
          </>
        )}
      </g>
      {labels}
    </g>
  );
});

const GND_ROT: Record<string, Orient> = { top: 'R0', right: 'R90', bottom: 'R180', left: 'R270' };
const FLAG_TEXT: Record<string, { align: string; dx: number; dy: number }> = {
  top: { align: 'Top', dx: 0, dy: 8 },
  bottom: { align: 'Bottom', dx: 0, dy: -8 },
  left: { align: 'Left', dx: 8, dy: 0 },
  right: { align: 'Right', dx: -8, dy: 0 },
};

function FlagView({ flag, doc, lib, selected }: { flag: Flag; doc: AscDoc; lib: Library; selected?: boolean }) {
  const dir = flagDirection(doc, flag);
  const cls = `flag${selected ? ' sel' : ''}`;
  if (flag.name === '0') {
    const gnd = lib.skin('GND');
    return (
      <g className={cls} transform={matrix(GND_ROT[dir], flag.x, flag.y)}>
        {gnd ? <g dangerouslySetInnerHTML={{ __html: gnd.body }} /> : <path d="M -16 0 H 16 M -9 6 H 9 M -3 12 H 3" />}
      </g>
    );
  }
  const t = FLAG_TEXT[dir];
  return (
    <g className={cls}>
      <circle cx={flag.x} cy={flag.y} r={3.6} className="flagdot" />
      <AlignedText x={flag.x + t.dx} y={flag.y + t.dy} align={t.align} size={2} className="flagname">
        {flag.ioPin ? `${flag.name} [${flag.ioPin}]` : flag.name}
      </AlignedText>
    </g>
  );
}

export interface CanvasProps {
  doc: AscDoc;
  lib: Library;
  conn: Connectivity;
  selection: ItemRef[];
  /** red resaltada (probe o hover) */
  highlightNet?: string;
  /** símbolo resaltado porque el cursor está sobre uno de sus rótulos */
  hoverSymbol?: number;
  /** marcas de pines sueltos (Ctrl+U) */
  showLoose?: boolean;
  /** Ver › Mostrar el comando de simulación */
  showSimCommand?: boolean;
}

export const SchematicCanvas = memo(function SchematicCanvas({ doc, lib, conn, selection, highlightNet, hoverSymbol, showLoose = true, showSimCommand = true }: CanvasProps) {
  const isSel = (r: ItemRef) => selection.some((s) => sameRef(s, r));

  // Puntos de unión, como los marca LTspice (spec §8.3)
  const junctions = junctionPoints(doc, lib);

  // Pines sueltos (LTspice los marca con un cuadradito)
  const loose: { x: number; y: number }[] = [];
  doc.symbols.forEach((s, si) => {
    const def = lib.symbol(s.type);
    pinPoints(s, def).forEach((p, pi) => {
      const net = conn.pinNet.get(`${si}:${pi}`);
      if (!net || (net.pins.length === 1 && !net.wires.length && !net.labels.length)) loose.push(p);
    });
  });

  const hl = highlightNet ? conn.nets.find((n) => n.name === highlightNet) : undefined;

  return (
    <g className="schematic">
      <g className="shapes">{doc.shapes.map((s, i) => <ShapeView key={i} s={s} />)}</g>
      <g className="wires">
        {doc.wires.map((w, i) => (
          <line key={i} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} className={isSel({ kind: 'wire', index: i }) ? 'sel' : undefined} />
        ))}
      </g>
      {hl && (
        <g className="net-hl">
          {hl.wires.map((wi) => {
            const w = doc.wires[wi];
            return <line key={wi} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} />;
          })}
          {hl.pins.map((p, i) => <circle key={i} cx={p.at.x} cy={p.at.y} r={4} />)}
        </g>
      )}
      <g className="junctions">{junctions.map(({ x, y }) => <circle key={`${x},${y}`} cx={x} cy={y} r={4} />)}</g>
      <g className="symbols">
        {doc.symbols.map((s, i) => (
          <SymbolView key={i} inst={s} def={lib.symbol(s.type)} lib={lib} selected={isSel({ kind: 'symbol', index: i })} hover={hoverSymbol === i} />
        ))}
      </g>
      <g className="loose">{showLoose && loose.map((p, i) => <rect key={i} x={p.x - 3} y={p.y - 3} width={6} height={6} />)}</g>
      <g className="texts">
        {doc.texts.map((full, i) => {
          const t = visibleText(full, showSimCommand);
          return !t ? null : (
          <g
            key={i}
            className={`${t.kind === 'comment' && isNgspiceComment(full.text) ? 'directive ngspice' : t.kind}${isSel({ kind: 'text', index: i }) ? ' sel' : ''}`}
          >
            {t.text.split('\\n').map((line, j) => (
              <AlignedText key={j} x={t.x} y={t.y + j * fontSize(t.size) * 1.2} align={t.align} size={t.size}>
                {line}
              </AlignedText>
            ))}
          </g>
          );
        })}
      </g>
      <g className="flags">
        {doc.flags.map((f, i) => <FlagView key={i} flag={f} doc={doc} lib={lib} selected={isSel({ kind: 'flag', index: i })} />)}
      </g>
    </g>
  );
});
