// Exportar (#326): vista a pantalla completa con la hoja tal como sale. Dibuja el mismo
// esquemático que la pantalla (SchematicCanvas y las capas del OP y de las corrientes) con el tema
// de impresión: fondo blanco, todo negro, sin grilla ni selección. La hoja es la caja del dibujo
// ajustada a la grilla de 16, a 1 unidad = 1 pt, y de ella salen el PDF, el SVG y el PNG.
// Queda debajo de la barra de la app (la marca y el estilo siguen a la vista); las herramientas
// del esquemático dejan su lugar a las de la vista previa: zoom, mover y elegir un área.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AscDoc } from '../asc/model.ts';
import { DEFAULT_SKIN, type Library } from '../library/library.ts';
import type { Connectivity } from '../netlist/connectivity.ts';
import { isNgspiceComment } from '../netlist/directives.ts';
import { t } from '../i18n/i18n.ts';
import { Toolbar, type ToolGroup } from '../ui/Toolbar.tsx';
import { Icon } from '../ui/icons.tsx';
import { SchematicCanvas } from './SchematicCanvas.tsx';
import { CurrentArrowsLayer, type CurrentArrow } from './currentArrows.tsx';
import { AnnotationLayer, type Annotation } from './NetNames.tsx';
import { download, pngWithText, schematicPng, sheetBox, sheetPdf, sheetSvg } from './exportSchematic.ts';
import { sheetTikz } from './tikz.ts';
import { FONTS, fontChoice, loadFont } from './fonts.ts';
import { useMathJax } from './latex.ts';

type Rect = { x: number; y: number; w: number; h: number };

/** Capas opcionales de la hoja: apagadas de entrada */
interface Layers {
  op: boolean;
  currents: boolean;
  directives: boolean;
}

/**
 * El skin Tremor (#330): el Default trazado a mano alzada. No es una carpeta de library/skins
 * sino el trazo de roughPen, pero se elige como un skin más (no va sobre los otros)
 */
export const TREMOR = 'Tremor';

/** La letra que sugiere cada skin al elegirlo (después se puede cambiar) */
const SKIN_FONT: Record<string, string> = { [DEFAULT_SKIN]: 'lmodern', [TREMOR]: 'comicrelief', 'Boca Jrs': 'arimo' };

/** Letras de la hoja (#328): las que el PDF puede incrustar, primero las de los skins en su orden */
const SKIN_ORDER = [DEFAULT_SKIN, TREMOR, 'Boca Jrs'].map((s) => SKIN_FONT[s]);
const rank = (id: string) => (SKIN_ORDER.includes(id) ? SKIN_ORDER.indexOf(id) : SKIN_ORDER.length);
const SHEET_FONTS = FONTS.filter((f) => f.font).sort((a, b) => rank(a.id) - rank(b.id));

/** Lo que se recuerda de cada dibujo */
interface Settings {
  skin: string;
  font: string;
  layers: Layers;
  /** sólo esta parte de la hoja (pt); null: la hoja entera */
  area: Rect | null;
}

const DEFAULTS: Settings = { skin: DEFAULT_SKIN, font: SKIN_FONT[DEFAULT_SKIN], layers: { op: false, currents: false, directives: false }, area: null };
const settingsKey = (key: string) => `turbospice.export.${key}`;

function loadSettings(key: string): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(settingsKey(key)) ?? 'null') as Partial<Settings> | null;
    return s ? { ...DEFAULTS, ...s, layers: { ...DEFAULTS.layers, ...s.layers } } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

/** Píxeles por punto del PNG (~288 ppp) */
const PNG_SCALE = 4;
/** 1 pt en mm, para mostrar el tamaño de la hoja */
const PT_MM = 25.4 / 72;
/** El área se ajusta a media celda de la grilla (8 pt): los cables del borde no quedan cortados al medio */
const AREA_SNAP = 8;
/** Zoom de la vista previa, relativo a la hoja entera en pantalla */
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 16;
/** Margen alrededor de la hoja al ajustarla a la vista (px) */
const FIT_PAD = 32;

export function ExportView({ doc, lib, conn, name, storeKey, annotations, arrows, toolsSlot, tabsSlot, onClose, onMessage }: {
  doc: AscDoc;
  /** la librería de la pantalla: la hoja usa el skin que se elige acá */
  lib: Library;
  conn: Connectivity;
  /** nombre de los archivos que se descargan, sin extensión */
  name: string;
  /** de qué dibujo son las opciones que se recuerdan (proyecto, testbench, subcircuito) */
  storeKey: string;
  /** valores del punto de operación, si hay uno simulado */
  annotations?: Annotation[];
  /** flechas de corriente, si hay una simulación del circuito */
  arrows?: CurrentArrow[];
  /** el lugar de las herramientas en la barra de la app */
  toolsSlot?: HTMLElement | null;
  /** el lugar de las pestañas (Schematic, Results) en la barra de la app */
  tabsSlot?: HTMLElement | null;
  onClose(): void;
  onMessage(text: string): void;
}) {
  const [settings, setSettings] = useState(() => loadSettings(storeKey));
  const set = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));
  useEffect(() => {
    try {
      localStorage.setItem(settingsKey(storeKey), JSON.stringify(settings));
    } catch {
      // (sin recordarlas)
    }
  }, [settings, storeKey]);

  // skins: el Default, Tremor y los de library/skins; uno que ya no está vuelve al Default
  const skins = useMemo(() => [DEFAULT_SKIN, TREMOR, ...lib.skinNames().filter((s) => s !== DEFAULT_SKIN && s !== TREMOR)], [lib]);
  const skin = skins.includes(settings.skin) ? settings.skin : DEFAULT_SKIN;
  const tremor = skin === TREMOR;
  const sheetLib = useMemo(() => lib.withSkin(tremor ? DEFAULT_SKIN : skin), [lib, skin, tremor]);
  const pickSkin = (s: string) => set({ skin: s, ...(SKIN_FONT[s] ? { font: SKIN_FONT[s] } : {}) });

  const { layers, area } = settings;
  const choice = fontChoice(SHEET_FONTS.some((f) => f.id === settings.font) ? settings.font : SKIN_FONT[DEFAULT_SKIN]);
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

  const [sheet, setSheet] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const contentRef = useRef<SVGGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });

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
    setSheet(b.width || b.height ? sheetBox({ x: b.x, y: b.y, w: b.width, h: b.height }) : null);
  }, [shown, op, cur, sheetLib, font, tremor, mathVersion]);

  // lo que se exporta: el área elegida o la hoja entera
  const page = sheet && area ? area : sheet;

  // --- vista previa: zoom y paneo; con «Select area», arrastrar marca el área ---
  const [picking, setPicking] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const shownBox = picking ? sheet : page;
  const fitView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  // al cambiar lo que se ve (área sí/no), se vuelve a ver entero
  useEffect(fitView, [shownBox?.x, shownBox?.y, shownBox?.w, shownBox?.h]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStage({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // la hoja entra entera en la vista previa (sin agrandarla más de 3 veces) y el zoom va sobre eso
  const fit = shownBox && stage.w && stage.h ? Math.min((stage.w - 2 * FIT_PAD) / shownBox.w, (stage.h - 2 * FIT_PAD) / shownBox.h, 3) : 1;
  const scale = fit * zoom;
  const W = shownBox ? shownBox.w * scale : 0;
  const H = shownBox ? shownBox.h * scale : 0;
  const left = stage.w / 2 - W / 2 + pan.x;
  const top = stage.h / 2 - H / 2 + pan.y;

  /** Zoom por `k` dejando quieto el punto (mx, my) de la vista previa */
  const zoomAt = (k: number, mx = stage.w / 2, my = stage.h / 2) => {
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * k));
    const r = z / zoom;
    if (r === 1) return;
    // el punto bajo el cursor queda donde está: left' = mx - (mx - left)·r
    setPan({ x: mx - (mx - left) * r - stage.w / 2 + (W * r) / 2, y: my - (my - top) * r - stage.h / 2 + (H * r) / 2 });
    setZoom(z);
  };
  // (la rueda con passive: false, para que no desplace la página)
  const zoomRef = useRef(zoomAt);
  zoomRef.current = zoomAt;
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomRef.current(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  /** Punto de la vista previa → coordenadas de la hoja (pt) */
  const toSheet = (mx: number, my: number) => (shownBox ? { x: shownBox.x + ((mx - left) / W) * shownBox.w, y: shownBox.y + ((my - top) / H) * shownBox.h } : { x: 0, y: 0 });
  const local = (e: React.PointerEvent) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const [grab, setGrab] = useState<{ x: number; y: number; px: number; py: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (!shownBox || (e.button !== 0 && e.button !== 1)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    const s = toSheet(p.x, p.y);
    // con «Select area», el botón izquierdo sobre la hoja marca el área; fuera de ella (o con el
    // botón del medio), arrastra la vista como siempre
    const onSheet = !!sheet && s.x >= sheet.x && s.x <= sheet.x + sheet.w && s.y >= sheet.y && s.y <= sheet.y + sheet.h;
    if (picking && e.button === 0 && onSheet) {
      setDrag({ x0: s.x, y0: s.y, x1: s.x, y1: s.y });
    } else setGrab({ x: p.x, y: p.y, px: pan.x, py: pan.y });
  };
  // al elegir el área, una cruz fina sigue al cursor sobre toda la hoja (para ubicar el recorte)
  const [aim, setAim] = useState<{ x: number; y: number } | null>(null);
  const onMove = (e: React.PointerEvent) => {
    const p = local(e);
    if (picking) setAim(toSheet(p.x, p.y));
    if (drag) {
      const s = toSheet(p.x, p.y);
      setDrag({ ...drag, x1: s.x, y1: s.y });
    } else if (grab) setPan({ x: grab.px + p.x - grab.x, y: grab.py + p.y - grab.y });
  };
  const onUp = () => {
    setGrab(null);
    if (!drag || !sheet) return;
    setDrag(null);
    // hacia afuera, a la media celda, y dentro de la hoja
    const x1 = Math.max(sheet.x, Math.floor(Math.min(drag.x0, drag.x1) / AREA_SNAP) * AREA_SNAP);
    const y1 = Math.max(sheet.y, Math.floor(Math.min(drag.y0, drag.y1) / AREA_SNAP) * AREA_SNAP);
    const x2 = Math.min(sheet.x + sheet.w, Math.ceil(Math.max(drag.x0, drag.x1) / AREA_SNAP) * AREA_SNAP);
    const y2 = Math.min(sheet.y + sheet.h, Math.ceil(Math.max(drag.y0, drag.y1) / AREA_SNAP) * AREA_SNAP);
    // un clic (o un área mínima) no cambia nada
    if (x2 - x1 < 2 * AREA_SNAP || y2 - y1 < 2 * AREA_SNAP) return;
    set({ area: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } });
    setPicking(false);
  };
  const marked = drag ? { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) } : area;

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (picking) setPicking(false);
      else onClose();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, picking]);

  // debajo de la barra de la app, que sigue a la vista
  const [barBottom, setBarBottom] = useState(0);
  useLayoutEffect(() => {
    const bar = document.querySelector('.appbar');
    if (!bar) return;
    const measure = () => setBarBottom(bar.getBoundingClientRect().bottom);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  const svgText = () => (svgRef.current && page ? sheetSvg(svgRef.current, page, name) : null);
  const run = async (what: 'pdf' | 'svg' | 'png' | 'copy' | 'tex') => {
    const text = svgText();
    if (!text || !page) return;
    setBusy(true);
    try {
      if (what === 'tex') {
        if (!contentRef.current) return;
        download(`${name}.tex`, new Blob([sheetTikz(contentRef.current, page, { name, skin, clip: !!area })], { type: 'application/x-tex' }));
      } else if (what === 'svg') download(`${name}.svg`, new Blob([text], { type: 'image/svg+xml' }));
      else if (what === 'pdf') download(`${name}.pdf`, await sheetPdf(text, page, FONT, name));
      else {
        // el SVG mide en pt: 1 pt = 4/3 px CSS
        const raw = await schematicPng(text, (PNG_SCALE * 3) / 4);
        if (!raw) throw new Error('PNG');
        // con la marca en los metadatos (al portapapeles también, aunque el sistema puede sacarla)
        const png = await pngWithText(raw, name);
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

  const check = (key: keyof Layers, label: string, available: boolean) => (
    <label className={available ? undefined : 'disabled'} title={available ? undefined : t('Run a simulation of this circuit first')}>
      <input type="checkbox" checked={available && layers[key]} disabled={!available} onChange={(e) => set({ layers: { ...layers, [key]: e.target.checked } })} />
      {label}
    </label>
  );

  const groups: ToolGroup[] = [
    {
      id: 'zoom',
      label: t('Zoom'),
      tools: [
        { icon: 'zoomOut', label: t('Zoom out'), title: t('Zoom out (or the mouse wheel)'), onClick: () => zoomAt(1 / 1.25), disabled: !shownBox || zoom <= ZOOM_MIN },
        { icon: 'zoomIn', label: t('Zoom in'), title: t('Zoom in (or the mouse wheel)'), onClick: () => zoomAt(1.25), disabled: !shownBox || zoom >= ZOOM_MAX },
        { icon: 'fit', label: t('Fit'), title: t('See the whole sheet'), onClick: fitView, disabled: !shownBox },
      ],
    },
    {
      id: 'area',
      label: t('Area'),
      tools: [
        { icon: 'area', label: t('Select area'), title: t('Drag over the sheet to export only that part'), onClick: () => setPicking(!picking), active: picking, disabled: !sheet },
        { icon: 'rect', label: t('Whole sheet'), title: t('Export the whole sheet again'), onClick: () => (set({ area: null }), setPicking(false)), disabled: !area },
      ],
    },
  ];
  // las herramientas de la vista previa, centradas en la barra
  const bar = (
    <div className="export-tools">
      <Toolbar label={t('Export')} groups={groups} />
    </div>
  );
  // como las pestañas Schematic y Results: Export pintada, con su cruz; las dos salen de Export
  const tabs = (
    <nav className="tabs view-tabs" aria-label={t('Views')}>
      <button onClick={onClose} title={t('Back to the schematic (Esc)')}>
        {t('Schematic')}
        <span className="view-act" aria-hidden="true">
          <Icon name="caret" size={12} />
        </span>
      </button>
      <button className="active" onClick={onClose} title={t('Close the export (Esc)')}>
        {t('Export')}
        <span className="view-act" aria-hidden="true">
          <Icon name="close" size={12} />
        </span>
      </button>
    </nav>
  );

  return (
    <div className="export-view" role="dialog" aria-label={t('Export')} style={{ top: barBottom }}>
      {tabsSlot && createPortal(tabs, tabsSlot)}
      {toolsSlot ? createPortal(bar, toolsSlot) : <div className="export-bar">{bar}</div>}
      <div
        className={`export-stage${picking ? ' picking' : ''}${grab ? ' grabbing' : ''}`}
        ref={stageRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={() => setAim(null)}
        onAuxClick={(e) => e.preventDefault()}
      >
        <svg
          ref={svgRef}
          className="export-sheet"
          style={{ '--sheet-font': choice.css, '--sheet-bold': choice.bold ? 700 : 400, left, top } as React.CSSProperties}
          viewBox={shownBox ? `${shownBox.x} ${shownBox.y} ${shownBox.w} ${shownBox.h}` : '0 0 1 1'}
          width={W}
          height={H}
        >
          <g ref={contentRef}>
            <SchematicCanvas doc={shown} lib={sheetLib} conn={conn} selection={[]} showLoose={false} showSimCommand={layers.directives} tremor={tremor} />
            {cur && <CurrentArrowsLayer items={cur.map((a) => ({ ...a, color: undefined, hl: false }))} />}
            {op && <AnnotationLayer items={op} scale={1} />}
          </g>
        </svg>
        {/* al elegir el área se ve la hoja entera, con el área marcada (no es parte del dibujo) */}
        {picking && sheet && (
          <svg className="export-area" style={{ left, top }} width={W} height={H} viewBox={`${sheet.x} ${sheet.y} ${sheet.w} ${sheet.h}`}>
            {marked && <rect x={marked.x} y={marked.y} width={marked.w} height={marked.h} />}
            {aim && (
              <g className="export-aim">
                <line x1={sheet.x} x2={sheet.x + sheet.w} y1={aim.y} y2={aim.y} />
                <line x1={aim.x} x2={aim.x} y1={sheet.y} y2={sheet.y + sheet.h} />
              </g>
            )}
          </svg>
        )}
        {!sheet && <div className="export-empty">{t('The schematic is empty')}</div>}
        {sheet && (
          <div className="export-hint">
            {picking ? t('Drag over the sheet to choose the area to export · Esc: cancel') : `${Math.round(zoom * 100)}% · ${t('Wheel: zoom · drag: move')}`}
          </div>
        )}
      </div>
      <aside className="export-panel">
        <section>
          <h3>{t('Style')}</h3>
          <label className="choice">
            <span>{t('Skin')}</span>
            <select value={skin} onChange={(e) => pickSkin(e.target.value)}>
              {skins.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="choice">
            <span>{t('Font')}</span>
            <select value={choice.id} onChange={(e) => set({ font: e.target.value })}>
              {SHEET_FONTS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </label>
        </section>
        <section>
          <h3>{t('Sheet')}</h3>
          <p className="hint">
            {page ? `${page.w} × ${page.h} pt (${(page.w * PT_MM).toFixed(0)} × ${(page.h * PT_MM).toFixed(0)} mm)` : '—'}
          </p>
          {area && <p className="hint">{t('Only the selected area')}</p>}
        </section>
        <section className="export-actions">
          <h3>{t('Download')}</h3>
          <button className="primary" disabled={!page || busy || font !== choice.id} onClick={() => run('pdf')}>{t('Download PDF')}</button>
          <button disabled={!page || busy} onClick={() => run('tex')} title={t('Standalone LaTeX file with the drawing in TikZ; text between $…$ goes to LaTeX as written')}>{t('Download .tex (TikZ)')}</button>
          <button disabled={!page || busy} onClick={() => run('png')}>{t('Download PNG')}</button>
          <button disabled={!page || busy || !('ClipboardItem' in window)} onClick={() => run('copy')}>{t('Copy image')}</button>
          <button disabled={!page || busy} onClick={() => run('svg')}>{t('Download SVG')}</button>
        </section>
        <details className="export-advanced">
          <summary>{t('Advanced')}</summary>
          <section>
            <h3>{t('Include')}</h3>
            {check('op', t('Operating point values'), !!annotations?.length)}
            {check('currents', t('Current arrows'), !!arrows?.length)}
            {check('directives', t('SPICE directives'), true)}
          </section>
        </details>
      </aside>
    </div>
  );
}
