// Render SVG de un esquemático LTspice (sin interacción: la maneja SchematicEditor).
import { memo, type ReactNode } from 'react';
import type { CircuitDiff, Mark } from '../project/diff.ts';
import { WINDOW_ATTR, type AscDoc, type Flag, type Orient, type Shape, type SymbolDef, type SymbolInst } from '../asc/model.ts';
import { effectiveAttrs, effectiveWindows } from '../asc/resolve.ts';
import { orientMatrix, toWorld, transformAlign } from '../asc/transform.ts';
import type { Library } from '../library/library.ts';
import type { Connectivity } from '../netlist/connectivity.ts';
import { isNgspiceComment } from '../netlist/directives.ts';
import { displayValue, flagDirection, fontSize, junctionPoints, pinPoints, visibleText, type ItemRef } from './geometry.ts';
import { arcAngles, lineDash } from './shapes.ts';
import { parseSource } from '../sim/sources.ts';
import { KINDS } from './sourceIcons.tsx';

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

/** Arco de LTspice: caja de la elipse, (xs,ys) es el FINAL y (xe,ye) el INICIO, antihorario */
function arcPath(c: number[]): string {
  const { cx, cy, rx, ry, a0, span } = arcAngles(c);
  if (span >= 2 * Math.PI) return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy}`;
  const a1 = a0 - span;
  const p0 = { x: cx + rx * Math.cos(a0), y: cy + ry * Math.sin(a0) };
  const p1 = { x: cx + rx * Math.cos(a1), y: cy + ry * Math.sin(a1) };
  return `M ${p0.x} ${p0.y} A ${rx} ${ry} 0 ${span > Math.PI ? 1 : 0} 0 ${p1.x} ${p1.y}`;
}

export function ShapeView({ s, className }: { s: Shape; className?: string }) {
  const c = s.coords;
  const dash = lineDash(s.style);
  switch (s.kind) {
    case 'LINE':
      return <line className={className} x1={c[0]} y1={c[1]} x2={c[2]} y2={c[3]} strokeDasharray={dash} />;
    case 'RECTANGLE':
      return <rect className={className} x={Math.min(c[0], c[2])} y={Math.min(c[1], c[3])} width={Math.abs(c[2] - c[0])} height={Math.abs(c[3] - c[1])} strokeDasharray={dash} />;
    case 'CIRCLE':
      return <ellipse className={className} cx={(c[0] + c[2]) / 2} cy={(c[1] + c[3]) / 2} rx={Math.abs(c[2] - c[0]) / 2} ry={Math.abs(c[3] - c[1]) / 2} strokeDasharray={dash} />;
    case 'ARC':
      return <path className={className} d={arcPath(c)} strokeDasharray={dash} />;
  }
}

const matrix = (o: Orient, x: number, y: number) => `matrix(${orientMatrix(o).join(' ')} ${x} ${y})`;

export const SymbolView = memo(function SymbolView({ inst, def, lib, selected, hover, hideLabels, mark }: {
  inst: SymbolInst;
  def: SymbolDef | undefined;
  lib: Library;
  selected?: boolean;
  /** el cursor está sobre uno de sus rótulos */
  hover?: boolean;
  /** sin rótulos (miniaturas) */
  hideLabels?: boolean;
  /** cambio contra la corrida anterior (historial, #153) */
  mark?: Mark | 'removed';
}) {
  const skin = lib.skin(inst.type);
  const cls = `sym${selected ? ' sel' : ''}${hover ? ' hover' : ''}${def ? '' : ' missing'}${mark ? ` diff-${mark}` : ''}`;
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
  // fuente de tensión: en el medio, el dibujito de su forma de onda (DC usa el símbolo cell)
  const waveKind = inst.type.toLowerCase() === 'voltage' ? parseSource({ Value: attrs.get('Value'), Value2: attrs.get('Value2'), SpiceLine: attrs.get('SpiceLine') })?.kind : undefined;
  const waveIcon = waveKind && waveKind !== 'dc' ? KINDS.find((k) => k.kind === waveKind)?.icon : undefined;
  const labels: ReactNode[] = [];
  for (const [idx, w] of hideLabels ? [] : effectiveWindows(inst, def, lib.windowDefaults)) {
    const key = WINDOW_ATTR[idx];
    if (!key) continue;
    if (idx === 3 && !inst.attrs.has('Value') && HIDE_DEFAULT_VALUE.test(prefix)) continue;
    const raw = attrs.get(key);
    if (!raw) continue;
    const text = idx === 3 ? displayValue(prefix, raw) : raw;
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
          <>
            <g className="skin" dangerouslySetInnerHTML={{ __html: skin.body }} />
            {waveIcon && <g transform="translate(-15 49.5) scale(0.65)" fill="none" className="wave-icon">{waveIcon}</g>}
          </>
        ) : waveIcon ? (
          <>
            <line x1={0} y1={16} x2={0} y2={32} />
            <line x1={0} y1={80} x2={0} y2={96} />
            <circle cx={0} cy={56} r={24} fill="none" />
            <path d="M-4 41H4M0 37V45M-4 71H4" fill="none" />
            <g transform="translate(-15 49.5) scale(0.65)" fill="none" className="wave-icon">{waveIcon}</g>
          </>
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

export function FlagView({ flag, doc, lib, selected, mark }: { flag: Flag; doc: AscDoc; lib: Library; selected?: boolean; mark?: Mark }) {
  const dir = flagDirection(doc, flag);
  const cls = `flag${selected ? ' sel' : ''}${mark ? ` diff-${mark}` : ''}`;
  if (flag.name === '0') {
    const gnd = lib.skin('GND');
    return (
      <g className={cls} transform={matrix(GND_ROT[dir], flag.x, flag.y)}>
        {gnd ? <g className="skin" dangerouslySetInnerHTML={{ __html: gnd.body }} /> : <path d="M -16 0 H 16 M -9 6 H 9 M -3 12 H 3" />}
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
  /** color de los cables de las redes con traza (nombre en minúsculas) */
  netColors?: Map<string, string>;
  /** marcas de pines sueltos (Ctrl+U) */
  showLoose?: boolean;
  /** Ver › Mostrar el comando de simulación */
  showSimCommand?: boolean;
  /** cambios contra la corrida anterior (historial, #153): colores y fantasmas de lo quitado */
  diff?: CircuitDiff;
}

export const SchematicCanvas = memo(function SchematicCanvas({ doc, lib, conn, selection, highlightNet, hoverSymbol, netColors, showLoose = true, showSimCommand = true, diff }: CanvasProps) {
  // (con un Set: con todo seleccionado, buscar en la lista por elemento era O(n²), #184)
  const selected = new Set(selection.map((r) => `${r.kind}:${r.index}`));
  const isSel = (r: ItemRef) => selected.has(`${r.kind}:${r.index}`);

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

  const wireColor = new Map<number, string>();
  if (netColors?.size) for (const n of conn.nets) {
    const c = netColors.get(n.name.toLowerCase());
    if (c) n.wires.forEach((wi) => wireColor.set(wi, c));
  }

  const hl = highlightNet ? conn.nets.find((n) => n.name === highlightNet) : undefined;

  return (
    <g className="schematic">
      <g className="shapes">{doc.shapes.map((s, i) => <ShapeView key={i} s={s} className={isSel({ kind: 'shape', index: i }) ? 'sel' : undefined} />)}</g>
      <g className="wires">
        {doc.wires.map((w, i) => (
          <line
            key={i}
            x1={w.x1}
            y1={w.y1}
            x2={w.x2}
            y2={w.y2}
            className={isSel({ kind: 'wire', index: i }) ? 'sel' : diff?.wires.has(i) ? `diff-${diff.wires.get(i)}` : undefined}
            style={wireColor.has(i) && !isSel({ kind: 'wire', index: i }) ? { stroke: wireColor.get(i) } : undefined}
          />
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
          <SymbolView key={i} inst={s} def={lib.symbol(s.type)} lib={lib} selected={isSel({ kind: 'symbol', index: i })} hover={hoverSymbol === i} mark={diff?.symbols.get(i)} />
        ))}
      </g>
      {diff && (diff.removed.symbols.length > 0 || diff.removed.wires.length > 0) && (
        <g className="diff-ghost">
          {diff.removed.wires.map((w, i) => <line key={i} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} />)}
          {diff.removed.symbols.map((s, i) => <SymbolView key={i} inst={s} def={lib.symbol(s.type)} lib={lib} mark="removed" />)}
        </g>
      )}
      <g className="loose">{showLoose && loose.map((p, i) => <rect key={i} x={p.x - 3} y={p.y - 3} width={6} height={6} />)}</g>
      <g className="texts">
        {doc.texts.map((full, i) => {
          const t = visibleText(full, showSimCommand);
          return !t ? null : (
          <g
            key={i}
            className={`${t.kind === 'comment' && isNgspiceComment(full.text) ? 'directive ngspice' : t.kind}${isSel({ kind: 'text', index: i }) ? ' sel' : ''}${diff?.texts.has(i) ? ' diff-changed' : ''}`}
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
        {doc.flags.map((f, i) => <FlagView key={i} flag={f} doc={doc} lib={lib} selected={isSel({ kind: 'flag', index: i })} mark={diff?.flags.get(i)} />)}
      </g>
    </g>
  );
});
