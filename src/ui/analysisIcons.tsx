// Dibujitos de cada tipo de simulación para el menú New (#331): la forma de lo que calcula
// (un pulso en el tiempo, un Bode, el símbolo de continua, una escalera para el barrido…).
import type { ReactNode } from 'react';
import type { AnalysisKind } from '../sim/analyses.ts';

const PATHS: Record<AnalysisKind | 'complex', ReactNode> = {
  // pulsos en el tiempo
  tran: <path d="M1 12H4V4H8V12H11V4H15V12H19" />,
  // Bode: plano y después cae
  ac: <path d="M1 5H8Q12 5 14 9L18 15" />,
  // símbolo de continua
  op: <path d="M3 6H17M3 10H6M8.5 10H11.5M14 10H17" />,
  // escalera: la fuente que se barre
  dc: <path d="M1 14H5V11H9V8H13V5H17V2H19" />,
  // un polo y un cero
  pz: (
    <>
      <path d="M3 5L8 10M8 5L3 10" />
      <circle cx={14.5} cy={7.5} r={3} />
    </>
  ),
  // un lazo con su flecha
  stb: <path d="M15.2 4.2A5.5 5.5 0 1 0 15.5 11M15.2 1V4.4H11.8" />,
  // ruido
  noise: <path d="M1 8L3 5L4 10L6 3L7 12L9 6L10 9L12 4L13 11L15 6L16 9L18 5L19 8" />,
  // un bloque con entrada y salida
  tf: <path d="M1 8H6M14 8H19M16.5 5.5L19 8L16.5 10.5M6 4H14V12H6Z" />,
  // delta
  sens: <path d="M10 3L17 13H3Z" />,
  // senoide recortada
  disto: <path d="M1 8C2.5 4 3.5 3.5 5 3.5H7C8.5 3.5 9 4 10 8C11 12 11.5 12.5 13 12.5H15C16.5 12.5 17.5 12 19 8" />,
  // cuadripolo
  sp: <path d="M6 3H14V13H6ZM1 5.5H6M1 10.5H6M14 5.5H19M14 10.5H19" />,
  // un bloque .control
  complex: <path d="M7 3C5 3 5 4.5 5 6S4.5 8 3 8C4.5 8 5 8.5 5 10S5 13 7 13M13 3C15 3 15 4.5 15 6S15.5 8 17 8C15.5 8 15 8.5 15 10S15 13 13 13" />,
};

export function AnalysisIcon({ kind }: { kind: AnalysisKind | 'complex' }) {
  return (
    <svg className="analysis-icon" viewBox="0 0 20 16" width={20} height={16} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[kind]}
    </svg>
  );
}
