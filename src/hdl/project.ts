// Archivos Verilog del proyecto (#209): cada uno genera un <módulo>.sub (el subcircuito con XSPICE)
// y un <módulo>.asy (entradas a la izquierda, salidas a la derecha) entre los archivos del proyecto.
import { makeSymbol, subcktPins } from '../library/makeSymbol.ts';
import type { ProjectFile } from '../project/turbo.ts';
import { generatedFrom, type HdlBlock } from './synth.ts';

const key = (s: string) => s.toLowerCase();

/** Pines de un .asy, en orden de SpiceOrder */
function symbolPins(asy: string): string[] {
  const pins: { name: string; order: number }[] = [];
  let cur: { name: string; order: number } | null = null;
  for (const line of asy.split(/\r?\n/)) {
    if (/^PIN\s/.test(line)) pins.push((cur = { name: '', order: pins.length + 1 }));
    const m = /^PINATTR\s+(PinName|SpiceOrder)\s+(.*)$/.exec(line.trim());
    if (m && cur) {
      if (m[1] === 'PinName') cur.name = m[2].trim();
      else cur.order = parseInt(m[2]) || cur.order;
    }
  }
  return pins.sort((a, b) => a.order - b.order).map((p) => p.name);
}

/**
 * Archivos del proyecto después de sintetizar `source`: su .sub reemplazado (o nuevo) y su .asy
 * nuevo, o regenerado si los pines cambiaron (si siguen igual queda el que está, que pudo
 * editarse). No pisa un .sub que no generó este Verilog: devuelve el nombre en `clash`.
 */
export function applySynthesis(files: ProjectFile[], source: string, block: HdlBlock): { files: ProjectFile[]; clash?: string } {
  const subName = `${block.name}.sub`;
  const asyName = `${block.name}.asy`;
  const oldSub = files.find((f) => key(f.name) === key(subName));
  if (oldSub && key(generatedFrom(oldSub.text) ?? '') !== key(source)) return { files, clash: subName };
  const pins = [...block.inputs, ...block.outputs];
  const sub: ProjectFile = { name: subName, kind: 'model', text: block.subckt };
  const oldAsy = files.find((f) => key(f.name) === key(asyName));
  const keepAsy = oldAsy && symbolPins(oldAsy.text).join(' ') === pins.join(' ');
  const asy: ProjectFile = keepAsy
    ? oldAsy
    : { name: asyName, kind: 'symbol', text: makeSymbol({ name: block.name, pins, leftCount: block.inputs.length, modelFile: subName, spiceLine: block.params, description: `Verilog: ${source}` }) };
  const rest = files.filter((f) => key(f.name) !== key(subName) && key(f.name) !== key(asyName));
  return { files: [...rest, sub, asy] };
}

/** El .sub generado por un archivo Verilog del proyecto, si hay */
export const generatedSub = (files: ProjectFile[], source: string): ProjectFile | undefined =>
  files.find((f) => f.kind === 'model' && key(generatedFrom(f.text) ?? '') === key(source));

/** Pines del .subckt generado (para mostrarlos) */
export const generatedPins = (sub: ProjectFile): string[] => subcktPins(sub.text, sub.name.replace(/\.sub$/i, '')) ?? [];

/**
 * Módulo de más arriba de un archivo Verilog: el que ningún otro del archivo instancia (si hay
 * varios, el último). Se le pasa a Yosys porque con todos los Verilog del proyecto juntos no puede
 * adivinar cuál se quiere.
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

/** Módulos Verilog del proyecto (panel Módulos): el archivo y el nombre de su módulo sintetizado */
export const verilogModules = (files: ProjectFile[]): { file: string; name: string; sub?: ProjectFile }[] =>
  files.filter((f) => f.kind === 'verilog').map((f) => {
    const sub = generatedSub(files, f.name);
    return { file: f.name, name: sub ? sub.name.replace(/\.sub$/i, '') : f.name, sub };
  });

/** Quita un archivo Verilog con el .sub y el .asy que generó */
export function removeVerilogModule(files: ProjectFile[], file: string): ProjectFile[] {
  const sub = generatedSub(files, file);
  const gone = new Set([file, ...(sub ? [sub.name, sub.name.replace(/\.sub$/i, '.asy')] : [])].map(key));
  return files.filter((f) => !gone.has(key(f.name)));
}
