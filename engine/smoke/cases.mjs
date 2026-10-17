// Casos del smoke test. `check(res)` devuelve un string si algo está mal.

const plot = (res, prefix) => {
  const p = res.plots.find((p) => p.name.startsWith(prefix));
  if (!p) throw new Error(`no hay plot ${prefix}*`);
  return p;
};
const vec = (p, name) => {
  const v = p.vectors.find((v) => v.name.toLowerCase() === name.toLowerCase());
  if (!v) throw new Error(`no hay vector ${name} en ${p.name}`);
  return v;
};
const near = (a, b, rel, what) =>
  Math.abs(a - b) <= rel * Math.abs(b) ? null : `${what}: ${a} (esperado ${b})`;

const R = 1e3;
const C = 1e-6;
const TAU = R * C;
const FC = 1 / (2 * Math.PI * TAU);

const RC = `V1 in 0 DC 0 AC 1 PULSE(0 1 0 1n 1n 1 2)
R1 in out ${R}
C1 out 0 ${C}`;

export const CASES = [
  {
    name: '.op divisor resistivo',
    netlist: `* op\nV1 in 0 DC 10\nR1 in out 1k\nR2 out 0 3k\n.op\n.end`,
    check: (res) => near(vec(plot(res, 'op'), 'out').real[0], 7.5, 1e-12, 'V(out)'),
  },
  {
    name: '.tran RC (τ = 1 ms)',
    netlist: `* tran\n${RC}\n.tran 1u 5m\n.end`,
    check: (res) => {
      const p = plot(res, 'tran');
      const t = vec(p, 'time').real;
      const v = vec(p, 'out').real;
      const i = t.findIndex((x) => x >= TAU);
      return near(v[i], 1 - Math.exp(-t[i] / TAU), 1e-3, 'V(out) en t=τ');
    },
  },
  {
    name: '.ac RC (−3 dB en fc)',
    netlist: `* ac\n${RC}\n.ac dec 50 1 1meg\n.end`,
    check: (res) => {
      const p = plot(res, 'ac');
      const f = vec(p, 'frequency').real;
      const v = vec(p, 'out');
      const i = f.findIndex((x) => x >= FC);
      const mag = Math.hypot(v.real[i], v.imag[i]);
      return near(mag, 1 / Math.sqrt(1 + (f[i] / FC) ** 2), 1e-6, '|H(fc)|');
    },
  },
  {
    name: '.dc barrido anidado',
    netlist: `* dc\nV1 in 0 1\nV2 b 0 1\nR1 in out 1k\nR2 out b 1k\n.dc V1 0 5 0.5 V2 0 2 1\n.end`,
  },
  {
    name: '.noise resistor',
    netlist: `* noise\nV1 in 0 DC 0 AC 1\nR1 in out 1k\nR2 out 0 1k\n.noise v(out) V1 dec 10 1 100k\n.end`,
  },
  {
    name: '.tf',
    netlist: `* tf\nV1 in 0 DC 1\nR1 in out 1k\nR2 out 0 3k\n.tf v(out) V1\n.end`,
    check: (res) => near(vec(plot(res, 'tf'), 'transfer_function').real[0], 0.75, 1e-12, 'Av'),
  },
  {
    name: '.sens DC',
    netlist: `* sens\nV1 in 0 DC 1\nR1 in out 1k\nR2 out 0 3k\n.sens v(out)\n.end`,
  },
  {
    name: '.pz RC (polo en −1/τ)',
    netlist: `* pz\n${RC}\n.pz in 0 out 0 vol pz\n.end`,
    check: (res) => {
      const p = plot(res, 'pz');
      const pole = vec(p, 'pole(1)');
      return near(pole.real[0], -1 / TAU, 1e-6, 'polo');
    },
  },
  {
    name: '.disto',
    netlist: `* disto\nV1 in 0 DC 0.7 AC 1 DISTOF1 0.1\nD1 in out dmod\nR1 out 0 1k\n.model dmod D\n.disto dec 5 1k 100k\n.end`,
  },
  {
    name: '.sp parámetros S (filtro LC)',
    netlist: `* sp\nV1 in 0 dc 0 ac 1 portnum 1 z0 50\nV2 out 0 dc 0 ac 0 portnum 2 z0 50\nL1 in out 100n\nC1 out 0 10p\n.sp dec 10 1meg 1g\n.end`,
  },
  {
    name: 'BJT + MOSFET (.tran amplificador)',
    netlist: `* bjt/mos\nVcc vcc 0 12\nVin in 0 SIN(0 10m 1k)\nC1 in b 10u\nR1 vcc b 100k\nR2 b 0 22k\nRc vcc c 4.7k\nRe e 0 1k\nQ1 c b e qn\nM1 vcc c s s nm\nRs s 0 10k\n.model qn NPN(BF=150 IS=1e-14 VAF=100)\n.model nm NMOS(LEVEL=1 VTO=1 KP=100u)\n.tran 10u 3m\n.end`,
  },
  {
    name: 'XSPICE analógico (gain + s_xfer)',
    netlist: `* xspice analog\nV1 in 0 DC 0 AC 1\nA1 in mid amp\nA2 mid out filt\nR1 out 0 1k\n.model amp gain(gain=10)\n.model filt s_xfer(num_coeff=[1] den_coeff=[1e-3 1])\n.ac dec 10 1 100k\n.end`,
    check: (res) => {
      const v = vec(plot(res, 'ac'), 'out');
      return near(Math.hypot(v.real[0], v.imag[0]), 10, 1e-3, '|H(1 Hz)|');
    },
  },
  {
    name: 'XSPICE digital (contador con d_dff)',
    netlist: `* xspice digital
Vclk clk 0 PULSE(0 1 0 1n 1n 0.5u 1u)
Aadc [clk] [dclk] adc1
Ainv1 q0 nq0 inv1
Ainv2 q1 nq1 inv1
Aff0 nq0 dclk nul nul q0 qb0 dff1
Aff1 nq1 q0 nul nul q1 qb1 dff1
Adac [q0 q1] [a0 a1] dac1
R0 a0 0 1k
R1 a1 0 1k
.model adc1 adc_bridge(in_low=0.3 in_high=0.7)
.model dac1 dac_bridge(out_low=0 out_high=1)
.model inv1 d_inverter
.model dff1 d_dff
.tran 10n 8u
.end`,
    check: (res) => {
      const p = plot(res, 'tran');
      const a1 = vec(p, 'a1').real;
      const edges = a1.reduce((n, x, i) => (i && (x > 0.5) !== (a1[i - 1] > 0.5) ? n + 1 : n), 0);
      // q1 = clk/4 → en 8 µs ~4 transiciones
      return edges >= 3 && edges <= 5 ? null : `a1 tuvo ${edges} transiciones (esperado ~4)`;
    },
  },
  {
    name: 'Sintaxis LTspice (.param, B-source, .meas)',
    native: false,
    netlist: `* lt compat\n.param rv=2k\nV1 in 0 PULSE(0 1 0 1n 1n 1 2)\nR1 in out {rv}\nC1 out 0 1u\nB1 sq 0 V=V(out)**2\nR2 sq 0 1k\n.tran 1u 10m\n.meas tran vend FIND v(out) AT=9m\n.end`,
    check: (res) => {
      const line = res.log.find((l) => /^vend\s*=/.test(l.trim()));
      if (!line) return '.meas no reportó vend';
      const v = parseFloat(line.split('=')[1]);
      return near(v, 1 - Math.exp(-9e-3 / 2e-3), 1e-3, 'vend');
    },
  },
];
