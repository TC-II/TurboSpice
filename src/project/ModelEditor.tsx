// Editor de un módulo «Modelo»: a la izquierda el texto del modelo (.subckt / .model) y los
// atributos del símbolo (Prefix, InstName, Value, SpiceModel, ModelFile, SpiceLine…, el nombre y
// el SpiceOrder de cada pin); a la derecha el símbolo (el mismo editor que el de los subcircuitos).
import { useEffect, useMemo, useRef, useState } from 'react';
import { SymbolEditor } from './SymbolEditor.tsx';
import { setSymParams, symParams, symPins, syncPins } from './symbolEdit.ts';
import { MODEL_ATTRS, modelInfo, modelModuleSymbol, setPinAttr, setSymAttr, symAttr } from './modelModule.ts';
import { t } from '../i18n/i18n.ts';

export function ModelEditor({ name, text, symText, symW, onText, onSymbol, onWidth, onClose }: {
  name: string;
  text: string;
  symText: string;
  symW: number;
  onText(text: string): void;
  onSymbol(text: string): void;
  onWidth(w: number): void;
  onClose(): void;
}) {
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text, name]);
  // se guarda al rato de dejar de escribir (y al salir del cuadro)
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const save = (v: string) => {
    clearTimeout(timer.current);
    if (v !== text) onText(v);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const info = useMemo(() => modelInfo(draft), [draft]);
  const pins = useMemo(() => symPins(symText), [symText]);
  const names = pins.map((p) => p.name.toLowerCase());
  const mismatch = info.pins.length > 0 && (info.pins.length !== pins.length || info.pins.some((p) => !names.includes(p.toLowerCase())));

  return (
    <div className="model-editor" style={{ '--sym-wc': `min(${symW}px, 60%)` } as React.CSSProperties}>
      <div className="sub-hint model-hint" role="status">
        <strong>{t('Model Editor')}</strong>
        <span className="sub-hint-name">{name}</span>
        <span className="sub-hint-text">{t('write the .subckt or .model on the left and draw its symbol on the right')}</span>
        <button onClick={onClose} title={t('Back to the testbench')}>
          {t('Return')}
        </button>
      </div>
      <section className="model-left">
        <label className="model-label" htmlFor="model-netlist">
          {t('Netlist ({file})', { file: `${name}.lib` })}
        </label>
        <textarea
          id="model-netlist"
          className="model-text"
          spellCheck={false}
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            setDraft(v);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => save(v), 500);
          }}
          onBlur={() => save(draft)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <p className="tree-meta">
          {info.kind === 'subckt'
            ? t('Defines .subckt {name} with the pins {pins}', { name: info.name, pins: info.pins.join(' ') || '—' })
            : info.kind === 'model'
              ? t('Defines .model {name} ({type})', { name: info.name, type: info.type ?? '' })
              : t('No .subckt or .model found yet')}
        </p>
        {mismatch && (
          <p className="tree-warn">
            {t('The pins of the symbol do not match the netlist ({pins}).', { pins: info.pins.join(' ') })}{' '}
            <button className="link" onClick={() => onSymbol(syncPins(symText, info.pins.map((n) => ({ name: n }))))}>
              {t('Update pins')}
            </button>
          </p>
        )}
        <details className="model-attrs" open>
          <summary>{t('Symbol attributes')}</summary>
          <table>
            <tbody>
              {MODEL_ATTRS.map((k) => (
                <tr key={k}>
                  <td>
                    <label htmlFor={`model-attr-${k}`}>{k}</label>
                  </td>
                  <td>
                    <AttrInput id={`model-attr-${k}`} value={symAttr(symText, k)} onCommit={(v) => onSymbol(setSymAttr(symText, k, v))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="tree-meta">{t('Prefix X calls the .subckt by its name (Value or SpiceModel); D, Q, M, J… use the .model named in Value. SpiceLine adds instance parameters.')}</p>
        </details>
        <details className="model-attrs" open>
          <summary>{t('Pins')}</summary>
          {pins.length ? (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('Name (PinName)')}</th>
                  <th>{t('Order (SpiceOrder)')}</th>
                </tr>
              </thead>
              <tbody>
                {pins.map((p, i) => (
                  <tr key={i}>
                    <td className="tree-meta">{i + 1}</td>
                    <td>
                      <AttrInput id={`model-pin-${i}`} label={t('Name of pin {n}', { n: i + 1 })} value={p.name} onCommit={(v) => v && onSymbol(setPinAttr(symText, i, 'PinName', v.replace(/\s/g, '')))} />
                    </td>
                    <td>
                      <AttrInput id={`model-ord-${i}`} label={t('SpiceOrder of pin {n}', { n: i + 1 })} value={String(p.order)} onCommit={(v) => /^\d+$/.test(v) && onSymbol(setPinAttr(symText, i, 'SpiceOrder', v))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="tree-meta">{t('No pins: add them with the pin tool of the symbol.')}</p>
          )}
        </details>
      </section>
      <SymbolEditor
        name={name}
        text={symText}
        ports={info.pins}
        onChange={onSymbol}
        onParams={(ps) => onSymbol(setSymParams(symText, ps))}
        onReset={() => onSymbol(setSymParams(modelModuleSymbol(name, draft), symParams(symText)))}
        onWidth={onWidth}
      />
    </div>
  );
}

/** Campo que guarda al salir o con Enter */
function AttrInput({ id, label, value, onCommit }: { id: string; label?: string; value: string; onCommit(v: string): void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => v.trim() !== value && onCommit(v.trim());
  return (
    <input
      id={id}
      aria-label={label}
      value={v}
      spellCheck={false}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
      }}
    />
  );
}
