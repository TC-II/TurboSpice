// Íconos de cada forma de onda de las fuentes: las pestañas de la ventana de fuentes (#47) y el
// dibujito en el medio del símbolo de la fuente de tensión, que muestra qué forma de onda tiene.
import type { ReactNode } from 'react';
import type { SourceKind } from '../sim/sources.ts';

export const KINDS: { kind: SourceKind; label: string; icon: ReactNode }[] = [
  { kind: 'sine', label: 'Seno', icon: <path d="M3 10C9 -2 15 -2 21 10S33 22 39 10" /> },
  { kind: 'ac', label: 'AC', icon: <path d="M12 16H36M16 16L33 5M28 5H33V10" strokeLinecap="round" strokeLinejoin="round" /> },
  { kind: 'pulse', label: 'Pulso', icon: <path d="M3 16H9L11 4H19L21 16H27L29 4H37L39 16H43" /> },
  { kind: 'dc', label: 'Valor DC', icon: <path d="M23 1V7M13 7H33M17 12H29M23 12V19" strokeLinecap="round" /> },
  { kind: 'exp', label: 'Exponencial', icon: <path d="M3 17H8C12 5 18 4 24 4C28 4 29 4 30 5C33 15 38 17 43 17" /> },
  { kind: 'sffm', label: 'FM (SFFM)', icon: <path d={fmIcon()} strokeWidth="1.3" /> },
  {
    kind: 'pwl',
    label: 'Por puntos',
    icon: (
      <>
        <path d="M3 16L12 6L20 12L30 3L43 15" />
        <circle cx="12" cy="6" r="1.8" fill="currentColor" stroke="none" />
        <circle cx="20" cy="12" r="1.8" fill="currentColor" stroke="none" />
        <circle cx="30" cy="3" r="1.8" fill="currentColor" stroke="none" />
      </>
    ),
  },
];

/** Ícono de FM: una senoidal que se comprime y se estira */
function fmIcon(): string {
  let d = 'M2 10';
  for (let i = 0; i <= 120; i++) {
    const x = i / 120;
    d += `L${(2 + x * 42).toFixed(1)} ${(10 - 7 * Math.sin(2 * Math.PI * 5 * x + 2.2 * Math.sin(2 * Math.PI * x))).toFixed(1)}`;
  }
  return d;
}
