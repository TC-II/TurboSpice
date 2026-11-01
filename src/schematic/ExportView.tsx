// Exportar (#326): vista a pantalla completa con la hoja tal como sale. Dibuja el mismo
// esquemático que la pantalla (SchematicCanvas y las capas del OP y de las corrientes) con el tema
// de impresión: fondo blanco, todo negro, sin grilla ni selección. La hoja es la caja del dibujo
// ajustada a la grilla de 16, a 1 unidad = 1 pt, y de ella salen el PDF, el SVG y el PNG.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AscDoc } from '../asc/model.ts';
import type { Library } from '../library/library.ts';
import type { Connectivity } from '../netlist/connectivity.ts';
import { isNgspiceComment } from '../netlist/directives.ts';
import { t } from '../i18n/i18n.ts';
import { SchematicCanvas } from './SchematicCanvas.tsx';
import { CurrentArrowsLayer, type CurrentArrow } from './currentArrows.tsx';
import { AnnotationLayer, type Annotation } from './NetNames.tsx';
import { download, schematicPng, sheetBox, sheetPdf, sheetSvg } from './exportSchematic.ts';
import { FONTS, fontChoice, loadFont } from './fonts.ts';
import { useMathJax } from './latex.ts';

/** Capas opcionales de la hoja: apagadas de entrada */
interface Layers {
  op: boolean;
  currents: boolean;
  directives: boolean;
  /** trazo Tremor (#330): cables y símbolos a mano alzada */
  tremor: boolean;
}

/** Letras de la hoja (#328): las que el PDF puede incrustar; de entrada, Latin Modern (la de LaTeX) */
const SHEET_FONTS = FONTS.filter((f) => f.font);
const SHEET_FONT_KEY = 'turbospice.sheetFont';
const savedFont = () => {
  try {
    return localStorage.getItem(SHEET_FONT_KEY);
  } catch {
    return null;
  }
};

/** Píxeles por punto del PNG (~288 ppp) */
const PNG_SCALE = 4;
/** 1 pt en mm, para mostrar el tamaño de la hoja */
const PT_MM = 25.4 / 72;

export function ExportView({ doc, lib, conn, name, annotations, arrows, onClose, onMessage }: {
  doc: AscDoc;
  lib: Library;
  conn: Connectivity;
  /** nombre de los archivos que se descargan, sin extensión */
  name: string;
  /** valores del punto de operación, si hay uno simulado */
  annotations?: Annotation[];
  /** flechas de corriente, si hay una simulación del circuito */
  arrows?: CurrentArrow[];
  onClose(): void;
  onMessage(text: string): void;
}) {
  const [layers, setLayers] = useState<Layers>({ op: false, currents: false, directives: false, tremor: false });
  const [page, setPage] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const contentRef = useRef<SVGGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [fontId, setFontId] = useState(() => (SHEET_FONTS.some((f) => f.id === savedFont()) ? savedFont()! : 'lmodern'));
  const choice = fontChoice(fontId);
  const FONT = choice.font!;
  // la hoja se mide recién con la letra cargada (cambia el ancho de los textos), y con las fórmulas
  const [font, setFont] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadFont(choice).then(
      () => alive && setFont(choice.id),
      (e) => onMessage(t('Could not export: {p0}', { p0: (e as Error).message })),
    );
    return () => {
      alive = false;
    };
  }, [choice, onMessage]);
  const mathVersion = useMathJax();
  const pickFont = (id: string) => {
    setFontId(id);
    try {
      localStorage.setItem(SHEET_FONT_KEY, id);
    } catch {
      // (sin recordarla)
    }
  };

  // sin las directivas, la hoja lleva sólo los comentarios
  const shown = useMemo(
    () => (layers.directives ? doc : { ...doc, texts: doc.texts.filter((x) => x.kind !== 'directive' && !(x.kind === 'comment' && isNgspiceComment(x.text))) }),
    [doc, layers.directives],
  );
  const op = layers.op && annotations?.length ? annotations : undefined;
  const cur = layers.currents && arrows?.length ? arrows : undefined;

  // la hoja se mide sobre lo dibujado (con las letras de la hoja), no sobre el modelo
  useLayoutEffect(() => {
    const g = contentRef.current;
    if (!g) return;
    const b = g.getBBox();
    setPage(b.width || b.height ? sheetBox({ x: b.x, y: b.y, w: b.width, h: b.height }) : null);
  }, [shown, op, cur, lib, font, layers.tremor, mathVersion]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStage({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  // la hoja entra entera en la vista previa (sin agrandarla más de 3 veces)
  const fit = page && stage.w && stage.h ? Math.min((stage.w - 48) / page.w, (stage.h - 48) / page.h, 3) : 1;

  const svgText = () => (svgRef.current && page ? sheetSvg(svgRef.current, page) : null);
  const run = async (what: 'pdf' | 'svg' | 'png' | 'copy' | 'tex') => {
    const text = svgText();
    if (!text || !page) return;
    setBusy(true);
    try {
      if (what === 'tex') {
        if (!contentRef.current) return;
        // el generador de TikZ se baja recién al exportar
        const { sheetTikz } = await import('./tikz.ts');
        download(`${name}.tex`, new Blob([sheetTikz(contentRef.current, page, { name, skin: lib.skinName + (layers.tremor ? ' (Tremor)' : '') })], { type: 'application/x-tex' }));
      } else if (what === 'svg') download(`${name}.svg`, new Blob([text], { type: 'image/svg+xml' }));
      else if (what === 'pdf') download(`${name}.pdf`, await sheetPdf(text, page, FONT));
      else {
        // el SVG mide en pt: 1 pt = 4/3 px CSS
        const png = await schematicPng(text, (PNG_SCALE * 3) / 4);
        if (!png) throw new Error('PNG');
        if (what === 'png') download(`${name}.png`, png);
        else {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
          onMessage(t('Image copied to the clipboard'));
        }
      }
    } catch (e) {
      onMessage(t('Could not export: {p0}', { p0: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  const check = (key: keyof Layers, label: string, available: boolean, title?: string) => (
    <label className={available ? undefined : 'disabled'} title={available ? title : t('Run a simulation of this circuit first')}>
      <input type="checkbox" checked={available && layers[key]} disabled={!available} onChange={(e) => setLayers({ ...layers, [key]: e.target.checked })} />
      {label}
    </label>
  );

  return (
    <div className="export-view" role="dialog" aria-label={t('Export')}>
      <div className="export-stage" ref={stageRef}>
        <svg
          ref={svgRef}
          className="export-sheet"
          style={{ '--sheet-font': choice.css, '--sheet-bold': choice.bold ? 700 : 400 } as React.CSSProperties}
          viewBox={page ? `${page.x} ${page.y} ${page.w} ${page.h}` : '0 0 1 1'}
          width={page ? page.w * fit : 0}
          height={page ? page.h * fit : 0}
        >
          <g ref={contentRef}>
            <SchematicCanvas doc={shown} lib={lib} conn={conn} selection={[]} showLoose={false} showSimCommand={layers.directives} tremor={layers.tremor} />
            {cur && <CurrentArrowsLayer items={cur.map((a) => ({ ...a, color: undefined, hl: false }))} />}
            {op && <AnnotationLayer items={op} scale={1} />}
          </g>
        </svg>
        {!page && <div className="export-empty">{t('The schematic is empty')}</div>}
      </div>
      <aside className="export-panel">
        <h2>{t('Export')}</h2>
        <section>
          <h3>{t('Include')}</h3>
          {check('op', t('Operating point values'), !!annotations?.length)}
          {check('currents', t('Current arrows'), !!arrows?.length)}
          {check('directives', t('SPICE directives'), true)}
        </section>
        <section>
          <h3>{t('Style')}</h3>
          <label className="choice">
            {t('Font')}{' '}
            <select value={choice.id} onChange={(e) => pickFont(e.target.value)}>
              {SHEET_FONTS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </label>
          {check('tremor', t('Tremor stroke'), true, t('Wires and symbols drawn freehand (the same sheet always comes out the same)'))}
        </section>
        <section>
          <h3>{t('Sheet')}</h3>
          <p className="hint">
            {page ? `${page.w} × ${page.h} pt (${(page.w * PT_MM).toFixed(0)} × ${(page.h * PT_MM).toFixed(0)} mm)` : '—'}
          </p>
          <p className="hint">{t('Fitted to the drawing on a 16 pt grid, one cell of margin')}</p>
        </section>
        <section className="export-actions">
          <button className="primary" disabled={!page || busy || font !== choice.id} onClick={() => run('pdf')}>{t('Download PDF')}</button>
          <button disabled={!page || busy} onClick={() => run('svg')}>{t('Download SVG')}</button>
          <button disabled={!page || busy} onClick={() => run('png')}>{t('Download PNG')}</button>
          <button disabled={!page || busy} onClick={() => run('tex')} title={t('Standalone LaTeX file with the drawing in TikZ; text between $…$ goes to LaTeX as written')}>{t('Download .tex (TikZ)')}</button>
          <button disabled={!page || busy || !('ClipboardItem' in window)} onClick={() => run('copy')}>{t('Copy image')}</button>
        </section>
        <button className="export-close" onClick={onClose}>{t('Close')}</button>
      </aside>
    </div>
  );
}
