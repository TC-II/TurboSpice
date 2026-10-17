// Exportar el esquemático a SVG o PNG (con el skin, colores del tema claro y estilos en línea,
// para que se vea igual fuera de la app).

export function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Propiedades que se copian del estilo calculado a cada elemento
const PROPS = [
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'fill',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'vector-effect',
  'white-space',
];

/** Capas que no son parte del dibujo (grilla, fantasmas, selección, ayudas temporales) */
const DROP = '.ghost, .selbox, .snap-cursor, .net-names, .op-annotations, .net-hl, .loose, rect[fill="url(#grid)"], defs';

/**
 * SVG autónomo del esquemático. `box` es la caja del contenido en unidades del esquemático.
 * Se calcula con el tema claro (para informes) y la escala 1 unidad = 1 px.
 */
export function schematicSvg(svg: SVGSVGElement, box: { x1: number; y1: number; x2: number; y2: number }): string {
  const root = document.documentElement;
  const prev = root.getAttribute('data-theme');
  root.setAttribute('data-theme', 'light');
  try {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    // estilos en línea, recorriendo original y copia a la par
    const src = [svg, ...svg.querySelectorAll('*')];
    const dst = [clone, ...clone.querySelectorAll('*')];
    src.forEach((el, i) => {
      const cs = getComputedStyle(el);
      const style = PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';');
      (dst[i] as SVGElement).setAttribute('style', style);
      (dst[i] as SVGElement).removeAttribute('class');
    });
    // las capas a quitar se ubican en el original (la copia ya no tiene clases)
    const remove = new Set([...svg.querySelectorAll(DROP)].map((n) => src.indexOf(n)));
    [...remove].sort((a, b) => b - a).forEach((i) => dst[i]?.remove());
    const pad = 24;
    const w = box.x2 - box.x1 + 2 * pad;
    const h = box.y2 - box.y1 + 2 * pad;
    clone.setAttribute('viewBox', `${box.x1 - pad} ${box.y1 - pad} ${w} ${h}`);
    clone.setAttribute('width', String(Math.round(w)));
    clone.setAttribute('height', String(Math.round(h)));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('style', 'background:#ffffff');
    // fondo blanco explícito (muchos visores muestran transparente)
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', String(box.x1 - pad));
    bg.setAttribute('y', String(box.y1 - pad));
    bg.setAttribute('width', String(w));
    bg.setAttribute('height', String(h));
    bg.setAttribute('fill', '#ffffff');
    clone.insertBefore(bg, clone.firstChild);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  } finally {
    if (prev === null) root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', prev);
  }
}

/** PNG del esquemático a `scale` píxeles por unidad */
export async function schematicPng(svgText: string, scale = 2): Promise<Blob | null> {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportSchematic(svg: SVGSVGElement, box: { x1: number; y1: number; x2: number; y2: number }, name: string, format: 'svg' | 'png') {
  const text = schematicSvg(svg, box);
  if (format === 'svg') return download(`${name}.svg`, new Blob([text], { type: 'image/svg+xml' }));
  const png = await schematicPng(text);
  if (png) download(`${name}.png`, png);
}
