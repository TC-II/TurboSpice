// Módulos Verilog del proyecto (#209): <nombre>.v y su símbolo <nombre>.asy, como un subcircuito
// esquemático es <nombre>.asc + <nombre>.asy. El módulo de más arriba del .v tiene que llamarse como
// el archivo. La síntesis (Yosys) queda guardada en el .v (ProjectFile.synth): la librería la usa
// como el archivo de modelos <nombre>.sub que nombra el símbolo (ModelFile).
import { makeSymbol } from '../library/makeSymbol.ts';
import { setSymParams, symParams, syncPins } from '../project/symbolEdit.ts';
import type { Project, ProjectFile, VerilogSynth } from '../project/turbo.ts';
import { t } from '../i18n/i18n.ts';
import { ELECTRICAL, ELECTRICAL_NAMES } from './electrical.ts';
import type { HdlBlock, PinDir } from './synth.ts';

const key = (s: string) => s.toLowerCase();

export const isVerilogName = (name: string) => /\.s?v$/i.test(name);
/** Nombre del módulo de un archivo Verilog del proyecto ("contador.v" → "contador") */
export const moduleOf = (f: { name: string }) => f.name.replace(/\.s?v$/i, '');
export const verilogModules = (p: Project): ProjectFile[] => p.files.filter((f) => f.kind === 'verilog');
export const verilogFile = (p: Project, name: string): ProjectFile | undefined => verilogModules(p).find((f) => key(moduleOf(f)) === key(name));
/** ¿Cambió el código desde la última síntesis (o nunca se sintetizó)? */
export const isStale = (f: ProjectFile) => !f.synth || f.synth.source !== f.text;
/** Todos los Verilog del proyecto (un módulo puede instanciar los de otro archivo) */
export const verilogSources = (p: Project, override?: { name: string; text: string }): Record<string, string> => ({
  ...Object.fromEntries(verilogModules(p).map((f) => [f.name, f.text])),
  ...(override ? { [override.name]: override.text } : {}),
});

/** Verilog de un módulo nuevo */
export const verilogTemplate = (name: string) => `// ${t('{name}: synthesizable Verilog. Inputs go on the left of the symbol, outputs on the right.', { name })}
// ${t('The electrical interface (levels, thresholds, drive, delay) is set below the code and on each instance.')}
module ${name} (
  input clk,
  input rst,
  output reg [3:0] q
);
  always @(posedge clk or posedge rst)
    if (rst) q <= 0;
    else q <= q + 1;
endmodule
`;

const IOPIN: Record<PinDir, string> = { in: 'In', out: 'Out', inout: 'BiDir' };

/** Parámetros del símbolo: los eléctricos y los parameter de Verilog, conservando los valores que ya tenía */
function symbolParams(prev: [string, string][], block: { params: Record<string, string> }): [string, string][] {
  const old = new Map(prev.map(([k, v]) => [key(k), v]));
  const out: [string, string][] = ELECTRICAL.map((p) => [p.name, old.get(p.name) ?? p.value]);
  for (const [k, v] of Object.entries(block.params)) if (!ELECTRICAL_NAMES.has(key(k))) out.push([k, old.get(key(k)) ?? v]);
  return out;
}

/** Parámetros del símbolo sin mostrarlos en el esquemático (son muchos: se ven al editar la instancia) */
export const withParams = (text: string, ps: [string, string][]) =>
  setSymParams(text, ps)
    .split('\n')
    .filter((l) => !/^WINDOW 39 /.test(l))
    .join('\n');

/** Símbolo nuevo del módulo: entradas a la izquierda; inout y salidas a la derecha */
export function verilogSymbol(name: string, block: Pick<HdlBlock, 'pins' | 'params'>): string {
  const text = makeSymbol({
    name,
    pins: block.pins.map((p) => p.name),
    leftCount: block.pins.filter((p) => p.dir === 'in').length,
    modelFile: `${name}.sub`,
    description: t('Verilog module {name}', { name }),
  });
  return withParams(text, symbolParams([], block));
}

/**
 * Guarda la síntesis de un módulo: el resultado queda en su .v y el símbolo se crea o se pone al
 * día (pines nuevos o que ya no están; los que siguen, en su lugar) con sus parámetros.
 */
export function applySynth(p: Project, name: string, text: string, block: HdlBlock): Project {
  const file = verilogFile(p, name);
  if (!file) return p;
  const synth: VerilogSynth = { source: text, module: block.name, subckt: block.subckt, pins: block.pins, params: block.params };
  const asyName = `${name}.asy`;
  const sym = p.files.find((f) => f.kind === 'symbol' && key(f.name) === key(asyName));
  const nextSym = sym
    ? withParams(syncPins(sym.text, block.pins.map((x) => ({ name: x.name, dir: IOPIN[x.dir] }))), symbolParams(symParams(sym.text), block))
    : verilogSymbol(name, block);
  const files = p.files.map((f) => (f === file ? { ...f, text, synth } : f === sym ? { ...f, text: nextSym } : f));
  if (!sym) files.push({ name: asyName, kind: 'symbol', text: nextSym });
  return { ...p, modified: Date.now(), files };
}

/** Cambia el código de un módulo (sin sintetizar: queda desactualizado hasta la próxima síntesis) */
export function storeVerilog(p: Project, name: string, text: string): Project {
  const f = verilogFile(p, name);
  if (!f || f.text === text) return p;
  return { ...p, modified: Date.now(), files: p.files.map((x) => (x === f ? { ...x, text } : x)) };
}

/** Agrega un módulo Verilog nuevo (todavía sin símbolo: aparece al sintetizarlo) */
export function addVerilogModule(p: Project, name: string, text = verilogTemplate(name)): Project {
  return { ...p, modified: Date.now(), files: [...p.files, { name: `${name}.v`, kind: 'verilog', text }] };
}

/** Pines del módulo (de su última síntesis) con la dirección como la de un puerto de esquemático */
export const verilogPorts = (f: ProjectFile) => (f.synth?.pins ?? []).map((x) => ({ name: x.name, dir: IOPIN[x.dir] }));

/**
 * Módulo de más arriba de un archivo Verilog: el que ningún otro del archivo instancia (si hay
 * varios, el último).
 */
export function topModuleOf(text: string): string | undefined {
  const code = text.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
  const decls = [...code.matchAll(/^\s*module\s+([A-Za-z_][\w$]*)/gm)];
  const names = decls.map((m) => m[1]);
  // sin las declaraciones, "nombre #(…) u1 (" o "nombre u1 (" es una instancia
  const body = code.replace(/^\s*module\s+[A-Za-z_][\w$]*/gm, '');
  const esc = (n: string) => n.replace(/\$/g, '\\$');
  const used = (n: string) => new RegExp(`(^|[^\\w$.])${esc(n)}\\s*(#|[A-Za-z_][\\w$]*\\s*\\()`, 'm').test(body);
  const tops = names.filter((n) => !used(n));
  return tops.at(-1) ?? names.at(-1);
}
