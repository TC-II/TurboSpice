// PDF mínimo de una página con una imagen JPEG (Exportar a PDF, rápido): sin dependencias.
// La imagen va centrada en una hoja A4 (apaisada si es más ancha que alta), con margen.

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 28.35; // 10 mm

/** PDF de una página A4 con la imagen JPEG (`jpeg`, de `w`×`h` píxeles) centrada */
export function jpegPdf(jpeg: Uint8Array, w: number, h: number): Uint8Array {
  const landscape = w >= h;
  const pw = landscape ? A4.h : A4.w;
  const ph = landscape ? A4.w : A4.h;
  const k = Math.min((pw - 2 * MARGIN) / w, (ph - 2 * MARGIN) / h);
  const iw = w * k;
  const ih = h * k;
  const x = (pw - iw) / 2;
  const y = (ph - ih) / 2;
  const f = (n: number) => n.toFixed(2);
  const content = `q ${f(iw)} 0 0 ${f(ih)} ${f(x)} ${f(y)} cm /Im0 Do Q`;
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let len = 0;
  const push = (b: Uint8Array | string) => {
    const bytes = typeof b === 'string' ? enc.encode(b) : b;
    parts.push(bytes);
    len += bytes.length;
  };
  const obj = (n: number, body: string) => {
    offsets[n] = len;
    push(`${n} 0 obj\n${body}\nendobj\n`);
  };
  push('%PDF-1.4\n');
  // comentario con bytes altos: marca el archivo como binario
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pw)} ${f(ph)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = len;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  push(jpeg);
  push('\nendstream\nendobj\n');
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = len;
  push(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len);
  let p = 0;
  for (const b of parts) out.set(b, p), (p += b.length);
  return out;
}

/** PDF del SVG autónomo del esquemático (schematicSvg): se rasteriza a alta resolución */
export async function schematicPdf(svgText: string): Promise<Blob> {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    // ~300 ppp en A4: el lado largo, unos 3500 px (sin pasar de 4 px por unidad)
    const scale = Math.min(4, 3500 / Math.max(img.width, img.height, 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!jpeg) throw new Error('canvas');
    const bytes = jpegPdf(new Uint8Array(await jpeg.arrayBuffer()), canvas.width, canvas.height);
    return new Blob([bytes], { type: 'application/pdf' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
