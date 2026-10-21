// Clasifica los resultados de res/ y escribe report.json + resumen por consola.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SP = dirname(new URL(import.meta.url).pathname).replace(/^\/(\w:)/, '$1');
const { normalizeLtspice } = await import(pathToFileURL('C:/_DATA/ITBA/Repositorios GitHub/TurboSpice/tests/corpus/compare.mjs').href);
const jobs = JSON.parse(readFileSync(join(SP, 'jobs.json'), 'utf8'));

const AUTO = /^(N\d{3,}|NC_\d+|MP_\d+)$/;
function netCompare(ref, ours) {
  const clean = (t) => t.trim().split('\n').map((l) => l.replace(/\s*;§pnba.*$/, '').replace(/µ/g, 'u').trim()).filter((l) => l && !l.startsWith('*') && !/^\.backanno|^\.end$/i.test(l));
  const a = clean(ref), b = clean(ours);
  // multiconjunto con los nodos automáticos enmascarados
  const mask = (l) => l.split(/\s+/).map((t) => (AUTO.test(t) ? '*' : t)).join(' ');
  const ca = new Map(), cb = new Map();
  a.forEach((l) => ca.set(mask(l), (ca.get(mask(l)) ?? 0) + 1));
  b.forEach((l) => cb.set(mask(l), (cb.get(mask(l)) ?? 0) + 1));
  const onlyLt = a.filter((l) => (cb.get(mask(l)) ?? 0) < ca.get(mask(l)));
  const onlyTs = b.filter((l) => (ca.get(mask(l)) ?? 0) < cb.get(mask(l)));
  if (onlyLt.length || onlyTs.length) return { eq: false, reason: `${onlyLt.length} solo LT / ${onlyTs.length} solo TS`, lt: onlyLt.slice(0, 4), ts: onlyTs.slice(0, 4) };
  // mismo multiconjunto: mapeo de nodos alineando por línea ordenada
  a.sort((x, y) => mask(x).localeCompare(mask(y)) || x.localeCompare(y));
  b.sort((x, y) => mask(x).localeCompare(mask(y)) || x.localeCompare(y));
  const map = new Map(), rev = new Map();
  for (let i = 0; i < a.length; i++) {
    const ta = a[i].split(/\s+/), tb = b[i].split(/\s+/);
    if (ta.length !== tb.length) return { eq: true, exact: false, map: null };
    for (let j = 0; j < ta.length; j++) {
      if (ta[j] === tb[j] && !AUTO.test(ta[j])) continue;
      if (!AUTO.test(ta[j]) || !AUTO.test(tb[j]) || (map.has(ta[j]) && map.get(ta[j]) !== tb[j]) || (rev.has(tb[j]) && rev.get(tb[j]) !== ta[j])) return { eq: true, exact: false, map: null };
      map.set(ta[j], tb[j]); rev.set(tb[j], ta[j]);
    }
  }
  return { eq: true, exact: [...map].every(([k, v]) => k === v), map };
}

const interp = (xs, ys, x) => {
  let lo = 0, hi = xs.length - 1;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[hi]) return ys[hi];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
  return ys[lo] + t * (ys[hi] - ys[lo]);
};

function compareSim(lt, ts, nodeMap) {
  const raw = lt.raw;
  const kind = /transient/i.test(raw.plotname) ? 'tran' : /ac analysis/i.test(raw.plotname) ? 'ac' : /operating/i.test(raw.plotname) ? 'op' : /dc transfer/i.test(raw.plotname) ? 'dc' : /noise/i.test(raw.plotname) ? 'noise' : 'otro';
  const plot = ts.plots.find((p) => p.name.toLowerCase().startsWith(kind === 'otro' ? '' : kind)) ?? ts.plots[0];
  if (!plot) return { kind, status: 'sin-plot-ts' };
  const vec = new Map(plot.vectors.map((v) => [v.name.toLowerCase(), v]));
  const xL = raw.vars[0];
  let xT = plot.vectors.find((v) => /^(time|frequency|v-sweep|i-sweep|temp)/i.test(v.name)) ?? plot.vectors[0];
  // ngspice también concatena los barridos anidados: sólo el primero
  let cut = xT.re.length;
  for (let i = 1; i < xT.re.length; i++) if (xT.re[i] < xT.re[i - 1]) { cut = i; break; }
  if (cut < xT.re.length) {
    const sl = (v) => ({ ...v, re: v.re.slice(0, cut), im: v.im?.slice(0, cut) });
    xT = sl(xT);
    for (const [k, v] of vec) vec.set(k, sl(v));
  }
  // pico global de las tensiones de nodo (piso de escala: microvoltios en un circuito de 10 V son 0)
  let gpk = 0;
  for (const v of raw.vars.slice(1)) if (/^V\(/i.test(v.name)) for (const y of v.re) if (Math.abs(y) > gpk && Math.abs(y) < 1e6) gpk = Math.abs(y);
  const per = [];
  for (const v of raw.vars.slice(1)) {
    const m = /^V\(([^)]+)\)$/i.exec(v.name);
    if (!m || m[1].includes(':')) continue;
    let node = m[1];
    const up = node.toUpperCase();
    if (nodeMap?.has(up)) node = nodeMap.get(up);
    const t = vec.get(node.toLowerCase()) ?? vec.get(`v(${node.toLowerCase()})`);
    if (!t) continue;
    if (kind === 'op') {
      const a = v.re[0], b = t.re[0];
      per.push({ node: m[1], err: Math.abs(a - b) / Math.max(Math.abs(a) * 0.01, 1e-3) * 0.01, lt: a, ts: b });
    } else if (kind === 'ac') {
      let worst = 0, at = 0;
      const xs = xT.re;
      const db = (re, im) => 20 * Math.log10(Math.hypot(re, im) + 1e-30);
      for (let i = 0; i < xL.re.length; i++) {
        const f = xL.re[i];
        if (f < xs[0] || f > xs[xs.length - 1]) continue;
        const a = db(v.re[i], v.im[i]);
        const b = db(interp(xs, t.re, f), interp(xs, t.im ?? t.re.map(() => 0), f));
        if (a < -120 && b < -120) continue;
        const d = Math.abs(a - b);
        if (d > worst) { worst = d; at = f; }
      }
      per.push({ node: m[1], errDb: worst, at });
    } else {
      const xs = xT.re;
      let pk = 0, mx = 0, se = 0, cnt = 0;
      for (const y of v.re) pk = Math.max(pk, Math.abs(y));
      const lo = Math.min(...v.re), hi = Math.max(...v.re);
      const scale = Math.max(hi - lo, pk * 0.01, gpk * 1e-3, 1e-6);
      // tolerancia en x: distancia al rango de TS dentro de ±0.2 % del eje (flancos)
      const dx = (xs[xs.length - 1] - xs[0]) * 0.002;
      let j0 = 0, mxAt = 0;
      for (let i = 0; i < xL.re.length; i++) {
        const x = xL.re[i];
        if (x < xs[0] || x > xs[xs.length - 1]) continue;
        let lo2 = interp(xs, t.re, x), hi2 = lo2;
        for (const q of [x - dx, x + dx]) { const y = interp(xs, t.re, q); lo2 = Math.min(lo2, y); hi2 = Math.max(hi2, y); }
        while (j0 < xs.length && xs[j0] < x - dx) j0++;
        for (let k = j0; k < xs.length && xs[k] <= x + dx; k++) { lo2 = Math.min(lo2, t.re[k]); hi2 = Math.max(hi2, t.re[k]); }
        const y = v.re[i];
        const d = y < lo2 ? lo2 - y : y > hi2 ? y - hi2 : 0;
        if (d > mx) { mx = d; mxAt = x; }
        se += d * d; cnt++;
      }
      // forma de onda: en la segunda mitad, pico a pico y cruces por la media (frecuencia)
      const feat = (xs2, ys2) => {
        const t0 = xs2[0] + (xs2[xs2.length - 1] - xs2[0]) / 2;
        const ys = ys2.filter((_, i) => xs2[i] >= t0), xx = xs2.filter((x) => x >= t0);
        if (ys.length < 8) return null;
        const mn = Math.min(...ys), mxv = Math.max(...ys), mean = ys.reduce((a, b) => a + b, 0) / ys.length;
        let cr = 0;
        for (let i = 1; i < ys.length; i++) if ((ys[i - 1] - mean) * (ys[i] - mean) < 0 && Math.abs(ys[i] - ys[i - 1]) > (mxv - mn) * 1e-3) cr++;
        return { pp: mxv - mn, mean, f: cr / 2 / (xx[xx.length - 1] - xx[0] || 1) };
      };
      const fa = feat(xL.re, v.re), fb = feat(xs, t.re);
      const shape = fa && fb ? { pp: Math.abs(fa.pp - fb.pp) / Math.max(fa.pp, scale), mean: Math.abs(fa.mean - fb.mean) / scale, f: fa.f > 2 ? Math.abs(fa.f - fb.f) / fa.f : Math.abs(fa.f - fb.f) > 2 ? 1 : 0, fl: fa.f, ft: fb.f } : null;
      if (cnt) per.push({ node: m[1], err: mx / scale, rms: Math.sqrt(se / cnt) / scale, at: mxAt, shape });
    }
  }
  if (!per.length) return { kind, status: 'sin-vectores-comunes', ltVars: raw.vars.slice(0, 8).map((v) => v.name), tsVecs: plot.vectors.slice(0, 8).map((v) => v.name) };
  let status, worst;
  if (kind === 'ac') {
    worst = per.reduce((a, b) => (b.errDb > a.errDb ? b : a));
    status = worst.errDb < 0.5 ? 'igual' : worst.errDb < 3 ? 'parecido' : 'distinto';
  } else {
    worst = per.reduce((a, b) => (b.err > a.err ? b : a));
    const rmsW = Math.max(...per.map((p) => p.rms ?? p.err));
    // misma forma (pico a pico, media y frecuencia en la 2.ª mitad) aunque desfasada: oscilador
    const sameShape = kind === 'tran' && per.every((p) => p.shape && p.shape.pp < 0.1 && p.shape.mean < 0.1 && p.shape.f < 0.05);
    status = worst.err < 0.05 ? 'igual' : rmsW < 0.05 ? 'parecido' : sameShape ? 'parecido-forma' : 'distinto';
  }
  return { kind, status, compared: per.length, worst, nsteps: raw.nsteps, tsPlots: ts.plots.length };
}

const report = [];
for (const j of jobs) {
  const tsP = join(SP, process.env.RESTS ?? 'res', `${j.id}.ts.json`), ltP = join(SP, 'res', `${j.id}.lt.json`);
  if (!existsSync(tsP) || !existsSync(ltP)) continue;
  let ts, lt;
  try { ts = JSON.parse(readFileSync(tsP, 'utf8')); lt = JSON.parse(readFileSync(ltP, 'utf8')); } catch { continue; }
  const o = { id: j.id, group: j.group, src: j.src, variant: j.variant, directive: j.directive };
  // representación
  if (ts.crashed) o.rep = ts.crashed.err?.killed ? 'timeout-ts' : 'crash-ts';
  else if (ts.exception && ['parse', 'netlist'].includes(ts.stage)) { o.rep = `excepcion-${ts.stage}`; o.exception = ts.exception.split('\n').slice(0, 3).join(' | '); }
  else if (ts.missingSymbols?.length) { o.rep = 'simbolos-faltantes'; o.missing = ts.missingSymbols; }
  else o.rep = 'ok';
  o.roundtrip = ts.roundtrip;
  o.ltMissingSym = /could not open|can't find symbol|unknown symbol/i.test(lt.log ?? '');
  // netlist
  let nc = null;
  if (lt.net && ts.ltNet) {
    nc = netCompare(normalizeLtspice(lt.net), ts.ltNet);
    o.net = nc.eq ? (nc.exact ? 'identica' : 'equivalente') : 'distinta';
    if (!nc.eq) o.netDiff = { reason: nc.reason, lt: nc.lt, ts: nc.ts };
  } else o.net = lt.net ? 'sin-net-ts' : 'sin-net-lt';
  // simulación
  o.hasSim = !!ts.hasSim;
  if (ts.hasSim) {
    o.ltOk = !!lt.raw;
    o.ltErr = lt.raw ? undefined : (lt.log ?? '').split('\n').filter((l) => /error|fatal|singular|unknown|can't|cannot|not found|time step/i.test(l)).slice(0, 3).join(' | ') || (lt.run?.err?.killed ? 'timeout' : 'sin raw');
    if (ts.crashed) o.sim = ts.crashed.err?.killed ? 'timeout-ts' : 'crash-ts';
    else if (ts.exception) { o.sim = `excepcion-${ts.stage}`; o.exception = ts.exception.split('\n').slice(0, 3).join(' | '); }
    else if (ts.tooBig?.length) { o.sim = 'demasiado-grande'; o.tooBig = ts.tooBig; }
    else if (ts.errors?.length || !ts.plots?.length) {
      o.sim = 'error-ts';
      o.errors = ts.errors?.slice(0, 6);
      o.warnings = ts.warnings?.filter((w) => !/memoria|puntos/i.test(w)).slice(0, 6);
      o.logTail = ts.log?.filter((l) => /error|warning|unknown|not|fail|abort/i.test(l)).slice(-8);
    } else if (!lt.raw) o.sim = 'solo-ts-ok';
    else {
      try { o.cmp = compareSim(lt, ts, nc?.map ?? null); } catch (e) { o.cmp = { status: 'cmp-error', e: String(e) }; }
      o.sim = o.cmp.status;
    }
    if (o.rep === 'simbolos-faltantes' && !/error|excepcion|timeout|crash|grande/.test(o.sim)) o.sim = 'incompleto';
    o.simMs = ts.simMs; o.ltMs = lt.run?.ms;
  }
  report.push(o);
}
writeFileSync(join(SP, process.env.REPORT ?? 'report.json'), JSON.stringify(report, null, 1));

const tally = (rows, key) => { const m = {}; for (const r of rows) m[r[key]] = (m[r[key]] ?? 0) + 1; return m; };
const groups = [...new Set(report.map((r) => r.group))];
for (const g of groups) {
  const rows = report.filter((r) => r.group === g);
  console.log(`\n== ${g} (${rows.length})`);
  console.log('  representación:', tally(rows, 'rep'));
  console.log('  netlist:', tally(rows, 'net'));
  const s = rows.filter((r) => r.hasSim);
  console.log(`  simulación (${s.length}, LT ok ${s.filter((r) => r.ltOk).length}):`, tally(s, 'sim'));
}
