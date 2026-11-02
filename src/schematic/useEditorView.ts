// Vista del editor de esquemáticos: tamaño del lienzo, zoom y posición, vistas anteriores (Shift+Z),
// la rueda y los gestos que en un dibujo pesado mueven lo ya pintado con un transform (#186).
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import type { Point } from '../asc/model.ts';
import type { Box } from './geometry.ts';
import type { View } from './editorTypes.ts';
import { HEAVY_NODES } from './editorDoc.ts';

export function useEditorView(svgRef: RefObject<SVGSVGElement | null>) {
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ cx: 0, cy: 0, scale: 1 });
  // vistas anteriores (Shift+Z); los giros seguidos de la rueda cuentan como un solo paso
  const viewHistory = useRef<View[]>([]);
  const lastWheel = useRef(0);
  const viewRef = useRef(view);
  viewRef.current = view;
  const pushView = () => {
    viewHistory.current.push(viewRef.current);
    if (viewHistory.current.length > 50) viewHistory.current.shift();
  };
  /** Cambio de vista que se deshace con Shift+Z */
  const zoomTo = (v: View) => {
    pushView();
    setView(v);
  };

  // Paneo, rueda y pellizco en un esquemático pesado (#186): cambiar el viewBox rehace el layout
  // y el pintado de todo el SVG en cada cuadro. Durante el gesto se mueve y escala el dibujo ya
  // pintado con un transform CSS (lo hace el compositor) y la vista se aplica al terminar.
  const gesture = useRef<{ v: View; tx: number; ty: number; k: number } | null>(null);
  const wheelTimer = useRef<number | undefined>(undefined);
  /** la vista que se ve (la del gesto en curso, si hay) */
  const liveView = () => gesture.current?.v ?? view;
  /** Rectángulo del svg sin el transform del gesto */
  const svgRect = () => {
    const r = svgRef.current!.getBoundingClientRect();
    const g = gesture.current;
    return g ? { left: r.left - g.tx, top: r.top - g.ty, width: r.width / g.k, height: r.height / g.k } : r;
  };
  const clearGesture = useCallback(() => {
    const el = svgRef.current;
    gesture.current = null;
    clearTimeout(wheelTimer.current);
    if (el) el.style.transform = el.style.transformOrigin = el.style.willChange = '';
  }, [svgRef]);
  const heavy = () => (svgRef.current?.getElementsByTagName('*').length ?? 0) > HEAVY_NODES;
  /** Vista nueva durante un gesto */
  const moveView = (v: View) => {
    const el = svgRef.current;
    if (!el || (!gesture.current && !heavy())) return setView(v);
    const c = viewRef.current;
    const k = v.scale / c.scale;
    const tx = (c.cx - size.w / 2 / c.scale - (v.cx - size.w / 2 / v.scale)) * v.scale;
    const ty = (c.cy - size.h / 2 / c.scale - (v.cy - size.h / 2 / v.scale)) * v.scale;
    gesture.current = { v, tx, ty, k };
    el.style.willChange = 'transform';
    el.style.transformOrigin = '0 0';
    el.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
    // en un gesto largo se aplica cada tanto: lo que entra por los bordes no está pintado (la
    // franja vacía más ancha) y, al acercar mucho, el dibujo escalado se ve borroso
    const gapX = Math.max(tx, size.w - tx - k * size.w);
    const gapY = Math.max(ty, size.h - ty - k * size.h);
    if (gapX > size.w * 0.35 || gapY > size.h * 0.35 || k > 2.5) commitView();
  };
  /** Fin del gesto: la vista de verdad (en el mismo cuadro en que se saca el transform) */
  const commitView = () => {
    const g = gesture.current;
    if (!g) return;
    if (g.v === viewRef.current) return clearGesture();
    flushSync(() => setView(g.v));
  };
  // la vista cambió (por el gesto o por otra cosa, p. ej. Ajustar): fuera el transform
  useLayoutEffect(() => {
    if (gesture.current) clearGesture();
  }, [view, clearGesture]);

  useEffect(() => {
    const el = svgRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [svgRef]);

  /** Vista que muestra toda la caja, con un margen */
  const viewOf = useCallback(
    (b: Box, pad: number, max = 4): View => ({
      cx: (b.x1 + b.x2) / 2,
      cy: (b.y1 + b.y2) / 2,
      scale: Math.min(max, Math.max(0.05, Math.min(size.w / (b.x2 - b.x1 + 2 * pad), size.h / (b.y2 - b.y1 + 2 * pad)))),
    }),
    [size],
  );

  const toDoc = (e: { clientX: number; clientY: number }): Point => {
    const r = svgRect();
    const v = liveView();
    return { x: v.cx - size.w / 2 / v.scale + (e.clientX - r.left) / v.scale, y: v.cy - size.h / 2 / v.scale + (e.clientY - r.top) / v.scale };
  };

  const onWheel = (e: { clientX: number; clientY: number; deltaY: number; timeStamp: number }) => {
    const p = toDoc(e);
    const v = liveView();
    const k = Math.exp(-e.deltaY * 0.0015);
    const scale = Math.min(8, Math.max(0.03, v.scale * k));
    if (e.timeStamp - lastWheel.current > 500) pushView();
    lastWheel.current = e.timeStamp;
    // mantener fijo el punto bajo el cursor
    moveView({ scale, cx: p.x - (p.x - v.cx) * (v.scale / scale), cy: p.y - (p.y - v.cy) * (v.scale / scale) });
    clearTimeout(wheelTimer.current);
    if (gesture.current) wheelTimer.current = window.setTimeout(commitView, 150);
  };
  // durante el gesto el svg escalado puede no cubrir el lienzo: la rueda sobre ese borde vacío
  // (que es el contenedor) sigue haciendo zoom
  const wheelRef = useRef(onWheel);
  wheelRef.current = onWheel;
  useEffect(() => {
    const parent = svgRef.current?.parentElement;
    if (!parent) return;
    const h = (e: WheelEvent) => e.target === parent && gesture.current && wheelRef.current(e);
    parent.addEventListener('wheel', h);
    return () => parent.removeEventListener('wheel', h);
  }, [svgRef]);
  return { size, view, setView, viewRef, viewHistory, pushView, zoomTo, heavy, svgRect, moveView, commitView, viewOf, toDoc, onWheel };
}
