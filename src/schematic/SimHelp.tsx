// Ayuda de cada análisis (#331): un ícono cuadrado "i" en la barra de la simulación que, al posar
// el mouse, abre un globo con lo justo para usarlo. El del .stb (#332) trae los dos modelos de
// realimentación (A-β para Tian y ganancia asintótica para el GFT), cómo se pasa de uno al otro y
// dónde va la LoopProbe en el lazo. El mismo globo (HoverPop) explica la caja de la sonda vacía.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Library } from '../library/library.ts';
import type { AnalysisKind } from '../sim/analyses.ts';
import { t } from '../i18n/i18n.ts';

const POP_W = 440;

/**
 * Globo que se abre al posar el mouse (o con el foco) sobre `children`. Queda abierto mientras el
 * mouse está en el ancla o en el globo: al salir se cierra con una demora corta, así se puede
 * cruzar el hueco entre los dos y leer, desplazar o seleccionar.
 */
export function HoverPop({ pop, children, className, label, width = POP_W, focusable = true }: {
  pop: ReactNode;
  children: ReactNode;
  className?: string;
  label?: string;
  width?: number;
  /** el ancla toma el foco (un ícono suelto); no, si adentro ya hay un campo */
  focusable?: boolean;
}) {
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const timer = useRef(0);
  const keep = () => window.clearTimeout(timer.current);
  const close = () => {
    keep();
    timer.current = window.setTimeout(() => setPos(null), 250);
  };
  useEffect(() => keep, []);
  const open = (el: HTMLElement) => {
    keep();
    // fijo en la ventana, debajo del ancla y sin salirse por los costados
    const r = el.getBoundingClientRect();
    const w = Math.min(width, window.innerWidth - 16);
    setPos({ width: w, top: r.bottom + 6, left: Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8)), maxHeight: window.innerHeight - r.bottom - 14 });
  };
  return (
    <span
      className={`hpop-anchor${className ? ` ${className}` : ''}${pos ? ' open' : ''}`}
      tabIndex={focusable ? 0 : undefined}
      aria-label={label}
      aria-expanded={focusable ? !!pos : undefined}
      onMouseEnter={(e) => open(e.currentTarget)}
      onMouseLeave={close}
      onFocus={focusable ? (e) => open(e.currentTarget) : undefined}
      onBlur={focusable ? close : undefined}
      onKeyDown={(e) => e.key === 'Escape' && setPos(null)}
    >
      {children}
      {pos &&
        createPortal(
          <div className="hpop" role="tooltip" style={pos} onMouseEnter={keep} onMouseLeave={close}>
            {pop}
          </div>,
          document.body,
        )}
    </span>
  );
}

// ---------- notación matemática (hasta que entre el LaTeX de #328) ----------

/** Fracción apilada */
const Frac = ({ n, d }: { n: ReactNode; d: ReactNode }) => (
  <span className="mx-frac">
    <span>{n}</span>
    <span>{d}</span>
  </span>
);
/** Variable en itálica, con subíndice opcional */
const V = ({ v, sub }: { v: string; sub?: string }) => (
  <i>
    {v}
    {sub && <sub>{sub}</sub>}
  </i>
);
const Ginf = () => <V v="G" sub="∞" />;
const G0 = () => <V v="G" sub="0" />;
/** Ecuación en su renglón, centrada */
const Eq = ({ children }: { children: ReactNode }) => <div className="mx">{children}</div>;

// ---------- diagramas ----------

const Arrow = ({ id }: { id: string }) => (
  <defs>
    <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0L10 5L0 10z" className="stbm-head" />
    </marker>
  </defs>
);

/** Sumador: círculo con el signo de cada entrada */
const Sum = ({ x, y, signs }: { x: number; y: number; signs: [string, number, number][] }) => (
  <g>
    <circle cx={x} cy={y} r={13} className="stbm-sum" />
    {signs.map(([s, dx, dy], i) => (
      <text key={i} x={x + dx} y={y + dy} className="stbm-sign" textAnchor="middle" dominantBaseline="central">
        {s}
      </text>
    ))}
  </g>
);

/** Texto centrado (en x e y) en un punto: así queda en el medio de su caja */
const Lbl = ({ x, y, children, small }: { x: number; y: number; children: ReactNode; small?: boolean }) => (
  <text x={x} y={y} className={`stbm-lbl${small ? ' stbm-small' : ''}`} textAnchor="middle" dominantBaseline="central">
    {children}
  </text>
);

/** La LoopProbe con su dibujo del skin elegido, centrada en (x, y) */
function Probe({ lib, x, y, s = 0.75 }: { lib?: Library; x: number; y: number; s?: number }) {
  const skin = lib?.skin('LoopProbe');
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} className="stbm-probe">
      {skin ? (
        <g className="sym" dangerouslySetInnerHTML={{ __html: skin.body }} />
      ) : (
        // sin librería: el dibujo del .asy (caja con la flecha)
        <g className="sym">
          <rect x={-32} y={-12} width={64} height={24} fill="none" />
          <path d="M-48 0H-32M32 0H48M-20 0H18M10 -5L18 0L10 5" fill="none" />
        </g>
      )}
    </g>
  );
}

/** Lazo A-β; con `lib`, la LoopProbe entre la salida de A y el nodo de salida (dónde va) */
function ABeta({ lib, probe }: { lib?: Library; probe?: boolean }) {
  const m = probe ? 'url(#stbm-p)' : 'url(#stbm-a)';
  // con la sonda, todo lo que sigue a A se corre a la derecha
  const d = probe ? 112 : 0;
  const out = 252 + d;
  return (
    <svg viewBox={`0 14 ${342 + d} 120`} className="stbm-svg" role="img" aria-label={probe ? t('Where the loop probe goes') : t('A-β model')}>
      <Arrow id={probe ? 'stbm-p' : 'stbm-a'} />
      <text x={6} y={46} className="stbm-io" dominantBaseline="central">x</text>
      <line x1={22} y1={46} x2={63} y2={46} markerEnd={m} />
      <Sum x={78} y={46} signs={[['+', -16, -12], ['−', -13, 17]]} />
      <line x1={91} y1={46} x2={128} y2={46} markerEnd={m} />
      <polygon points="130,20 130,72 190,46" className="stbm-amp" />
      <Lbl x={150} y={46}>A</Lbl>
      {probe ? (
        <>
          <line x1={190} y1={46} x2={200} y2={46} />
          <Probe lib={lib} x={248} y={46} s={1} />
          <line x1={296} y1={46} x2={out} y2={46} />
          <line x1={out} y1={46} x2={out + 46} y2={46} markerEnd={m} />
        </>
      ) : (
        <line x1={190} y1={46} x2={out + 46} y2={46} markerEnd={m} />
      )}
      <circle cx={out} cy={46} r={3} className="stbm-dot" />
      <text x={out + 52} y={46} className="stbm-io" dominantBaseline="central">y</text>
      <polyline points={`${out},46 ${out},112 ${150 + d / 2 + 34},112`} markerEnd={m} />
      <rect x={150 + d / 2 - 32} y={94} width={64} height={36} rx={6} className="stbm-fb" />
      <Lbl x={150 + d / 2} y={112}>β</Lbl>
      <polyline points={`${150 + d / 2 - 32},112 78,112 78,61`} markerEnd={m} />
    </svg>
  );
}

function Asymptotic() {
  const m = 'url(#stbm-g)';
  return (
    <svg viewBox="0 12 380 180" className="stbm-svg" role="img" aria-label={t('Asymptotic gain model')}>
      <Arrow id="stbm-g" />
      <text x={6} y={110} className="stbm-io" dominantBaseline="central">x</text>
      <line x1={22} y1={110} x2={75} y2={110} markerEnd={m} />
      <circle cx={46} cy={110} r={3} className="stbm-dot" />
      <polyline points="46,110 46,40 138,40" markerEnd={m} />
      <rect x={140} y={22} width={64} height={36} rx={6} className="stbm-ff" />
      <Lbl x={172} y={40}>
        G<tspan className="stbm-sub" dy={4}>0</tspan>
      </Lbl>
      <polyline points="204,40 290,40 290,95" markerEnd={m} />
      <Sum x={90} y={110} signs={[['+', -16, -12], ['−', -13, 17]]} />
      <line x1={103} y1={110} x2={126} y2={110} markerEnd={m} />
      <polygon points="128,78 128,142 204,110" className="stbm-amp" />
      <Lbl x={156} y={110} small>
        R·G<tspan className="stbm-sub" dy={3}>∞</tspan>
      </Lbl>
      <line x1={204} y1={110} x2={275} y2={110} markerEnd={m} />
      {/* igual que el restador, con + en las dos entradas */}
      <Sum x={290} y={110} signs={[['+', -16, -12], ['+', 12, -16]]} />
      <line x1={303} y1={110} x2={350} y2={110} markerEnd={m} />
      <circle cx={326} cy={110} r={3} className="stbm-dot" />
      <text x={356} y={110} className="stbm-io" dominantBaseline="central">y</text>
      <polyline points="326,110 326,172 242,172" markerEnd={m} />
      <rect x={176} y={154} width={64} height={36} rx={6} className="stbm-fb" />
      <Lbl x={208} y={172} small>
        1/G<tspan className="stbm-sub" dy={3}>∞</tspan>
      </Lbl>
      <polyline points="176,172 90,172 90,125" markerEnd={m} />
    </svg>
  );
}

/** Dónde va la LoopProbe: el lazo con la sonda y cómo se la pone */
export function ProbePlacement({ lib }: { lib?: Library }) {
  return (
    <>
      <ABeta lib={lib} probe />
      <p>{t('Insert a LoopProbe (or LoopProbe_Dif for a differential loop) from the Component menu, Stability library, in series anywhere in the loop, with its arrow in the direction of the signal. In any other analysis it is a short circuit.')}</p>
    </>
  );
}

function StbHelp({ lib }: { lib?: Library }) {
  return (
    <>
      <section>
        <h4>{t('Where the loop probe goes')}</h4>
        <ProbePlacement lib={lib} />
      </section>
      <section>
        <h4>{t('GFT → asymptotic gain model')}</h4>
        <Asymptotic />
        <Eq>
          <V v="G" /> = <Ginf /> <Frac n={<V v="R" />} d={<>1 + <V v="R" /></>} /> + <Frac n={<G0 />} d={<>1 + <V v="R" /></>} />
        </Eq>
        <p>{t('R: return ratio; G∞: gain when R → ∞ (= 1/β); G0: gain when R = 0 (direct path).')}</p>
      </section>
      <section>
        <h4>{t('Tian → A-β model')}</h4>
        <ABeta />
        <Eq>
          <V v="T" /> = −<V v="A" />
          <V v="β" />
          <span className="mx-gap" />
          <V v="G" /> = <Frac n={<V v="A" />} d={<>1 + <V v="A" /><V v="β" /></>} /> = <Frac n={<V v="A" />} d={<>1 − <V v="T" /></>} />
        </Eq>
        <p>{t('A: amplifier block; β: feedback block. With an input and an output it gives A = G·(1 − T) and β = −T/A.')}</p>
      </section>
      <section>
        <h4>{t('Equivalence')}</h4>
        <Eq>
          <V v="β" /> = <Frac n="1" d={<Ginf />} />
          <span className="mx-gap" />
          <V v="A" /> = <Frac n={<><Ginf />(<Ginf /><V v="R" /> + <G0 />)</>} d={<><Ginf /> − <G0 /></>} />
        </Eq>
        <p>{t('Without direct path (G0 = 0) both models are the same: A = G∞·R, Aβ = R and T = −R. With G0 ≠ 0 the equivalent A absorbs the direct path.')}</p>
      </section>
    </>
  );
}

/** Lo justo de cada análisis: qué calcula y qué hace falta en el circuito */
const HELP: Record<Exclude<AnalysisKind, 'stb'>, () => string[]> = {
  tran: () => [
    t('Simulates the circuit over time, from 0 to the stop time.'),
    t('Save from: results before that time are not kept. Maximum step: limits the time step (useful for fast edges).'),
  ],
  ac: () => [t('Small-signal frequency response around the operating point (Bode plot).'), t('The excitation source needs "AC 1" in its value.')],
  op: () => [t('DC voltages and currents of every node and component.'), t('After running, annotate them on the schematic (OP) or click with the probe.')],
  dc: () => [t('Sweeps a source (and optionally a second one, nested) and solves the operating point at each step.'), t('Typical use: transfer and I–V curves.')],
  noise: () => [
    t('Noise spectral density at the output, and referred to the input source.'),
    t('Output: the node where noise is measured (Reference: the other node, ground if empty). Source: the input source the noise is referred to.'),
  ],
  tf: () => [t('DC gain from the source to the output, and the input and output resistances.')],
  sens: () => [t('Sensitivity of the output to every parameter of the circuit (DC, or in AC over a frequency sweep).')],
  pz: () => [t('Poles and zeros of the transfer function between the input and output nodes.'), t('Transfer V/V: voltage gain; V/I: transimpedance (input current source).')],
  disto: () => [t('Small-signal harmonic and intermodulation distortion.'), t('The sources need DISTOF1 (and DISTOF2 for intermodulation) in their value.')],
  sp: () => [t('S-parameters of the ports over a frequency sweep.'), t('Each port is a voltage source with "portnum N z0 50" in its value.')],
};

export function SimHelp({ kind, label, lib }: { kind: AnalysisKind; label: string; lib?: Library }) {
  const pop =
    kind === 'stb' ? (
      <StbHelp lib={lib} />
    ) : (
      <section>
        <h4>{label}</h4>
        {HELP[kind]().map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </section>
    );
  return (
    <HoverPop pop={pop} className="sim-help" label={t('Help: {what}', { what: label })} width={kind === 'stb' ? POP_W : 320}>
      <span className="sim-help-icon" aria-hidden>
        i
      </span>
    </HoverPop>
  );
}
