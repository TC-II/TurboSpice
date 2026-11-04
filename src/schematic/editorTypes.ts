// Tipos del editor de esquemáticos: herramientas, vista, arrastres y lo que el editor ofrece afuera.
import { type AscDoc, type Orient, type Point, type DrawnShapeKind } from '../asc/model.ts';
import type { TextWindow } from '../asc/model.ts';
import { type Box, type ItemRef } from './geometry.ts';
import type { PickWhat } from './simDialogs.tsx';

export type Tool =
  | { kind: 'select' }
  | { kind: 'wire'; start: Point | null }
  | { kind: 'place'; type: string; orient: Orient }
  | { kind: 'flag'; name: string; ioPin?: string }
  | { kind: 'text'; text: string; textKind: 'directive' | 'comment' }
  /** T: click en el esquemático y se escribe el comentario ahí mismo (Enter o click afuera lo deja, Esc cancela) */
  | { kind: 'comment' }
  | { kind: 'delete' }
  | { kind: 'probe' }
  /** elegir una red o una fuente para un diálogo (Esc cancela) */
  | { kind: 'pick'; what: PickWhat }
  /**
   * M / S de LTspice: click en un elemento (o recuadro) y sigue al cursor hasta el próximo
   * click; `stretch` estira los cables conectados (S) o no (M)
   */
  | { kind: 'move'; stretch: boolean; refs: ItemRef[] | null; start: Point | null }
  /**
   * Figuras decorativas (LINE / RECTANGLE / CIRCLE / ARC del .asc), con `style` de línea.
   * `pts`: los clicks hechos. Línea, rectángulo y círculo (su caja) llevan 2; el arco, 4: la
   * caja de la elipse, el punto de inicio y el de fin (va en sentido antihorario).
   */
  | { kind: 'shape'; shape: DrawnShapeKind; pts: Point[]; style?: string }
  /** lápiz: anotaciones a mano alzada (figura PATH), arrastrando con el botón izquierdo */
  | { kind: 'pencil'; style?: string }
  /** Z: arrastrar un recuadro y ajustar la vista a él; después vuelve a `prev` */
  | { kind: 'zoom'; prev: Tool };

/** Tipo de dato del arrastre de un subcircuito desde el panel del proyecto (#199) */
export const SUBCKT_DRAG = 'application/x-turbospice-subckt';

export interface EditorHandle {
  fit(): void;
  /** Posición del cursor en el esquemático (para pegar/duplicar) */
  cursor(): Point;
  /** Elemento SVG y caja del contenido (para exportar) */
  svg(): SVGSVGElement | null;
  contentBox(): Box | null;
  /** Centra la vista en una caja (p.ej. el componente de un problema) */
  centerOn(b: Box): void;
  /** Shift+Z: vuelve a la vista anterior (zoom anterior) */
  zoomPrev(): void;
  /** ¿Se desplazó con Espacio+arrastrar desde que se apretó Espacio? (si no, Espacio = ajustar) */
  spacePanned(): boolean;
  /** Zoom y posición (para volver al mismo lugar al subir por la jerarquía, #180) */
  view(): View;
  setView(v: View): void;
  /** escribir en el lugar un comentario existente (false si no es un comentario común) */
  editText(index: number): boolean;
  /** Ctrl+R con un rótulo agarrado: gira el rótulo, no el componente (false si no hay ninguno) */
  rotateLabel(): boolean;
}

export interface View {
  cx: number;
  cy: number;
  /** píxeles por unidad de LTspice */
  scale: number;
}

export type Drag =
  /** `right`: con el botón derecho; si no se movió, al soltar es un click derecho */
  | { mode: 'pan'; sx: number; sy: number; view: View; right?: boolean; moved?: boolean }
  /** `editText`: click en un comentario ya seleccionado; si no se mueve, se edita en el lugar */
  | { mode: 'move'; start: Point; refs: ItemRef[]; detach: boolean; moved: boolean; whole?: boolean; editText?: number }
  /** agrandar o achicar un comentario desde la esquina de su caja (cambia el tamaño de letra) */
  | { mode: 'textsize'; index: number; left: boolean; top: boolean; box: Box }
  /** cambiar el tamaño de una figura desde una de sus manijas (shapeHandles) */
  | { mode: 'shapesize'; index: number; handle: number }
  /** `erase`: con la herramienta borrar, al soltar se borra lo que queda adentro */
  | { mode: 'box'; start: Point; additive: boolean; erase?: boolean }
  /** recuadro de la herramienta zoom */
  | { mode: 'zoom'; start: Point }
  /** punta de prueba apretada sobre `from`: al soltar en otro lugar, la resta o el cociente (#308) */
  | { mode: 'probe'; start: Point; from: { net?: string; symbol?: number; pin?: number; body?: boolean } }
  /** trazo del lápiz en curso */
  | { mode: 'pencil'; pts: Point[] }
  /** mover un codo de cable; `base` es el documento con el cable ya partido si hizo falta */
  | { mode: 'vertex'; base: AscDoc; at: Point; free: boolean; commitBase: boolean }
  /** desplazar un tramo de cable en forma perpendicular */
  | { mode: 'segment'; start: Point; index: number }
  /**
   * arrastrar un rótulo (InstName/Value) de un símbolo; si su componente está seleccionado junto
   * con otros, el mismo rótulo de todos. `at` es el ancla de cada uno en el esquemático.
   */
  | { mode: 'label'; start: Point; sym: number; shift: boolean; items: { sym: number; win: number; w: TextWindow; at: Point }[]; moved: boolean };

export interface InlineText {
  index: number | null;
  x: number;
  y: number;
  align: string;
  size: number;
  value: string;
  box?: { w: number; h: number };
}
