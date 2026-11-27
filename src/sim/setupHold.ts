// Setup y hold de los flip-flops: un símbolo los declara con «SYMATTR SetupHold <dato> <reloj> <tsu>
// <th>» (pines y tiempos, como los de su hoja de datos). Después de simular, en las señales de esos
// dos pines: si el dato cambia menos de tsu antes de un flanco de subida del reloj, o menos de th
// después, la simulación lo avisa. XSPICE toma el dato igual (no hay metaestabilidad): en el
// circuito, ese flanco podría tomar cualquiera de los dos valores.
import { paramNumber } from '../hdl/electrical.ts';
import { t } from '../i18n/i18n.ts';
import { DISPLAY_PREFIXES, formatSi, parseSpiceNumber } from '../netlist/spicenum.ts';
import type { Element } from '../netlist/ltnetlist.ts';

/** Una señal: tensión, o los cambios de un nodo digital (0, 1, X = 0,5) */
export interface Wave {
  x: Float64Array;
  y: Float64Array;
  digital: boolean;
}

/** Instantes en que la señal pasa `level` (subiendo, si `rising`); una digital, en el instante del cambio */
function crossings({ x, y, digital }: Wave, level: number, rising: boolean): number[] {
  const out: number[] = [];
  for (let k = 1; k < y.length; k++) {
    const [a, b] = [y[k - 1], y[k]];
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    const up = a < level && b >= level;
    if (up || (!rising && a >= level && b < level)) out.push(digital ? x[k] : x[k - 1] + ((level - a) / (b - a || 1)) * (x[k] - x[k - 1]));
  }
  return out;
}

/**
 * Las violaciones de setup/hold de la corrida (una por instancia: la primera, y cuántas hubo).
 * `vector(net)`: la señal de una red en el transitorio (null si no se guardó).
 */
export function setupHoldProblems(elements: Element[], vector: (net: string) => Wave | null): string[] {
  const out: string[] = [];
  const s = (v: number) => `${formatSi(v, 4, DISPLAY_PREFIXES)}s`;
  for (const e of elements) {
    const spec = e.attrs.get('SetupHold')?.trim().split(/\s+/);
    if (!spec || spec.length !== 4) continue;
    const [dPin, cPin, tsu, th] = [spec[0].toLowerCase(), spec[1].toLowerCase(), parseSpiceNumber(spec[2]), parseSpiceNumber(spec[3])];
    const net = (pin: string) => e.nodes[e.pinNames.findIndex((p) => p.toLowerCase() === pin)];
    const [d, clk] = [net(dPin), net(cPin)].map((n) => (n ? vector(n) : null));
    if (!d || !clk) continue;
    // (el umbral: entre VIL y VIH de la instancia)
    const ps = Object.fromEntries([...(e.attrs.get('SpiceLine') ?? '').matchAll(/(\w+)=(\S+)/g)].map((m) => [m[1].toLowerCase(), m[2]]));
    const mid = (paramNumber('vil', ps) + paramNumber('vih', ps)) / 2;
    const level = (w: Wave) => (w.digital || !Number.isFinite(mid) ? 0.5 : mid);
    const edges = crossings(clk, level(clk), true);
    const changes = crossings(d, level(d), false);
    const bad = edges.flatMap((tc) => changes.filter((td) => td > tc - tsu && td < tc + th).map((td) => ({ tc, td })));
    if (!bad.length) continue;
    const { tc, td } = bad[0];
    const name = e.name.replace(/^X§/, '').replace(/^x(?=[a-z])/i, '');
    out.push(
      td <= tc
        ? t('{name}: {d} changes {dt} before the clock edge at {tc} (setup {tsu}); {n} in total', { name, d: spec[0], dt: s(tc - td), tc: s(tc), tsu: s(tsu), n: bad.length })
        : t('{name}: {d} changes {dt} after the clock edge at {tc} (hold {th}); {n} in total', { name, d: spec[0], dt: s(td - tc), tc: s(tc), th: s(th), n: bad.length }),
    );
  }
  return out;
}
