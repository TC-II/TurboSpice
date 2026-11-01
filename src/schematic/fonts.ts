// Letras del esquemático (#328): la de la pantalla (Configuración) y la de la hoja de export, que
// el PDF incrusta. Con archivo propio en public/fonts: Arimo (OFL, mide igual que Arial, con
// griegas), Latin Modern Roman (GFL, la de \usepackage{lmodern}; sólo regular) y Comic Relief
// (OFL, a mano alzada, la del skin Tremor).

import type { SheetFont } from './exportSchematic.ts';

export interface FontChoice {
  id: string;
  label: string;
  /** font-family de CSS */
  css: string;
  /** la que se carga e incrusta; null: la del sistema, no se incrusta */
  font: SheetFont | null;
  /** tiene negrita propia (si no, la negrita se ve normal, como sale en el PDF) */
  bold: boolean;
}

const url = (f: string) => `${import.meta.env.BASE_URL}fonts/${f}`;

export const FONTS: FontChoice[] = [
  { id: 'system', label: 'System (sans-serif)', css: 'system-ui, sans-serif', font: null, bold: true },
  { id: 'arimo', label: 'Arimo', css: 'Arimo, Arial, sans-serif', font: { family: 'Arimo', files: { normal: url('Arimo-Regular.ttf'), bold: url('Arimo-Bold.ttf') } }, bold: true },
  {
    id: 'lmodern',
    label: 'Latin Modern (LaTeX)',
    css: "'Latin Modern Roman', 'CMU Serif', serif",
    font: { family: 'Latin Modern Roman', files: { normal: url('LatinModern-Regular.ttf'), bold: url('LatinModern-Regular.ttf') } },
    bold: false,
  },
  // a mano alzada, para el skin Tremor (OFL, con griegas: Ω, µ, τ)
  {
    id: 'comicrelief',
    label: 'Comic Relief',
    css: "'Comic Relief', 'Comic Sans MS', cursive",
    font: { family: 'Comic Relief', files: { normal: url('ComicRelief-Regular.ttf'), bold: url('ComicRelief-Bold.ttf') } },
    bold: true,
  },
];

export const fontChoice = (id: string | null | undefined) => FONTS.find((f) => f.id === id) ?? FONTS[0];

const ready = new Map<string, Promise<void>>();
/** Carga la letra como fuente web (para que la pantalla y la vista previa midan como el PDF) */
export function loadFont(choice: FontChoice): Promise<void> {
  const f = choice.font;
  if (!f) return Promise.resolve();
  let p = ready.get(choice.id);
  if (!p) {
    p = Promise.all(
      Object.entries(f.files)
        .filter(([style, file]) => style === 'normal' || file !== f.files.normal)
        .map(async ([style, file]) => {
          document.fonts.add(await new FontFace(f.family, `url("${file}")`, { weight: style === 'bold' ? '700' : '400' }).load());
        }),
    ).then(
      () => {},
      (e) => {
        // otro intento la próxima vez
        ready.delete(choice.id);
        throw e;
      },
    );
    ready.set(choice.id, p);
  }
  return p;
}
