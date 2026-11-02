// Lo que se sabe del circuito para la barra y los diálogos de simulación: el PDK y su esquina
// (docs/pdk.md), y las redes, fuentes y sondas de lazo para los selectores
import type { AscDoc } from '../asc/model.ts';
import { readData, writeData } from '../asc/dataText.ts';
import { effectiveAttrs } from '../asc/resolve.ts';
import type { Library } from '../library/library.ts';
import { PDK_CORNERS, pdkLib, pdkOfSymbols } from '../library/pdk.ts';
import type { Connectivity } from '../netlist/connectivity.ts';
import { spiceName } from '../netlist/spiceName.ts';
import type { CircuitInfo } from '../schematic/simDialogs.tsx';

/** La esquina del PDK: la de una directiva .lib, si hay, o la elegida en la barra (guardada en el .asc, ;.pdk) */
export function pdkBarOf(doc: AscDoc, commit: (d: AscDoc) => void) {
  const lines = doc.texts.filter((x) => x.kind === 'directive').flatMap((x) => x.text.split('\\n'));
  let fixed: { name: string; corner?: string; line: string } | undefined;
  for (const line of lines) {
    const m = /^\s*\.(?:lib|include|inc)\s+["']?([^"'\s]+)["']?(?:\s+(\S+))?/i.exec(line);
    const hit = m && pdkLib(m[1], m[2]);
    if (hit && (hit.corner || !fixed)) fixed = { ...hit, line: line.trim() };
  }
  const name = pdkOfSymbols(doc.symbols.map((x) => x.type)) ?? fixed?.name;
  if (!name) return undefined;
  const chosen = (readData(doc, 'pdk') as { corner?: string } | undefined)?.corner;
  return {
    name,
    corner: fixed?.corner ?? chosen ?? 'tt',
    corners: PDK_CORNERS,
    fixed: fixed?.corner ? fixed.line : undefined,
    onChange: (corner: string) => commit(writeData(doc, 'pdk', corner === 'tt' ? undefined : { corner })),
  };
}

/** Redes, fuentes y sondas de lazo del .stb (librería Stability) del circuito */
export function circuitInfoOf(conn: Connectivity, doc: AscDoc, lib: Library): CircuitInfo {
  return {
    nets: [...new Set(conn.nets.map((n) => n.name).filter((n) => n))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    sources: doc.symbols
      .map((s) => effectiveAttrs(s, lib.symbol(s.type)))
      .filter((a) => /^[VI]$/i.test(a.get('Prefix') ?? ''))
      .map((a) => spiceName(a.get('InstName') ?? ''))
      .filter(Boolean),
    // sondas de lazo del .stb (librería Stability)
    probes: doc.symbols
      .map((s) => effectiveAttrs(s, lib.symbol(s.type)))
      .filter((a) => /^(LoopProbe|LoopProbe_Dif|DiffLoopProbe)$/i.test(a.get('SpiceModel') ?? ''))
      .map((a) => ({ name: spiceName(a.get('InstName') ?? ''), diff: /^(LoopProbe_Dif|DiffLoopProbe)$/i.test(a.get('SpiceModel') ?? '') }))
      .filter((p, i, all) => p.name && all.findIndex((q) => q.name === p.name) === i),
  };
}
