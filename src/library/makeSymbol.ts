// Símbolos generados: un rectángulo con los pines a los costados, para un .subckt de un
// archivo de modelos o para un esquemático usado como bloque jerárquico (como el
// "Hierarchy → Create symbol" de LTspice).

/** Pines de un .subckt (sin los parámetros "params:" / "x=1") */
export function subcktPins(text: string, name: string): string[] | null {
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*\.subckt\s+(\S+)\s*(.*)$/i.exec(lines[i]);
    if (!m || m[1].toLowerCase() !== name.toLowerCase()) continue;
    let rest = m[2];
    for (let k = i + 1; k < lines.length && /^\s*\+/.test(lines[k]); k++) rest += ' ' + lines[k].replace(/^\s*\+/, '');
    const pins: string[] = [];
    for (const tok of rest.split(/\s+/).filter(Boolean)) {
      if (/^params:?$/i.test(tok) || /=/.test(tok)) break;
      pins.push(tok);
    }
    return pins;
  }
  return null;
}

/** Puertos de un esquemático jerárquico: las etiquetas con IOPIN (si no hay, todas menos tierra) */
export function schematicPorts(flags: { name: string; ioPin?: string }[]): string[] {
  const io = flags.filter((f) => f.ioPin).map((f) => f.name);
  const list = io.length ? io : flags.map((f) => f.name).filter((n) => n !== '0');
  return [...new Set(list)];
}

export function makeSymbol(o: { name: string; pins: string[]; block?: boolean; modelFile?: string; description?: string }): string {
  const left = o.pins.slice(0, Math.ceil(o.pins.length / 2));
  const right = o.pins.slice(left.length);
  const rows = Math.max(left.length, right.length, 1);
  const h = rows * 32;
  const w = Math.max(64, Math.ceil((Math.max(...o.pins.map((p) => p.length), o.name.length) * 6 + 32) / 32) * 32);
  const out = [
    'Version 4',
    `SymbolType ${o.block ? 'BLOCK' : 'CELL'}`,
    `RECTANGLE Normal ${-w / 2} ${-h / 2} ${w / 2} ${h / 2}`,
    `WINDOW 0 0 ${-h / 2 - 8} Bottom 2`,
    `WINDOW 3 0 ${h / 2 + 8} Top 2`,
    'SYMATTR Prefix X',
  ];
  if (!o.block) out.push(`SYMATTR Value ${o.name}`);
  if (o.modelFile) out.push(`SYMATTR ModelFile ${o.modelFile}`);
  out.push(`SYMATTR Description ${o.description ?? (o.block ? `Bloque ${o.name}` : `Subcircuito ${o.name}`)}`);
  let order = 1;
  const pin = (x: number, y: number, side: 'LEFT' | 'RIGHT', name: string) =>
    out.push(`PIN ${x} ${y} ${side} 8`, `PINATTR PinName ${name}`, `PINATTR SpiceOrder ${order++}`);
  // filas centradas en la grilla de 16
  const y0 = -h / 2 + 16;
  left.forEach((p, i) => pin(-w / 2, y0 + i * 32, 'LEFT', p));
  right.forEach((p, i) => pin(w / 2, y0 + i * 32, 'RIGHT', p));
  return out.join('\n') + '\n';
}
