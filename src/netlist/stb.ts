// Análisis de estabilidad (.stb) → bloque .control de ngspice.
//
// La sonda (library/sub/Stability/LoopProbe.lib) tiene una fuente de tensión en serie (Vinj),
// un amperímetro (Vprb) y una fuente de corriente en paralelo (Iinj), todas en 0. El .stb corre
// dos análisis AC (tres con la transferencia del GFT) encendiendo una fuente por vez, con todas
// las demás fuentes del circuito en AC 0, y combina los resultados según las fórmulas de Frank
// Wiedmann (plot.defs de GFT_LTspice.zip, que también da la ganancia de lazo de Tian):
//   Vy = −V(x), Iy = I(Vprb); corrida 1: inyección de tensión, 2: entrada, 3: de corriente
//   D  = Vy1·Iy3 − Vy3·Iy1
//   T (GFT)  = 1/(1/D − 1)
//   T (Tian) = 1/(Vy1 + Iy3 − 2·D) − 1        (simétrica: no importa la orientación)
//   A  = Vo2·D + Vo1·(Vy3·Iy2 − Vy2·Iy3) + Vo3·(Vy2·Iy1 − Vy1·Iy2)
//   G = Vo2, G∞ = A/D, Dn = G/A, Tn = 1/(Dn − 1), G0 = (G − G∞·D)/(1 − D)
// En notación del modelo de ganancia asintótica: G = G∞·R/(1+R) + G0/(1+R), con R = T del GFT.
// Los resultados quedan en un plot propio ("stbN" al leerlo, ver engine/ngspice.ts) con la
// frecuencia como escala; los plots de las corridas se borran.
import type { Analysis } from '../sim/analyses.ts';
import { t } from '../i18n/i18n.ts';

export type StbAnalysis = Extract<Analysis, { kind: 'stb' }>;

/** Vector que marca el plot de resultados de un .stb */
export const STB_VECTOR = 'loopgain';

/** `x` sin ceros exactos, para dividir por él (ngspice corta todo el .control con "out of range for divide") */
const nz = (x: string) => `(${x}+1e-300*(mag(${x}) lt 1e-300))`;

export interface StbContext {
  /** nombre de ngspice de la sonda ("xlp1"), o undefined si no existe */
  probe: string | undefined;
  /** fuentes independientes V/I del nivel superior (nombres de ngspice): van en AC 0 */
  sources: string[];
  /** nombre de ngspice de la fuente de entrada del GFT */
  input?: string;
  /** vector de ngspice de la salida del GFT ("v(out)") */
  output?: string;
}

/** Líneas del .control para un .stb (el número `n` hace únicos los nombres) o un error */
export function stbControl(a: StbAnalysis, ctx: StbContext, n: number): string[] | string {
  if (!ctx.probe) return t('.stb: loop probe "{probe}" not found', { probe: a.probe });
  // dentro de la sonda diferencial, la del modo elegido
  const p = a.mode ? `${ctx.probe}.x${a.mode}` : ctx.probe;
  const sweep = `ac ${a.sweep.type} ${a.sweep.points} ${a.sweep.start} ${a.sweep.stop}`;
  const gft = a.method === 'gft';
  const h = gft && !!ctx.input && !!ctx.output;
  if (gft && a.input && !ctx.input) return t('.stb: input source "{src}" not found', { src: a.input });
  const v = (k: number) => `ts_stb${n}_${k}`;
  const out: string[] = [`* .stb ${a.probe}`, ...ctx.sources.map((s) => `alter ${s} acmag=0`)];
  const run = (k: number, on: string[], off: string[]) => {
    out.push(...on, sweep, `set ${v(k)} = $curplot`, ...off);
  };
  run(1, [`alter @v.${p}.vinj[acmag]=1`], [`alter @v.${p}.vinj[acmag]=0`]);
  if (h) run(2, [`alter ${ctx.input} acmag=1`], [`alter ${ctx.input} acmag=0`]);
  run(3, [`alter @i.${p}.iinj[acmag]=1`], [`alter @i.${p}.iinj[acmag]=0`]);
  const q = (k: number, what: string) => `{$${v(k)}}.${what}`;
  const x = `ts_${n}_`;
  out.push(
    `let ${x}vy1 = -${q(1, `v(${p}.x)`)}`,
    `let ${x}iy1 = ${q(1, `i(v.${p}.vprb)`)}`,
    `let ${x}vy3 = -${q(3, `v(${p}.x)`)}`,
    `let ${x}iy3 = ${q(3, `i(v.${p}.vprb)`)}`,
    `let ${x}d = ${x}vy1*${x}iy3-${x}vy3*${x}iy1`,
    `let ${x}dz = ${nz(`${x}d`)}`,
    `let ${x}g = 1/${x}dz-1`,
    `let ${x}tgft = 1/${nz(`${x}g`)}`,
    `let ${x}r = ${x}vy1+${x}iy3-2*${x}d`,
    `let ${x}ttian = 1/${nz(`${x}r`)}-1`,
  );
  if (h) {
    out.push(
      `let ${x}vy2 = -${q(2, `v(${p}.x)`)}`,
      `let ${x}iy2 = ${q(2, `i(v.${p}.vprb)`)}`,
      `let ${x}vo1 = ${q(1, ctx.output!)}`,
      `let ${x}vo2 = ${q(2, ctx.output!)}`,
      `let ${x}vo3 = ${q(3, ctx.output!)}`,
      `let ${x}a = ${x}vo2*${x}d+${x}vo1*(${x}vy3*${x}iy2-${x}vy2*${x}iy3)+${x}vo3*(${x}vy2*${x}iy1-${x}vy1*${x}iy2)`,
      // A = 0 exacto: la salida es el nodo de la sonda (G∞ = 0)
      `let ${x}a = ${nz(`${x}a`)}`,
      `let ${x}h = ${nz(`${x}vo2`)}`,
    );
  }
  // el plot de resultados
  const cur = `{$${v(3)}}.${x}`;
  out.push('setplot new', `let frequency = real(${q(1, 'frequency')})`, 'settype frequency frequency', 'setscale frequency');
  out.push(`let ${STB_VECTOR} = ${cur}${gft ? 'tgft' : 'ttian'}`, `let t_tian = ${cur}ttian`, `let t_gft = ${cur}tgft`, `let r = ${cur}tgft`, `let d = ${cur}d`);
  if (h) {
    out.push(
      `let g = ${cur}vo2`,
      `let ginf = ${cur}a/${cur}dz`,
      `let dn = ${cur}h/${cur}a`,
      // sin camino directo Dn = 1 exacto: Tn infinito
      'let ts_dn1 = dn-1',
      `let tn = 1/${nz('ts_dn1')}`,
      'let ts_d0 = 1-d',
      `let g0 = (g-ginf*d)/${nz('ts_d0')}`,
      `let ts_tp = ginf/${cur}h-1`,
      `let tp = 1/${nz('ts_tp')}`,
      'unlet ts_dn1 ts_d0 ts_tp',
    );
  }
  out.push(`destroy $${v(1)}${h ? ` $${v(2)}` : ''} $${v(3)}`);
  return out;
}

