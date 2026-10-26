// Ventana del switch controlado por tensión de la TCLib (#307): Ron, Roff, umbral e histéresis,
// con un dibujo de la resistencia en función de la tensión de control. Los parámetros van en
// Value2 ("Rs=1m Roff=1G Vt=1m Vh=0"), que es lo que recibe el subcircuito.
import { useState } from 'react';
import type { SymbolDef, SymbolInst } from '../asc/model.ts';
import { effectiveAttrs } from '../asc/resolve.ts';
import { formatParamList, parseParamList } from '../project/symbolEdit.ts';
import { Modal } from './dialogs.tsx';
import { t } from '../i18n/i18n.ts';

/** El símbolo de la TCLib que abre esta ventana */
export const isTcSwitch = (type: string) => /(^|\/)TCLib\/switch$/i.test(type);

type Key = 'Rs' | 'Roff' | 'Vt' | 'Vh';
/** valores por defecto del subcircuito (TCLib/switch.lib) */
const DEFAULTS: Record<Key, string> = { Rs: '1m', Roff: '1G', Vt: '1m', Vh: '0' };
const FIELDS: { key: Key; label: string; unit: string; hint: string }[] = [
  { key: 'Rs', label: 'Ron', unit: 'Ω', hint: t('Resistance when closed') },
  { key: 'Roff', label: 'Roff', unit: 'Ω', hint: t('Resistance when open') },
  { key: 'Vt', label: t('Threshold Vt'), unit: 'V', hint: t('Control voltage V(Vc+, Vc−) at which it switches') },
  { key: 'Vh', label: t('Hysteresis Vh'), unit: 'V', hint: t('Closes above Vt+Vh and opens below Vt−Vh') },
];

export function SwitchDialog({ inst, def, onApply, onAttributes, onClose }: {
  inst: SymbolInst;
  def: SymbolDef | undefined;
  /** atributos a escribir */
  onApply(attrs: Record<string, string>): void;
  onAttributes(): void;
  onClose(): void;
}) {
  const eff = effectiveAttrs(inst, def);
  const name = eff.get('InstName') ?? '';
  const initial = parseParamList(eff.get('Value2') ?? '');
  const get = (k: Key) => initial.find(([n]) => n.toLowerCase() === k.toLowerCase())?.[1] ?? DEFAULTS[k];
  const [vals, setVals] = useState<Record<Key, string>>(() => ({ Rs: get('Rs'), Roff: get('Roff'), Vt: get('Vt'), Vh: get('Vh') }));
  const [focus, setFocus] = useState<Key | ''>('');
  const submit = () => {
    // los parámetros que no son de esta ventana se conservan
    const others = initial.filter(([n]) => !FIELDS.some((f) => f.key.toLowerCase() === n.toLowerCase()));
    const ps: [string, string][] = FIELDS.map((f): [string, string] => [f.key, vals[f.key].trim() || DEFAULTS[f.key]]);
    const Value2 = formatParamList([...ps, ...others]);
    onApply(Value2 !== (eff.get('Value2') ?? '') ? { Value2 } : {});
  };
  return (
    <Modal title={`${t('Switch')} — ${name}`} onClose={onClose}>
      <form className="swdlg" onSubmit={(e) => (e.preventDefault(), submit())}>
        <SwitchDrawing focus={focus} />
        <div className="src-row sw-row">
          {FIELDS.map((f, i) => (
            <label key={f.key} title={f.hint}>
              {f.label} ({f.unit})
              <input
                autoFocus={i === 0}
                value={vals[f.key]}
                placeholder={DEFAULTS[f.key]}
                spellCheck={false}
                onFocus={() => setFocus(f.key)}
                onBlur={() => setFocus('')}
                onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <small className="hint">{t('Closes when V(Vc+, Vc−) goes above Vt+Vh and opens when it goes below Vt−Vh.')}</small>
        <code className="src-line">{`${name} … switch ${FIELDS.map((f) => `${f.key}=${vals[f.key].trim() || DEFAULTS[f.key]}`).join(' ')}`}</code>
        <div className="buttons">
          <button type="button" onClick={onAttributes}>{t('Attributes…')}</button>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose}>{t('Cancel')}</button>
          <button type="submit" className="primary">{t('OK')}</button>
        </div>
      </form>
    </Modal>
  );
}

/** R en función de la tensión de control: el lazo de histéresis, con la cota que se está editando resaltada */
function SwitchDrawing({ focus }: { focus: Key | '' }) {
  const W = 420;
  const H = 150;
  const x0 = 40;
  const yOff = 30;
  const yOn = 112;
  const vt = 210;
  const lo = 170;
  const hi = 250;
  const on = (k: Key) => (focus === k ? ' on' : '');
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
      <g className={`dim${on('Roff')}`}>
        <text x={x0 + 6} y={yOff - 6}>Roff</text>
      </g>
      <g className={`dim${on('Rs')}`}>
        <text x={W - 24} y={yOn - 6} textAnchor="end">Ron</text>
      </g>
      <g className={`dim${on('Vt')}`}>
        <line x1={vt} y1={yOff - 8} x2={vt} y2={yOn + 14} strokeDasharray="2 3" />
        <text x={vt} y={yOn + 28} textAnchor="middle">Vt</text>
      </g>
      <g className={`dim${on('Vh')}`}>
        <path d={`M${lo} ${yOff - 14} H${hi}`} />
        <text x={lo - 4} y={yOff - 16} textAnchor="end">Vt−Vh</text>
        <text x={hi + 4} y={yOff - 16}>Vt+Vh</text>
      </g>
    </svg>
  );
}
