// Grosor de las líneas del esquemático según el zoom (prueba de Dev2). Hoy los trazos no escalan
// (vector-effect: non-scaling-stroke): de cerca se ven finos al lado de los símbolos y de lejos,
// gruesos. Estas variantes multiplican el grosor de la Configuración por un factor que sigue al zoom
// (--sch-zk en svg.editor). Se elige con ?lw=fixed|prop|steps|soft en la URL (queda recordada en
// este navegador) hasta decidir cuál queda.

export type StrokeZoomMode = 'fixed' | 'prop' | 'steps' | 'soft';
export const STROKE_ZOOM_MODES: StrokeZoomMode[] = ['fixed', 'prop', 'steps', 'soft'];

/**
 * Escala de la vista (px de pantalla por unidad del esquemático) en la que el grosor es el de la
 * Configuración: la de referencia, un cuerpo de resistencia de 58 unidades de ~84 px con el grosor medio.
 */
export const STROKE_REF_SCALE = 1.45;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Factor del grosor a la escala `scale`:
 * - fixed: 1 (lo de hoy: el mismo grosor en pantalla con cualquier zoom);
 * - prop: proporcional al zoom, como un dibujo en papel (con un mínimo y un máximo para que de
 *   lejos no desaparezca y de cerca no sea una franja);
 * - steps: proporcional, pero en escalones de √2 (cambia pocas veces: sin recalcular estilos en
 *   cada paso de la rueda);
 * - soft: crece con la raíz del zoom (la mitad de rápido, en escala log).
 */
export function strokeZoom(mode: string | null | undefined, scale: number): number {
  const r = scale / STROKE_REF_SCALE;
  if (!(r > 0) || !Number.isFinite(r)) return 1;
  switch (mode) {
    case 'prop':
      return clamp(r, 0.35, 6);
    case 'steps':
      return clamp(2 ** (Math.round(Math.log2(r) * 2) / 2), 0.5, 4);
    case 'soft':
      return clamp(Math.sqrt(r), 0.5, 3);
    default:
      return 1;
  }
}

const KEY = 'turbospice.lwZoom';
// (se lee al cargar el módulo: la app saca los parámetros de la URL al abrir un ejemplo)
try {
  const q = new URLSearchParams(location.search).get('lw');
  if (q && (STROKE_ZOOM_MODES as string[]).includes(q)) localStorage.setItem(KEY, q);
} catch {
  // (sin URL ni almacenamiento: la de siempre)
}

/** La variante elegida en este navegador */
export function strokeZoomMode(): StrokeZoomMode {
  try {
    const v = localStorage.getItem(KEY);
    return v && (STROKE_ZOOM_MODES as string[]).includes(v) ? (v as StrokeZoomMode) : 'fixed';
  } catch {
    return 'fixed';
  }
}
