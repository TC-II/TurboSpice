// Exportar el esquemático a SVG, PNG o PDF (con el skin y estilos en línea, para que se vea
// igual fuera de la app).

/** La marca de lo exportado: va en los metadatos (no se ve en el dibujo) */
export const TURBOSPICE_URL = 'https://tc-ii.github.io/TurboSpice/';
export const CREATED_WITH = `Created with TurboSpice ${TURBOSPICE_URL}`;

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Metadatos RDF (Dublin Core y XMP) de la hoja: los del SVG y los XMP del PDF */
function rdf(title: string): string {
  return (
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/">' +
    '<rdf:Description rdf:about="">' +
    `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(title)}</rdf:li></rdf:Alt></dc:title>` +
    `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(CREATED_WITH)}</rdf:li></rdf:Alt></dc:description>` +
    '<dc:creator><rdf:Seq><rdf:li>TurboSpice</rdf:li></rdf:Seq></dc:creator>' +
    `<dc:source>${TURBOSPICE_URL}</dc:source>` +
    `<xmp:CreatorTool>TurboSpice ${TURBOSPICE_URL}</xmp:CreatorTool>` +
    `<xmp:CreateDate>${new Date().toISOString()}</xmp:CreateDate>` +
    '</rdf:Description></rdf:RDF>'
  );
}

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
const DROP = '.ghost, .placing, .selbox, .snap-cursor, .wire-crosshair, .net-names, .op-annotations, .net-hl, .loose, rect[fill="url(#grid)"], defs';

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Copia de `svg` con el estilo calculado de cada elemento escrito en línea (sin clases), sin
 * los elementos que coinciden con `drop` (se buscan en el original)
 */
function inlineStyled(svg: SVGSVGElement, drop: string): SVGSVGElement {
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
  const remove = new Set([...svg.querySelectorAll(drop)].map((n) => src.indexOf(n)));
  [...remove].sort((a, b) => b - a).forEach((i) => dst[i]?.remove());
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return clone;
}

/** Fondo blanco explícito en `box` (muchos visores muestran transparente) */
function whiteBackground(svg: SVGSVGElement, box: Rect) {
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', String(box.x));
  bg.setAttribute('y', String(box.y));
  bg.setAttribute('width', String(box.w));
  bg.setAttribute('height', String(box.h));
  bg.setAttribute('fill', '#ffffff');
  svg.insertBefore(bg, svg.firstChild);
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';

/**
 * SVG autónomo del esquemático. `box` es la caja del contenido en unidades del esquemático.
 * Se calcula con el tema claro (para informes) y la escala 1 unidad = 1 px.
 */
export function schematicSvg(svg: SVGSVGElement, box: { x1: number; y1: number; x2: number; y2: number }): string {
  const root = document.documentElement;
  const prev = root.getAttribute('data-theme');
  root.setAttribute('data-theme', 'light');
  try {
    const clone = inlineStyled(svg, DROP);
    const pad = 24;
    const w = box.x2 - box.x1 + 2 * pad;
    const h = box.y2 - box.y1 + 2 * pad;
    clone.setAttribute('viewBox', `${box.x1 - pad} ${box.y1 - pad} ${w} ${h}`);
    clone.setAttribute('width', String(Math.round(w)));
    clone.setAttribute('height', String(Math.round(h)));
    clone.setAttribute('style', 'background:#ffffff');
    whiteBackground(clone, { x: box.x1 - pad, y: box.y1 - pad, w, h });
    return XML_HEAD + new XMLSerializer().serializeToString(clone);
  } finally {
    if (prev === null) root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', prev);
  }
}

/** Grilla de la hoja de export: la de LTspice (16 unidades = 16 pt) */
export const SHEET_GRID = 16;

/**
 * Hoja de export: la caja del dibujo ajustada hacia afuera a la grilla de 16 y una celda más por
 * lado (los cables van sobre la grilla: sin esa celda, el del borde quedaría cortado al medio)
 */
export function sheetBox(b: Rect): Rect {
  const g = SHEET_GRID;
  const x1 = Math.floor(b.x / g) * g - g;
  const y1 = Math.floor(b.y / g) * g - g;
  const x2 = Math.ceil((b.x + b.w) / g) * g + g;
  const y2 = Math.ceil((b.y + b.h) / g) * g + g;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** dominant-baseline del SVG → alignment-baseline que entiende svg2pdf */
const BASELINE: Record<string, string> = {
  hanging: 'hanging',
  central: 'middle',
  middle: 'middle',
  'text-before-edge': 'top',
  'text-after-edge': 'bottom',
};

/**
 * SVG autónomo de la hoja de export (ExportView): el tema de impresión ya está aplicado y el
 * viewBox es la hoja, a 1 unidad = 1 pt
 */
export function sheetSvg(svg: SVGSVGElement, page: Rect, title = 'TurboSpice schematic'): string {
  const clone = inlineStyled(svg, 'defs, style');
  clone.removeAttribute('style');
  // svg2pdf ubica el texto con alignment-baseline (no lee dominant-baseline)
  for (const el of clone.querySelectorAll('text')) {
    const b = BASELINE[/dominant-baseline:\s*([\w-]+)/.exec(el.getAttribute('style') ?? '')?.[1] ?? ''];
    if (b) el.setAttribute('alignment-baseline', b);
  }
  clone.setAttribute('viewBox', `${page.x} ${page.y} ${page.w} ${page.h}`);
  clone.setAttribute('width', `${page.w}pt`);
  clone.setAttribute('height', `${page.h}pt`);
  whiteBackground(clone, page);
  // la marca: un comentario y los metadatos RDF (no se dibujan)
  const meta = new DOMParser().parseFromString(`<metadata xmlns="http://www.w3.org/2000/svg">${rdf(title)}</metadata>`, 'image/svg+xml').documentElement;
  clone.insertBefore(document.importNode(meta, true), clone.firstChild);
  return XML_HEAD + `<!-- ${CREATED_WITH} -->
` + new XMLSerializer().serializeToString(clone);
}

// --- texto en el PNG (chunks tEXt, antes de IEND) ---
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
/** Chunk tEXt (Latin-1): palabra clave, un 0 y el texto */
function textChunk(key: string, text: string): Uint8Array {
  const data = Uint8Array.from(`${key}\0${text}`, (ch) => (ch.charCodeAt(0) < 256 ? ch.charCodeAt(0) : 63));
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set([0x74, 0x45, 0x58, 0x74], 4); // tEXt
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** El PNG con la marca en sus metadatos (Software, Title, Comment, Source) */
export async function pngWithText(png: Blob, title: string): Promise<Blob> {
  const bytes = new Uint8Array(await png.arrayBuffer());
  // IEND son los últimos 12 bytes
  const end = bytes.length - 12;
  const chunks = [
    textChunk('Title', title),
    textChunk('Software', 'TurboSpice'),
    textChunk('Source', TURBOSPICE_URL),
    textChunk('Comment', CREATED_WITH),
  ];
  return new Blob([bytes.subarray(0, end), ...chunks, bytes.subarray(end)], { type: 'image/png' });
}

/** PNG de un SVG autónomo a `scale` píxeles por píxel CSS del SVG */
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
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Fuente que se incrusta en el PDF: familia y TTF por estilo ('normal', 'bold') */
export interface SheetFont {
  family: string;
  files: Record<string, string>;
}

/** Bytes en base64 (lo que pide addFileToVFS de jsPDF) */
function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * PDF vectorial de una página del tamaño de la hoja (sheetSvg), con jsPDF + svg2pdf.js. La
 * fuente va incrustada (las de fábrica del PDF no tienen Ω, µ ni las griegas)
 */
export async function sheetPdf(svgText: string, page: Rect, font: SheetFont, title = 'TurboSpice schematic'): Promise<Blob> {
  const [{ jsPDF }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const el = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement as unknown as SVGSVGElement;
  const pdf = new jsPDF({ unit: 'pt', format: [page.w, page.h], orientation: page.w > page.h ? 'landscape' : 'portrait', compress: true });
  for (const [style, url] of Object.entries(font.files)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    const file = `${font.family}-${style}.ttf`;
    pdf.addFileToVFS(file, base64(new Uint8Array(await res.arrayBuffer())));
    pdf.addFont(file, font.family, style);
  }
  await pdf.svg(el, { x: 0, y: 0, width: page.w, height: page.h });
  // la marca, en el diccionario Info y en los XMP (el Producer lo escribe jsPDF con su nombre)
  pdf.setDocumentProperties({ title, subject: CREATED_WITH, keywords: 'TurboSpice, schematic, SPICE', creator: `TurboSpice ${TURBOSPICE_URL}` });
  pdf.addMetadata(`<x:xmpmeta xmlns:x="adobe:ns:meta/">${rdf(title)}</x:xmpmeta>`, true);
  return pdf.output('blob');
}
