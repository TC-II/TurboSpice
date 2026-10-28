// Íconos de la barra de herramientas (SVG en línea, 20×20, trazo con currentColor).
import type { ReactNode } from 'react';

/** Cápsula con texto (NET, OP): más ancha que los demás íconos */
function capsule(text: string): ReactNode {
  return (
    <>
      <rect x="1" y="3" width="28" height="14" rx="7" />
      <text x="15" y="13.8" textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor" stroke="none" fontFamily="system-ui, sans-serif" letterSpacing="0.3">
        {text}
      </text>
    </>
  );
}
const WIDE = new Set(['nets', 'op']);

const P: Record<string, ReactNode> = {
  new: <path d="M5 2.5h7l3 3v12H5zM12 2.5v3h3" />,
  pdf: <path d="M5 2.5h7l3 3v12H5zM12 2.5v3h3M10 8v5M7.8 11l2.2 2.2 2.2-2.2" />,
  open: <path d="M2.5 5.5v10h13l2-7h-13l-2 7M2.5 5.5h5l1.5 1.5h6v1.5" />,
  save: <path d="M3.5 3.5h11l2 2v11h-13zM6.5 3.5v4h6v-4M6 16.5v-5h8v5" />,
  share: <path d="M8 12a3 3 0 0 0 4.2 0l3-3a3 3 0 0 0-4.2-4.2L9.8 6M12 8a3 3 0 0 0-4.2 0l-3 3A3 3 0 0 0 9 15.2l1.2-1.2" />,
  undo: <path d="M7 4.5 3.5 8 7 11.5M3.5 8H12a4.5 4.5 0 0 1 0 9H8" />,
  redo: <path d="M13 4.5 16.5 8 13 11.5M16.5 8H8a4.5 4.5 0 0 0 0 9h4" />,
  select: <path d="M4.5 3v13l3.5-3.5 2.5 5 2-1-2.5-5h5z" />,
  wire: <path d="M3 15.5h6v-11h8M3 15.5a1.2 1.2 0 1 0 0 .01M17 4.5a1.2 1.2 0 1 0 0 .01" />,
  // chip (CI): cuerpo rectangular con pines a los cuatro lados y marca de pin 1
  component: <path d="M5 5h10v10H5zM2 7.5h3M2 12.5h3M15 7.5h3M15 12.5h3M7.5 2v3M12.5 2v3M7.5 15v3M12.5 15v3M7.5 7.5h.01" />,
  ground: <path d="M10 3v7M4 10h12M6.5 13h7M9 16h2" />,
  label: <path d="M3 6.5h9l4.5 3.5-4.5 3.5H3zM6.5 10h.01" />,
  // figuras: línea, rectángulo y círculo
  shapes: <path d="M2.5 17.5l6-6M11 3.5h6v6h-6zM6 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6M13.5 14a3 3 0 1 0 .01 0" />,
  line: <path d="M4 16 16 4" />,
  rect: <path d="M4 5.5h12v9H4z" />,
  circle: <path d="M10 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12" />,
  // pin: cuadradito con su patita
  pin: <path d="M3 10h7M10 7.5h5v5h-5z" />,
  text: <path d="M4 5V3.5h12V5M10 3.5v13M7.5 16.5h5" />,
  directive: <path d="M7 4 3 10l4 6M13 4l4 6-4 6M11 3.5l-2 13" />,
  // cruz a 45°, chica como los trazos del esquemático
  delete: <path d="M7 7l6 6M13 7l-6 6" />,
  // mover: flecha de cuatro puntas; arrastrar: la misma con un cable que la sigue
  move: <path d="M10 2.5v15M2.5 10h15M10 2.5 8 4.5M10 2.5l2 2M10 17.5l-2-2M10 17.5l2-2M2.5 10l2-2M2.5 10l2 2M17.5 10l-2-2M17.5 10l-2 2" />,
  rotate: <path d="M15.5 8.5A6 6 0 1 0 14 14M15.5 3.5v5h-5" />,
  mirror: <path d="M10 2.5v15M8 5 3 15h5zM12 5l5 10h-5z" />,
  fit: <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4M7 7h6v6H7z" />,
  check: <path d="M4 10.5l4 4 8-9" />,
  // grilla: 4×4 puntitos
  grid: <path d="M4 4h.01M8 4h.01M12 4h.01M16 4h.01M4 8h.01M8 8h.01M12 8h.01M16 8h.01M4 12h.01M8 12h.01M12 12h.01M16 12h.01M4 16h.01M8 16h.01M12 16h.01M16 16h.01" />,
  nets: capsule('NET'),
  study: <path d="M4 3.5h12v13H4zM7 7h6M7 10h6M7 13h3.5M13.5 12.5l1.5 1.5 2.5-3" />,
  sim: <path d="M3 4.5h14M3 10h14M3 15.5h14M7 2.5v4M13 8v4M9 13.5v4" />,
  control: <path d="M6 4H4.5v12H6M14 4h1.5v12H14M7.5 8l2 2-2 2M10.5 12.5h2" />,
  run: <path d="M6 4l10 6-10 6z" />,
  stop: <path d="M5 5h10v10H5z" />,
  // punta digital (pen de multímetro): cuerpo, pantalla, dos botones, cuello y punta
  probe: <path d="M7.5 1.5h5a1.5 1.5 0 0 1 1.5 1.5v7.5L12 13.5H8L6 10.5V3a1.5 1.5 0 0 1 1.5-1.5zM8 4h4v3.5H8zM8 10h.01M12 10h.01M8.5 13.5v2.5h3v-2.5M10 16v2.5" />,
  op: capsule('OP'),
  info: <path d="M10 9v5M10 6v.01M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16" />,
  help: <path d="M7.5 7.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.7M10 14.5v.01M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16" />,
  sun: <path d="M10 6.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" />,
  moon: <path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8" />,
  results: <path d="M3 16.5h14M3 3.5v13M5.5 13l3-4 3 2 4.5-6" />,
  // disposición de los resultados: al costado (dos columnas) o abajo (dos filas)
  layoutSide: <path d="M4.5 3.5h3.5a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1zM12 3.5h3.5a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H12a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1zM3.5 6.5h5.5M11 6.5h5.5" />,
  layoutStack: <path d="M4.5 3.5h11a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1zM4.5 11h11a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V12a1 1 0 0 1 1-1zM6 3.5v5.5M6 11v5.5" />,
  copy: <path d="M7 7h9v10H7zM4 13V3h9" />,
  tree: <path d="M3.5 4.5h5M6 4.5v11M6 9.5h4M6 15.5h4M12 7.5h4.5v4H12zM12 13.5h4.5v4H12z" />,
  trash: <path d="M3.5 5.5h13M8 5.5V3.5h4v2M5.5 5.5l1 11h7l1-11M8.5 8.5v5M11.5 8.5v5" />,
  clock: <path d="M10 2.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15M10 6v4l2.5 2.5" />,
  paste: <path d="M6 4H4v13h12V4h-2M7 3h6v3H7z" />,
  cut: <path d="M6 14a2 2 0 1 0 0 .01M14 14a2 2 0 1 0 0 .01M7.5 12.5 15 3M12.5 12.5 5 3" />,
  close: <path d="M5 5l10 10M15 5 5 15" />,
  minus: <path d="M5 10h10" />,
  // tutorial: un birrete
  school: <path d="M10 4 1.5 8 10 12l8.5-4zM5 10v4c1.5 1.5 3.2 2 5 2s3.5-.5 5-2v-4M18.5 8v5" />,
  // menú principal: un cuadrado con líneas
  menu: (
    <>
      <rect x="3" y="3" width="14" height="14" rx="3" />
      <path d="M6.5 7.5h7M6.5 10h7M6.5 12.5h7" />
    </>
  ),
  more: (
    <g fill="currentColor" stroke="none">
      <circle cx="4.5" cy="10" r="1.4" />
      <circle cx="10" cy="10" r="1.4" />
      <circle cx="15.5" cy="10" r="1.4" />
    </g>
  ),
  caret: <path d="M6 8.5 10 12.5 14 8.5" />,
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={WIDE.has(name) ? size * 1.5 : size} height={size} viewBox={WIDE.has(name) ? '0 0 30 20' : '0 0 20 20'} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {P[name]}
    </svg>
  );
}
