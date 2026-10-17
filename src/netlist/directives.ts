// Directivas que sólo existen en ngspice (.control, .pz, .sens, .disto, .sp, .pss).
// Para que el .asc siga simulando en LTspice se guardan como comentario (";.pz …"):
// LTspice los muestra y los ignora; TurboSpice los reconoce y los ejecuta.

export const NGSPICE_ONLY = /^\s*\.(control|pz|sens|disto|sp|pss)\b/i;

/** ¿Este comentario de esquemático es una directiva de ngspice activa? */
export const isNgspiceComment = (text: string) => NGSPICE_ONLY.test(text);

/** ¿El texto (directiva o comentario) es un bloque .control? */
export const isControlBlock = (text: string) => /^\s*\.control\b/i.test(text);
