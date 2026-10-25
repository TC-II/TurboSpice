// Buses como los de LTspice: una etiqueta con rango es un bus de varias redes, una por bit.
//   d[7:0]      → d[7] d[6] … d[0]   (en el orden escrito: d[0:7] → d[0] … d[7])
//   f[9:0],in   → f[9] … f[0] in     (partes separadas por comas, concatenadas)
//   d[3]        → una red sola, el bit 3 de d (se une con el bit del bus por el nombre)
// Un componente con InstName en arreglo (R1[10:0]) son varios componentes iguales; cada uno toma
// el bit que le toca de los buses de sus pines (o la misma red, si el pin está en una red simple).
// Un pin de símbolo con rango en el nombre (q[3:0]) es un pin de bus: en la netlist son varios
// nodos seguidos.

const RANGE = /^(.*?)\[(\d+):(\d+)\]$/;

/** Bits de una parte: "d[7:0]" → [d[7]…d[0]]; "x" → ["x"] */
function partBits(part: string): string[] {
  const m = RANGE.exec(part);
  if (!m) return [part];
  const [a, b] = [Number(m[2]), Number(m[3])];
  const step = a <= b ? 1 : -1;
  const out: string[] = [];
  for (let i = a; ; i += step) {
    out.push(`${m[1]}[${i}]`);
    if (i === b) break;
  }
  return out;
}

/** ¿El nombre es un bus (tiene un rango o varias partes)? */
export const isBusName = (name: string) => name.includes(',') || RANGE.test(name.trim());

/** Redes de un nombre de bus, en orden; un nombre que no es bus → [nombre] */
export function busBits(name: string): string[] {
  if (!isBusName(name)) return [name];
  return name
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap(partBits);
}

/** Cantidad de redes de un nombre (1 si no es bus) */
export const busWidth = (name: string) => busBits(name).length;

/** Nombres de los componentes de un InstName en arreglo ("R1[10:0]" → R1[10]…R1[0]), o null */
export function instArray(instName: string): string[] | null {
  const m = RANGE.exec(instName.trim());
  return m ? partBits(instName.trim()) : null;
}

/**
 * Nodos que le tocan a la copia `copy` (de `copies`) de un pin de `pinWidth` bits conectado a una
 * red con estos `bits`: si el bus alcanza para todas las copias, su tramo; si tiene el ancho del
 * pin, el mismo para todas; una red simple va a todos los bits. null si los anchos no encajan.
 */
export function pinNodes(bits: string[], pinWidth: number, copy: number, copies: number): string[] | null {
  const w = bits.length;
  if (w === pinWidth * copies) return bits.slice(copy * pinWidth, (copy + 1) * pinWidth);
  if (w === pinWidth) return bits;
  if (w === 1) return Array(pinWidth).fill(bits[0]);
  return null;
}

/**
 * Un bit de bus (f[3]) en ngspice: f__3__. Los corchetes son la sintaxis de los vectores de
 * conexión de XSPICE y, cuando el nodo entra a un subcircuito con compuertas digitales, rompen la
 * línea ([f[3]]). ngNodeName lo aplica (y con él V(f[3]) encuentra su vector); bitNodeName lo
 * deshace para mostrar los nombres de los vectores.
 */
export const busBitNode = (net: string) => net.replace(/\[(\d+)\]/g, '__$1__');
export const bitNodeName = (vec: string) => vec.replace(/__(\d+)__/g, '[$1]');
