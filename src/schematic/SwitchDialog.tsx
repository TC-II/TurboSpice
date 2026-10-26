// Ventana del switch controlado por tensión (#307): Ron, Roff, umbral e histéresis, con un dibujo
// de la resistencia en función de la tensión de control. En el de la TCLib los parámetros van en
// Value2 ("Rs=1m Roff=1G Vt=1m Vh=0", lo que recibe el subcircuito); en el nativo de SPICE (S…),
// en la directiva ".model SW SW(…)" del esquemático.
import { useState } from 'react';
import type { AscDoc, SymbolDef, SymbolInst } from '../asc/model.ts';
import { effectiveAttrs, type WindowDefaults } from '../asc/resolve.ts';
import { formatParamList, parseParamList } from '../project/symbolEdit.ts';
import type { LabelPatch } from './edit.ts';
import { labelRows, Modal } from './dialogs.tsx';
import { findSwModel } from './switchModel.ts';
import { t } from '../i18n/i18n.ts';

/** El símbolo de la TCLib que abre esta ventana */
export const isTcSwitch = (type: string) => /(^|\/)TCLib\/switch$/i.test(type);
/** El switch nativo de SPICE (prefijo S): sus parámetros van en un .model SW del esquemático */
export const isNativeSwitch = (prefix: string) => /^s$/i.test(prefix);

type Id = 'on' | 'off' | 'vt' | 'vh';
interface Field {
  id: Id;
  /** nombre del parámetro en el subcircuito o en el .model */
  param: string;
  label: string;
  unit: string;
  hint: string;
  dflt: string;
}
const field = (id: Id, param: string, dflt: string): Field => {
  const base = {
    on: { label: 'Ron', unit: 'Ω', hint: t('Resistance when closed') },
    off: { label: 'Roff', unit: 'Ω', hint: t('Resistance when open') },
    vt: { label: t('Threshold Vt'), unit: 'V', hint: t('Control voltage V(Vc+, Vc−) at which it switches') },
    vh: { label: t('Hysteresis Vh'), unit: 'V', hint: t('Closes above Vt+Vh and opens below Vt−Vh') },
  }[id];
  return { id, param, dflt, ...base };
};
/** TCLib/switch.lib: parámetros del subcircuito (Ron se llama Rs) */
const TC_FIELDS = [field('on', 'Rs', '1m'), field('off', 'Roff', '1G'), field('vt', 'Vt', '1m'), field('vh', 'Vh', '0')];
/** .model SW de SPICE: los valores por defecto de ngspice (Roff = 1/GMIN) */
const SW_FIELDS = [field('on', 'Ron', '1'), field('off', 'Roff', '1T'), field('vt', 'Vt', '0'), field('vh', 'Vh', '0')];

export function SwitchDialog({ inst, def, doc, windowDefaults, onApply, onClose }: {
  inst: SymbolInst;
  def: SymbolDef | undefined;
  /** el esquemático: el switch nativo lee su .model de las directivas */
  doc: AscDoc;
  windowDefaults: WindowDefaults;
  /** atributos a escribir, rótulos que se muestran u ocultan y, en el nativo, su .model */
  onApply(attrs: Record<string, string>, labels: Map<number, LabelPatch>, model?: { name: string; params: [string, string][] }): void;
  onClose(): void;
}) {
  const eff = effectiveAttrs(inst, def);
  const native = isNativeSwitch(eff.get('Prefix') ?? '');
  const FIELDS = native ? SW_FIELDS : TC_FIELDS;
  const [name, setName] = useState(eff.get('InstName') ?? '');
  const [model, setModel] = useState(eff.get('Value') || 'SW');
  // rótulos del símbolo: el nombre (0), el modelo (3) o los parámetros (Value2, 123)
  const rows = labelRows(inst, def, windowDefaults);
  // (en el símbolo de la TCLib los parámetros vienen con tamaño 0: se ven sólo si se los muestra)
  const seen = (r: (typeof rows)[number]) => r.visible && r.size > 0;
  const [shown, setShown] = useState(() => new Map(rows.map((r) => [r.win, seen(r)])));
  const vis = (win: number) => (
    <input
      type="checkbox"
      className="attr-vis"
      checked={shown.get(win) ?? false}
      title={t('Visible on the schematic')}
      aria-label={t('Visible on the schematic')}
      onChange={(e) => setShown(new Map(shown).set(win, e.target.checked))}
    />
  );
  const modelName = model.trim() || 'SW';
  const found = native ? findSwModel(doc, modelName) : null;
  const [initial] = useState(() => (native ? (findSwModel(doc, eff.get('Value') || 'SW')?.params ?? []) : parseParamList(eff.get('Value2') ?? '')));
  const get = (f: Field) => initial.find(([n]) => n.toLowerCase() === f.param.toLowerCase())?.[1] ?? f.dflt;
  const [vals, setVals] = useState<Record<Id, string>>(() => ({ on: get(FIELDS[0]), off: get(FIELDS[1]), vt: get(FIELDS[2]), vh: get(FIELDS[3]) }));
  const [focus, setFocus] = useState<Id | ''>('');
  // otros switches nativos con el mismo .model: cambiarlo los cambia a todos
  const sharing = native
    ? doc.symbols.filter((s) => s !== inst && /(^|\/)sw$/i.test(s.type) && (s.attrs.get('Value') || 'SW').toLowerCase() === modelName.toLowerCase()).length
    : 0;
  const params = (): [string, string][] => {
    // los parámetros que no son de esta ventana se conservan
    const others = initial.filter(([n]) => !FIELDS.some((f) => f.param.toLowerCase() === n.toLowerCase()));
    return [...FIELDS.map((f): [string, string] => [f.param, vals[f.id].trim() || f.dflt]), ...others];
  };
  const submit = () => {
    const attrs: Record<string, string> = {};
    if (native) {
      if (modelName !== (eff.get('Value') ?? '')) attrs.Value = modelName;
    } else {
      const Value2 = formatParamList(params());
      if (Value2 !== (eff.get('Value2') ?? '')) attrs.Value2 = Value2;
    }
    if (name.trim() && name.trim() !== eff.get('InstName')) attrs.InstName = name.trim();
    const labels = new Map<number, LabelPatch>();
    for (const r of rows) if (shown.get(r.win) !== seen(r)) labels.set(r.win, shown.get(r.win) ? { visible: true, size: r.size || 2 } : { visible: false });
    // el símbolo de la TCLib no trae rótulo para el nombre: al mostrarlo va arriba a la derecha del círculo
    if (shown.get(0) && !rows.some((r) => r.win === 0)) labels.set(0, { visible: true, create: { x: 36, y: 16, align: 'Left', size: 2 } });
    onApply(attrs, labels, native ? { name: modelName, params: params() } : undefined);
  };
  const line = native ? `.model ${modelName} SW(${formatParamList(params())})` : `${name} … switch ${formatParamList(params())}`;
  return (
    <Modal title={`${t('Switch')} — ${name}`} onClose={onClose} wide>
      <form className="swdlg" onSubmit={(e) => (e.preventDefault(), submit())}>
        <SwitchDrawing focus={focus} />
        <div className="src-row sw-row">
          {FIELDS.map((f, i) => (
            <label key={f.id} title={f.hint}>
              {f.label} ({f.unit})
              <input
                autoFocus={i === 0}
                value={vals[f.id]}
                placeholder={f.dflt}
                spellCheck={false}
                onFocus={() => setFocus(f.id)}
                onBlur={() => setFocus('')}
                onChange={(e) => setVals({ ...vals, [f.id]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <small className="hint">{t('Closes when V(Vc+, Vc−) goes above Vt+Vh and opens when it goes below Vt−Vh.')}</small>
        {native && (
          <small className="hint">
            {found ? t('The parameters are in the directive .model {m} of the schematic.', { m: modelName }) : t('A directive .model {m} is added to the schematic.', { m: modelName })}
            {sharing > 0 && ` ${t('It is shared by {n} other switches: they change too.', { n: sharing })}`}
          </small>
        )}
        <details className="src-adv attrs">
          <summary>{t('Attributes')}</summary>
          <label className="attr-row">
            <span>InstName</span>
            <input value={name} spellCheck={false} onChange={(e) => setName(e.target.value)} />
            {vis(0)}
          </label>
          {native ? (
            <label className="attr-row">
              <span>{t('Model')}</span>
              <input value={model} spellCheck={false} onChange={(e) => setModel(e.target.value)} />
              {vis(3)}
            </label>
          ) : (
            <label className="attr-row">
              <span>{t('Parameters')}</span>
              <code className="src-line">{formatParamList(params())}</code>
              {vis(123)}
            </label>
          )}
        </details>
        <code className="src-line">{line}</code>
        <div className="buttons">
          <button type="button" onClick={onClose}>{t('Cancel')}</button>
          <button type="submit" className="primary">{t('OK')}</button>
        </div>
      </form>
    </Modal>
  );
}

/** R en función de la tensión de control: el lazo de histéresis, con la cota que se está editando resaltada */
function SwitchDrawing({ focus }: { focus: Id | '' }) {
  const W = 420;
  const H = 150;
  const x0 = 40;
  const yOff = 30;
  const yOn = 112;
  const vt = 210;
  const lo = 170;
  const hi = 250;
  const on = (k: Id) => (focus === k ? ' on' : '');
  return (
    <svg className="src-draw" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Switch resistance against control voltage')}>
      <g className="axis">
        <line x1={x0} y1={yOn + 14} x2={W - 16} y2={yOn + 14} />
        <line x1={x0} y1={yOn + 14} x2={x0} y2={12} />
      </g>
      <text x={W - 16} y={H - 4} textAnchor="end">V(Vc+, Vc−)</text>
      <text x={x0 - 6} y={14} textAnchor="end">R</text>
      {/* abierto hasta Vt+Vh al subir; cerrado hasta Vt−Vh al bajar */}
      <path className="wave" d={`M${x0} ${yOff} H${hi} V${yOn} H${W - 24}`} />
      <path className="wave" d={`M${W - 24} ${yOn} H${lo} V${yOff}`} strokeDasharray="5 4" />
      <path className="wave" d={`M${hi - 8} ${(yOff + yOn) / 2 - 8} l8 8 l8 -8`} />
      <path className="wave" d={`M${lo - 8} ${(yOff + yOn) / 2 + 8} l8 -8 l8 8`} />
      <g className={`dim${on('off')}`}>
        <text x={x0 + 6} y={yOff - 6}>Roff</text>
      </g>
      <g className={`dim${on('on')}`}>
        <text x={W - 24} y={yOn - 6} textAnchor="end">Ron</text>
      </g>
      <g className={`dim${on('vt')}`}>
        <line x1={vt} y1={yOff - 8} x2={vt} y2={yOn + 14} strokeDasharray="2 3" />
        <text x={vt} y={yOn + 28} textAnchor="middle">Vt</text>
      </g>
      <g className={`dim${on('vh')}`}>
        <path d={`M${lo} ${yOff - 14} H${hi}`} />
        <text x={lo - 4} y={yOff - 16} textAnchor="end">Vt−Vh</text>
        <text x={hi + 4} y={yOff - 16}>Vt+Vh</text>
      </g>
    </svg>
  );
}
