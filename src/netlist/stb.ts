// Análisis de estabilidad (.stb) → bloque .control de ngspice.
//
// La sonda (library/sub/Stability/LoopProbe.lib) tiene una fuente de tensión en serie (Vinj),
// un amperímetro (Vprb) y una fuente de corriente en paralelo (Iinj), todas en 0. El .stb corre
// dos análisis AC (tres con la transferencia de lazo cerrado) encendiendo una fuente por vez, con
// todas las demás fuentes del circuito en AC 0, y combina los resultados según las fórmulas de Frank
// Wiedmann (plot.defs de GFT_LTspice.zip, que también da la ganancia de lazo de Tian):
//   Vy = −V(x), Iy = I(Vprb); corrida 1: inyección de tensión, 2: entrada, 3: de corriente
//   D   = Vy1·Iy3 − Vy3·Iy1
//   R   = 1/(1/D − 1)                          (GFT: razón de retorno)
//   Aβ  = 1/(Vy1 + Iy3 − 2·D) − 1              (Tian; simétrica: no importa la orientación)
//   num = Vo2·D + Vo1·(Vy3·Iy2 − Vy2·Iy3) + Vo3·(Vy2·Iy1 − Vy1·Iy2)
//
// Cada método se presenta con su modelo:
//   Tian → modelo A-β sin feedforward: T = −Aβ, G = A/(1 + Aβ) = A/(1 − T).
//          Con entrada y salida: G = Vo2, A = G·(1 − T), β = −T/A.
//   GFT  → modelo asintótico: G = G∞·R/(1+R) + G0/(1+R), con G∞ = num/D (= 1/β),
//          G0 = (G − G∞·D)/(1 − D), Rn = 1/(G/num − 1) (razón de retorno nula), Rp = 1/(G∞/G − 1),
//          y el A-β equivalente: β = 1/G∞, A = G∞·(G∞·R + G0)/(G∞ − G0) (sin G0: A = G∞·R),
//          con su T = −Aβ = −(G∞·R + G0)/(G∞ − G0).
// Los resultados quedan en un plot propio ("stbN" al leerlo, ver engine/ngspice.ts) con la
// frecuencia como escala; los plots de las corridas se borran. Lo marca T (Tian) o R (GFT), y los
// márgenes se calculan sobre R o Aβ = −T (waveform/StbView.tsx).
// Con la sonda diferencial (LoopProbe_Dif) se miden los dos modos en la misma simulación (#333):
// las corridas de inyección de cada sonda interna (xdm, xcm) y una sola con la entrada; en el plot,
// lo que depende del modo lleva _dm o _cm (R_DM, T_CM, GINF_DM…) y G queda sin sufijo.
import type { Analysis } from '../sim/analyses.ts';
import { t } from '../i18n/i18n.ts';

export type StbAnalysis = Extract<Analysis, { kind: 'stb' }>;

/** `x` sin ceros exactos, para dividir por él (ngspice corta todo el .control con "out of range for divide") */
const nz = (x: string) => `(${x}+1e-300*(mag(${x}) lt 1e-300))`;

export interface StbContext {
  /** nombre de ngspice de la sonda ("xlp1"), o undefined si no existe */
  probe: string | undefined;
  /** fuentes independientes V/I del nivel superior (nombres de ngspice): van en AC 0 */
  sources: string[];
  /** nombre de ngspice de la fuente de entrada (transferencia de lazo cerrado) */
  input?: string;
  /** vector de ngspice de la salida ("v(out)") */
  output?: string;
  /** la sonda es la diferencial (LoopProbe_Dif): se miden DM y CM */
  diff?: boolean;
}

/** '' con la sonda simple; con la diferencial, cada modo */
type StbProbeMode = '' | 'dm' | 'cm';

/** Líneas del .control para un .stb (el número `n` hace únicos los nombres) o un error */
export function stbControl(a: StbAnalysis, ctx: StbContext, n: number): string[] | string {
  if (!ctx.probe) return t('.stb: loop probe "{probe}" not found', { probe: a.probe });
  // la sonda diferencial lleva adentro una sonda por modo: se miden siempre los dos (#333)
  const modes: StbProbeMode[] = ctx.diff ? ['dm', 'cm'] : [''];
  const sweep = `ac ${a.sweep.type} ${a.sweep.points} ${a.sweep.start} ${a.sweep.stop}`;
  const gft = a.method === 'gft';
  const h = !!ctx.input && !!ctx.output;
  if (a.input && !ctx.input) return t('.stb: input source "{src}" not found', { src: a.input });
  const v = (k: string) => `ts_stb${n}_${k}`;
  const out: string[] = [`* .stb ${a.probe}`, ...ctx.sources.map((s) => `alter ${s} acmag=0`)];
  const runs: string[] = [];
  const run = (k: string, on: string[], off: string[]) => {
    out.push(...on, sweep, `set ${v(k)} = $curplot`, ...off);
    runs.push(v(k));
  };
  // corridas: inyección de tensión (1) y de corriente (3) en cada modo; la de la entrada (2), una
  // sola para todos (las sondas quedan transparentes)
  for (const m of modes) {
    const p = m ? `${ctx.probe}.x${m}` : ctx.probe;
    run(`${m}1`, [`alter @v.${p}.vinj[acmag]=1`], [`alter @v.${p}.vinj[acmag]=0`]);
    run(`${m}3`, [`alter @i.${p}.iinj[acmag]=1`], [`alter @i.${p}.iinj[acmag]=0`]);
  }
  if (h) run('2', [`alter ${ctx.input} acmag=1`], [`alter ${ctx.input} acmag=0`]);
  // los let quedan en el plot de la última corrida
  const cur = `{$${runs[runs.length - 1]}}.`;
  for (const m of modes) {
    const p = m ? `${ctx.probe}.x${m}` : ctx.probe;
    const q = (k: string, what: string) => `{$${v(k)}}.${what}`;
    const x = `ts_${n}${m}_`;
    out.push(
      `let ${x}vy1 = -${q(`${m}1`, `v(${p}.x)`)}`,
      `let ${x}iy1 = ${q(`${m}1`, `i(v.${p}.vprb)`)}`,
      `let ${x}vy3 = -${q(`${m}3`, `v(${p}.x)`)}`,
      `let ${x}iy3 = ${q(`${m}3`, `i(v.${p}.vprb)`)}`,
      `let ${x}d = ${x}vy1*${x}iy3-${x}vy3*${x}iy1`,
    );
    if (gft) out.push(`let ${x}dz = ${nz(`${x}d`)}`, `let ${x}g = 1/${x}dz-1`, `let ${x}lg = 1/${nz(`${x}g`)}`);
    else out.push(`let ${x}den = ${x}vy1+${x}iy3-2*${x}d`, `let ${x}lg = 1/${nz(`${x}den`)}-1`);
    if (h) {
      out.push(`let ${x}vo2 = ${q('2', ctx.output!)}`, `let ${x}h = ${nz(`${x}vo2`)}`);
      if (gft) {
        out.push(
          `let ${x}vy2 = -${q('2', `v(${p}.x)`)}`,
          `let ${x}iy2 = ${q('2', `i(v.${p}.vprb)`)}`,
          `let ${x}vo1 = ${q(`${m}1`, ctx.output!)}`,
          `let ${x}vo3 = ${q(`${m}3`, ctx.output!)}`,
          `let ${x}num = ${x}vo2*${x}d+${x}vo1*(${x}vy3*${x}iy2-${x}vy2*${x}iy3)+${x}vo3*(${x}vy2*${x}iy1-${x}vy1*${x}iy2)`,
          // num = 0 exacto: la salida es el nodo de la sonda (G∞ = 0)
          `let ${x}num = ${nz(`${x}num`)}`,
        );
      }
    }
  }
  // el plot de resultados; con la sonda diferencial, lo que depende del modo lleva _dm o _cm
  out.push('setplot new', `let frequency = real({$${runs[0]}}.frequency)`, 'settype frequency frequency', 'setscale frequency');
  // la transferencia de lazo cerrado es la misma para los dos modos
  if (h) out.push(`let g = ${cur}ts_${n}${modes[0]}_vo2`);
  for (const m of modes) {
    const x = `${cur}ts_${n}${m}_`;
    const s = m ? `_${m}` : '';
    if (!gft) {
      // modelo A-β: T = −Aβ
      out.push(`let ab${s} = ${x}lg`, `let t${s} = -ab${s}`);
      if (h) out.push(`let a${s} = g*(1-t${s})`, `let ts_a = a${s}`, `let beta${s} = -t${s}/${nz('ts_a')}`, 'unlet ts_a');
    } else {
      // modelo asintótico
      out.push(`let r${s} = ${x}lg`);
      if (h) {
        out.push(
          `let ginf${s} = ${x}num/${x}dz`,
          'let ts_d0 = 1-' + `${x}d`,
          `let g0${s} = (g-ginf${s}*${x}d)/${nz('ts_d0')}`,
          // sin camino directo G/num = 1 exacto: Rn infinita
          `let ts_rn = ${x}h/${x}num-1`,
          `let rn${s} = 1/${nz('ts_rn')}`,
          `let ts_rp = ginf${s}/${x}h-1`,
          `let rp${s} = 1/${nz('ts_rp')}`,
          // A-β equivalente (el camino directo queda dentro de A)
          `let ts_gi = ginf${s}`,
          `let beta${s} = 1/${nz('ts_gi')}`,
          `let ts_gg = ginf${s}-g0${s}`,
          `let a${s} = ginf${s}*(ginf${s}*r${s}+g0${s})/${nz('ts_gg')}`,
          `let ab${s} = a${s}*beta${s}`,
          `let t${s} = -ab${s}`,
          'unlet ts_d0 ts_rn ts_rp ts_gi ts_gg',
        );
      }
    }
  }
  out.push(`destroy ${runs.map((r) => `$${r}`).join(' ')}`);
  return out;
}
