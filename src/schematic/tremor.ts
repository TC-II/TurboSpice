// Trazo Tremor (#330): el lápiz a mano alzada de ASC-Parser (roughPen.js) sobre los skins y los
// cables de la hoja de export. La pantalla de trabajo no cambia. Cada dibujo se siembra con su
// lugar en la hoja: dos resistencias no salen iguales, y la misma hoja sale siempre igual.
import RoughPen from './roughPen.js';

type Skin = { viewBox: string; body: string };
type Pt = [number, number];

/**
 * El skin normalizado (estilos en línea, currentColor, var(--sch-bg)) en el formato que lee
 * roughPen, el de los SVG de Illustrator: clases en un <style>, en negro y blanco. (Con
 * atributos no: roughPen toma el primer `width="` de la etiqueta, y stroke-width también lo es)
 */
function toPenSvg(skin: Skin, classes: Map<string, string>): string {
  const body = skin.body.replace(/\sstyle="([^"]*)"/g, (_, style: string) => {
    const decls = style
      .split(';')
      .map((d) => /^\s*(fill|stroke|stroke-width)\s*:\s*(.+?)\s*$/.exec(d))
      .filter((m): m is RegExpExecArray => !!m)
      .map(([, k, v]) => `${k}: ${v === 'currentColor' ? '#000' : /var\(--sch-bg\)/.test(v) ? '#fff' : v}`)
      .join('; ');
    if (!classes.has(decls)) classes.set(decls, `t${classes.size}`);
    return ` class="${classes.get(decls)}"`;
  });
  const css = [...classes].map(([decls, cls]) => `.${cls} { ${decls}; }`).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${skin.viewBox}"><defs><style>${css}</style></defs>${body}</svg>`;
}

/**
 * De vuelta al esquemático: sin el <style> (sería global en la página) y con los colores del
 * tema (el negro sigue al tema; el blanco, al fondo). Los trazos ya traen fill, stroke y
 * stroke-width; las marcas (rellenos que sólo se deforman) recuperan su estilo en línea.
 */
function fromPenSvg(svg: string, classes: Map<string, string>): string {
  const style = new Map([...classes].map(([decls, cls]) => [cls, decls]));
  const colors = (s: string) => s.replace(/(fill|stroke)(="|:\s*)#000(000)?\b/gi, '$1$2currentColor').replace(/(fill)(="|:\s*)#fff(fff)?\b/gi, '$1$2var(--sch-bg)');
  return colors(
    svg
      .replace(/<\?xml[^>]*>/, '')
      .replace(/<svg[^>]*>/, '')
      .replace(/<\/svg>\s*$/, '')
      .replace(/<defs>[\s\S]*?<\/defs>/, '')
      .replace(/<(\w+)([^>]*?)\sclass="(t\d+)"([^>]*)>/g, (_, tag: string, a: string, cls: string, b: string) => {
        if (!/ stroke="/.test(a + b)) return `<${tag}${a} style="${style.get(cls) ?? ''}"${b}>`;
        // roughPen traza todo con una pluma negra: un trazo blanco (Boca Jrs) sigue blanco
        const white = /stroke:\s*#fff(fff)?\b/i.test(style.get(cls) ?? '');
        return `<${tag}${white ? (a + b).replace(/ stroke="#000(000)?"/i, ' stroke="#fff"') : a + b}>`;
      }),
  ).trim();
}

// por skin (el objeto del bundle) y semilla
const cache = new WeakMap<Skin, Map<string, Skin>>();

/** El skin redibujado a mano alzada; los trazos llegan justo a `pins` (coordenadas del símbolo) */
export function tremorSkin(skin: Skin, pins: Pt[], seed: string): Skin {
  let bySeed = cache.get(skin);
  if (!bySeed) cache.set(skin, (bySeed = new Map()));
  let out = bySeed.get(seed);
  if (!out) {
    try {
      const classes = new Map<string, string>();
      out = { viewBox: skin.viewBox, body: fromPenSvg(RoughPen.roughen(toPenSvg(skin, classes), { pins, seed }).svg, classes) };
    } catch {
      // mejor el dibujo limpio que perder el componente
      out = skin;
    }
    bySeed.set(seed, out);
  }
  return out;
}

/** Un cable a mano alzada: los dos extremos quedan donde estaban (uniones, pines, etiquetas) */
export function tremorWire(x1: number, y1: number, x2: number, y2: number): string {
  const opt = RoughPen.DEFAULTS;
  const ends: Pt[] = [
    [x1, y1],
    [x2, y2],
  ];
  try {
    const rand = RoughPen.mulberry32(RoughPen.fnv1a(`wire|${x1},${y1}|${x2},${y2}`));
    const pts = RoughPen.penStroke(ends, rand, opt, RoughPen.makeWarp(rand, opt.warp, opt.warpPeriod), RoughPen.makeTaper(ends, opt.lock), false);
    if (pts.length > 1) return pts.map(([x, y]) => `${+x.toFixed(2)},${+y.toFixed(2)}`).join(' ');
  } catch {
    // (recto, como estaba)
  }
  return `${x1},${y1} ${x2},${y2}`;
}
