// Ícono de información del .stb: al posar el mouse muestra los dos modelos de realimentación
// (A-β para Tian y ganancia asintótica para el GFT) y cómo se pasa de uno al otro.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n/i18n.ts';

const Arrow = ({ id }: { id: string }) => (
  <defs>
    <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0L10 5L0 10z" className="stbm-head" />
    </marker>
  </defs>
);

/** Sumador: círculo con los signos de cada entrada */
const Sum = ({ x, y, signs }: { x: number; y: number; signs: [string, number, number][] }) => (
  <g>
    <circle cx={x} cy={y} r={13} className="stbm-sum" />
    {signs.map(([s, dx, dy], i) => (
      <text key={i} x={x + dx} y={y + dy} className="stbm-sign">
        {s}
      </text>
    ))}
  </g>
);

function ABeta() {
  const m = 'url(#stbm-a)';
  return (
    <svg viewBox="0 0 360 160" className="stbm-svg" role="img" aria-label={t('A-β model')}>
      <Arrow id="stbm-a" />
      <text x={6} y={60} className="stbm-io">x</text>
      <line x1={28} y1={56} x2={65} y2={56} markerEnd={m} />
      <Sum x={80} y={56} signs={[['+', -20, -8], ['−', -16, 26]]} />
      <line x1={93} y1={56} x2={134} y2={56} markerEnd={m} />
      <polygon points="136,30 136,82 196,56" className="stbm-amp" />
      <text x={155} y={61} className="stbm-lbl">A</text>
      <line x1={196} y1={56} x2={304} y2={56} markerEnd={m} />
      <circle cx={256} cy={56} r={3} className="stbm-dot" />
      <text x={310} y={60} className="stbm-io">y</text>
      <polyline points="256,56 256,124 214,124" markerEnd={m} />
      <rect x={150} y={106} width={62} height={36} rx={6} className="stbm-fb" />
      <text x={181} y={129} className="stbm-lbl" textAnchor="middle">β</text>
      <polyline points="150,124 80,124 80,71" markerEnd={m} />
    </svg>
  );
}

function Asymptotic() {
  const m = 'url(#stbm-g)';
  return (
    <svg viewBox="0 0 380 200" className="stbm-svg" role="img" aria-label={t('Asymptotic gain model')}>
      <Arrow id="stbm-g" />
      <text x={6} y={114} className="stbm-io">x</text>
      <line x1={28} y1={110} x2={75} y2={110} markerEnd={m} />
      <circle cx={50} cy={110} r={3} className="stbm-dot" />
      <polyline points="50,110 50,40 138,40" markerEnd={m} />
      <rect x={140} y={22} width={64} height={36} rx={6} className="stbm-ff" />
      <text x={172} y={45} className="stbm-lbl" textAnchor="middle">G<tspan className="stbm-sub" dy={4}>0</tspan></text>
      <polyline points="204,40 290,40 290,95" markerEnd={m} />
      <Sum x={90} y={110} signs={[['+', -20, -8], ['−', -16, 26]]} />
      <line x1={103} y1={110} x2={126} y2={110} markerEnd={m} />
      <polygon points="128,78 128,142 204,110" className="stbm-amp" />
      <text x={136} y={115} className="stbm-lbl stbm-small">R·G∞</text>
      <line x1={204} y1={110} x2={275} y2={110} markerEnd={m} />
      <Sum x={290} y={110} signs={[['+', -4, 5]]} />
      <line x1={303} y1={110} x2={350} y2={110} markerEnd={m} />
      <circle cx={328} cy={110} r={3} className="stbm-dot" />
      <text x={354} y={114} className="stbm-io">y</text>
      <polyline points="328,110 328,172 242,172" markerEnd={m} />
      <rect x={176} y={154} width={64} height={36} rx={6} className="stbm-fb" />
      <text x={208} y={177} className="stbm-lbl stbm-small" textAnchor="middle">1/G∞</text>
      <polyline points="176,172 90,172 90,125" markerEnd={m} />
    </svg>
  );
}

const POP_W = 420;

export function StbModelsInfo() {
  // abierto mientras el mouse está en el ícono o en el globo; al salir se cierra con una demora
  // corta, así se puede cruzar el hueco entre los dos y leer, desplazar o seleccionar el globo
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
    // fijo en la ventana, debajo del ícono y sin salirse por los costados
    const r = el.getBoundingClientRect();
    const w = Math.min(POP_W, window.innerWidth - 16);
    setPos({ width: w, top: r.bottom + 4, left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)), maxHeight: window.innerHeight - r.bottom - 12 });
  };
  return (
    <span
      className={`stbm${pos ? ' open' : ''}`}
      tabIndex={0}
      aria-label={t('Feedback models')}
      aria-expanded={!!pos}
      onMouseEnter={(e) => open(e.currentTarget)}
      onMouseLeave={close}
      onFocus={(e) => open(e.currentTarget)}
      onBlur={close}
      onKeyDown={(e) => e.key === 'Escape' && setPos(null)}
    >
      <span className="stbm-icon" aria-hidden>i</span>
      {pos && createPortal(<div className="stbm-pop" role="tooltip" style={pos} onMouseEnter={keep} onMouseLeave={close}>
        <section>
          <h4>{t('Tian → A-β model')}</h4>
          <ABeta />
          <p className="stbm-eq">{'T = −Aβ  ·  G = A / (1 + Aβ) = A / (1 − T)'}</p>
          <p>{t('A: amplifier block; β: feedback block. With an input and an output it gives A = G·(1 − T) and β = −T/A.')}</p>
        </section>
        <section>
          <h4>{t('GFT → asymptotic gain model')}</h4>
          <Asymptotic />
          <p className="stbm-eq">{'G = G∞·R/(1+R) + G0/(1+R)'}</p>
          <p>{t('R: return ratio; G∞: gain when R → ∞ (= 1/β); G0: gain when R = 0 (direct path).')}</p>
        </section>
        <section className="stbm-equiv">
          <h4>{t('Equivalence')}</h4>
          <p className="stbm-eq">{'β = 1/G∞  ·  A = G∞·(G∞·R + G0)/(G∞ − G0)'}</p>
          <p>{t('Without direct path (G0 = 0) both models are the same: A = G∞·R, Aβ = R and T = −R. With G0 ≠ 0 the equivalent A absorbs the direct path.')}</p>
        </section>
      </div>, document.body)}
    </span>
  );
}
