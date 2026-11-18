// Lógica del editor de modelos, sin React. Un módulo «Modelo» es un netlist (.subckt o .model) y el
// símbolo que lo usa; acá está lo que el editor necesita saber y hacer con los dos juntos:
//  - qué define el netlist y qué problemas tiene, con su línea (parseModel);
//  - a qué nodo va cada pin del símbolo (por SpiceOrder), qué nodos no tienen pin, qué parámetros
//    pasa cada instancia y la línea de netlist que va a escribir (analyzeModel);
//  - las operaciones de cada paso (conectar un pin, agregar los que faltan, declarar un parámetro…),
//    que cambian netlist y símbolo a la vez sin dejar pines mal conectados;
//  - normalizeModel, que se aplica en cada cambio: los pines siguen a sus nodos cuando se edita el
//    netlist, SpiceModel/Prefix/ModelFile salen del netlist y el símbolo que no se tocó se rehace.
import { GRID } from '../asc/model.ts';
import { t } from '../i18n/i18n.ts';
import { makeSymbol } from '../library/makeSymbol.ts';
import { MODEL_TYPES, modelFileName, modelParams, PARAM_SLOTS, removePinKeepOrder, setModelParams, setPinAttr, setSubcktPins, setSymAttr, symAttr, syncModelAttrs } from './modelModule.ts';
import { addFreePin, addPin, parseParamList, setPinAlign, symBody, symPins, symWindows } from './symbolEdit.ts';

/** Lo que se edita: el netlist y el símbolo (.asy) */
export interface ModelState {
  text: string;
  sym: string;
}

/** Un .subckt o .model del netlist (de los de arriba: los de adentro de un .subckt son internos) */
export interface ModelDef {
  kind: 'subckt' | 'model';
  name: string;
  /** tipo del .model (D, NPN…), en mayúsculas */
  type?: string;
  /** línea (1…) de su .subckt / .model y de su .ends */
  line: number;
  end?: number;
  /** nodos del .subckt, o terminales del dispositivo de un .model (A K, C B E…) */
  nodes: string[];
  /** parámetros de la línea .subckt con su valor por defecto (params: G=1) */
  params: [string, string][];
}

export type DiagCode =
  | 'no-def'
  | 'no-ends'
  | 'stray-ends'
  | 'ends-name'
  | 'no-name'
  | 'no-type'
  | 'dup-def'
  | 'dup-node'
  | 'ground-node'
  | 'no-nodes'
  | 'unknown-type'
  | 'top-element'
  | 'top-command'
  | 'free-nodes'
  | 'free-nodes-end'
  | 'pin-unconnected'
  | 'pin-duplicate'
  | 'pin-dup-name'
  | 'pin-no-name'
  | 'param-undeclared';

/** Arreglo de un problema con un clic */
export type Fix =
  | { kind: 'add-pins' }
  | { kind: 'remove-pin'; pin: number }
  | { kind: 'add-node'; pin: number }
  | { kind: 'declare-param'; name: string }
  | { kind: 'remove-param'; name: string }
  | { kind: 'add-ends'; name: string };

/** Paso del flujo al que corresponde un problema: el netlist, los pines o los parámetros */
export type Area = 'netlist' | 'pins' | 'params';

export interface Diagnostic {
  code: DiagCode;
  severity: 'error' | 'warning';
  area: Area;
  /** línea del netlist (1…) */
  line?: number;
  args: Record<string, string | number>;
  fixes?: Fix[];
}

const eq = (a: string | undefined, b: string | undefined) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase();

// --- leer el netlist ------------------------------------------------------------------------

/** Comandos que en un archivo de modelos afectarían a cada simulación que lo use */
const COMMANDS = /^\.(tran|ac|dc|op|noise|tf|four|pz|sens|disto|stb|meas|measure|control|endc|print|plot|probe|step|save|backanno|end)$/i;

/** Sin el comentario del final de la línea (; de LTspice, «$ » y // de ngspice) */
const uncomment = (l: string) => l.replace(/(?:;|(?:^|\s)\$(?=\s|$)|(?:^|\s)\/\/).*$/, '');

/** Líneas lógicas: sin comentarios, con las de continuación (+) unidas a la suya y los «=» pegados */
function logicalLines(text: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  text.split(/\r\n|\r|\n/).forEach((raw, i) => {
    if (/^\s*\*/.test(raw)) return;
    const l = uncomment(raw);
    if (/^\s*\+/.test(l)) {
      if (out.length) out[out.length - 1].text += ' ' + l.replace(/^\s*\+/, '');
      return;
    }
    if (l.trim()) out.push({ line: i + 1, text: l.trim() });
  });
  for (const l of out) l.text = l.text.replace(/\s*=\s*/g, '=').trim();
  return out;
}

/** Qué define el netlist (sólo los .subckt y .model de arriba) y los problemas de su texto */
export function parseModel(text: string): { defs: ModelDef[]; diagnostics: Diagnostic[] } {
  const defs: ModelDef[] = [];
  const diagnostics: Diagnostic[] = [];
  const add = (code: DiagCode, severity: Diagnostic['severity'], line: number | undefined, args: Diagnostic['args'] = {}, fixes?: Fix[]) =>
    diagnostics.push({ code, severity, area: 'netlist', line, args, ...(fixes ? { fixes } : {}) });
  const open: ModelDef[] = [];
  const elements: number[] = [];
  for (const { line, text: l } of logicalLines(text)) {
    const words = l.split(/\s+/);
    const cmd = words[0].toLowerCase();
    if (cmd === '.subckt') {
      const name = words[1] ?? '';
      const rest = words.slice(2);
      const at = rest.findIndex((w) => /^params:/i.test(w) || w.includes('='));
      const nodes = at < 0 ? rest : rest.slice(0, at);
      const def: ModelDef = { kind: 'subckt', name, line, nodes, params: at < 0 ? [] : parseParamList(rest.slice(at).join(' ')) };
      if (!name || name.includes('=')) add('no-name', 'error', line);
      else if (!open.length) {
        defs.push(def);
        if (!nodes.length) add('no-nodes', 'warning', line, { name });
        const seen = new Set<string>();
        for (const n of nodes) {
          if (seen.has(n.toLowerCase())) add('dup-node', 'error', line, { node: n });
          seen.add(n.toLowerCase());
        }
        if (nodes.includes('0')) add('ground-node', 'warning', line);
      }
      open.push(def);
      continue;
    }
    if (cmd === '.ends') {
      const d = open.pop();
      if (!d) add('stray-ends', 'error', line);
      else {
        d.end = line;
        if (words[1] && d.name && !eq(words[1], d.name)) add('ends-name', 'warning', line, { name: words[1], expected: d.name });
      }
      continue;
    }
    if (cmd === '.model') {
      const m = /^\.model\s+(\S+)\s+([A-Za-z_]\w*)/i.exec(l);
      if (!m) {
        add('no-type', 'error', line);
        continue;
      }
      if (open.length) continue;
      const type = m[2].toUpperCase();
      defs.push({ kind: 'model', name: m[1], type, line, end: line, nodes: MODEL_TYPES[type]?.pins ?? [], params: [] });
      if (!MODEL_TYPES[type]) add('unknown-type', 'warning', line, { type: m[2] });
      continue;
    }
    if (open.length) continue;
    if (/^[a-z]/i.test(cmd)) elements.push(line);
    else if (COMMANDS.test(cmd)) add('top-command', 'warning', line, { cmd: words[0] });
  }
  open.forEach((d, i) => add('no-ends', 'error', d.line, { name: d.name }, i === open.length - 1 && d.name ? [{ kind: 'add-ends', name: d.name }] : undefined));
  if (elements.length) add('top-element', 'warning', elements[0], { n: elements.length, line: elements[0] });
  defs.forEach((d, i) => {
    if (defs.findIndex((x) => eq(x.name, d.name)) < i) add('dup-def', 'error', d.line, { name: d.name });
  });
  if (!defs.length && text.trim() && !diagnostics.some((d) => d.severity === 'error')) add('no-def', 'error', undefined);
  return { defs, diagnostics: diagnostics.sort((a, b) => (a.line ?? 0) - (b.line ?? 0)) };
}

/** La definición que usa el símbolo: la de su SpiceModel o, si el netlist no la tiene, la primera */
export const usedDef = (defs: ModelDef[], sym: string) => defs.find((d) => eq(d.name, symAttr(sym, 'SpiceModel'))) ?? defs[0];

// --- el símbolo frente al netlist ---------------------------------------------------------------

/** Un pin del símbolo con el nodo al que va */
export interface PinInfo {
  /** en el orden del archivo */
  index: number;
  name: string;
  /** lado del nombre (LEFT, RIGHT, TOP, BOTTOM; NONE: oculto) */
  align: string;
  order: number;
  /** índice del nodo al que va (por SpiceOrder) */
  node?: number;
  /** sin nodo (SpiceOrder fuera de los nodos) o al mismo nodo que otro pin anterior */
  problem?: 'unconnected' | 'duplicate';
}

export interface ModelAnalysis {
  /** el netlist está vacío: el editor ofrece cómo empezar */
  empty: boolean;
  defs: ModelDef[];
  used?: ModelDef;
  nodes: string[];
  pins: PinInfo[];
  /** índices de los nodos sin pin */
  free: number[];
  /** parámetros que pasa cada instancia (los del símbolo) */
  params: [string, string][];
  /** parámetros que declara la línea .subckt */
  declared: [string, string][];
  /** texto de Value, Value2, SpiceLine o SpiceLine2 que no es nombre=valor (la tabla no lo edita) */
  freeText: string;
  diagnostics: Diagnostic[];
  /** la línea de netlist de una instancia (XU1 in out AMP G=1) */
  instance: string;
}

/** Pines del símbolo con su nodo; y los nodos que no tienen pin */
function connect(sym: string, nodes: string[]): { pins: PinInfo[]; free: number[] } {
  const taken = new Set<number>();
  const pins = symPins(sym).map((p, index): PinInfo => {
    const base = { index, name: p.name, align: p.align, order: p.order };
    if (!(p.order >= 1 && p.order <= nodes.length)) return { ...base, problem: 'unconnected' };
    if (taken.has(p.order)) return { ...base, node: p.order - 1, problem: 'duplicate' };
    taken.add(p.order);
    return { ...base, node: p.order - 1 };
  });
  return { pins, free: nodes.flatMap((_, i) => (taken.has(i + 1) ? [] : [i])) };
}

export function analyzeModel(s: ModelState): ModelAnalysis {
  const { defs, diagnostics } = parseModel(s.text);
  const used = usedDef(defs, s.sym);
  const nodes = used?.nodes ?? [];
  const { pins, free } = connect(s.sym, nodes);
  const params = modelParams(s.sym);
  const declared = used?.kind === 'subckt' ? used.params : [];
  const freeText = PARAM_SLOTS.map((k) =>
    symAttr(s.sym, k)
      .replace(/([A-Za-z_]\w*)\s*=\s*(\{[^}]*\}|"[^"]*"|\S+)/g, '')
      .trim(),
  )
    .filter(Boolean)
    .join(' ');
  const out: Diagnostic[] = [...diagnostics];
  const pin = (code: DiagCode, severity: Diagnostic['severity'], args: Diagnostic['args'], fixes?: Fix[]) => out.push({ code, severity, area: 'pins', args, ...(fixes ? { fixes } : {}) });
  if (used) {
    // el netlister escribe un nodo por SpiceOrder hasta el del último pin: los huecos quedan flotando
    // (NC) y los nodos sin pin después del último faltan en la línea (ngspice la rechaza)
    const last = Math.max(0, ...pins.filter((p) => p.node !== undefined).map((p) => p.node! + 1));
    const gaps = free.filter((i) => i < last);
    const tail = free.filter((i) => i >= last);
    const listed = (is: number[]) => ({ nodes: is.map((i) => nodes[i]).join(', '), n: is.length });
    if (gaps.length) pin('free-nodes', 'warning', listed(gaps), [{ kind: 'add-pins' }]);
    if (tail.length) pin('free-nodes-end', 'error', listed(tail), [{ kind: 'add-pins' }]);
    for (const p of pins) {
      if (p.problem === 'unconnected')
        pin('pin-unconnected', 'error', { pin: p.name }, [{ kind: 'remove-pin', pin: p.index }, ...(used.kind === 'subckt' && p.name ? [{ kind: 'add-node' as const, pin: p.index }] : [])]);
      if (p.problem === 'duplicate')
        pin('pin-duplicate', 'error', { pin: p.name, other: pins.find((q) => q.node === p.node && !q.problem)?.name ?? '', node: nodes[p.node!] }, [{ kind: 'remove-pin', pin: p.index }]);
    }
    const names = pins.map((p) => p.name.toLowerCase());
    if (names.includes('')) pin('pin-no-name', 'warning', {});
    for (const n of new Set(names.filter((n, i) => n && names.indexOf(n) !== i))) pin('pin-dup-name', 'warning', { pin: pins.find((p) => p.name.toLowerCase() === n)!.name });
    if (used.kind === 'subckt')
      for (const [k] of params)
        if (!declared.some(([d]) => eq(d, k)))
          out.push({
            code: 'param-undeclared',
            severity: 'warning',
            area: 'params',
            args: { name: k },
            fixes: [
              { kind: 'declare-param', name: k },
              { kind: 'remove-param', name: k },
            ],
          });
  }
  return { empty: !s.text.trim(), defs, used, nodes, pins, free, params, declared, freeText, diagnostics: out, instance: instanceLine(s.sym) };
}

/** Letra de las instancias para un prefijo (X → U, como LTspice; QN → Q, MN → M) */
const instLetter = (prefix: string) => (prefix.toUpperCase() === 'X' ? 'U' : (prefix[0]?.toUpperCase() ?? 'U'));

/** La línea de netlist de la primera instancia, como la escribe el netlister: nombre, un nodo por
 *  SpiceOrder hasta el del último pin (con el nombre del pin; NC si ningún pin va ahí), SpiceModel,
 *  Value, Value2, SpiceLine y SpiceLine2 */
export function instanceLine(sym: string): string {
  const prefix = symAttr(sym, 'Prefix') || 'X';
  const own = /^([A-Za-z_]+)\d+$/.exec(symAttr(sym, 'InstName'));
  const inst = own ? own[0] : `${instLetter(prefix)}1`;
  const name = inst[0].toUpperCase() === prefix[0].toUpperCase() ? inst : `${prefix[0].toUpperCase()}${inst}`;
  const pins = symPins(sym);
  const count = Math.max(0, ...pins.map((p) => p.order).filter((o) => o >= 1));
  const nodes = Array.from({ length: count }, (_, k) => pins.find((p) => p.order === k + 1)?.name || 'NC');
  const P = prefix.toUpperCase();
  // los nodos que agrega el netlister: sustrato del BJT a tierra, bulk del MOS de 3 pines a la fuente
  if ((P === 'QN' || P === 'QP') && nodes.length === 3) nodes.push('0');
  else if ((P === 'MN' || P === 'MP') && nodes.length === 3) nodes.push(nodes[2]);
  const value = ['SpiceModel', ...PARAM_SLOTS].map((k) => symAttr(sym, k)).filter(Boolean);
  return [name, ...nodes, ...value].join(' ');
}

// --- símbolo generado ---------------------------------------------------------------------------

/** Lo que es dibujo y pines del símbolo (no sus atributos ni rótulos) */
const drawingKey = (sym: string) =>
  sym
    .split(/\r?\n/)
    .filter((l) => /^(LINE|RECTANGLE|CIRCLE|ARC|TEXT|PIN|PINATTR)\b/.test(l))
    .join('\n');

/** El símbolo que se genera para la definición `spiceModel` del netlist (o la primera): un
 *  rectángulo con la mitad de los nodos a cada lado */
export function generatedSymbol(name: string, text: string, spiceModel?: string): string {
  const defs = parseModel(text).defs;
  const d = defs.find((x) => eq(x.name, spiceModel)) ?? defs[0];
  let s = makeSymbol({ name: d?.name || name, pins: d?.nodes ?? [], modelFile: modelFileName(name), description: name });
  // el nombre va en SpiceModel (su rótulo es el WINDOW 38), no en Value
  s = setSymAttr(setSymAttr(s, 'Value', ''), 'SpiceModel', d?.name ?? name).replace(/^WINDOW 3 /m, 'WINDOW 38 ');
  s = setSymAttr(s, 'Prefix', d?.kind === 'model' ? (MODEL_TYPES[d.type ?? '']?.prefix ?? 'X') : 'X');
  return d?.kind === 'subckt' && d.params.length ? setModelParams(s, d.params) : s;
}

/** ¿El dibujo y los pines son los que se generaron para el netlist `text`? (nadie los tocó) */
export const isGenerated = (sym: string, name: string, text: string, spiceModel?: string) => drawingKey(sym) === drawingKey(generatedSymbol(name, text, spiceModel));

/** ¿Es el rectángulo que se genera para sus propios pines? (después de vaciar el netlist no hay con
 *  qué compararlo: si se lo dejó como se generó, se lo rehace con lo que se escriba) */
const isPristine = (sym: string, name: string) =>
  drawingKey(sym) ===
  drawingKey(
    makeSymbol({
      name: symAttr(sym, 'SpiceModel') || name,
      pins: symPins(sym)
        .sort((a, b) => a.order - b.order)
        .map((p) => p.name),
    }),
  );

/** El símbolo generado de nuevo, con lo que no es dibujo del actual: descripción, nombre de las
 *  instancias, parámetros y qué rótulos se ven (y su tamaño) */
export function rebuildSymbol(name: string, s: ModelState): string {
  let out = generatedSymbol(name, s.text, symAttr(s.sym, 'SpiceModel'));
  for (const k of ['Description', 'InstName']) if (symAttr(s.sym, k)) out = setSymAttr(out, k, symAttr(s.sym, k));
  const ps = modelParams(s.sym);
  if (ps.length) out = setModelParams(out, ps);
  // de cada rótulo, si estaba oculto y su tamaño (el lugar y la alineación son los del generado)
  for (const w of symWindows(s.sym))
    out = out.replace(
      new RegExp(`^WINDOW ${w.n} (-?\\d+) (-?\\d+) (\\S+) \\d+$`, 'm'),
      (_, x: string, y: string, align: string) => `WINDOW ${w.n} ${x} ${y} ${w.align === 'Invisible' ? 'Invisible' : align} ${w.size}`,
    );
  return out;
}

// --- normalizar después de cada cambio ------------------------------------------------------------

/** Índice nuevo de cada nodo viejo (-1 si ya no está). Los que siguen igual se aparean por la
 *  subsecuencia común más larga; los que cambiaron de lugar, por nombre; y entre dos que siguen
 *  igual, tantos viejos como nuevos se toman como renombrados en su lugar */
export function mapNodes(before: string[], after: string[]): number[] {
  const A = before.map((x) => x.toLowerCase());
  const B = after.map((x) => x.toLowerCase());
  const n = A.length;
  const m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const map = new Array<number>(n).fill(-1);
  const anchors: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (A[i] === B[j]) anchors.push([i++, j++]);
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  const usedB = new Set<number>();
  for (const [i, j] of anchors) (map[i] = j), usedB.add(j);
  // los que se movieron: por nombre
  A.forEach((a, i) => {
    if (map[i] >= 0) return;
    const j = B.findIndex((b, k) => b === a && !usedB.has(k));
    if (j >= 0) (map[i] = j), usedB.add(j);
  });
  // renombrados: en cada hueco entre dos anclas, si quedan tantos viejos como nuevos
  let pi = 0;
  let pj = 0;
  for (const [i, j] of [...anchors, [n, m] as [number, number]]) {
    const olds = Array.from({ length: i - pi }, (_, k) => pi + k).filter((k) => map[k] < 0);
    const news = Array.from({ length: j - pj }, (_, k) => pj + k).filter((k) => !usedB.has(k));
    if (olds.length === news.length) olds.forEach((o, k) => (map[o] = news[k]));
    pi = i + 1;
    pj = j + 1;
  }
  return map;
}

/** Los pines siguen a sus nodos: el SpiceOrder de cada uno pasa a la posición nueva de su nodo y,
 *  si el nodo cambió de nombre y el pin se llamaba como él, el pin también. El de un nodo que ya no
 *  está queda suelto (fuera de los nodos: el editor lo marca); los que ya estaban sueltos no cambian */
export function followNodes(sym: string, before: string[], after: string[]): string {
  if (before.length === after.length && before.every((x, i) => x === after[i])) return sym;
  const map = mapNodes(before, after);
  const pins = symPins(sym);
  let extra = Math.max(after.length, before.length, ...pins.map((p) => p.order));
  let s = sym;
  pins.forEach((p, i) => {
    if (!(p.order >= 1 && p.order <= before.length)) return;
    const k = map[p.order - 1];
    if (k < 0) return void (s = setPinAttr(s, i, 'SpiceOrder', String(++extra)));
    if (k + 1 !== p.order) s = setPinAttr(s, i, 'SpiceOrder', String(k + 1));
    const old = before[p.order - 1];
    if (old !== after[k] && eq(p.name, old)) s = setPinAttr(s, i, 'PinName', after[k]);
  });
  return s;
}

/** Lo que se hace después de cada cambio (`prev` → `next`), así netlist y símbolo nunca quedan
 *  desparejos: SpiceModel sigue a su definición (si se la renombró, la del mismo lugar); un símbolo
 *  que nadie tocó se genera de nuevo; si se lo tocó, sus pines siguen a sus nodos; Prefix sale de lo
 *  que define el netlist y ModelFile es el archivo del módulo. No cambia el netlist */
export function normalizeModel(next: ModelState, name: string, prev?: ModelState): ModelState {
  let sym = next.sym;
  const defs = parseModel(next.text).defs;
  const textChanged = !!prev && prev.text !== next.text;
  if (prev && (textChanged || !eq(symAttr(prev.sym, 'SpiceModel'), symAttr(sym, 'SpiceModel')))) {
    const before = textChanged ? parseModel(prev.text).defs : defs;
    const was = usedDef(before, prev.sym);
    let now = defs.find((d) => eq(d.name, symAttr(sym, 'SpiceModel')));
    if (!now && was) now = defs[before.indexOf(was)];
    now ??= defs[0];
    if (now && !eq(now.name, symAttr(sym, 'SpiceModel'))) sym = setSymAttr(sym, 'SpiceModel', now.name);
    if (now && (isGenerated(sym, name, prev.text, symAttr(prev.sym, 'SpiceModel')) || (!before.length && isPristine(sym, name)))) sym = rebuildSymbol(name, { text: next.text, sym });
    else if (now && was && textChanged && was.kind === now.kind && (eq(was.name, now.name) || before.indexOf(was) === defs.indexOf(now))) sym = followNodes(sym, was.nodes, now.nodes);
  }
  if (defs.length) sym = syncModelAttrs(sym, next.text);
  if (symAttr(sym, 'ModelFile') !== modelFileName(name)) sym = setSymAttr(sym, 'ModelFile', modelFileName(name));
  return sym === next.sym ? next : { text: next.text, sym };
}

// --- operaciones de cada paso -------------------------------------------------------------------

const defOf = (s: ModelState) => usedDef(parseModel(s.text).defs, s.sym);

/** Usar otra definición del netlist (si define varias) */
export const chooseDefinition = (s: ModelState, name: string): ModelState => ({ ...s, sym: setSymAttr(s.sym, 'SpiceModel', name) });

/** Conecta el pin `pin` al nodo `node` (null: lo desconecta). Si otro pin iba a ese nodo, pasa al
 *  nodo que tenía éste (se intercambian) o, si éste no tenía, queda suelto */
export function connectPin(s: ModelState, pin: number, node: number | null): ModelState {
  const nodes = defOf(s)?.nodes ?? [];
  const pins = symPins(s.sym);
  const p = pins[pin];
  if (!p) return s;
  const loose = Math.max(nodes.length, ...pins.map((q) => q.order)) + 1;
  if (node === null) return p.order >= 1 && p.order <= nodes.length ? { ...s, sym: setPinAttr(s.sym, pin, 'SpiceOrder', String(loose)) } : s;
  const target = node + 1;
  if (p.order === target || node < 0 || node >= nodes.length) return s;
  let sym = s.sym;
  const other = pins.findIndex((q, i) => i !== pin && q.order === target);
  if (other >= 0) {
    const mine = p.order >= 1 && p.order <= nodes.length && pins.filter((q) => q.order === p.order).length === 1;
    sym = setPinAttr(sym, other, 'SpiceOrder', String(mine ? p.order : loose));
  }
  return { ...s, sym: setPinAttr(sym, pin, 'SpiceOrder', String(target)) };
}

/** Agranda el cuerpo hacia abajo `dy` y baja los rótulos y textos que estaban debajo de él */
function growBody(sym: string, dy: number): string {
  const b = symBody(sym);
  if (!b) return sym;
  let body = false;
  return sym
    .split(/\r?\n/)
    .map((l) => {
      const r = /^RECTANGLE (\S+) (-?\d+) (-?\d+) (-?\d+) (-?\d+)(.*)$/.exec(l);
      if (r && !body) {
        body = true;
        const [x1, y1, x2, y2] = r.slice(2, 6).map(Number);
        return `RECTANGLE ${r[1]} ${x1} ${y1 >= y2 ? y1 + dy : y1} ${x2} ${y2 > y1 ? y2 + dy : y2}${r[6]}`;
      }
      const w = /^(WINDOW \d+ -?\d+ )(-?\d+)( .*)$/.exec(l) ?? /^(TEXT -?\d+ )(-?\d+)( .*)$/.exec(l);
      return w && Number(w[2]) >= b.y2 ? `${w[1]}${Number(w[2]) + dy}${w[3]}` : l;
    })
    .join('\n');
}

/** Pin nuevo en un borde del cuerpo (como los del símbolo generado: cada 32, en la grilla), que se
 *  agranda si no hay lugar; sin cuerpo (o fuera de la grilla), en un lugar libre a la izquierda */
export function placePin(sym: string, name: string, side: 'LEFT' | 'RIGHT'): string {
  const b = symBody(sym);
  const x = b && (side === 'LEFT' ? b.x1 : b.x2);
  if (!b || x === null || x % GRID || b.y1 % GRID) return addFreePin(sym, name, GRID);
  const taken = symPins(sym);
  let y = b.y1 + GRID;
  while (taken.some((p) => p.x === x && p.y === y)) y += 2 * GRID;
  const s = y > b.y2 - GRID ? growBody(sym, y + GRID - b.y2) : sym;
  return addPin(s, name, x, y);
}

/** Un nombre de pin que no usa otro pin (el del nodo; si ya está, con _2, _3…) */
function freePinName(sym: string, base: string): string {
  const names = new Set(symPins(sym).map((p) => p.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  for (let k = 2; ; k++) if (!names.has(`${base}_${k}`.toLowerCase())) return `${base}_${k}`;
}

/** Agrega el pin del nodo `node` (con su nombre y su SpiceOrder): la primera mitad de los nodos a
 *  la izquierda, la otra a la derecha */
export function addPinFor(s: ModelState, node: number): ModelState {
  const nodes = defOf(s)?.nodes ?? [];
  if (node < 0 || node >= nodes.length) return s;
  const sym = placePin(s.sym, freePinName(s.sym, nodes[node]), node < Math.ceil(nodes.length / 2) ? 'LEFT' : 'RIGHT');
  return { ...s, sym: setPinAttr(sym, symPins(sym).length - 1, 'SpiceOrder', String(node + 1)) };
}

/** Un pin para cada nodo que no tiene */
export function addMissingPins(s: ModelState): ModelState {
  let out = s;
  for (const node of analyzeModel(s).free) out = addPinFor(out, node);
  return out;
}

/** Saca el pin `pin`; los otros siguen en sus nodos (no se renumeran) */
export const removePin = (s: ModelState, pin: number): ModelState => ({ ...s, sym: removePinKeepOrder(s.sym, pin) });

/** Cambia el nombre que muestra el pin (no el nodo del netlist) */
export function renamePin(s: ModelState, pin: number, name: string): ModelState {
  const n = name.replace(/\s/g, '');
  return n && symPins(s.sym)[pin] ? { ...s, sym: setPinAttr(s.sym, pin, 'PinName', n) } : s;
}

/** Lado del nombre del pin (LEFT, RIGHT, TOP, BOTTOM) o NONE para ocultarlo */
export const setPinLabel = (s: ModelState, pin: number, side: string): ModelState => ({ ...s, sym: setPinAlign(s.sym, pin, side) });

/** Agrega al final de la línea .subckt un nodo para el pin suelto `pin` (con su nombre) */
export function addNodeFor(s: ModelState, pin: number): ModelState {
  const d = defOf(s);
  const p = symPins(s.sym)[pin];
  if (d?.kind !== 'subckt' || !p) return s;
  const base = p.name.replace(/\s/g, '') || `n${d.nodes.length + 1}`;
  let node = base;
  for (let k = 2; d.nodes.some((n) => eq(n, node)); k++) node = `${base}_${k}`;
  return { text: setSubcktPins(s.text, [...d.nodes, node], d.name), sym: setPinAttr(s.sym, pin, 'SpiceOrder', String(d.nodes.length + 1)) };
}

/** Parámetros de cada instancia (van, en orden, en Value, Value2, SpiceLine y SpiceLine2) */
export const setParams = (s: ModelState, ps: [string, string][]): ModelState => ({ ...s, sym: setModelParams(s.sym, ps) });

/** Agrega al símbolo los parámetros del .subckt que no pasa (con su valor por defecto) */
export function addDeclaredParams(s: ModelState): ModelState {
  const a = analyzeModel(s);
  const missing = a.declared.filter(([k]) => !a.params.some(([p]) => eq(p, k)));
  return missing.length ? setParams(s, [...a.params, ...missing]) : s;
}

/** Declara en la línea .subckt el parámetro `name` del símbolo (con el valor que tiene ahí) */
export function declareParam(s: ModelState, name: string): ModelState {
  const d = defOf(s);
  const v = modelParams(s.sym).find(([k]) => eq(k, name))?.[1];
  if (d?.kind !== 'subckt' || v === undefined || d.params.some(([k]) => eq(k, name))) return s;
  const esc = d.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^([ \\t]*\\.subckt[ \\t]+${esc}(?=\\s)[^\\r\\n]*(?:\\r?\\n[ \\t]*\\+[^\\r\\n]*)*)`, 'im');
  // al final de la línea (de su última línea de continuación), antes de un comentario «;»
  const add = (line: string) => `${d.params.length || /\bparams:/i.test(line) ? '' : ' params:'} ${name}=${v}`;
  return { ...s, text: s.text.replace(re, (line: string) => line.replace(/[ \t]*(;.*)?$/, (_, c?: string) => `${add(line)}${c ? ` ${c}` : ''}`)) };
}

/** Aplica el arreglo de un problema */
export function applyFix(s: ModelState, fix: Fix): ModelState {
  switch (fix.kind) {
    case 'add-pins':
      return addMissingPins(s);
    case 'remove-pin':
      return removePin(s, fix.pin);
    case 'add-node':
      return addNodeFor(s, fix.pin);
    case 'declare-param':
      return declareParam(s, fix.name);
    case 'remove-param':
      return setParams(
        s,
        modelParams(s.sym).filter(([k]) => !eq(k, fix.name)),
      );
    case 'add-ends':
      return { ...s, text: `${s.text}${s.text.endsWith('\n') || !s.text ? '' : '\n'}.ends ${fix.name}\n` };
  }
}

// --- cómo empezar ---------------------------------------------------------------------------------

/** Plantillas para empezar un modelo: el netlist (con el nombre del módulo) y los parámetros que
 *  pasa cada instancia (los de un MOSFET: W y L) */
export const TEMPLATES = [
  { id: 'subckt', label: () => t('Subcircuit'), text: (n: string) => `* ${n}\n.subckt ${n} in out params: R=1k\nR1 in out {R}\n.ends ${n}\n` },
  {
    id: 'amp',
    label: () => t('Amplifier (behavioral)'),
    text: (n: string) => `* ${n}: voltage gain with output resistance\n.subckt ${n} in out params: gain=10 rout=1\nE1 int 0 in 0 {gain}\nRout int out {rout}\n.ends ${n}\n`,
  },
  {
    id: 'opamp',
    label: () => t('Op amp (one pole)'),
    text: (n: string) =>
      `* ${n}: one-pole op amp, output limited to the supplies\n.subckt ${n} inp inn vp vn out params: avol=100k gbw=10meg\nRin inp inn 10meg\nG1 0 n1 inp inn 1m\nR1 n1 0 {avol/1m}\nC1 n1 0 {1m/(6.2832*gbw)}\nB1 out 0 V=max(min(V(n1),V(vp)),V(vn))\n.ends ${n}\n`,
  },
  { id: 'diode', label: () => t('Diode (.model D)'), text: (n: string) => `.model ${n} D(Is=2.5n Rs=0.5 N=1.8 Cjo=4p Tt=6n Bv=100 Ibv=100u)\n` },
  { id: 'npn', label: () => t('NPN transistor'), text: (n: string) => `.model ${n} NPN(Is=1e-14 Bf=200 Vaf=100 Cje=10p Cjc=5p Tf=0.3n)\n` },
  { id: 'pnp', label: () => t('PNP transistor'), text: (n: string) => `.model ${n} PNP(Is=1e-14 Bf=150 Vaf=80 Cje=10p Cjc=8p Tf=0.4n)\n` },
  {
    id: 'nmos',
    label: () => t('N-channel MOSFET'),
    text: (n: string) => `.model ${n} NMOS(Level=1 Vto=1 Kp=20u Lambda=0.02)\n`,
    params: [
      ['W', '10u'],
      ['L', '1u'],
    ] as [string, string][],
  },
  {
    id: 'pmos',
    label: () => t('P-channel MOSFET'),
    text: (n: string) => `.model ${n} PMOS(Level=1 Vto=-1 Kp=10u Lambda=0.02)\n`,
    params: [
      ['W', '20u'],
      ['L', '1u'],
    ] as [string, string][],
  },
  { id: 'njf', label: () => t('N-channel JFET'), text: (n: string) => `.model ${n} NJF(Beta=1m Vto=-2 Lambda=0.01)\n` },
];

/** El modelo con una plantilla: su netlist y el símbolo generado para él */
export function fromTemplate(s: ModelState, id: string, name: string): ModelState {
  const tpl = TEMPLATES.find((x) => x.id === id);
  if (!tpl) return s;
  const text = tpl.text(name);
  const sym = rebuildSymbol(name, { text, sym: setSymAttr(s.sym, 'SpiceModel', name) });
  return { text, sym: 'params' in tpl && tpl.params ? setModelParams(sym, tpl.params) : sym };
}

// --- textos ---------------------------------------------------------------------------------------

/** El texto de un problema, en el idioma de la interfaz */
export function diagnosticText(d: Diagnostic): string {
  const a = d.args;
  switch (d.code) {
    case 'no-def':
      return t('No .subckt or .model found');
    case 'no-ends':
      return t('.subckt {name} has no .ends', a);
    case 'stray-ends':
      return t('.ends without its .subckt');
    case 'ends-name':
      return t('.ends {name} closes .subckt {expected}', a);
    case 'no-name':
      return t('.subckt without a name');
    case 'no-type':
      return t('.model without a name or a type (e.g. .model D1N4148 D(Is=2.5n))');
    case 'dup-def':
      return t('{name} is defined twice: names must be unique', a);
    case 'dup-node':
      return t('Node {node} appears twice in the .subckt line', a);
    case 'ground-node':
      return t('Node 0 is ground: as a terminal it shorts every instance to ground');
    case 'no-nodes':
      return t('.subckt {name} has no nodes: the symbol cannot connect to anything', a);
    case 'unknown-type':
      return t('Unknown device type {type}: instances are written as a subcircuit (X)', a);
    case 'top-element':
      return Number(a.n) === 1
        ? t('An element outside any .subckt: it would be added to every circuit that uses this model')
        : t('{n} elements outside any .subckt (the first one on line {line}): they would be added to every circuit that uses this model', a);
    case 'top-command':
      return t('{cmd} outside any .subckt: it would apply to every simulation that uses this model', a);
    case 'free-nodes':
      return Number(a.n) === 1 ? t('Node {nodes} has no pin: it is left floating in each instance', a) : t('Nodes {nodes} have no pin: they are left floating in each instance', a);
    case 'free-nodes-end':
      return Number(a.n) === 1
        ? t('Node {nodes} has no pin and comes after the last one: each instance has fewer nodes than the .subckt and the simulation fails', a)
        : t('Nodes {nodes} have no pin and come after the last one: each instance has fewer nodes than the .subckt and the simulation fails', a);
    case 'pin-unconnected':
      return t('Pin {pin} does not go to any node of the netlist', a);
    case 'pin-duplicate':
      return t('Pins {other} and {pin} both go to node {node}', a);
    case 'pin-dup-name':
      return t('Two pins are called {pin}', a);
    case 'pin-no-name':
      return t('A pin has no name');
    case 'param-undeclared':
      return t('{name} is not a parameter of the .subckt (params: on its line): the simulator rejects it', a);
  }
}

/** El texto del botón de un arreglo */
export function fixText(f: Fix): string {
  switch (f.kind) {
    case 'add-pins':
      return t('Add the pins');
    case 'remove-pin':
      return t('Remove the pin');
    case 'add-node':
      return t('Add a node to the .subckt');
    case 'declare-param':
      return t('Declare it in the .subckt');
    case 'remove-param':
      return t('Remove it from the symbol');
    case 'add-ends':
      return t('Add .ends {name}', { name: f.name });
  }
}
