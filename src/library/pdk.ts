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

export type PdkIndex = { pdk: string; corners: PdkCorner[] };

/**
 * Las líneas .include de una esquina para los dispositivos dados: sólo los archivos que hacen
 * falta, en el orden de la esquina. `base` es la ruta de los modelos en el FS del motor.
 */
export function pdkIncludes(index: PdkIndex, corner: string, devices: Iterable<string>, base: string): string[] {
  const c = index.corners.find((c) => c.name === corner);
  if (!c) throw new Error(`${index.pdk} no tiene la esquina ${corner}`);
  const need = new Set(c.always);
  for (const d of devices) for (const i of c.devices[d.toLowerCase()] ?? []) need.add(i);
  return [...need].sort((a, b) => a - b).map((i) => `.include "${base}/${c.units[i]}"`);
}
