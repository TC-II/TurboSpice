// Grosor de las líneas del esquemático según el zoom. Los trazos no escalan solos
// (vector-effect: non-scaling-stroke): sin esto, de cerca se ven finos al lado de los símbolos y de
// lejos, gruesos. El grosor de la Configuración se multiplica por un factor (--sch-zk en svg.editor)
// que crece con la raíz del zoom, no en proporción: de lejos el dibujo no se vuelve una mancha y de
// cerca las líneas no son franjas.

/**
 * Escala de la vista (px de pantalla por unidad del esquemático) en la que el grosor es el de la
 * Configuración: la de referencia, un cuerpo de resistencia de 58 unidades de ~84 px con el grosor medio.
 */
export const STROKE_REF_SCALE = 1.45;

/**
 * Factor del grosor a la escala `scale`: la raíz del zoom relativo a la referencia, en escalones.
 * El zoom se redondea a potencias de √2 (el factor salta de a 2^¼ ≈ 1,19), así que cambia pocas
 * veces y no se recalculan los estilos en cada paso de la rueda. Nunca baja de la mitad.
 */
export function strokeZoom(scale: number): number {
  const r = scale / STROKE_REF_SCALE;
  if (!(r > 0) || !Number.isFinite(r)) return 1;
  const step = Math.round(Math.log2(r) * 2);
  return 2 ** (Math.max(-4, step) / 4);
}
