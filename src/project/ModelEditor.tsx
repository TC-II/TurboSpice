// Editor de un módulo «Modelo»: a la izquierda el texto del modelo (.subckt / .model), los
// atributos del símbolo (en el orden en que arman la línea de la instancia, como en TCLib) y sus
// pines (nombre, SpiceOrder, de qué lado va el nombre y si se ve); a la derecha el dibujo del
// símbolo (el mismo editor que el de los subcircuitos), mitad y mitad al entrar (el borde se arrastra).
// El símbolo y el netlist son independientes salvo en esto: SpiceModel es el nombre del .subckt (se
// cambia de cualquiera de los dos lados) y Prefix sale de lo que define (X o la letra del .model).
// Los pines van, por SpiceOrder, a sus nodos; cambiarlos no toca el código: eso lo hace el botón
// «Update pins in .lib».
import { useEffect, useMemo, useRef, useState } from 'react';
import { GRID } from '../asc/model.ts';
import { SymbolEditor } from './SymbolEditor.tsx';
import { addFreePin, pinSide, removePin, setPinAlign, symPins, symWindows } from './symbolEdit.ts';
import { subcktPins } from '../library/makeSymbol.ts';
import { ATTR_WINDOW, attrSize, libForPins, setAttrSize, MODEL_ATTRS, attrVisible, modelFileName, modelInfo, modelParams, setModelParams, setAttrVisible, pinsMismatch, renameModelIn, renameSubcktIn, setPinAttr, setSymAttr, symAttr, syncModelAttrs, updateModelPins } from './modelModule.ts';
import { t } from '../i18n/i18n.ts';

/** Qué hace cada atributo (según cómo los usan los símbolos de TCLib y el netlist) */
const ATTR_HELP: Record<(typeof MODEL_ATTRS)[number], () => string> = {
  InstName: () => t('Name of each instance on the schematic (X1, U1…); empty: the Prefix and a number'),
  Prefix: () => t('From the netlist: X for a .subckt; D, Q, M, J… for a .model of that device'),
  SpiceModel: () => t('The name of the .subckt or .model: changing it here renames it in the netlist, and vice versa'),
  Value: () => t('Goes after SpiceModel and is shown on the schematic: e.g. parameters (G=1)'),
  Value2: () => t('Goes after Value'),
  SpiceLine: () => t('Parameters with their default value (the «Parameters» table of the symbol)'),
  SpiceLine2: () => t('More text at the end of the line'),
  ModelFile: () => t('The file of this netlist: it is named like the component'),
  Description: () => t('Text shown in the component picker'),
};

const SIDES = ['LEFT', 'RIGHT', 'TOP', 'BOTTOM'] as const;
/** no se escriben a mano: Prefix sale del netlist y ModelFile es el archivo de este módulo */
const READ_ONLY = new Set<string>(['Prefix', 'ModelFile']);
/** tamaños de letra de LTspice (índice → pt, spec §7.1) */
const SIZES = [8, 13, 20, 26, 32, 46, 65, 92];

export function ModelEditor({ name, text, symText, onText, onSymbol: storeSymbol, onPickSymbol, onPickNetlist, onClose }: {
  name: string;
  text: string;
  symText: string;
  onText(text: string): void;
  onSymbol(text: string): void;
  /** el dibujo y los pines de un símbolo existente (su .asy) */
  onPickSymbol?(): void;
  /** el netlist de un componente existente (p. ej. un subcircuito del proyecto) */
  onPickNetlist?(): void;
  onClose(): void;
}) {
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text, name]);
  // se guarda al rato de dejar de escribir (y al salir del cuadro)
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const save = (raw: string) => {
    clearTimeout(timer.current);
    // borrado entero: arranca de nuevo con la línea .subckt (con los pines del símbolo) y su .ends
    let v = raw;
    if (!v.trim()) {
      const sub = symAttr(symText, 'SpiceModel') || name;
      // un nodo por SpiceOrder (el de cada pin con su nombre; los huecos, como el 3 y 4 de OA_Ideal, nK)
      const ps = symPins(symText);
      const ns = Array.from({ length: Math.max(0, ...ps.map((p) => p.order)) }, (_, k) => ps.find((p) => p.order === k + 1)?.name ?? `n${k + 1}`);
      v = `.subckt ${[sub, ...ns].join(' ')}\n\n.ends ${sub}\n`;
      setDraft(v);
    }
    if (v !== text) onText(v);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const info = useMemo(() => modelInfo(draft), [draft]);
  // ancho del dibujo: la mitad al entrar; después, el que se arrastre
  const [symW, setSymW] = useState<number | null>(null);
  useEffect(() => setSymW(null), [name]);
  // SpiceModel sigue al netlist guardado (y ModelFile es el archivo de este módulo)
  useEffect(() => {
    let next = syncModelAttrs(symText, text);
    if (symAttr(next, 'ModelFile') !== modelFileName(name)) next = setSymAttr(next, 'ModelFile', modelFileName(name));
    if (next !== symText) storeSymbol(next);
  }, [text, symText]); // eslint-disable-line react-hooks/exhaustive-deps
  const model = symAttr(symText, 'SpiceModel');
  // los nodos del .subckt que usa el símbolo
  const nodes = useMemo(() => (model ? subcktPins(draft, model) : null) ?? info.pins, [draft, model, info]);
  /** cambia el netlist (y lo guarda ya) */
  const editText = (v: string) => {
    setDraft(v);
    save(v);
  };
  const onSymbol = storeSymbol;
  // «Update pins in .lib»: la línea .subckt (y el cuerpo) con los pines del símbolo
  const pinsLib = model && subcktPins(draft, model) ? libForPins(draft, model, symText) : draft;
  // la alineación de cada rótulo al ocultarlo (el archivo no la guarda), para volver a mostrarlo igual
  const aligns = useRef(new Map<string, string>());
  const toggleAttr = (k: string, on: boolean) => {
    const w = symWindows(symText).find((x) => x.n === ATTR_WINDOW[k]);
    if (!on && w) aligns.current.set(k, w.align);
    onSymbol(setAttrVisible(symText, k, on, aligns.current.get(k)));
  };
  /** SpiceModel escrito a mano: renombra el .subckt (o .model) en el netlist */
  const renameModel = (to: string) => {
    if (!to || to === model) return;
    storeSymbol(setSymAttr(symText, 'SpiceModel', to));
    if (model) editText(renameModelIn(renameSubcktIn(draft, model, to), model, to));
  };
  const pins = useMemo(() => symPins(symText), [symText]);
  const names = pins.map((p) => p.name.toLowerCase());
  const mismatch = pinsMismatch(symText, nodes);
  const newPin = () => {
    let n = pins.length + 1;
    while (names.includes(`p${n}`)) n++;
    onSymbol(addFreePin(symText, `p${n}`, GRID));
  };

  return (
    <div className="model-editor" style={{ '--sym-wc': symW ? `min(${symW}px, 75%)` : '50%' } as React.CSSProperties}>
      <div className="sub-hint model-hint" role="status">
        <strong>{t('Model Editor')}</strong>
        <span className="sub-hint-name">{name}</span>
        <span className="sub-hint-text">{t('write the .subckt or .model on the left and draw its symbol on the right')}</span>
        <button onClick={onClose} title={t('Back to the testbench')}>
          {t('Return')}
        </button>
      </div>
      <section className="model-left">
        <div className="model-label-row">
          <label className="model-label" htmlFor="model-netlist">
            {t('Netlist ({file})', { file: `${name}.lib` })}
          </label>
          {onPickNetlist && (
            <button className="tree-add" onClick={onPickNetlist} title={t('Import the netlist of an existing component (a subcircuit of the project, a TCLib model…): the .subckt, renamed to this model')}>
              {t('Import from existing…')}
            </button>
          )}
        </div>
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
        {info.kind === 'none' && <p className="tree-meta">{t('No .subckt or .model found yet')}</p>}
        {mismatch && (
          <p className="tree-warn">
            {t('The pins of the symbol do not match the nodes of the netlist ({pins}) by SpiceOrder.', { pins: nodes.join(' ') })}{' '}
            <button className="link" onClick={() => storeSymbol(updateModelPins(symText, nodes, GRID))}>
              {t('Update pins in the symbol')}
            </button>
          </p>
        )}
        <details className="model-attrs" open>
          <summary>{t('Symbol attributes')}</summary>
          <table className="model-attr-table">
            <thead>
              <tr>
                <th />
                <th />
                <th>{t('Visible')}</th>
                <th>{t('Size')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {MODEL_ATTRS.map((k) => (
                <tr key={k}>
                  <td>
                    <label htmlFor={`model-attr-${k}`}>{k}</label>
                  </td>
                  <td>
                    <AttrInput id={`model-attr-${k}`} value={symAttr(symText, k)} placeholder={k === 'InstName' ? `${symAttr(symText, 'Prefix') || 'X'}1` : undefined} readOnly={READ_ONLY.has(k)} onCommit={(v) => (k === 'SpiceModel' ? renameModel(v.replace(/\s/g, '')) : onSymbol(setSymAttr(symText, k, v)))} />
                  </td>
                  <td>
                    {ATTR_WINDOW[k] !== undefined && (
                      <input type="checkbox" aria-label={t('Show {attr} on the schematic', { attr: k })} checked={attrVisible(symText, k)} onChange={(e) => toggleAttr(k, e.target.checked)} />
                    )}
                  </td>
                  <td>
                    {attrSize(symText, k) !== undefined && (
                      <select aria-label={t('Text size of {attr}', { attr: k })} value={attrSize(symText, k)} onChange={(e) => onSymbol(setAttrSize(symText, k, Number(e.target.value)))}>
                        {SIZES.map((pt, i) => (
                          <option key={i} value={i}>
                            {pt} pt
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="tree-meta">{ATTR_HELP[k]()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
        <details className="model-attrs" open>
          <summary>
            {t('Pins')}
            <button className="tree-add" onClick={newPin}>
              + {t('Add pin')}
            </button>
          </summary>
          <p className="tree-meta">{t('The name is the node of the .subckt; SpiceOrder is its position in the .subckt line. Drag the pins on the drawing to place them.')}</p>
          {pins.length ? (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('Name (PinName)')}</th>
                  <th>{t('Order (SpiceOrder)')}</th>
                  <th>{t('Align')}</th>
                  <th>{t('Visible')}</th>
                  <th />
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
                    <td>
                      <select
                        aria-label={t('Alignment of the name of pin {n}', { n: i + 1 })}
                        value={p.align === 'NONE' ? pinSide(symText, i) : p.align}
                        disabled={p.align === 'NONE'}
                        onChange={(e) => onSymbol(setPinAlign(symText, i, e.target.value))}
                      >
                        {SIDES.map((s) => (
                          <option key={s} value={s}>
                            {{ LEFT: t('Left'), RIGHT: t('Right'), TOP: t('Top'), BOTTOM: t('Bottom') }[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={t('Show the name of pin {n}', { n: i + 1 })}
                        checked={p.align !== 'NONE'}
                        onChange={(e) => onSymbol(setPinAlign(symText, i, e.target.checked ? pinSide(symText, i) : 'NONE'))}
                      />
                    </td>
                    <td>
                      <button className="icon-x" aria-label={t('Remove {name}', { name: p.name })} onClick={() => onSymbol(removePin(symText, i))}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="tree-meta">{t('No pins yet.')}</p>
          )}
          <button
            className="tree-add model-pins-lib"
            disabled={pinsLib === draft}
            onClick={() => editText(pinsLib)}
            title={pinsLib === draft ? t('The .subckt line already has these pins') : t('Rename the nodes of the .subckt line (and inside the circuit) after the pins, by SpiceOrder')}
          >
            {t('Update pins in .lib')}
          </button>
        </details>
      </section>
      <SymbolEditor
        name={name}
        text={symText}
        ports={info.pins}
        assign={false}
        keepAlign
        onWidth={setSymW}
        onChange={onSymbol}
        params={modelParams(symText)}
        onParams={(ps) => onSymbol(setModelParams(symText, ps))}
        onPickSymbol={onPickSymbol}
      />
    </div>
  );
}

/** Campo que guarda al salir o con Enter */
function AttrInput({ id, label, value, placeholder, readOnly, onCommit }: { id: string; label?: string; value: string; placeholder?: string; readOnly?: boolean; onCommit(v: string): void }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setV(value);
    // un texto largo que llega de afuera se ve desde el principio (se recorta el final)
    if (ref.current && document.activeElement !== ref.current) ref.current.scrollLeft = 0;
  }, [value]);
  const commit = () => v.trim() !== value && onCommit(v.trim());
  return (
    <input
      ref={ref}
      id={id}
      aria-label={label}
      value={v}
      placeholder={placeholder}
      readOnly={readOnly}
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
