import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { Library } from '../../src/library/library.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { ltNetlist } from '../../src/netlist/ltnetlist.ts';
import { chapters, levelOf, levels, practiceCircuit, starsFor, type Practice, type Probe } from '../../src/tutorial/lessons.ts';
import { rich } from '../../src/tutorial/Tutorial.tsx';
import { connectProgress, loadProgress, mergeProgress, parseProgress, progressText, PROGRESS_NAME, storeProgress, type Progress } from '../../src/tutorial/progress.ts';
import type { DriveClient } from '../../src/cloud/drive.ts';

const lib = new Library(buildBundle());

/** Una foto «vacía» de la app, para probar los chequeos de los pasos */
const probe = (p: Partial<Probe> = {}): Probe => ({
  projectName: 'Tutorial',
  dirty: false,
  benches: [{ id: 's1', custom: false, line: '', runs: 0 }],
  activeBench: 's1',
  groups: 1,
  modules: [],
  inSub: '',
  symbols: [],
  wires: 0,
  grounds: 0,
  labels: [],
  ports: 0,
  loose: 0,
  directives: [],
  line: '',
  tool: 'select',
  dialog: null,
  hasResult: false,
  resultKind: '',
  runs: 0,
  panes: [[]],
  zoomed: false,
  cursors: 0,
  markers: [],
  panel: 'plot',
  treeOpen: false,
  historyOpen: false,
  showOp: false,
  showNets: false,
  ...p,
});
const step = (ch: string, id: string) => chapters().find((c) => c.id === ch)!.steps.find((s) => s.id === id)!;

describe('tutorial', () => {
  it('capítulos y pasos con ids únicos', () => {
    const cs = chapters();
    expect(new Set(cs.map((c) => c.id)).size).toBe(cs.length);
    for (const c of cs) {
      expect(c.steps.length).toBeGreaterThan(2);
      // cada misión arranca de cero, en su proyecto de práctica
      expect(['empty', 'rc', 'rcTran', 'divider']).toContain(c.practice);
      expect(new Set(c.steps.map((s) => s.id)).size).toBe(c.steps.length);
    }
  });

  it('los circuitos de práctica no tienen pines sueltos y simulan lo que dicen', () => {
    for (const k of ['rc', 'rcTran', 'divider'] as Practice[]) {
      const doc = parseAsc(practiceCircuit(k).asc!);
      const { conn } = ltNetlist(doc, lib);
      const loose = [...conn.pinNet.values()].filter((n) => n.pins.length === 1 && !n.labels.length);
      expect(loose, k).toEqual([]);
      expect(doc.symbols.every((s, si) => lib.symbol(s.type)!.pins.every((_, pi) => conn.pinNet.has(`${si}:${pi}`))), k).toBe(true);
    }
    const rc = parseAsc(practiceCircuit('rcTran').asc!);
    expect(rc.texts.map((x) => x.text)).toContain('.tran 20m');
    expect(ltNetlist(rc, lib).conn.nets.map((n) => n.name).sort()).toEqual(['0', 'in', 'out']);
    expect(practiceCircuit('empty').asc).toBeNull();
  });

  it('los pasos se cumplen con el estado que piden', () => {
    const R = (value: string) => ({ type: 'res', prefix: 'R', value });
    const C = (value: string) => ({ type: 'cap', prefix: 'C', value });
    const values = step('draw', 'values');
    expect(values.check!(probe({ symbols: [R('1k'), C('1u')] }), {})).toBe(true);
    expect(values.check!(probe({ symbols: [R('1000'), C('1µ')] }), {})).toBe(true);
    expect(values.check!(probe({ symbols: [R('R'), C('1u')] }), {})).toBe(false);

    const tstop = step('simulate', 'tstop');
    expect(tstop.check!(probe({ line: '.tran 20m' }), {})).toBe(true);
    expect(tstop.check!(probe({ line: '.tran 0 20m 0 1u' }), {})).toBe(true);
    expect(tstop.check!(probe({ line: '.tran 10m' }), {})).toBe(false);

    // borrar y deshacer: hace falta que baje y vuelva
    const undo = step('draw', 'undo');
    const three = probe({ symbols: [R('1k'), C('1u'), R('2k')] });
    const mem = undo.start!(three);
    expect(undo.check!(three, mem)).toBe(false);
    expect(undo.check!(probe({ symbols: [R('1k'), C('1u')] }), mem)).toBe(false);
    expect(undo.check!(three, mem)).toBe(true);

    const expr = step('plot', 'expr');
    expect(expr.check!(probe({ panes: [['V(out)']] }), {})).toBe(false);
    expect(expr.check!(probe({ panes: [['V(out)', 'V(in)-V(out)']] }), {})).toBe(true);

    const sweep = step('study', 'sweep');
    expect(sweep.check!(probe({ directives: ['.param x=1', '.tran 1m'] }), {})).toBe(false);
    expect(sweep.check!(probe({ directives: ['.param x=1\\n.step R1 list 1k 2k 5k'] }), {})).toBe(true);
  });

  it('niveles y estrellas', () => {
    expect(levelOf(0).index).toBe(0);
    const ls = levels();
    expect(levelOf(ls[1].xp).index).toBe(1);
    expect(levelOf(1e9)).toMatchObject({ index: ls.length - 1, progress: 1 });
    expect(starsFor(0, 0)).toBe(3);
    expect(starsFor(2, 0)).toBe(2);
    expect(starsFor(1, 1)).toBe(1);
  });

  it('marcado de los textos', () => {
    const parts = rich('Press [[Ctrl+R]] to **rotate** `R1`');
    expect(parts.filter((x) => typeof x !== 'string').length).toBe(3);
  });
});

describe('pasos que piden abrir o prender algo', () => {
  it('si ya estaba abierto al empezar, no se cumple solo: queda como explicación, con «Siguiente»', () => {
    for (const [ch, id] of [['tour', 'panel'], ['project', 'open'], ['project', 'history'], ['op', 'annotate'], ['op', 'nets']]) {
      const s = step(ch, id);
      const key = ({ panel: 'treeOpen', open: 'treeOpen', history: 'historyOpen', annotate: 'showOp', nets: 'showNets' } as const)[id as 'panel'];
      const on = probe({ [key]: true });
      const off = probe({ [key]: false });
      const mem = s.start!(on);
      expect(s.manual!(mem)).toBe(true);
      expect(s.check!(on, mem)).toBe(false);
      expect(s.progress!(on, mem)).toBeTruthy();
      // si igual lo cierra y lo abre, se cumple
      expect(s.check!(off, mem)).toBe(false);
      expect(s.check!(on, mem)).toBe(true);
      // cerrado al empezar: hay que abrirlo, y alcanza con eso
      const m2 = s.start!(off);
      expect(s.manual!(m2)).toBe(false);
      expect(s.progress!(off, m2)).toBeUndefined();
      expect(s.check!(on, m2)).toBe(true);
    }
  });

  it('la punta de prueba no pide prenderla si ya está prendida (se prende sola al simular)', () => {
    const s = step('plot', 'probe');
    expect(s.body).not.toMatch(/^Turn on/);
    expect(s.progress!(probe({ tool: 'probe' }), {})).toBeTruthy();
    expect(s.progress!(probe({ tool: 'select' }), {})).toBeUndefined();
  });
});

describe('progreso del tutorial (Drive)', () => {
  const p = (xp: number, ch: Progress['ch'], more: Partial<Progress> = {}): Progress => ({ xp, ch, sound: true, ...more });

  it('une los pasos hechos, las mejores estrellas y el mayor XP; el sonido y la posición son de acá', () => {
    const m = mergeProgress(p(40, { tour: { done: ['a', 'b'], stars: 2 } }, { sound: false, pos: { x: 1, y: 2 } }), p(90, { tour: { done: ['b', 'c'], stars: 3 }, draw: { done: ['x'] } }));
    expect(m.xp).toBe(90);
    expect(m.ch.tour).toEqual({ done: ['a', 'b', 'c'], stars: 3 });
    expect(m.ch.draw).toEqual({ done: ['x'] });
    expect(m.sound).toBe(false);
    expect(m.pos).toEqual({ x: 1, y: 2 });
  });

  it('después de borrar el progreso, el de otra máquina (época vieja) no lo devuelve', () => {
    const old = p(500, { tour: { done: ['a'], stars: 3 } });
    const reset = p(10, { draw: { done: ['x'] } }, { epoch: 1 });
    expect(mergeProgress(old, reset)).toMatchObject({ xp: 10, ch: { draw: { done: ['x'] } }, epoch: 1 });
    expect(mergeProgress(reset, old)).toMatchObject({ xp: 10, epoch: 1 });
  });

  it('a Drive no va la posición de la tarjeta, y se vuelve a leer igual', () => {
    const j = JSON.parse(progressText(p(30, { tour: { done: ['a'] } }, { pos: { x: 5, y: 5 }, epoch: 2 })));
    expect(j.format).toBe('turbospice-tutorial');
    expect(j.pos).toBeUndefined();
    expect(parseProgress(j)).toEqual(p(30, { tour: { done: ['a'] } }, { epoch: 2 }));
    expect(parseProgress({ xp: 'x' })).toBeNull();
  });

  it('al entrar une el de Drive con el de acá y después sube cada cambio', async () => {
    const mem = new Map<string, string>();
    globalThis.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) } as Storage;
    globalThis.window ??= globalThis as unknown as Window & typeof globalThis;
    globalThis.window.dispatchEvent ??= () => true;
    storeProgress(p(20, { tour: { done: ['a'] } }));
    let remote = progressText(p(60, { draw: { done: ['x'] } }));
    const saved: string[] = [];
    const drive = {
      find: async (name: string) => (name === PROGRESS_NAME ? [{ id: 'f1' }] : []),
      download: async () => new TextEncoder().encode(remote),
      save: async (_name: string, bytes: Uint8Array, id?: string) => {
        remote = new TextDecoder().decode(bytes);
        saved.push(remote);
        return { id: id ?? 'f1' };
      },
    } as unknown as DriveClient;
    const stop = connectProgress(drive, (e) => {
      throw e;
    });
    await new Promise((r) => setTimeout(r, 1100));
    expect(loadProgress()).toMatchObject({ xp: 60, ch: { tour: { done: ['a'] }, draw: { done: ['x'] } } });
    expect(JSON.parse(remote)).toMatchObject({ xp: 60, ch: { tour: { done: ['a'] } } });
    storeProgress({ ...loadProgress(), xp: 70 });
    storeProgress({ ...loadProgress(), xp: 80 });
    await new Promise((r) => setTimeout(r, 1100));
    expect(saved.length).toBe(2);
    expect(JSON.parse(remote).xp).toBe(80);
    stop();
  });
});
