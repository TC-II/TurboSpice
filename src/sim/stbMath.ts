// Cuentas sobre la ganancia de lazo T(jω) de un .stb: márgenes de fase y de ganancia, un
// modelo racional de T (vector fitting, Gustavsen y Semlyen 1999) del que salen sus polos y
// ceros, los polos del lazo cerrado (ceros de 1 + T) y el lugar de raíces de 1 + k·T.
//
// El modelo queda en variables de estado reales, T(s) = c·(sI − A)⁻¹·b + d, con s normalizada
// por ωn. Los polos con ganancia k son los autovalores de A − b·k/(1 + k·d)·c, así que el lugar
// de raíces y el lazo cerrado (k = 1) son autovalores; los ceros de T son el límite k → ∞.

export interface Complex {
  re: number;
  im: number;
}

// --- márgenes ------------------------------------------------------------------------------

export interface Crossing {
  /** frecuencia [Hz] */
  f: number;
  /** margen: de fase [°] en el cruce de 0 dB, de ganancia [dB] en el de −180° */
  margin: number;
}

export interface Margins {
  /** cruces de |T| = 1 (frecuencia de cruce) con su margen de fase */
  phase: Crossing[];
  /** cruces de la fase por −180° (+ k·360°) con su margen de ganancia */
  gain: Crossing[];
}

/** Fase desenrollada [°] de T */
export function unwrappedPhase(re: ArrayLike<number>, im: ArrayLike<number>): number[] {
  const out: number[] = [];
  let off = 0;
  for (let i = 0; i < re.length; i++) {
    const p = (Math.atan2(im[i], re[i]) * 180) / Math.PI;
    if (i) {
      const prev = out[i - 1] - off;
      if (p - prev > 180) off -= 360;
      else if (p - prev < -180) off += 360;
    }
    out.push(p + off);
  }
  return out;
}

/** Márgenes de fase y de ganancia de T(f), interpolando en log f */
export function margins(f: ArrayLike<number>, re: ArrayLike<number>, im: ArrayLike<number>): Margins {
  const db = Array.from(f, (_, i) => 20 * Math.log10(Math.hypot(re[i], im[i])));
  const ph = unwrappedPhase(re, im);
  const lf = Array.from(f, (x) => Math.log10(Math.max(x, 1e-30)));
  const at = (i: number, u: number, y: number[]) => y[i] + u * (y[i + 1] - y[i]);
  const out: Margins = { phase: [], gain: [] };
  for (let i = 0; i + 1 < f.length; i++) {
    if (Number.isFinite(db[i]) && Number.isFinite(db[i + 1]) && (db[i] >= 0) !== (db[i + 1] >= 0)) {
      const u = db[i] / (db[i] - db[i + 1]);
      // margen = 180° + fase, llevado a (−180°, 180°]
      const m = (((180 + at(i, u, ph)) % 360) + 540) % 360 - 180;
      out.phase.push({ f: 10 ** at(i, u, lf), margin: m === -180 ? 180 : m });
    }
    // cruces de −180° + k·360°
    const k0 = Math.ceil((Math.min(ph[i], ph[i + 1]) + 180) / 360);
    const k1 = Math.floor((Math.max(ph[i], ph[i + 1]) + 180) / 360);
    for (let k = k0; k <= k1; k++) {
      const target = -180 + 360 * k;
      if (ph[i] === ph[i + 1] || (target === ph[i + 1] && i + 2 < f.length)) continue;
      const u = (target - ph[i]) / (ph[i + 1] - ph[i]);
      out.gain.push({ f: 10 ** at(i, u, lf), margin: -at(i, u, db) });
    }
  }
  return out;
}

// --- álgebra lineal chica -----------------------------------------------------------------

/** Mínimos cuadrados reales (Householder QR) de M·x ≈ y; M en filas */
export function leastSquares(M: number[][], y: number[]): number[] {
  const m = M.length;
  const n = M[0].length;
  const A = M.map((r) => r.slice());
  const b = y.slice();
  // escala de columnas: mejora el condicionamiento
  const sc = Array.from({ length: n }, (_, j) => Math.sqrt(A.reduce((s, r) => s + r[j] * r[j], 0)) || 1);
  for (const r of A) for (let j = 0; j < n; j++) r[j] /= sc[j];
  for (let k = 0; k < n; k++) {
    let norm = 0;
    for (let i = k; i < m; i++) norm += A[i][k] * A[i][k];
    norm = Math.sqrt(norm);
    if (!norm) continue;
    const alpha = A[k][k] > 0 ? -norm : norm;
    const v = Array.from({ length: m - k }, (_, i) => A[k + i][k]);
    v[0] -= alpha;
    const vv = v.reduce((s, x) => s + x * x, 0);
    if (!vv) continue;
    for (let j = k; j < n; j++) {
      let s = 0;
      for (let i = 0; i < v.length; i++) s += v[i] * A[k + i][j];
      s = (2 * s) / vv;
      for (let i = 0; i < v.length; i++) A[k + i][j] -= s * v[i];
    }
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i] * b[k + i];
    s = (2 * s) / vv;
    for (let i = 0; i < v.length; i++) b[k + i] -= s * v[i];
  }
  const x = new Array<number>(n).fill(0);
  for (let k = n - 1; k >= 0; k--) {
    let s = b[k];
    for (let j = k + 1; j < n; j++) s -= A[k][j] * x[j];
    x[k] = Math.abs(A[k][k]) > 1e-300 ? s / A[k][k] : 0;
  }
  return x.map((v, j) => v / sc[j]);
}

/** Autovalores de una matriz real cuadrada (Hessenberg + QR complejo con desplazamiento de Wilkinson) */
export function eigenvalues(M: number[][]): Complex[] {
  const n = M.length;
  if (!n) return [];
  const a = M.map((r) => r.slice());
  // Hessenberg por eliminación con pivoteo (elmhes)
  for (let m = 1; m < n - 1; m++) {
    let x = 0;
    let p = m;
    for (let j = m; j < n; j++) if (Math.abs(a[j][m - 1]) > Math.abs(x)) [x, p] = [a[j][m - 1], j];
    if (p !== m) {
      [a[p], a[m]] = [a[m], a[p]];
      for (const r of a) [r[p], r[m]] = [r[m], r[p]];
    }
    if (!x) continue;
    for (let i = m + 1; i < n; i++) {
      const y = a[i][m - 1] / x;
      if (!y) continue;
      a[i][m - 1] = 0;
      for (let j = m; j < n; j++) a[i][j] -= y * a[m][j];
      for (let j = 0; j < n; j++) a[j][m] += y * a[j][i];
    }
  }
  const re = a.map((r) => r.slice());
  const im = a.map((r) => r.map(() => 0));
  const out: Complex[] = [];
  let hi = n - 1;
  let iter = 0;
  const abs = (i: number, j: number) => Math.hypot(re[i][j], im[i][j]);
  while (hi >= 0) {
    if (hi === 0) {
      out.push({ re: re[0][0], im: im[0][0] });
      hi--;
      continue;
    }
    let lo = hi;
    while (lo > 0 && abs(lo, lo - 1) > 1e-14 * (abs(lo, lo) + abs(lo - 1, lo - 1) || 1)) lo--;
    if (lo === hi) {
      out.push({ re: re[hi][hi], im: im[hi][hi] });
      hi--;
      iter = 0;
      continue;
    }
    if (++iter > 300) {
      // no converge: lo que quede de la diagonal
      for (let i = hi; i >= 0; i--) out.push({ re: re[i][i], im: im[i][i] });
      break;
    }
    // desplazamiento: el autovalor del bloque 2×2 final más cercano a a[hi][hi]
    const [ar, ai, br, bi, cr, ci, dr, di] = [re[hi - 1][hi - 1], im[hi - 1][hi - 1], re[hi - 1][hi], im[hi - 1][hi], re[hi][hi - 1], im[hi][hi - 1], re[hi][hi], im[hi][hi]];
    // tr/2 ± sqrt((a−d)²/4 + b·c)
    const hr = (ar - dr) / 2;
    const hii = (ai - di) / 2;
    const qr = hr * hr - hii * hii + (br * cr - bi * ci);
    const qi = 2 * hr * hii + (br * ci + bi * cr);
    const mod = Math.hypot(qr, qi);
    let sr = Math.sqrt(Math.max(0, (mod + qr) / 2));
    let si = Math.sign(qi || 1) * Math.sqrt(Math.max(0, (mod - qr) / 2));
    const mr = (ar + dr) / 2;
    const mi = (ai + di) / 2;
    const d1 = Math.hypot(mr + sr - dr, mi + si - di);
    const d2 = Math.hypot(mr - sr - dr, mi - si - di);
    if (d2 < d1) [sr, si] = [-sr, -si];
    let mur = mr + sr;
    let mui = mi + si;
    if (iter % 11 === 10) {
      // desplazamiento excepcional
      mur = dr + Math.abs(cr) * 0.75;
      mui = di;
    }
    for (let i = lo; i <= hi; i++) {
      re[i][i] -= mur;
      im[i][i] -= mui;
    }
    // QR con rotaciones de Givens, y R·Q
    const rots: [number, number, number][] = [];
    for (let k = lo; k < hi; k++) {
      const xr = re[k][k];
      const xi = im[k][k];
      const yr = re[k + 1][k];
      const yi = im[k + 1][k];
      const ax = Math.hypot(xr, xi);
      const r = Math.hypot(ax, Math.hypot(yr, yi));
      let c: number;
      let gr: number;
      let gi: number;
      if (!r) [c, gr, gi] = [1, 0, 0];
      else if (!ax) [c, gr, gi] = [0, 1, 0];
      else {
        c = ax / r;
        // s = (x/|x|)·conj(y)/r
        const ur = xr / ax;
        const ui = xi / ax;
        gr = (ur * yr + ui * yi) / r;
        gi = (ui * yr - ur * yi) / r;
      }
      rots.push([c, gr, gi]);
      for (let j = k; j <= hi; j++) {
        const pr = re[k][j];
        const pi = im[k][j];
        const qr2 = re[k + 1][j];
        const qi2 = im[k + 1][j];
        // fila k: c·p + s·q ; fila k+1: −conj(s)·p + c·q
        re[k][j] = c * pr + (gr * qr2 - gi * qi2);
        im[k][j] = c * pi + (gr * qi2 + gi * qr2);
        re[k + 1][j] = -(gr * pr + gi * pi) + c * qr2;
        im[k + 1][j] = -(gr * pi - gi * pr) + c * qi2;
      }
    }
    rots.forEach(([c, gr, gi], idx) => {
      const k = lo + idx;
      for (let i = lo; i <= Math.min(hi, k + 2); i++) {
        const pr = re[i][k];
        const pi = im[i][k];
        const qr2 = re[i][k + 1];
        const qi2 = im[i][k + 1];
        // columnas por G^H: k = c·p + conj(s)·q ; k+1 = −s·p + c·q
        re[i][k] = c * pr + (gr * qr2 + gi * qi2);
        im[i][k] = c * pi + (gr * qi2 - gi * qr2);
        re[i][k + 1] = -(gr * pr - gi * pi) + c * qr2;
        im[i][k + 1] = -(gr * pi + gi * pr) + c * qi2;
      }
    });
    for (let i = lo; i <= hi; i++) {
      re[i][i] += mur;
      im[i][i] += mui;
    }
  }
  return out;
}

// --- modelo racional ---------------------------------------------------------------------

export interface RationalModel {
  /** escala de s: s = ωn·s̃ [rad/s] */
  wn: number;
  A: number[][];
  b: number[];
  c: number[];
  d: number;
  /** polos de T [rad/s] */
  poles: Complex[];
  /** error relativo rms del ajuste */
  error: number;
}

/** bloques reales de A, b a partir de polos (los complejos, con su conjugado una sola vez) */
function realForm(poles: Complex[]): { A: number[][]; b: number[]; kinds: ('r' | 'c1' | 'c2')[] } {
  const n = poles.reduce((s, p) => s + (p.im ? 2 : 1), 0);
  const A = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const b = new Array<number>(n).fill(0);
  const kinds: ('r' | 'c1' | 'c2')[] = [];
  let i = 0;
  for (const p of poles) {
    if (!p.im) {
      A[i][i] = p.re;
      b[i] = 1;
      kinds.push('r');
      i++;
    } else {
      A[i][i] = A[i + 1][i + 1] = p.re;
      A[i][i + 1] = p.im;
      A[i + 1][i] = -p.im;
      b[i] = 2;
      kinds.push('c1', 'c2');
      i += 2;
    }
  }
  return { A, b, kinds };
}

/** columnas de la base (fracciones parciales reales) en un s̃ complejo */
function basis(poles: Complex[], sr: number, si: number): Complex[] {
  const out: Complex[] = [];
  for (const p of poles) {
    // 1/(s − p)
    const dr = sr - p.re;
    const di = si - p.im;
    const m = dr * dr + di * di;
    const ar = dr / m;
    const ai = -di / m;
    if (!p.im) out.push({ re: ar, im: ai });
    else {
      // 1/(s−p) + 1/(s−p*) y j/(s−p) − j/(s−p*)
      const er = sr - p.re;
      const ei = si + p.im;
      const mm = er * er + ei * ei;
      const br = er / mm;
      const bi = -ei / mm;
      out.push({ re: ar + br, im: ai + bi }, { re: -(ai - bi), im: ar - br });
    }
  }
  return out;
}

/** polos complejos con im > 0 (uno por par) y reales, desde autovalores */
function tidyPoles(ev: Complex[], flip: boolean): Complex[] {
  const out: Complex[] = [];
  const used = new Set<number>();
  ev.forEach((e, i) => {
    if (used.has(i)) return;
    used.add(i);
    const tol = 1e-8 * Math.max(1, Math.hypot(e.re, e.im));
    let re = e.re;
    if (flip && re > 0) re = -re;
    if (Math.abs(e.im) <= tol) return out.push({ re: re || -1e-9, im: 0 });
    // su conjugado
    let best = -1;
    let bd = Infinity;
    ev.forEach((o, j) => {
      if (used.has(j)) return;
      const dd = Math.hypot(o.re - e.re, o.im + e.im);
      if (dd < bd) [best, bd] = [j, dd];
    });
    if (best >= 0) used.add(best);
    out.push({ re, im: Math.abs(e.im) });
  });
  return out;
}

function fitWith(poles: Complex[], s: number[], H: Complex[], w: number[]): { c: number[]; d: number; error: number } {
  const rows: number[][] = [];
  const y: number[] = [];
  s.forEach((sk, k) => {
    const ph = basis(poles, 0, sk);
    rows.push([...ph.map((p) => p.re * w[k]), w[k]]);
    y.push(H[k].re * w[k]);
    rows.push([...ph.map((p) => p.im * w[k]), 0]);
    y.push(H[k].im * w[k]);
  });
  const x = leastSquares(rows, y);
  const c = x.slice(0, -1);
  const d = x[x.length - 1];
  let err = 0;
  s.forEach((sk, k) => {
    const ph = basis(poles, 0, sk);
    let r = d;
    let i = 0;
    ph.forEach((p, j) => {
      r += c[j] * p.re;
      i += c[j] * p.im;
    });
    err += (Math.hypot(r - H[k].re, i - H[k].im) * w[k]) ** 2;
  });
  return { c, d, error: Math.sqrt(err / s.length) };
}

function vectorFit(s: number[], H: Complex[], w: number[], n: number, flip: boolean, iters = 12): { poles: Complex[]; c: number[]; d: number; error: number } {
  const lo = Math.log10(s[0]);
  const hi = Math.log10(s[s.length - 1]);
  // polos iniciales: pares complejos con amortiguamiento chico, repartidos en la banda
  const pairs = Math.floor(n / 2);
  let poles: Complex[] = Array.from({ length: pairs }, (_, i) => {
    const b = 10 ** (lo + ((i + 0.5) * (hi - lo)) / Math.max(pairs, 1));
    return { re: -b / 100, im: b };
  });
  // orden impar: un polo real en el medio de la banda
  if (n % 2) poles.push({ re: -(10 ** ((lo + hi) / 2)), im: 0 });
  for (let it = 0; it < iters; it++) {
    const rows: number[][] = [];
    const y: number[] = [];
    s.forEach((sk, k) => {
      const ph = basis(poles, 0, sk);
      const h = H[k];
      // Σ c·φ + d − H·Σ c̃·φ = H
      const rr = [...ph.map((p) => p.re), 1, ...ph.map((p) => -(h.re * p.re - h.im * p.im))];
      const ri = [...ph.map((p) => p.im), 0, ...ph.map((p) => -(h.re * p.im + h.im * p.re))];
      rows.push(rr.map((v) => v * w[k]), ri.map((v) => v * w[k]));
      y.push(h.re * w[k], h.im * w[k]);
    });
    const x = leastSquares(rows, y);
    const m = basis(poles, 0, 1).length;
    const ct = x.slice(m + 1);
    const { A, b } = realForm(poles);
    const Z = A.map((r, i) => r.map((v, j) => v - b[i] * ct[j]));
    poles = tidyPoles(eigenvalues(Z), flip);
  }
  return { poles, ...fitWith(poles, s, H, w) };
}

/**
 * Modelo racional de T a partir de sus muestras: prueba órdenes crecientes y se queda con el
 * primero que ajusta con error relativo < `tol` (o con el mejor). Sin polos inestables forzados:
 * se compara con un ajuste que los refleja al semiplano izquierdo y se usa el estable si ajusta
 * casi igual (los polos inestables espurios son un riesgo del ajuste).
 */
export function fitRational(f: ArrayLike<number>, re: ArrayLike<number>, im: ArrayLike<number>, tol = 2e-3, maxOrder = 16): RationalModel | null {
  const idx = Array.from(f, (_, i) => i).filter((i) => f[i] > 0 && Number.isFinite(re[i]) && Number.isFinite(im[i]) && (re[i] || im[i]));
  if (idx.length < 6) return null;
  const wn = 2 * Math.PI * Math.sqrt(f[idx[0]] * f[idx[idx.length - 1]]);
  const s = idx.map((i) => (2 * Math.PI * f[i]) / wn);
  const H = idx.map((i) => ({ re: re[i], im: im[i] }));
  // ajuste relativo: pesa igual cada década aunque |T| baje mucho
  const w = H.map((h) => 1 / Math.max(Math.hypot(h.re, h.im), 1e-12));
  let best: ReturnType<typeof vectorFit> | null = null;
  for (let n = 1; n <= Math.min(maxOrder, Math.floor(idx.length / 2)); n++) {
    const stable = vectorFit(s, H, w, n, true);
    const free = vectorFit(s, H, w, n, false);
    const r = free.error < stable.error * 0.5 ? free : stable;
    if (!best || r.error < best.error) best = r;
    if (r.error < tol) break;
  }
  if (!best) return null;
  const { A, b } = realForm(best.poles);
  const poles = best.poles.flatMap((p) => (p.im ? [{ re: p.re * wn, im: p.im * wn }, { re: p.re * wn, im: -p.im * wn }] : [{ re: p.re * wn, im: 0 }]));
  return { wn, A, b, c: best.c, d: best.d, poles, error: best.error };
}

/** T del modelo en s [rad/s] */
export function evalModel(m: RationalModel, s: Complex): Complex {
  const poles = basisPoles(m);
  const ph = basis(poles, s.re / m.wn, s.im / m.wn);
  let r = m.d;
  let i = 0;
  ph.forEach((p, j) => {
    r += m.c[j] * p.re;
    i += m.c[j] * p.im;
  });
  return { re: r, im: i };
}

/** los polos normalizados, uno por par, en el orden de las columnas de A */
function basisPoles(m: RationalModel): Complex[] {
  const out: Complex[] = [];
  for (let i = 0; i < m.A.length; i++) {
    if (i + 1 < m.A.length && m.A[i][i + 1] !== 0) {
      out.push({ re: m.A[i][i], im: m.A[i][i + 1] });
      i++;
    } else out.push({ re: m.A[i][i], im: 0 });
  }
  return out;
}

/** Raíces de 1 + k·T [rad/s] */
export function closedLoopRoots(m: RationalModel, k: number): Complex[] {
  const g = k / (1 + k * m.d);
  const Z = m.A.map((r, i) => r.map((v, j) => v - m.b[i] * g * m.c[j]));
  return eigenvalues(Z).map((e) => ({ re: e.re * m.wn, im: e.im * m.wn }));
}

/**
 * Ceros de T [rad/s]: con d ≠ 0, autovalores de A − b·c/d; si T es estrictamente propia, las
 * raíces de 1 + k·T con k muy grande que quedan a distancia finita.
 */
export function modelZeros(m: RationalModel): Complex[] {
  const scale = Math.max(...m.c.map(Math.abs), 1e-300);
  if (Math.abs(m.d) > 1e-9 * scale) {
    const Z = m.A.map((r, i) => r.map((v, j) => v - (m.b[i] * m.c[j]) / m.d));
    return eigenvalues(Z).map((e) => ({ re: e.re * m.wn, im: e.im * m.wn }));
  }
  const K = 1e9 / scale;
  // los que se van a infinito crecen como K^(1/r); los finitos quedan cerca de la banda
  const far = 1e4 * m.wn;
  return closedLoopRoots(m, K).filter((r) => Math.hypot(r.re, r.im) < far);
}

/**
 * Lugar de raíces de 1 + k·T para k de 0 a ∞ (escala log alrededor de 1): ramas como
 * polilíneas [rad/s], siguiendo cada raíz por cercanía.
 */
export function rootLocus(m: RationalModel, n = 160): Complex[][] {
  const ks = [0, ...Array.from({ length: n }, (_, i) => 10 ** (-6 + (12 * i) / (n - 1)))];
  let prev = closedLoopRoots(m, 0);
  const branches: Complex[][] = prev.map((r) => [r]);
  for (const k of ks.slice(1)) {
    const cur = closedLoopRoots(m, k);
    const free = new Set(cur.map((_, i) => i));
    const next: Complex[] = [];
    prev.forEach((p, bi) => {
      let best = -1;
      let bd = Infinity;
      for (const j of free) {
        const dd = Math.hypot(cur[j].re - p.re, cur[j].im - p.im);
        if (dd < bd) [best, bd] = [j, dd];
      }
      if (best < 0) return;
      free.delete(best);
      next[bi] = cur[best];
      branches[bi].push(cur[best]);
    });
    prev = next.length === prev.length ? next : cur;
  }
  return branches;
}
