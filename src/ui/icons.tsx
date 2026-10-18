// Íconos de la barra de herramientas (SVG en línea, 20×20, trazo con currentColor).
import type { ReactNode } from 'react';

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
  // resistencia europea (rectángulo)
  component: <path d="M2 10h4M14 10h4M6 7h8v6H6z" />,
  ground: <path d="M10 3v7M4 10h12M6.5 13h7M9 16h2" />,
  label: <path d="M3 6.5h9l4.5 3.5-4.5 3.5H3zM6.5 10h.01" />,
  text: <path d="M4 5V3.5h12V5M10 3.5v13M7.5 16.5h5" />,
  directive: <path d="M7 4 3 10l4 6M13 4l4 6-4 6M11 3.5l-2 13" />,
  // cruz a 45°, chica como los trazos del esquemático
  delete: <path d="M7 7l6 6M13 7l-6 6" />,
  rotate: <path d="M15.5 8.5A6 6 0 1 0 14 14M15.5 3.5v5h-5" />,
  mirror: <path d="M10 2.5v15M8 5 3 15h5zM12 5l5 10h-5z" />,
  fit: <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4M7 7h6v6H7z" />,
  nets: <path d="M2.5 13.5h4M13.5 13.5h4M6.5 11h7v5h-7zM8.5 13.5h3M10 11V5M7 5h6" />,
  study: <path d="M4 3.5h12v13H4zM7 7h6M7 10h6M7 13h3.5M13.5 12.5l1.5 1.5 2.5-3" />,
  sim: <path d="M3 4.5h14M3 10h14M3 15.5h14M7 2.5v4M13 8v4M9 13.5v4" />,
  control: <path d="M6 4H4.5v12H6M14 4h1.5v12H14M7.5 8l2 2-2 2M10.5 12.5h2" />,
  run: <path d="M6 4l10 6-10 6z" />,
  stop: <path d="M5 5h10v10H5z" />,
  probe: <path d="M15 3l2 2-7.5 7.5-3-.5-.5-3zM6.5 12.5 3 17" />,
  op: <path d="M3 15l3.5-4 3 2.5L14 7l3 3M3 4h5M3 7h3" />,
  help: <path d="M7.5 7.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.7M10 14.5v.01M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16" />,
  sun: <path d="M10 6.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" />,
  moon: <path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8" />,
  results: <path d="M3 16.5h14M3 3.5v13M5.5 13l3-4 3 2 4.5-6" />,
  // disposición de los resultados: al costado (dos columnas) o abajo (dos filas)
  layoutSide: <path d="M4.5 3.5h3.5a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1zM12 3.5h3.5a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H12a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1zM3.5 6.5h5.5M11 6.5h5.5" />,
  layoutStack: <path d="M4.5 3.5h11a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1zM4.5 11h11a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V12a1 1 0 0 1 1-1zM6 3.5v5.5M6 11v5.5" />,
  copy: <path d="M7 7h9v10H7zM4 13V3h9" />,
  paste: <path d="M6 4H4v13h12V4h-2M7 3h6v3H7z" />,
  cut: <path d="M6 14a2 2 0 1 0 0 .01M14 14a2 2 0 1 0 0 .01M7.5 12.5 15 3M12.5 12.5 5 3" />,
  close: <path d="M5 5l10 10M15 5 5 15" />,
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
    <svg className="icon" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {P[name]}
    </svg>
  );
}
