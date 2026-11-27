// Nombres de estado para las ondas: un grupo de localparam (o parameter) con dos o más constantes
// («localparam IDLE = 2'd0, ABRE = 2'd1;») son los estados de las señales a las que se les asigna
// uno de esos nombres («estado <= IDLE»). La onda de esa señal muestra el nombre en vez del número.
// (por nombre de señal en todo el proyecto: dos máquinas con un «estado» cada una se mezclan)

/** Valor de una constante de Verilog: 5, 2'd1, 3'b101, 8'hA5, 'h1F; undefined si no es un número */
export function verilogNumber(s: string): number | undefined {
  const m = /^(?:\d*\s*'[sS]?([bBoOdDhH])\s*([0-9a-fA-F_]+)|(\d[\d_]*))$/.exec(s.trim());
  if (!m) return undefined;
  if (m[3]) return Number(m[3].replace(/_/g, ''));
  const base = { b: 2, o: 8, d: 10, h: 16 }[m[1].toLowerCase() as 'b' | 'o' | 'd' | 'h'];
  const n = parseInt(m[2].replace(/_/g, ''), base);
  return Number.isNaN(n) ? undefined : n;
}

/** Señal → (valor → nombre del estado), de los fuentes Verilog */
export function stateNames(sources: string[]): Map<string, Map<number, string>> {
  const out = new Map<string, Map<number, string>>();
  for (const src of sources) {
    const code = src.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
    for (const st of code.matchAll(/\b(?:localparam|parameter)\b\s*(?:integer\s*)?(?:\[[^\]]*\]\s*)?([^;]*);/g)) {
      const group = new Map<string, number>();
      for (const item of st[1].split(',')) {
        const m = /^\s*([A-Za-z_][\w$]*)\s*=\s*(.+?)\s*$/.exec(item);
        const v = m ? verilogNumber(m[2]) : undefined;
        if (m && v !== undefined) group.set(m[1], v);
      }
      if (group.size < 2) continue;
      const names = [...group.keys()].join('|');
      for (const a of code.matchAll(new RegExp(`\\b([A-Za-z_][\\w$]*)\\s*<?=\\s*(${names})\\s*;`, 'g'))) {
        const m = out.get(a[1]) ?? out.set(a[1], new Map()).get(a[1])!;
        for (const [n, v] of group) if (!m.has(v)) m.set(v, n);
      }
    }
  }
  return out;
}
