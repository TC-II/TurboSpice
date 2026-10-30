// Diálogo de un dispositivo de PDK (símbolos de library/sym/sky130 y gf180, docs/pdk.md): la
// variante (los otros símbolos de la misma familia), sus medidas en µm con lo que dan (W/L,
// resistencia, capacidad) y qué rótulos se ven. Todo lo demás, en el diálogo de atributos.
import { useMemo, useRef, useEffect, useState } from 'react';
import { baseName, type SymbolDef, type SymbolInst } from '../asc/model.ts';
import { effectiveAttrs, type WindowDefaults } from '../asc/resolve.ts';
import type { Library } from '../library/library.ts';
import { formatParamList, parseParamList } from '../project/symbolEdit.ts';
import { parseSpiceNumber } from '../netlist/spicenum.ts';
import { si } from '../waveform/series.ts';
import { t } from '../i18n/i18n.ts';
import { Modal, labelRows } from './dialogs.tsx';
import type { LabelPatch } from './edit.ts';

/** El PDK de un símbolo («sky130\nfet_01v8» → sky130), si es de uno */
export function pdkOfSymbol(type: string): 'sky130' | 'gf180' | undefined {
  const dir = type.replace(/\\/g, '/').split('/').slice(-2, -1)[0]?.toLowerCase();
  return dir === 'sky130' || dir === 'gf180' ? dir : undefined;
}

type Field = { key: string; label: string; unit: string; scale: number; suffix: string };

/**
 * Cómo se muestra cada parámetro: en µm (o µm²) siempre. En sky130 (.option scale=1u) el número
 * ya está en µm; en gf180 va en metros, así que se lee y se escribe con «u» (o «p» para áreas).
 */
function fieldOf(pdk: 'sky130' | 'gf180', key: string): Field {
  const k = key.toLowerCase();
  const gf = pdk === 'gf180';
  const len = (label: string): Field => ({ key, label, unit: 'µm', scale: gf ? 1e-6 : 1, suffix: gf ? 'u' : '' });
  if (k === 'w' || k === 'c_width' || k === 'r_width') return len(t('Width'));
  if (k === 'l' || k === 'c_length' || k === 'r_length') return len(t('Length'));
  if (k === 'pj' || k === 'perim') return len(t('Perimeter'));
  if (k === 'area') return { key, label: t('Area'), unit: 'µm²', scale: gf ? 1e-12 : 1, suffix: gf ? 'p' : '' };
  if (k === 'nf') return { key, label: t('Fingers'), unit: '', scale: 1, suffix: '' };
  if (k === 'm' || k === 'mult') return { key, label: t('Multiplier'), unit: '', scale: 1, suffix: '' };
  return { key, label: key, unit: '', scale: 1, suffix: '' };
}

const shown = (raw: string, f: Field) => {
  if (!raw.trim() || /[{}]/.test(raw)) return raw;
  const x = parseSpiceNumber(raw);
  return Number.isFinite(x) ? String(parseFloat((x / f.scale).toPrecision(6))) : raw;
};
const stored = (text: string, f: Field) => {
  const s = text.trim();
  // un número solo va con la unidad del PDK; una expresión o un valor con sufijo, tal cual
  return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? `${s}${f.suffix}` : s;
};

export function PdkDialog({ inst, def, lib, windowDefaults, onApply, onAdvanced, onClose }: {
  inst: SymbolInst;
  def: SymbolDef | undefined;
  lib: Library;
  windowDefaults: WindowDefaults;
  onApply(attrs: Record<string, string>, labels: Map<number, LabelPatch>): void;
  /** el diálogo de atributos de siempre */
  onAdvanced(): void;
  onClose(): void;
}) {
  const pdk = pdkOfSymbol(inst.type)!;
  const eff = effectiveAttrs(inst, def);
  const [name, setName] = useState(eff.get('InstName') ?? '');
  const [model, setModel] = useState(eff.get('Value') ?? '');
  const defaults = parseParamList(def?.attrs.get('SpiceLine') ?? '');
  const initial = new Map(parseParamList(eff.get('SpiceLine') ?? '').map(([k, v]) => [k.toLowerCase(), v]));
  const fields = defaults.map(([k]) => fieldOf(pdk, k));
  const [vals, setVals] = useState(() => Object.fromEntries(fields.map((f) => [f.key, shown(initial.get(f.key.toLowerCase()) ?? '', f)])));
  // los parámetros que no son del símbolo (m=2, un mult…), como texto
  const [extra, setExtra] = useState(() => formatParamList(parseParamList(eff.get('SpiceLine') ?? '').filter(([k]) => !fields.some((f) => f.key.toLowerCase() === k.toLowerCase()))));
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    first.current?.focus();
    first.current?.select();
  }, []);

  // variantes: los símbolos de la misma carpeta con el mismo dibujo y los mismos parámetros
  const variants = useMemo(() => {
    const dir = inst.type.replace(/\\/g, '/').split('/').slice(0, -1).join('/').toLowerCase();
    const sameParams = (d: SymbolDef) => parseParamList(d.attrs.get('SpiceLine') ?? '').map(([k]) => k.toLowerCase()).join() === defaults.map(([k]) => k.toLowerCase()).join();
    return lib
      .symbolPaths()
      .filter((p) => p.replace(/\\/g, '/').split('/').slice(0, -1).join('/').toLowerCase() === dir)
      .map((p) => ({ path: p, def: lib.symbol(p)! }))
      .filter(({ def: d }) => d && d.attrs.get('Skin') === def?.attrs.get('Skin') && d.attrs.get('Prefix') === def?.attrs.get('Prefix') && d.pins.length === def?.pins.length && sameParams(d));
  }, [inst.type]);
  const current = variants.find((v) => (v.def.attrs.get('Value') ?? '').toLowerCase() === model.toLowerCase()) ?? variants.find((v) => v.path === inst.type);
  const desc = (current?.def ?? def)?.attrs.get('Description') ?? '';
  const title = desc.replace(/^(sky130|GF180MCU)\s+/, '').replace(/\s*\([^)]*\)\.?.*$/, '').replace(/;.*$/, '');

  // lo que dan las medidas
  const num = (key: string) => {
    const f = fields.find((x) => x.key.toLowerCase() === key);
    const v = f ? parseFloat(vals[f.key]) : NaN;
    return Number.isFinite(v) ? v : undefined;
  };
  const w = num('w') ?? num('r_width') ?? num('c_width') ?? (/(\d+)p(\d+)$/.exec(model) ? parseFloat(/(\d+)p(\d+)$/.exec(model)!.slice(1).join('.')) : undefined);
  const l = num('l') ?? num('r_length') ?? num('c_length');
  const sheet = /~?([\d.]+)\s*(k?)Ω\/□/.exec(desc);
  const density = /~?([\d.]+)\s*fF\/µm²/.exec(desc);
  const facts: string[] = [];
  if (def?.attrs.get('Skin')?.match(/mos/) && w && l) {
    const nf = num('nf') ?? 1;
    facts.push(`W/L = ${parseFloat((w / l).toPrecision(3))}`);
    if (nf > 1) facts.push(t('total width {w} µm', { w: parseFloat((w * nf).toPrecision(4)) }));
    facts.push(t('gate area {a} µm²', { a: parseFloat((w * l * nf).toPrecision(3)) }));
  }
  if (sheet && w && l) facts.push(`R ≈ ${si(parseFloat(sheet[1]) * (sheet[2] ? 1e3 : 1) * (l / w), 3)}Ω (${parseFloat((l / w).toPrecision(3))} □)`);
  if (density && w && l) facts.push(`C ≈ ${si(parseFloat(density[1]) * 1e-15 * w * l, 3)}F`);

  // rótulos: el nombre del modelo (ventana 3) y los parámetros (ventana 39)
  const [rows, setRows] = useState(() => labelRows(inst, def, windowDefaults));
  const [patches, setPatches] = useState(new Map<number, LabelPatch>());
  const visible = (win: number) => rows.find((r) => r.win === win)?.visible;
  const setVisible = (win: number, v: boolean) => {
    setPatches(new Map(patches).set(win, { ...patches.get(win), visible: v }));
    setRows(rows.map((r) => (r.win === win ? { ...r, visible: v, moved: true } : r)));
  };

  const submit = () => {
    const line = [formatParamList(fields.map((f): [string, string] => [f.key, stored(vals[f.key] ?? '', f)]).filter(([, v]) => v)), extra.trim()].filter(Boolean).join(' ');
    const out: Record<string, string> = { InstName: name, Value: model, SpiceLine: line };
    onApply(Object.fromEntries(Object.entries(out).filter(([k, v]) => v !== (eff.get(k) ?? ''))), patches);
  };

  return (
    <Modal title={`${name} — ${title || baseName(inst.type)}`} onClose={onClose}>
      <form
        className="attrs pdk-dlg"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="pdk-head">
          <span className="chip pdk-chip">{pdk}</span>
          <code title={desc}>{model}</code>
        </div>
        {variants.length > 1 && (
          <div className="pdk-variants" role="radiogroup" aria-label={t('Variant')}>
            {variants.map((v) => {
              const value = v.def.attrs.get('Value') ?? '';
              const d = (v.def.attrs.get('Description') ?? '').replace(/^(sky130|GF180MCU)\s+/, '').replace(/\s*\([^)]*\)\.?.*$/, '').replace(/;.*$/, '');
              return (
                <button
                  type="button"
                  key={v.path}
                  role="radio"
                  aria-checked={value.toLowerCase() === model.toLowerCase()}
                  className={value.toLowerCase() === model.toLowerCase() ? 'active' : ''}
                  title={value}
                  onClick={() => setModel(value)}
                >
                  <b>{baseName(v.path)}</b>
                  <small>{d}</small>
                </button>
              );
            })}
          </div>
        )}
        <label className="attr-row">
          <span>{t('Name')}</span>
          <input ref={first} value={name} spellCheck={false} onChange={(e) => setName(e.target.value)} />
          <span className="attr-vis" />
        </label>
        {fields.map((f) => (
          <label key={f.key} className="attr-row pdk-field">
            <span>{f.label}</span>
            <span className="pdk-input">
              <input value={vals[f.key] ?? ''} spellCheck={false} inputMode="decimal" placeholder={shown(defaults.find(([k]) => k === f.key)?.[1] ?? '', f)} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
              {f.unit && <em>{f.unit}</em>}
            </span>
            <span className="attr-vis" />
          </label>
        ))}
        <label className="attr-row">
          <span title={t('Other instance parameters, as in SPICE (m=2 …)')}>{t('Other')}</span>
          <input value={extra} spellCheck={false} placeholder="m=1" onChange={(e) => setExtra(e.target.value)} />
          <span className="attr-vis" />
        </label>
        {facts.length > 0 && <div className="pdk-facts">{facts.join(' · ')}</div>}
        <div className="pdk-shows">
          {visible(3) !== undefined && (
            <label>
              <input type="checkbox" checked={!!visible(3)} onChange={(e) => setVisible(3, e.target.checked)} />
              {t('Show the model name')}
            </label>
          )}
          {visible(39) !== undefined && (
            <label>
              <input type="checkbox" checked={!!visible(39)} onChange={(e) => setVisible(39, e.target.checked)} />
              {t('Show the parameters')}
            </label>
          )}
        </div>
        <small className="hint">{t('The corner is the .lib {pdk} <corner> directive (tt, ff, ss, sf, fs); without one, tt.', { pdk })}</small>
        <div className="buttons">
          <button type="button" className="link" onClick={onAdvanced}>
            {t('All attributes…')}
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose}>{t('Cancel')}</button>
          <button type="submit" className="primary">{t('OK')}</button>
        </div>
      </form>
    </Modal>
  );
}
