// Directivas que sólo existen en ngspice (.control, .pz, .sens, .disto, .sp, .pss).
// Para que el .asc siga simulando en LTspice se guardan como comentario (";.pz …"):
// LTspice los muestra y los ignora; TurboSpice los reconoce y los ejecuta.

export const NGSPICE_ONLY = /^\s*\.(control|pz|sens|disto|sp|pss)\b/i;

/** ¿Este comentario de esquemático es una directiva de ngspice activa? */
export const isNgspiceComment = (text: string) => NGSPICE_ONLY.test(text);

/** ¿El texto (directiva o comentario) es un bloque .control? */
export const isControlBlock = (text: string) => /^\s*\.control\b/i.test(text);

/** Marcas de sección de un .control combinable con los barridos (paso personalizado) */
export const HOOK_MARKS = { before: '* antes de cada corrida', after: '* después de cada corrida', final: '* al final' } as const;

/**
 * Secciones de un .control con marcas (antes/después de cada corrida, al final), o null si es
 * un bloque común (que decide todo lo que se simula).
 */
export function controlHooks(body: string[]): { before: string[]; after: string[]; final: string[] } | null {
  const marks = Object.entries(HOOK_MARKS) as [keyof typeof HOOK_MARKS, string][];
  if (!body.some((l) => marks.some(([, m]) => l.trim().toLowerCase() === m))) return null;
  const out = { before: [] as string[], after: [] as string[], final: [] as string[] };
  let cur: keyof typeof out | null = null;
  for (const l of body) {
    const m = marks.find(([, mark]) => l.trim().toLowerCase() === mark);
    if (m) cur = m[0];
    else if (cur && l.trim()) out[cur].push(l.trim());
  }
  return out;
}
