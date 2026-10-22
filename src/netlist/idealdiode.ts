import { t } from '../i18n/i18n.ts';
// Diodo "ideal" de LTspice (.model X D(Ron=… Vfwd=… Roff=… Vrev=… Rrev=… Ilimit=…)).
// ngspice no lo tiene: acepta el modelo sin error pero lo trata como una resistencia, así
// que los resultados saldrían mal en silencio. Se reemplaza cada instancia por una fuente
// de corriente comportamental lineal por tramos, como lo define LTspice:
//   V ≥ Vfwd        → Vfwd/Roff + (V − Vfwd)/Ron            (encendido)
//   V ≤ −Vrev       → −Vrev/Roff + (V + Vrev)/Rrev          (ruptura inversa, si hay Vrev)
//   en otro caso    → V/Roff                                 (apagado)

const IDEAL_PARAMS = ['ron', 'roff', 'vfwd', 'vrev', 'rrev', 'ilimit', 'revilimit', 'epsilon', 'revepsilon'];

interface IdealModel {
  ron: string;
  roff: string;
  vfwd: string;
  vrev?: string;
  rrev: string;
  ilimit?: string;
  revilimit?: string;
}

/** Une líneas de continuación ("+ …") para poder procesar línea a línea */
function joinContinuations(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (/^\s*\+/.test(line) && out.length) out[out.length - 1] += ' ' + line.replace(/^\s*\+/, '');
    else out.push(line);
  }
  return out;
}

function parseModelParams(body: string): Map<string, string> {
  const params = new Map<string, string>();
  for (const m of body.matchAll(/([A-Za-z_]\w*)\s*=\s*(\{[^}]*\}|[^\s,()]+)/g)) params.set(m[1].toLowerCase(), m[2]);
  return params;
}

/** LTspice no deja Ron/Rrev en 0: medido con -b, Ron=0 conduce como 1 mΩ */
const minR = (r: string) => (r.startsWith('{') ? `{max(${r.slice(1, -1)}, 1m)}` : /^[+]?0*\.?0*(e[+-]?\d+)?$/i.test(r) ? '1m' : r);

const val = (v: string) => (v.startsWith('{') ? `(${v.slice(1, -1)})` : v);

function current(m: IdealModel, v: string): string {
  const { ron, roff, vfwd } = { ron: val(m.ron), roff: val(m.roff), vfwd: val(m.vfwd) };
  let on = `${vfwd}/${roff}+(${v}-${vfwd})/${ron}`;
  if (m.ilimit) on = `min(${on},${val(m.ilimit)})`;
  let expr = `(${v}>=${vfwd}) ? (${on}) : `;
  if (m.vrev) {
    const vrev = val(m.vrev);
    let rev = `-${vrev}/${roff}+(${v}+${vrev})/${val(m.rrev)}`;
    if (m.revilimit) rev = `max(${rev},-${val(m.revilimit)})`;
    expr += `(${v}<=-${vrev}) ? (${rev}) : `;
  }
  return expr + `(${v}/${roff})`;
}

export interface IdealDiodeResult {
  text: string;
  /** modelos ideales encontrados (en minúsculas) */
  models: string[];
  warnings: string[];
}

/**
 * Reemplaza en un texto SPICE (netlist o archivo de modelos) los diodos que usan un modelo
 * ideal definido en ese mismo texto, o en `external` (modelos ideales de otros archivos).
 */
export function replaceIdealDiodes(text: string, external = new Map<string, IdealModel>()): IdealDiodeResult & { found: Map<string, IdealModel> } {
  const lines = joinContinuations(text);
  const found = new Map<string, IdealModel>();
  const warnings: string[] = [];

  for (const line of lines) {
    const m = /^\s*\.model\s+(\S+)\s+D\b\s*\(?(.*?)\)?\s*$/i.exec(line);
    if (!m) continue;
    const p = parseModelParams(m[2]);
    if (![...p.keys()].some((k) => IDEAL_PARAMS.includes(k))) continue;
    const other = [...p.keys()].filter((k) => !IDEAL_PARAMS.includes(k));
    if (other.length) warnings.push(t('Ideal diode {p0}: parameters ignored ({p1})', { p0: m[1], p1: other.join(', ') }));
    if (p.has('epsilon') || p.has('revepsilon')) warnings.push(t('Ideal diode {p0}: Epsilon (smooth transition) isn\'t modeled', { p0: m[1] }));
    found.set(m[1].toLowerCase(), {
      ron: minR(p.get('ron') ?? '1'),
      // LTspice: sin Roff el diodo apagado conduce sólo Gmin
      roff: p.get('roff') ?? '1e12',
      vfwd: p.get('vfwd') ?? '0',
      vrev: p.get('vrev'),
      rrev: minR(p.get('rrev') ?? p.get('ron') ?? '1'),
      ilimit: p.get('ilimit'),
      revilimit: p.get('revilimit'),
    });
  }
  const all = new Map([...external, ...found]);
  if (!all.size) return { text, models: [], warnings, found };

  const out = lines.map((line) => {
    if (/^\s*\.model\s+(\S+)\s+D\b/i.test(line)) {
      const name = /^\s*\.model\s+(\S+)/i.exec(line)![1].toLowerCase();
      return found.has(name) ? `* (diodo ideal de LTspice → fuente B) ${line.trim()}` : line;
    }
    const d = /^(\s*)(D\S*)\s+(\S+)\s+(\S+)\s+(\S+)(.*)$/i.exec(line);
    if (!d) return line;
    const model = all.get(d[5].toLowerCase());
    if (!model) return line;
    const [, indent, name, a, k] = d;
    return `${indent}B${name} ${a} ${k} I=${current(model, `V(${a},${k})`)}`;
  });
  return { text: out.join('\n'), models: [...found.keys()], warnings, found };
}
