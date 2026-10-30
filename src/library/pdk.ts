// Modelos de un PDK (public/library/pdk/<pdk>/, los arma scripts/build-pdk.ts).

export type PdkCorner = {
  name: string;
  /** La esquina entera, para incluir todo */
  file: string;
  /** Archivos que la componen, en orden */
  units: string[];
  /** Índices en `units` que van siempre (.option scale y lo que usan) */
  always: number[];
  /** Por dispositivo (en minúsculas), los índices en `units` que necesita además de `always` */
  devices: Record<string, number[]>;
};

export type PdkIndex = { pdk: string; corners: PdkCorner[]; devices?: { name: string }[]; models?: { name: string }[] };

/**
 * Las líneas .include de una esquina para los dispositivos dados: sólo los archivos que hacen
 * falta, en el orden de la esquina. `base` es la ruta de los modelos en el FS del motor.
 */
export function pdkIncludes(index: PdkIndex, corner: string, devices: Iterable<string>, base: string): string[] {
  const c = index.corners.find((c) => c.name === corner);
  if (!c) throw new Error(`${index.pdk}: no corner ${corner}`);
  const need = new Set(c.always);
  for (const d of devices) for (const i of c.devices[d.toLowerCase()] ?? []) need.add(i);
  return [...need].sort((a, b) => a - b).map((i) => `.include "${base}/${c.units[i]}"`);
}

export const PDKS = ['sky130', 'gf180'] as const;

/**
 * ".lib <ruta> <sección>" (o ".include <ruta>") de un PDK: su nombre y, si la sección la fija, la
 * esquina. Valen el nombre ("sky130 tt", "gf180 ff") y las rutas de open_pdks que usan xschem y los
 * tutoriales: sky130.lib.spice tt; sm141064.ngspice typical (las secciones bjt_, res_… de los demás
 * dispositivos no cambian la esquina: ya van con ella) y design.ngspice.
 */
export function pdkLib(path: string, section?: string): { name: string; corner?: string } | undefined {
  const base = path.replace(/\\/g, '/').replace(/^["']|["']$/g, '').split('/').pop()!.toLowerCase();
  const sec = section?.toLowerCase();
  if (base === 'sky130' || base === 'sky130.lib.spice') return { name: 'sky130', corner: sec };
  if (base === 'gf180' || base === 'gf180mcu') return { name: 'gf180', corner: sec === 'typical' ? 'tt' : sec };
  if (base === 'design.ngspice') return { name: 'gf180' };
  if (base === 'sm141064.ngspice') {
    return { name: 'gf180', corner: !sec || /^(bjt|diode|res|mimcap|moscap)_/.test(sec) ? undefined : sec === 'typical' ? 'tt' : sec };
  }
  return undefined;
}

/** Los .lib/.include de PDK de unas directivas (para saber qué índices cargar antes de la netlist) */
export function pdkLibsIn(text: string): string[] {
  const out = new Set<string>();
  for (const [, path, sec] of text.matchAll(/^\s*\.(?:lib|include|inc)\s+["']?([^"'\s]+)["']?(?:\s+(\S+))?/gim)) {
    const hit = pdkLib(path, sec);
    if (hit) out.add(hit.name);
  }
  return [...out];
}

/** Nombres (en minúsculas) de los subcircuitos y modelos de un índice */
export const pdkNames = (index: PdkIndex) => new Set([...(index.devices ?? []), ...(index.models ?? [])].map((d) => d.name.toLowerCase()));

const DEVICE = /\bsky130_fd_pr__\w+/gi;

/** Dispositivos de un PDK que nombra un texto (netlist o archivos de modelos), en minúsculas */
export function pdkDevices(text: string): Set<string> {
  return new Set([...text.matchAll(DEVICE)].map((m) => m[0].toLowerCase()));
}

export const isPdkDevice = (name: string) => /^sky130_fd_pr__\w+$/i.test(name);

/**
 * Lo que hay que agregar a una simulación que usa dispositivos de un PDK: las líneas .include y
 * los archivos para el FS del motor (bajo `base`), con los que éstos incluyen.
 * `fetchText` baja un archivo del PDK (ruta relativa a su carpeta).
 */
export async function loadPdk(
  index: PdkIndex,
  corner: string,
  devices: Iterable<string>,
  base: string,
  fetchText: (rel: string) => Promise<string>,
): Promise<{ includes: string[]; files: Record<string, string> }> {
  const known = [...devices].filter((d) => index.corners[0]?.devices[d.toLowerCase()]);
  const includes = pdkIncludes(index, corner, known, base);
  const files: Record<string, string> = {};
  const load = async (rel: string): Promise<void> => {
    if (`${base}/${rel}` in files) return;
    files[`${base}/${rel}`] = '';
    const text = await fetchText(rel);
    files[`${base}/${rel}`] = text;
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : '';
    const nested = [...text.matchAll(/^\s*\.inc(?:lude)?\s+"([^"]+)"/gim)].map((m) => normalize(dir + m[1]));
    await Promise.all(nested.map(load));
  };
  await Promise.all(includes.map((l) => load(/"([^"]+)"/.exec(l)![1].slice(base.length + 1))));
  return { includes, files };
}

/** "a/b/../c" → "a/c" */
function normalize(path: string): string {
  const out: string[] = [];
  for (const p of path.split('/')) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}
