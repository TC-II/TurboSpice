// Tutorial interactivo: capítulos («misiones») con pasos que se cumplen solos. Cada paso mira una
// foto del estado de la app (Probe, la arma App) o un evento del DOM, y avanza cuando se cumple.
// Los textos admiten **negrita**, `código` y [[Tecla]].
import { parseAnalysis } from '../sim/analyses.ts';
import { parseSpiceNumber } from '../netlist/spicenum.ts';
import { t } from '../i18n/i18n.ts';

/** Lo que el tutorial puede ver de la app */
export interface Probe {
  projectName: string;
  dirty: boolean;
  benches: { id: string; custom: boolean; group?: string; line: string; runs: number }[];
  activeBench: string;
  groups: number;
  modules: { name: string; kind: 'schematic' | 'verilog' | 'model' }[];
  /** subcircuito abierto ('' = el testbench) */
  inSub: string;
  /** el esquemático que se ve */
  symbols: { type: string; prefix: string; value: string }[];
  wires: number;
  grounds: number;
  /** etiquetas de red que no son tierra */
  labels: string[];
  /** etiquetas con puerto (pines de un subcircuito) */
  ports: number;
  /** pines sin conectar */
  loose: number;
  directives: string[];
  /** comando de análisis del testbench (.tran 20m, .ac …) */
  line: string;
  tool: string;
  dialog: string | null;
  hasResult: boolean;
  /** análisis de los resultados que se ven ('tran', 'ac'…) */
  resultKind: string;
  /** corridas superpuestas (.step) */
  runs: number;
  panes: string[][];
  zoomed: boolean;
  cursors: number;
  markers: string[];
  panel: string;
  treeOpen: boolean;
  historyOpen: boolean;
  showOp: boolean;
  showNets: boolean;
}

/** Memoria de un paso (lo que había al empezarlo) */
export type Mem = Record<string, unknown>;

export interface Step {
  id: string;
  title: string;
  body: string;
  hint?: string;
  /** elemento a resaltar */
  target?: () => Element | null;
  /** se cumple solo (sin esto, el paso se pasa con «Siguiente») */
  check?(p: Probe, mem: Mem): boolean;
  /** foto al empezar el paso (para pasos que piden un cambio) */
  start?(p: Probe): Mem;
  /** avance parcial ("Pines sin conectar: 2") */
  progress?(p: Probe, mem: Mem): string | undefined;
  /** detección por eventos del DOM: llama a done() y devuelve cómo dejar de escuchar */
  watch?(done: () => void): () => void;
  /** con lo que dejó start(), se pasa con «Siguiente» (lo que pide ya estaba hecho) */
  manual?(mem: Mem): boolean;
  /** saltearlo no resta estrellas */
  optional?: boolean;
  /** texto del botón de un paso sin chequeo */
  next?: string;
}

export type Practice = 'empty' | 'rc' | 'rcTran' | 'divider';

export interface Chapter {
  id: string;
  icon: string;
  title: string;
  blurb: string;
  badge: string;
  /** proyecto nuevo con el que arranca (el que estaba abierto queda en Recientes) */
  practice: Practice;
  steps: Step[];
}

// ── utilidades ───────────────────────────────────────────────────────────

const visible = (e: Element | null | undefined) => {
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? e : null;
};
/** Elemento visible por su nombre accesible */
export const byLabel = (label: string) => () => [...document.querySelectorAll('[aria-label]')].find((e) => e.getAttribute('aria-label') === label && visible(e)) ?? null;
const bySel = (sel: string) => () => [...document.querySelectorAll(sel)].find((e) => visible(e)) ?? null;

const of = (p: Probe, prefix: string) => p.symbols.filter((s) => s.prefix.toUpperCase() === prefix);
const num = (v: string) => parseSpiceNumber(v.replace(/µ/g, 'u').replace(/Ω|ohms?$/i, ''));
/** Un paso que pide prender algo (abrir un panel, mostrar una vista): si ya estaba así al empezar,
 *  no se cumple solo; queda como explicación (lo señala y se pasa con «Siguiente»). Si igual lo
 *  apaga y lo vuelve a prender, se cumple */
const turnOn = (on: (p: Probe) => boolean, already: string) => ({
  start: (p: Probe): Mem => ({ was: on(p), off: !on(p) }),
  check: (p: Probe, m: Mem) => {
    if (!on(p)) m.off = true;
    return !!m.off && on(p);
  },
  manual: (m: Mem) => !!m.was,
  progress: (p: Probe, m: Mem) => (m.was && on(p) && !m.off ? already : undefined),
});
const near = (a: number, b: number) => Math.abs(a - b) <= Math.abs(b) * 1e-6;
const kind = (line: string) => /^\s*\.(\w+)/.exec(line)?.[1].toLowerCase() ?? '';
const traces = (p: Probe) => p.panes.flat();
const directive = (p: Probe, cmd: string) => p.directives.some((d) => d.split('\\n').some((l) => new RegExp(`^\\s*\\${cmd}\\b`, 'i').test(l)));
const looseText = (p: Probe) => (p.loose ? t('Unconnected pins: {n}', { n: p.loose }) : undefined);
/** ¿El menú principal está abierto? */
const menuOpen = () => !!document.querySelector('.app-menu-btn[aria-expanded="true"]');

// ── circuitos de práctica ────────────────────────────────────────────────

const RC = (source: string, line: string) => `Version 4
SHEET 1 880 680
WIRE 48 48 144 48
WIRE 224 48 336 48
WIRE 336 48 416 48
WIRE 48 128 48 48
FLAG 48 208 0
FLAG 336 112 0
FLAG 48 48 in
FLAG 416 48 out
SYMBOL voltage 48 112 R0
SYMATTR InstName V1
${source}
SYMBOL res 240 32 R90
WINDOW 0 0 56 VBottom 2
WINDOW 3 32 56 VTop 2
SYMATTR InstName R1
SYMATTR Value 1k
SYMBOL cap 320 48 R0
SYMATTR InstName C1
SYMATTR Value 1u
${line ? `TEXT 40 280 Left 2 !${line}\n` : ''}`;

const DIVIDER = `Version 4
SHEET 1 880 680
WIRE 64 16 192 16
WIRE 64 80 64 16
WIRE 192 96 192 112
FLAG 64 160 0
FLAG 192 192 0
FLAG 192 96 mid
SYMBOL voltage 64 64 R0
SYMATTR InstName V1
SYMATTR Value 10
SYMBOL res 176 0 R0
SYMATTR InstName R1
SYMATTR Value 1k
SYMBOL res 176 96 R0
SYMATTR InstName R2
SYMATTR Value 2k
TEXT 40 232 Left 2 !.op
`;

/** El .asc de cada práctica (null: proyecto vacío) y el nombre del proyecto */
export function practiceCircuit(p: Practice): { name: string; asc: string | null } {
  switch (p) {
    case 'empty':
      return { name: t('Tutorial'), asc: null };
    case 'rc':
      return { name: t('Tutorial RC'), asc: RC('SYMATTR Value 1', '') };
    case 'rcTran':
      return { name: t('Tutorial RC'), asc: RC('SYMATTR Value PULSE(0 1 0 1u 1u 5m 10m)\nSYMATTR Value2 AC 1', '.tran 20m') };
    case 'divider':
      return { name: t('Tutorial divider'), asc: DIVIDER };
  }
}

// ── niveles ──────────────────────────────────────────────────────────────

export const STEP_XP = 10;
/** extra por paso sin pista */
export const CLEAN_XP = 5;
export const CHAPTER_XP = 50;

export function levels() {
  return [
    { xp: 0, name: t('Spark') },
    { xp: 120, name: t('Breadboard') },
    { xp: 300, name: t('Soldering iron') },
    { xp: 520, name: t('Oscilloscope') },
    { xp: 760, name: t('Master node') },
    { xp: 1000, name: t('SPICE legend') },
  ];
}

export function levelOf(xp: number) {
  const ls = levels();
  let i = 0;
  while (i + 1 < ls.length && xp >= ls[i + 1].xp) i++;
  const next = ls[i + 1];
  return { index: i, name: ls[i].name, from: ls[i].xp, to: next?.xp, progress: next ? (xp - ls[i].xp) / (next.xp - ls[i].xp) : 1 };
}

/** Estrellas de un capítulo terminado: 3, menos una si se pidieron pistas y otra si se salteó algo */
export const starsFor = (hints: number, skipped: number) => Math.max(1, 3 - (hints ? 1 : 0) - (skipped ? 1 : 0));

// ── capítulos ────────────────────────────────────────────────────────────

export function chapters(): Chapter[] {
  return [
    {
      id: 'tour',
      icon: '🧭',
      title: t('First contact'),
      blurb: t('Find your way around: menu, tools, project panel and shortcuts.'),
      badge: t('Golden compass'),
      practice: 'empty',
      steps: [
        {
          id: 'welcome',
          title: t('Welcome to the Academy!'),
          body: t('Each mission teaches you a part of TurboSpice. Do what this card says: TurboSpice **notices it on its own** and gives you XP. If you get stuck, ask for a **hint** (it costs a star) or **skip** the step. You can drag this card by its title.'),
          next: t('Let\'s go!'),
        },
        {
          id: 'menu',
          title: t('The main menu'),
          body: t('Everything is in the ☰ menu: files, editing, drawing, simulation, view, examples and help. **Open it.**'),
          target: bySel('.app-menu-btn'),
          check: menuOpen,
        },
        {
          id: 'toolbar',
          title: t('The toolbar'),
          body: t('Next to the menu are the tools: new, save, undo, and the drawing ones (wire, component, ground, label…). Rest the mouse on each one to see what it does and its shortcut.'),
          target: bySel('.appbar-tools [role="toolbar"]'),
        },
        {
          id: 'panel',
          title: t('The project panel'),
          body: t('The capsule with the name of the project opens the **project panel**: your testbenches and modules live there. **Click it.**'),
          target: bySel('button.proj-capsule'),
          ...turnOn((p) => p.treeOpen, t('It is already open: look at it and go on.')),
        },
        {
          id: 'simrow',
          title: t('The simulation bar'),
          body: t('**New simulation** chooses what to simulate (transient, AC, DC…), **Run** runs it, and the bar to the right shows its parameters. You will use it very soon.'),
          target: bySel('.sim-row'),
        },
        {
          id: 'zoom',
          title: t('Moving around the sheet'),
          body: t('The **mouse wheel** zooms, dragging with the **right button** (or the wheel) moves the sheet, and [[Space]] fits everything in view. **Zoom with the wheel** over the schematic.'),
          target: bySel('.canvas-wrap'),
          watch: (done) => {
            const h = (e: WheelEvent) => e.target instanceof Element && e.target.closest('.canvas-wrap') && done();
            window.addEventListener('wheel', h, { passive: true });
            return () => window.removeEventListener('wheel', h);
          },
        },
        {
          id: 'shortcuts',
          title: t('Shortcuts'),
          body: t('TurboSpice is made to be used with the keyboard, like LTspice. With the mouse over the schematic press [[?]] to see every shortcut.'),
          check: (p) => p.dialog === 'help',
        },
      ],
    },
    {
      id: 'draw',
      icon: '✏️',
      title: t('Your first circuit'),
      blurb: t('Draw an RC circuit: components, wires, ground, labels and values.'),
      badge: t('Golden soldering iron'),
      practice: 'empty',
      steps: [
        {
          id: 'source',
          title: t('A voltage source'),
          body: t('Press [[V]] (or Draw › Voltage source) and **click on the sheet** to place it. Each click places another one: [[Esc]] stops.'),
          check: (p) => of(p, 'V').length > 0,
        },
        {
          id: 'resistor',
          title: t('A resistor, lying down'),
          body: t('Press [[R]] and, before clicking, [[Ctrl+R]] to **rotate** it so that it lies horizontally. Place it to the right of the source.'),
          hint: t('Ctrl+R rotates and Ctrl+E mirrors, also after placing it (with it selected).'),
          check: (p) => of(p, 'R').length > 0,
        },
        {
          id: 'capacitor',
          title: t('A capacitor'),
          body: t('Press [[C]] and place it standing, to the right of the resistor.'),
          check: (p) => of(p, 'C').length > 0,
        },
        {
          id: 'ground',
          title: t('Ground'),
          body: t('Every circuit needs a reference: press [[G]] and put a **ground** under the source (and another one under the capacitor).'),
          check: (p) => p.grounds > 0,
        },
        {
          id: 'wires',
          title: t('Wires'),
          body: t('Press [[W]] and click from pin to pin: each click makes a corner and clicking on a pin ends the wire. Join source → resistor → capacitor, and their bottoms to ground. The red marks are **unconnected pins**.'),
          hint: t('A wire ends on a pin, on another wire or on a ground. Esc leaves the tool. If a component is far away, drag it: its wires stretch.'),
          check: (p) => p.loose === 0 && p.wires >= 2 && p.symbols.length >= 3,
          progress: looseText,
        },
        {
          id: 'label',
          title: t('Name the nets'),
          body: t('Press [[N]], write **in** and click on the wire of the source; then the same with **out** on the wire of the capacitor. Named nets are easier to find and to plot: V(in), V(out).'),
          check: (p) => p.labels.length >= 2,
          progress: (p) => (p.labels.length ? p.labels.join(', ') : undefined),
        },
        {
          id: 'values',
          title: t('Values'),
          body: t('**Right-click** the resistor and write **1k**; then the capacitor: **1u**. (Double-click opens all its attributes.)'),
          hint: t('SI prefixes: k = kilo, m = milli, u = micro, n = nano, p = pico… and meg = mega (M is milli, as in SPICE).'),
          check: (p) => of(p, 'R').some((s) => near(num(s.value), 1e3)) && of(p, 'C').some((s) => near(num(s.value), 1e-6)),
          progress: (p) => `R = ${of(p, 'R').map((s) => s.value || '?').join(', ') || '—'} · C = ${of(p, 'C').map((s) => s.value || '?').join(', ') || '—'}`,
        },
        {
          id: 'undo',
          title: t('Delete without fear'),
          body: t('Click a component to select it, press [[Del]]… and bring it back with [[Ctrl+Z]].'),
          start: (p) => ({ n: p.symbols.length }),
          check: (p, m) => {
            if (p.symbols.length < (m.n as number)) m.gone = true;
            return !!m.gone && p.symbols.length >= (m.n as number);
          },
        },
      ],
    },
    {
      id: 'simulate',
      icon: '⚡',
      title: t('Let\'s simulate!'),
      blurb: t('Choose an analysis, set its parameters, configure the source and run.'),
      badge: t('Spark of life'),
      practice: 'rc',
      steps: [
        {
          id: 'analysis',
          title: t('Choose an analysis'),
          body: t('Open **New simulation ▾** and choose **Transient**: the circuit over time.'),
          target: byLabel(t('New simulation')),
          check: (p) => kind(p.line) === 'tran',
        },
        {
          id: 'tstop',
          title: t('How long?'),
          body: t('The bar shows the parameters of the transient. Change the **stop time** to **20m** (20 ms) and press [[Enter]].'),
          target: bySel('.simbar'),
          check: (p) => {
            const a = parseAnalysis(p.line);
            return a?.kind === 'tran' && near(num(a.tstop), 0.02);
          },
        },
        {
          id: 'pulse',
          title: t('A source that changes'),
          body: t('**Double-click** the source V1, choose **PULSE** and make it go from 0 V to 1 V. OK.'),
          hint: t('On the Pulse tab: V initial 0, V on 1, T on 5m, T period 10m. Rise and fall times can stay small.'),
          check: (p) => of(p, 'V').some((s) => /^\s*(pulse|sin|sine)\b/i.test(s.value)),
        },
        {
          id: 'run',
          title: t('Run!'),
          body: t('Press **Run** (or [[Alt+R]]). ngspice runs right here, inside your browser.'),
          target: byLabel(t('Run|verb')),
          check: (p) => p.hasResult && p.resultKind === 'tran',
        },
        {
          id: 'results',
          title: t('The results'),
          body: t('The **Results** view opened next to the schematic. The buttons at the top show or hide each view, and the two on their right put the results on the side or below.'),
          target: bySel('.results-panel'),
        },
        {
          id: 'log',
          title: t('When something goes wrong'),
          body: t('The ▾ arrow next to **Results** has the simulated **Netlist**, the **Errors** and the ngspice **Log** ([[Ctrl+L]]). Open the log.'),
          target: byLabel(t('More results views')),
          ...turnOn((p) => p.panel === 'log', t('It is already showing: look at it and go on.')),
        },
      ],
    },
    {
      id: 'plot',
      icon: '📈',
      title: t('Plot lab'),
      blurb: t('Probe, currents, expressions, zoom, cursors, markers and panes.'),
      badge: t('Oscilloscope'),
      practice: 'rcTran',
      steps: [
        {
          id: 'run',
          title: t('Fresh results'),
          body: t('First you need results: press **Run** ([[Alt+R]]).'),
          target: byLabel(t('Run|verb')),
          check: (p) => p.hasResult && !!p.resultKind,
        },
        {
          id: 'probe',
          title: t('The probe'),
          body: t('The **probe** (the Measure button) plots what you click. It turns on by itself after simulating; if it is off, turn it on. Click a **wire** of the schematic: its voltage is plotted. Try the **out** net.'),
          target: byLabel(t('Measure')),
          progress: (p) => (p.tool === 'probe' ? t('The probe is on: click the out wire.') : undefined),
          start: (p) => ({ n: traces(p).length }),
          check: (p, m) => traces(p).some((x) => /^V\(/i.test(x)) && traces(p).length > (m.n as number),
        },
        {
          id: 'current',
          title: t('Currents'),
          body: t('With the probe, click **on a component** (the resistor): its current is plotted, I(R1).'),
          check: (p) => traces(p).some((x) => /^I[a-z]?\(/i.test(x)),
        },
        {
          id: 'expr',
          title: t('Expressions'),
          body: t('With the mouse over the plot press [[T]] (or click the box of traces) and write **V(in)-V(out)**: in and out are the nets at both ends of the resistor, so it is the voltage across it. [[Enter]] adds it.'),
          hint: t('Any expression works: V(out)*1000, I(R1)*V(in), abs(V(out))… and Ctrl+Space suggests the names.'),
          check: (p) => traces(p).some((x) => /\)\s*[-+*/]|[-+*/]\s*[VI]\(/i.test(x)),
        },
        {
          id: 'zoom',
          title: t('Zoom'),
          body: t('**Drag** a box over the plot to zoom into that part. ([[Z]] also zooms to a box and [[Shift+Z]] goes back.)'),
          ...turnOn((p) => p.zoomed, t('The plot is already zoomed: Shift+Z goes back.')),
        },
        {
          id: 'cursors',
          title: t('Cursors'),
          body: t('Turn on **Cursors** and click the plot twice: cursors A and B, and their difference in the readout.'),
          target: bySel('.results-panel'),
          check: (p) => p.cursors >= 2,
        },
        {
          id: 'markers',
          title: t('Markers'),
          body: t('With the mouse over a trace press [[A]] and then [[D]]: two markers and their differences (Δx, Δy). [[M]] puts a single marker; drag them to move them.'),
          hint: t('If the letters end up in the box of traces, that box has the focus: click a button of the viewer (Markers, for example) and try again.'),
          check: (p) => p.markers.includes('a') && p.markers.includes('d'),
        },
        {
          id: 'panes',
          title: t('Several panes'),
          body: t('Press [[P]] over the plot (or the + under a pane) to add a **pane**, and drag a trace from the legend into it (or right-click it › Move to a new pane).'),
          check: (p) => p.panes.filter((x) => x.length).length >= 2,
        },
        {
          id: 'fit',
          title: t('The big picture'),
          body: t('Press [[Space]] over the plot (or the fit button of the viewer) to see everything again.'),
          check: (p) => !p.zoomed,
        },
        {
          id: 'export',
          title: t('Take it with you'),
          body: t('In the ▾ arrow next to **Results**, **Export** saves the traces to CSV, the plot to PNG or the view as an LTspice .plt.'),
          target: byLabel(t('More results views')),
        },
      ],
    },
    {
      id: 'project',
      icon: '🗂️',
      title: t('Workbenches and testbenches'),
      blurb: t('Organize a project: several simulations of a circuit, grouped and with their history.'),
      badge: t('Master plan'),
      practice: 'rcTran',
      steps: [
        {
          id: 'concept',
          title: t('How a project is organized'),
          body: t('A **project** (a .turbo file) has **workbenches**, and each workbench has **testbenches**. A testbench is a schematic **with its simulation**: a transient, an AC… The testbenches of a workbench are usually the same circuit seen in different ways. The **modules** (subcircuits, models, Verilog) belong to the whole project.'),
        },
        {
          id: 'open',
          title: t('Open the panel'),
          body: t('Click the project capsule to open its panel.'),
          target: bySel('button.proj-capsule'),
          ...turnOn((p) => p.treeOpen, t('It is already open: look at it and go on.')),
        },
        {
          id: 'newbench',
          title: t('A second testbench'),
          body: t('This testbench already simulates a transient. Choose **New simulation ▾ › AC (Bode)**: since a testbench has a single simulation, a **new testbench** is created with a copy of the circuit.'),
          target: byLabel(t('New simulation')),
          check: (p) => p.benches.length >= 2 && p.benches.some((b) => kind(b.line) === 'ac'),
        },
        {
          id: 'runac',
          title: t('Bode'),
          body: t('Run it ([[Alt+R]]) and probe **out**: magnitude and phase of the RC filter.'),
          hint: t('For the AC analysis the source needs "AC 1" in its small-signal value: the practice circuit already has it.'),
          check: (p) => p.hasResult && p.resultKind === 'ac' && traces(p).length > 0,
        },
        {
          id: 'rename',
          title: t('Names that say something'),
          body: t('In the panel, the ✎ button of the testbench (it appears when you rest the mouse on it) renames it: call it **Bode**.'),
          target: bySel('.project-tree .tree-row.active'),
          check: (p) => p.benches.some((b) => b.custom),
        },
        {
          id: 'switch',
          title: t('Back and forth'),
          body: t('Click the other testbench in the panel: each one keeps its circuit, its simulation and its results.'),
          target: bySel('.project-tree'),
          start: (p) => ({ seen: [p.activeBench] }),
          check: (p, m) => {
            const seen = m.seen as string[];
            if (!seen.includes(p.activeBench)) seen.push(p.activeBench);
            return seen.length >= 2;
          },
        },
        {
          id: 'workbench',
          title: t('A new workbench'),
          body: t('At the end of the list, **+ Workbench** creates another one (with an empty testbench inside). It is useful, for example, for a variant of the design.'),
          target: bySel('.tree-new-group'),
          check: (p) => p.groups >= 2,
        },
        {
          id: 'drag',
          title: t('Moving testbenches'),
          body: t('**Drag** a testbench by its name and drop it **onto another workbench** to move it there.'),
          optional: true,
          start: (p) => ({ was: Object.fromEntries(p.benches.map((b) => [b.id, b.group ?? ''])) }),
          check: (p, m) => p.benches.some((b) => b.id in (m.was as Mem) && (m.was as Mem)[b.id] !== (b.group ?? '')),
        },
        {
          id: 'history',
          title: t('The run history'),
          body: t('Every time you simulate, the exact circuit is saved. The 🕑 button of a testbench (with the number of runs) opens its **history**: what changed between runs, and you can restore an old one.'),
          target: bySel('.project-tree .tree-runs:not(.none)'),
          ...turnOn((p) => p.historyOpen, t('It is already open: look at it and go on.')),
        },
        {
          id: 'propagate',
          title: t('Propagating values'),
          body: t('When the testbenches of a workbench share components, **right-clicking** one (R1) offers to **propagate** its value to the others of the workbench. That way you change the design once.'),
        },
      ],
    },
    {
      id: 'module',
      icon: '🧩',
      title: t('Build a module'),
      blurb: t('Your own subcircuit: drawn inside, with ports, symbol and instances.'),
      badge: t('Black box'),
      practice: 'empty',
      steps: [
        {
          id: 'new',
          title: t('A new module'),
          body: t('In the project panel (the capsule opens it), **+ New › Subcircuit**, and call it **FILTER**.'),
          target: bySel('.tree-newmenu > button'),
          check: (p) => p.modules.some((x) => x.kind === 'schematic') && !!p.inSub,
        },
        {
          id: 'inside',
          title: t('Inside the module'),
          body: t('You are in the **subcircuit editor** (the orange bar). Draw a resistor and a capacitor, as in any schematic.'),
          check: (p) => !!p.inSub && of(p, 'R').length > 0 && of(p, 'C').length > 0,
        },
        {
          id: 'ports',
          title: t('Ports'),
          body: t('The pins of the module are its **ports**: the **Port** button of the toolbar places a net label that is a port. Add **IN** and **OUT** (and a ground, which is the same everywhere).'),
          target: byLabel(t('Port')),
          check: (p) => !!p.inSub && p.ports >= 2,
        },
        {
          id: 'wire',
          title: t('Connect everything'),
          body: t('Join the ports to the components with wires ([[W]]) until no pin is left loose.'),
          check: (p) => !!p.inSub && p.loose === 0 && p.wires > 0 && p.ports >= 2,
          progress: looseText,
        },
        {
          id: 'symbol',
          title: t('Its symbol'),
          body: t('On the right is the **symbol editor**: the ports already became pins. You can move them, change the drawing or adopt an existing symbol.'),
          target: bySel('.sym-pane'),
        },
        {
          id: 'return',
          title: t('Back to the testbench|tut'),
          body: t('Press **Return** in the orange bar (or [[Alt+↑]]).'),
          target: bySel('.sub-hint button'),
          check: (p) => !p.inSub,
        },
        {
          id: 'place',
          title: t('Use it'),
          body: t('Press [[P]] and open the **Project** folder (or drag FILTER from the panel onto the sheet), and place it.'),
          check: (p) => !p.inSub && p.symbols.some((s) => p.modules.some((x) => x.name.toLowerCase() === s.type.toLowerCase())),
        },
        {
          id: 'descend',
          title: t('Into an instance'),
          body: t('**Double-click** the instance to go down into it. With results, the probe there shows its internal voltages and currents.'),
          start: () => ({}),
          check: (p, m) => {
            if (!p.inSub) m.out = true;
            return !!m.out && !!p.inSub;
          },
        },
        {
          id: 'verilog',
          title: t('Bonus: Verilog'),
          body: t('**+ New › Verilog** creates a digital block written in Verilog: it is synthesized and simulated together with the analog circuit. Try it!'),
          optional: true,
          target: bySel('.tree-newmenu > button'),
          check: (p) => p.modules.some((x) => x.kind === 'verilog'),
        },
      ],
    },
    {
      id: 'study',
      icon: '🔬',
      title: t('The Studio'),
      blurb: t('Sweeps and measurements without writing SPICE.'),
      badge: t('Magnifying glass'),
      practice: 'rcTran',
      steps: [
        {
          id: 'open',
          title: t('Open the Studio|tut'),
          body: t('**New simulation ▾ › Studio…** or [[Alt+E]]. It sets up sweeps, tolerances (Monte Carlo) and measurements as cards.'),
          target: byLabel(t('New simulation')),
          check: (p) => p.dialog === 'study',
        },
        {
          id: 'sweep',
          title: t('Sweep a component|tut'),
          body: t('Add a **sweep** of **R1** with the values **1k 2k 5k** and accept.'),
          hint: t('In the sweep card: what to vary = a component, R1; how = a list of values.'),
          check: (p) => directive(p, '.step'),
        },
        {
          id: 'run',
          title: t('Several runs'),
          body: t('Run it: one curve per value, overlaid. ([[Shift+S]] over the plot chooses which runs to see.)'),
          check: (p) => p.hasResult && p.runs >= 2,
        },
        {
          id: 'meas',
          title: t('Measure'),
          body: t('Open the Studio again and add a **measurement**, for example the maximum of V(out). Then run again.'),
          check: (p) => directive(p, '.meas') || directive(p, '.measure'),
        },
        {
          id: 'table',
          title: t('The measurements'),
          body: t('After running, the ▾ arrow next to **Results › Measurements** shows a table with a row per run.'),
          target: byLabel(t('More results views')),
          ...turnOn((p) => p.panel === 'meas', t('It is already showing: look at it and go on.')),
        },
      ],
    },
    {
      id: 'op',
      icon: '🔍',
      title: t('Operating point'),
      blurb: t('Voltages and currents annotated on the schematic, and the names of the nets.'),
      badge: t('Multimeter'),
      practice: 'divider',
      steps: [
        {
          id: 'run',
          title: t('Solve the circuit'),
          body: t('This testbench has an **Operating point** analysis (.op): press **Run**.'),
          target: byLabel(t('Run|verb')),
          check: (p) => p.hasResult,
        },
        {
          id: 'annotate',
          title: t('Annotate it'),
          body: t('The **OP** button writes the voltages and currents on the schematic, without changing it.'),
          target: byLabel(t('Annotate OP')),
          ...turnOn((p) => p.showOp, t('It is already on: look at it and go on.')),
        },
        {
          id: 'nets',
          title: t('Net names'),
          body: t('The **NET** button (or [[Alt+N]]) shows the name of every net, also the ones you did not name.'),
          target: byLabel(t('Nets')),
          ...turnOn((p) => p.showNets, t('It is already on: look at it and go on.')),
        },
        {
          id: 'hover',
          title: t('Ask any component'),
          body: t('Rest the mouse on a component: the bar at the bottom shows its parameters and its operating point. Change R2, run again and compare.'),
        },
      ],
    },
    {
      id: 'save',
      icon: '💾',
      title: t('Save and share'),
      blurb: t('Name your project, save it, share it and take it to LTspice.'),
      badge: t('Golden floppy'),
      practice: 'empty',
      steps: [
        {
          id: 'rename',
          title: t('A name for your project'),
          body: t('**Double-click** the name of the project in the capsule and give it a name of your own.'),
          target: bySel('.capsule-project'),
          start: (p) => ({ name: p.projectName }),
          check: (p, m) => p.projectName !== m.name,
        },
        {
          id: 'save',
          title: t('Save'),
          body: t('[[Ctrl+S]] saves the project as a .turbo file (with a Google account, in your Drive). It is also autosaved in this browser, and older ones are in the menu, **Recent**.'),
          check: (p) => !p.dirty,
        },
        {
          id: 'share',
          title: t('Share a link'),
          body: t('The **Share** button makes a link that opens this circuit: nothing is uploaded to a server, the circuit travels inside the link.'),
          target: byLabel(t('Share')),
          check: (p) => p.dialog === 'share',
        },
        {
          id: 'ltspice',
          title: t('To and from LTspice'),
          body: t('**File › Export .zip for LTspice** gives you an .asc per testbench, and **File › Open/Import…** brings your .asc, .asy and .lib.'),
        },
        {
          id: 'examples',
          title: t('Keep exploring'),
          body: t('The **Examples** of the menu are complete projects: transfer functions, transistor amplifiers, ADCs… Open one and explore it with everything you learned.'),
          target: bySel('.app-menu-btn'),
        },
      ],
    },
  ];
}
