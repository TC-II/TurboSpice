import { t } from '../i18n/i18n.ts';
// Fragmentos de ejemplo para el bloque .control de ngspice (probados en el motor WASM:
// tests/unit/control.test.ts). Los nombres R1, out, etc. son de ejemplo.

export interface Snippet {
  label: string;
  help: string;
  code: string;
}

export const CONTROL_SNIPPETS: Snippet[] = [
  {
    label: t('Run the analyses'),
    help: t('Runs the schematic\'s analyses (.tran, .ac…). Without "run" the block only does what it says.'),
    code: 'run',
  },
  {
    label: t('Sweep a component'),
    help: t('Changes a component\'s value and simulates at each step: one result per value (tran1, tran2…).'),
    code: 'foreach val 500 1k 2k\n  alter R1 $val\n  run\nend',
  },
  {
    label: t('Sweep a .param'),
    help: t('Changes a parameter defined with .param and simulates again.'),
    code: 'foreach val 1 2 4\n  alterparam k = $val\n  reset\n  run\nend',
  },
  {
    label: 'Monte Carlo',
    help: t('Repeats the simulation varying a component at random (normal distribution, σ = 5%).'),
    code: 'let n = 0\ndowhile n < 10\n  let rval = 1k * (1 + 0.05 * sgauss(0))\n  alter R1 = rval\n  run\n  let n = n + 1\nend',
  },
  {
    label: t('Measure (meas)'),
    help: t('Measures on the result of the last analysis; the value goes to the Log.'),
    code: 'run\nmeas tran vmax MAX v(out)\nmeas tran trise TRIG v(out) VAL=0.1 RISE=1 TARG v(out) VAL=0.9 RISE=1',
  },
  {
    label: t('Compute a vector'),
    help: t('Creates a new vector from others; it shows up in Results to plot it.'),
    code: t('run\nlet gain_db = db(v(out))\nlet phase = 180/pi * cph(v(out))'),
  },
  {
    label: t('Print values'),
    help: t('Writes to the Log (mean, max, min, rms…).'),
    code: t('run\necho Mean output value:\nprint mean(v(out))'),
  },
  {
    label: 'FFT',
    help: t('Spectrum of a transient signal (creates a "spec" result).'),
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
