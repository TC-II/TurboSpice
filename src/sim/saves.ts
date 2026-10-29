// Qué señales se guardan en la simulación (#314). Por defecto todo (.save all + savecurrents);
// con "sólo lo elegido" el testbench lleva una directiva ".save V(out) I(R1) Ic(Q1)…" con los
// nombres de LTspice (LTspice la entiende igual) y acá se traduce a los vectores de ngspice.
//
// Medido en el motor (ngspice-47 wasm):
// - con una lista en .save, ngspice guarda sólo eso; ".options savecurrents" agrega igual las
//   corrientes de todos los dispositivos, así que en ese modo no va;
// - @r1[i], @q1[ic]… se pueden pedir con .save sin savecurrents;
// - un nodo que no existe se ignora; un dispositivo que no existe da un vector vacío;
// - los nodos digitales de XSPICE (event-driven, también los de los bloques Verilog) se guardan
//   siempre: .save no los filtra.
import type { AscDoc } from '../asc/model.ts';
import type { Element, LtNetlist } from '../netlist/ltnetlist.ts';
import { isNgspiceComment } from '../netlist/directives.ts';
import { ngNodeName, type NgspiceNetlist } from '../netlist/tongspice.ts';
import { blockInstances, hierDevice } from './context.ts';
import { deviceVector, netVector, type BuiltSimulation } from './schematicSim.ts';

/** Línea .save del usuario con una lista (no "all" ni "none") */
const SAVE_LIST = /^\s*\.save\b(?!\s+(all|none)\s*$)/i;
const lines = (text: string) => text.split('\\n');

/** Referencias de un .save: "V(out)", "V(a,b)", "I(R1)", "@Q1[gm]" */
export function saveRefs(line: string): string[] {
  const body = line.trim().replace(/^\.save\s*/i, '');
  return body.match(/[A-Za-z]\w*\s*\([^()]*\)|@[^\s[]+\[[^\]]+\]|[^\s,]+/g)?.filter((r) => !/^(all|none)$/i.test(r)).map((r) => r.replace(/\s+/g, '')) ?? [];
}

/**
 * Señales elegidas del testbench: null si se guarda todo (no hay .save con lista). Lee las
 * directivas (o comentarios de ngspice) de la netlist o del esquemático.
 */
export function saveSelection(texts: { kind: string; text: string }[]): string[] | null {
  let out: string[] | null = null;
  for (const tt of texts) {
    if (tt.kind !== 'directive' && !isNgspiceComment(tt.text)) continue;
    for (const l of lines(tt.text)) {
      const s = l.replace(/^\s*;/, '');
      if (SAVE_LIST.test(s)) out = [...(out ?? []), ...saveRefs(s)];
    }
  }
  return out;
}

/** Índice del texto del esquemático con el .save de lista, o -1 */
export function findSaveText(doc: AscDoc): number {
  return doc.texts.findIndex((tt) => tt.kind === 'directive' && lines(tt.text).some((l) => SAVE_LIST.test(l)));
}

/**
 * Escribe la selección en el esquemático: null (o vacía) vuelve a "guardar todo" (saca el .save). La
 * directiva queda debajo del comando de análisis (oculta, como él: tiene su menú).
 */
export function setSaveSelection(doc: AscDoc, refs: string[] | null): AscDoc {
  const i = findSaveText(doc);
  const texts = [...doc.texts];
  const line = refs?.length ? `.save ${refs.join(' ')}` : null;
  if (i >= 0) {
    const ls = lines(texts[i].text).filter((l) => !SAVE_LIST.test(l));
    if (line) ls.push(line);
    if (ls.some((l) => l.trim())) texts[i] = { ...texts[i], text: ls.join('\\n') };
    else texts.splice(i, 1);
  } else if (line) {
    const near = doc.texts.find((tt) => tt.kind === 'directive');
    texts.push({ x: near?.x ?? 0, y: (near?.y ?? 0) + 32, align: 'Left', size: 2, kind: 'directive', text: line });
  }
  return { ...doc, texts };
}

/** Referencias V()/I()/Ic()…/@dev[param] escritas en un texto (trazas, .meas, .control, .four) */
export function textRefs(text: string): string[] {
  return text.match(/\b(?:v|i|i[bcdegs]|dig)\s*\([^()]*\)|@[^\s[()]+\[[^\]]+\]/gi)?.map((r) => r.replace(/\s+/g, '')) ?? [];
}

const TERMINAL = /^i([bcdegs])$/i;

/** Vectores de ngspice de una referencia de LTspice ("V(out)" → "out", "I(R1)" → "@r1[i]") */
export function refVectors(ref: string, lt: LtNetlist, ng: NgspiceNetlist): string[] {
  const dev = /^@([^[]+)\[([^\]]+)\]$/.exec(ref);
  const m = /^(\w+)\((.*)\)$/.exec(ref);
  const element = (name: string): Element | undefined => lt.elements.find((e) => e.name.toLowerCase() === name.toLowerCase() || e.name.replace(/§/g, '').toLowerCase() === name.toLowerCase());
  /** dispositivo con su nombre de ngspice y el elemento (si es del nivel superior) */
  const device = (name: string): { ng: string; el?: Element } | null => {
    const el = element(name);
    if (el) {
      const n = ng.names.get(el.name)?.toLowerCase();
      return n ? { ng: n, el } : null;
    }
    const h = name.includes('.') ? hierDevice(name) : null;
    return h ? { ng: h } : null;
  };
  if (dev) {
    const d = device(dev[1]);
    return [`@${d?.ng ?? dev[1].toLowerCase()}[${dev[2].toLowerCase()}]`];
  }
  if (!m) return [];
  const f = m[1].toLowerCase();
  const args = m[2].split(',').map((a) => a.trim()).filter(Boolean);
  // los nodos digitales se guardan siempre
  if (f === 'dig') return [];
  if (f === 'v') return args.filter((a) => a !== '0').map((a) => netVector(a));
  const d = args[0] ? device(args[0]) : null;
  if (!d) return [];
  if (f === 'i') {
    const v = deviceVector(d.ng, d.el?.value);
    // las fuentes, inductores… tienen rama; el resto, el parámetro de corriente
    return v ? [v] : [];
  }
  const term = TERMINAL.exec(f);
  return term ? [`@${d.ng}[i${term[1].toLowerCase()}]`] : [];
}

/** Una señal que se puede elegir en el menú */
export interface SavableSignal {
  /** como se escribe en el .save (nombres de LTspice / de las trazas) */
  ref: string;
  kind: 'voltage' | 'current';
  /** "" en el nivel superior, "X_U1", "X_U1.X_U2"… */
  group: string;
}

/** Terminales con corriente propia de cada tipo de transistor */
const TERMINALS: Record<string, string[]> = { Q: ['Ic', 'Ib', 'Ie'], M: ['Id', 'Ig', 'Is'], J: ['Id', 'Ig', 'Is'], Z: ['Id', 'Ig', 'Is'] };

function elementSignals(elements: Element[], name: (e: Element) => string | undefined, net: (n: string) => string, group: string): SavableSignal[] {
  const out: SavableSignal[] = [];
  const nets = new Set<string>();
  for (const e of elements) for (const n of e.nodes) if (n && n !== '0') nets.add(n);
  for (const n of [...nets].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) out.push({ ref: `V(${net(n)})`, kind: 'voltage', group });
  for (const e of elements) {
    const p = e.prefix.toUpperCase();
    const nm = name(e);
    // los subcircuitos (X) y los dispositivos A digitales no tienen corriente propia
    if (!nm || p === 'X' || p === 'A' || p === 'K' || p === 'U') continue;
    for (const tt of TERMINALS[p] ?? ['I']) out.push({ ref: `${tt}(${nm})`, kind: 'current', group });
  }
  return out;
}

/** Todas las señales que se pueden guardar, por jerarquía (las de las instancias de subcircuitos del proyecto) */
export function savableSignals(sim: Pick<BuiltSimulation, 'lt' | 'ng'>): SavableSignal[] {
  const out = elementSignals(sim.lt.elements, (e) => e.name.replace(/§/g, ''), (n) => n, '');
  for (const b of blockInstances(sim as BuiltSimulation)) {
    const group = b.prefix.replace(/\.$/, '').toUpperCase();
    out.push(
      ...elementSignals(
        b.block.lt.elements,
        (e) => {
          const ng = b.names.get(e.name);
          return ng ? `${b.prefix}${ng}`.toUpperCase() : undefined;
        },
        (n) => `${b.prefix}${ngNodeName(n)}`,
        group,
      ).filter((s) => !(s.kind === 'voltage' && b.block.ports.some((p) => s.ref.toLowerCase() === `v(${b.prefix}${ngNodeName(p)})`.toLowerCase()))),
    );
  }
  return out;
}
