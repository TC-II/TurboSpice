// Fragmentos de ejemplo para el bloque .control de ngspice (probados en el motor WASM:
// tests/unit/control.test.ts). Los nombres R1, out, etc. son de ejemplo.

export interface Snippet {
  label: string;
  help: string;
  code: string;
}

export const CONTROL_SNIPPETS: Snippet[] = [
  {
    label: 'Correr los análisis',
    help: 'Ejecuta los análisis del esquemático (.tran, .ac…). Sin "run" el bloque sólo hace lo que indique.',
    code: 'run',
  },
  {
    label: 'Barrer un componente',
    help: 'Cambia el valor de un componente y simula en cada paso: aparece un resultado por valor (tran1, tran2…).',
    code: 'foreach val 500 1k 2k\n  alter R1 $val\n  run\nend',
  },
  {
    label: 'Barrer un .param',
    help: 'Cambia un parámetro definido con .param y vuelve a simular.',
    code: 'foreach val 1 2 4\n  alterparam k = $val\n  reset\n  run\nend',
  },
  {
    label: 'Monte Carlo',
    help: 'Repite la simulación variando un componente al azar (distribución normal, σ = 5%).',
    code: 'let n = 0\ndowhile n < 10\n  let rval = 1k * (1 + 0.05 * sgauss(0))\n  alter R1 = rval\n  run\n  let n = n + 1\nend',
  },
  {
    label: 'Medir (meas)',
    help: 'Mide sobre el resultado del último análisis; el valor queda en el Log.',
    code: 'run\nmeas tran vmax MAX v(out)\nmeas tran trise TRIG v(out) VAL=0.1 RISE=1 TARG v(out) VAL=0.9 RISE=1',
  },
  {
    label: 'Calcular un vector',
    help: 'Crea un vector nuevo a partir de otros; aparece en Resultados para graficarlo.',
    code: 'run\nlet ganancia_db = db(v(out))\nlet fase = 180/pi * cph(v(out))',
  },
  {
    label: 'Imprimir valores',
    help: 'Escribe en el Log (mean, max, min, rms…).',
    code: 'run\necho Valor medio de la salida:\nprint mean(v(out))',
  },
  {
    label: 'FFT',
    help: 'Espectro de una señal del transitorio (crea un resultado "spec").',
    code: 'run\nlinearize v(out)\nfft v(out)',
  },
];

/** Texto completo del bloque a partir del cuerpo */
export const controlBlock = (body: string) => `.control\n${body.trim()}\n.endc`;

/** Cuerpo de un bloque ".control … .endc" (sin esas líneas) */
export function controlBody(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((l) => !/^\s*\.(control|endc)\b/i.test(l))
    .join('\n');
}
