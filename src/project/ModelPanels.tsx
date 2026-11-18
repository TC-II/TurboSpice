// Paneles del editor de modelos, uno por paso del flujo después del netlist: los pines (a qué nodo
// va cada uno), los parámetros de cada instancia, los rótulos que se ven en el esquemático y los
// detalles del componente. Muestran el análisis (modelEdit.ts) y cambian el modelo con `apply`.
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { t } from '../i18n/i18n.ts';
import { Icon } from '../ui/icons.tsx';
import {
  addDeclaredParams,
  addMissingPins,
  addPinFor,
  connectPin,
  diagnosticText,
  fixText,
  removePin,
  renamePin,
  setParams,
  setPinLabel,
  type Diagnostic,
  type Fix,
  type ModelAnalysis,
  type ModelState,
} from './modelEdit.ts';
import { ATTR_WINDOW, attrSize, attrVisible, modelFileName, setAttrSize, setAttrVisible, setSymAttr, symAttr } from './modelModule.ts';
import { formatParamList, pinSide, symWindows } from './symbolEdit.ts';

export type Apply = (fn: (s: ModelState) => ModelState) => void;

/** tamaños de letra de LTspice (índice → pt, spec §7.1) */
const SIZES = [8, 13, 20, 26, 32, 46, 65, 92];
const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Campo que guarda al salir o con Enter (Esc vuelve a lo que tenía). `check` da el error, si hay */
export function Field({
  id,
  label,
  value,
  placeholder,
  check,
  mono = true,
  onCommit,
}: {
  id?: string;
  label?: string;
  value: string;
  placeholder?: string;
  check?(v: string): string | null;
  mono?: boolean;
  onCommit(v: string): void;
}) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setV(value);
    // un texto largo que llega de afuera se ve desde el principio
    if (ref.current && document.activeElement !== ref.current) ref.current.scrollLeft = 0;
  }, [value]);
  const err = check?.(v.trim()) ?? null;
  const commit = () => {
    if (err) return setV(value);
    if (v.trim() !== value) onCommit(v.trim());
  };
  return (
    <input
      ref={ref}
      id={id}
      className={`mdl-field${mono ? ' mono' : ''}${err ? ' bad' : ''}`}
      aria-label={label}
      aria-invalid={!!err}
      title={err ?? undefined}
      value={v}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        else if (e.key === 'Escape') {
          e.stopPropagation();
          setV(value);
        }
      }}
    />
  );
}

/** Los problemas de un paso, con su línea (para ir a ella) y su arreglo */
export function ProblemList({ items, onReveal, onFix }: { items: Diagnostic[]; onReveal?(line: number): void; onFix(f: Fix): void }) {
  if (!items.length) return null;
  return (
    <ul className="mdl-problems" aria-label={t('Problems')}>
      {items.map((d, i) => (
        <li key={i} className={d.severity}>
          <Icon name={d.severity === 'error' ? 'close' : 'warning'} size={14} />
          <span className="mdl-problem-text">
            {d.line !== undefined && onReveal && (
              <button type="button" className="link mdl-line" onClick={() => onReveal(d.line!)} title={t('Go to line {line}', { line: d.line })}>
                {t('Line {line}', { line: d.line })}
              </button>
            )}
            {diagnosticText(d)}
          </span>
          {!!d.fixes?.length && (
            <span className="mdl-fixes">
              {d.fixes.map((f, k) => (
                <button key={k} type="button" className="tree-add" onClick={() => onFix(f)}>
                  {fixText(f)}
                </button>
              ))}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

const SIDES = () => [
  ['LEFT', t('Left')],
  ['RIGHT', t('Right')],
  ['TOP', t('Top')],
  ['BOTTOM', t('Bottom')],
  ['NONE', t('Hidden')],
];

/** Paso «Pines»: a qué nodo va cada pin del símbolo, el nombre que muestra y de qué lado */
export function PinsPanel({
  a,
  apply,
  hover,
  setHover,
  selected,
  problems,
}: {
  a: ModelAnalysis;
  apply: Apply;
  hover: number | null;
  setHover(i: number | null): void;
  selected: number[];
  problems: React.ReactNode;
}) {
  const def = a.used;
  return (
    <div className="mdl-panel">
      <p className="mdl-help">
        {def
          ? def.kind === 'subckt'
            ? t('Each pin of the symbol goes to a node of the .subckt line of {name}. Choose it in the list; drag the pins on the drawing to place them.', { name: def.name })
            : t('Each pin of the symbol goes to a terminal of the {type} device. Choose it in the list; drag the pins on the drawing to place them.', { type: def.type ?? '' })
          : t('Write the netlist first: the pins connect to the nodes of its .subckt or to the terminals of its .model.')}
      </p>
      {a.pins.length > 0 && (
        <div className="mdl-table-wrap">
          <table className="mdl-table mdl-pins">
            <thead>
              <tr>
                <th>{t('Pin name')}</th>
                <th>{t('Name side')}</th>
                <th>{def?.kind === 'model' ? t('Terminal') : t('Node')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {a.pins.map((p) => (
                <tr
                  key={p.index}
                  className={[p.problem ? 'bad' : '', hover === p.index || selected.includes(p.index) ? 'hl' : ''].join(' ').trim() || undefined}
                  onPointerEnter={() => setHover(p.index)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(p.index)}
                  onBlur={() => setHover(null)}
                >
                  <td>
                    <Field
                      label={t('Name of pin {n}', { n: p.index + 1 })}
                      value={p.name}
                      check={(v) => (!v ? t('The pin needs a name') : null)}
                      onCommit={(v) => apply((s) => renamePin(s, p.index, v))}
                    />
                  </td>
                  <td>
                    <select
                      aria-label={t('Where the name of pin {n} is shown', { n: p.index + 1 })}
                      value={p.align}
                      onChange={(e) => {
                        const side = e.target.value;
                        apply((s) => setPinLabel(s, p.index, side));
                      }}
                    >
                      {SIDES().map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                      {!SIDES().some(([v]) => v === p.align) && <option value={p.align}>{p.align}</option>}
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label={t('Node of pin {n}', { n: p.index + 1 })}
                      aria-invalid={!!p.problem}
                      disabled={!def}
                      value={p.problem === 'unconnected' ? '' : String(p.node)}
                      onChange={(e) => {
                        const v = e.target.value;
                        apply((s) => connectPin(s, p.index, v === '' ? null : Number(v)));
                      }}
                    >
                      <option value="">{t('— not connected —')}</option>
                      {a.nodes.map((n, i) => (
                        <option key={i} value={i}>
                          {i + 1} · {n}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="icon-x"
                      aria-label={t('Remove pin {name}', { name: p.name })}
                      title={t('Remove pin {name}', { name: p.name })}
                      onClick={() => apply((s) => removePin(s, p.index))}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {def && a.free.length > 0 && (
        <div className="mdl-free">
          <span>{def.kind === 'model' ? t('Terminals without a pin:') : t('Nodes without a pin:')}</span>
          {a.free.map((i) => (
            <button key={i} type="button" className="mdl-chip" onClick={() => apply((s) => addPinFor(s, i))} title={t('Add a pin for {node}', { node: a.nodes[i] })}>
              + {a.nodes[i]}
            </button>
          ))}
          {a.free.length > 1 && (
            <button type="button" className="tree-add" onClick={() => apply(addMissingPins)}>
              {t('Add all')}
            </button>
          )}
        </div>
      )}
      {def && !a.pins.length && !a.free.length && <p className="tree-meta">{t('No pins yet.')}</p>}
      {problems}
      {a.pins.length > 0 && (
        <div className="mdl-row">
          <button type="button" className="tree-add" onClick={() => apply((s) => a.pins.reduce((x, p) => (p.align === 'NONE' ? setPinLabel(x, p.index, pinSide(x.sym, p.index)) : x), s))}>
            {t('Show all the names')}
          </button>
          <button type="button" className="tree-add" onClick={() => apply((s) => a.pins.reduce((x, p) => setPinLabel(x, p.index, 'NONE'), s))}>
            {t('Hide all the names')}
          </button>
        </div>
      )}
    </div>
  );
}

const NAME = /^[A-Za-z_]\w*$/;

/** Paso «Parámetros»: lo que pasa cada instancia, con su valor por defecto (quien lo usa le pone de
 *  `key` los parámetros del símbolo: si cambian desde afuera, la tabla empieza de nuevo) */
export function ParamsPanel({ a, apply, problems }: { a: ModelAnalysis; apply: Apply; problems: React.ReactNode }) {
  const [rows, setRows] = useState<[string, string][]>(a.params);
  const shown = formatParamList(a.params);
  const problem = (k: string, v: string, i: number) =>
    !k.trim() && !v.trim()
      ? null
      : !NAME.test(k.trim())
        ? t('Name: letters, digits and _ (not starting with a digit), without braces')
        : !v.trim()
          ? t('A parameter is saved once it has a default value (e.g. 1k)')
          : rows.findIndex(([x]) => eq(x.trim(), k.trim())) !== i
            ? t('{name} is repeated', { name: k.trim() })
            : null;
  const commit = (rs = rows) => {
    const ok = rs.filter(([k, v], i) => k.trim() && v.trim() && !problem(k, v, i)).map(([k, v]) => [k.trim(), v.trim()] as [string, string]);
    if (formatParamList(ok) !== shown) apply((s) => setParams(s, ok));
  };
  const locked = !!a.freeText;
  const missing = a.declared.filter(([k]) => !a.params.some(([p]) => eq(p, k)));
  return (
    <div className="mdl-panel">
      <p className="mdl-help">
        {a.used?.kind === 'model'
          ? t('Instance parameters of the device (e.g. W and L of a MOSFET, area of a diode): each instance can change them.')
          : t('Parameters that each instance passes to the .subckt, with their default value; each instance can change them. Inside the .subckt they are used between braces: {R}, {2*R}.')}
      </p>
      {locked && <p className="tree-warn">{t('The symbol has text that is not name=value ({text}): edit it in Details › All the attributes.', { text: a.freeText })}</p>}
      {rows.length > 0 && (
        <div className="mdl-table-wrap">
          <table className="mdl-table mdl-params">
            <thead>
              <tr>
                <th>{t('Name')}</th>
                <th>{t('Default value')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(([k, v], i) => {
                const err = problem(k, v, i);
                return (
                  <tr key={i} className={err ? 'bad' : undefined}>
                    <td>
                      <input
                        className="mdl-field mono"
                        value={k}
                        disabled={locked}
                        aria-label={t('Parameter name')}
                        aria-invalid={!!err && !NAME.test(k.trim())}
                        spellCheck={false}
                        onChange={(e) => setRows(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))}
                        onBlur={() => commit()}
                        onKeyDown={(e) => e.key === 'Enter' && commit()}
                      />
                    </td>
                    <td>
                      <input
                        className="mdl-field mono"
                        value={v}
                        disabled={locked}
                        aria-label={t('Default value of {name}', { name: k })}
                        aria-invalid={!!err && NAME.test(k.trim())}
                        title={err ?? undefined}
                        spellCheck={false}
                        onChange={(e) => setRows(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))}
                        onBlur={() => commit()}
                        onKeyDown={(e) => e.key === 'Enter' && commit()}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="icon-x"
                        disabled={locked}
                        aria-label={t('Remove {name}', { name: k })}
                        onClick={() => {
                          const next = rows.filter((_, j) => j !== i);
                          setRows(next);
                          commit(next);
                        }}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.map(([k, v], i) => problem(k, v, i)).find(Boolean) && <p className="tree-warn">{rows.map(([k, v], i) => problem(k, v, i)).find(Boolean)}</p>}
      <div className="mdl-row">
        <button type="button" className="tree-add" disabled={locked} onClick={() => setRows([...rows, ['', '']])}>
          + {t('Add parameter')}
        </button>
      </div>
      {missing.length > 0 && (
        <div className="mdl-free">
          <span>{t('The .subckt also declares (with its default value):')}</span>
          <code>{formatParamList(missing)}</code>
          <button type="button" className="tree-add" disabled={locked} onClick={() => apply(addDeclaredParams)}>
            {missing.length > 1 ? t('Add them') : t('Add it')}
          </button>
        </div>
      )}
      {!rows.length && !missing.length && <p className="tree-meta">{t('None: each instance uses the netlist as it is.')}</p>}
      {problems}
    </div>
  );
}

/** Los rótulos que puede mostrar cada instancia, con el atributo que muestran */
const LABELS: { k: string; label: () => string }[] = [
  { k: 'InstName', label: () => t('Instance name') },
  { k: 'SpiceModel', label: () => t('Model name') },
  { k: 'Value', label: () => t('Parameter 1') },
  { k: 'Value2', label: () => t('Parameter 2') },
  { k: 'SpiceLine', label: () => t('Parameter 3') },
  { k: 'SpiceLine2', label: () => t('Parameters 4 and more') },
];

/** Paso «Rótulos»: qué texto se ve junto a cada instancia y de qué tamaño (se arrastran en el dibujo) */
export function LabelsPanel({ state, apply, aligns }: { state: ModelState; apply: Apply; aligns: MutableRefObject<Map<string, string>> }) {
  const sym = state.sym;
  const own = /^([A-Za-z_]+)\d+$/.exec(symAttr(sym, 'InstName'));
  const text = (k: string) => (k === 'InstName' ? (own?.[0] ?? `${symAttr(sym, 'Prefix').toUpperCase() === 'X' ? 'U' : (symAttr(sym, 'Prefix')[0] ?? 'U')}1`) : symAttr(sym, k));
  const rows = LABELS.filter(({ k }) => k === 'InstName' || k === 'SpiceModel' || symAttr(sym, k));
  const toggle = (k: string, on: boolean) =>
    apply((s) => {
      const w = symWindows(s.sym).find((x) => x.n === ATTR_WINDOW[k]);
      if (!on && w) aligns.current.set(k, w.align);
      return { ...s, sym: setAttrVisible(s.sym, k, on, aligns.current.get(k)) };
    });
  return (
    <div className="mdl-panel">
      <p className="mdl-help">{t('What each instance shows next to the symbol. Drag the labels on the drawing to place them.')}</p>
      <div className="mdl-table-wrap">
        <table className="mdl-table mdl-labels">
          <thead>
            <tr>
              <th>{t('Label')}</th>
              <th>{t('Text')}</th>
              <th>{t('Shown')}</th>
              <th>{t('Size')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ k, label }) => {
              const size = attrSize(sym, k);
              return (
                <tr key={k}>
                  <td>{label()}</td>
                  <td>
                    <code className="mdl-ellipsis" title={text(k)}>
                      {text(k)}
                    </code>
                  </td>
                  <td>
                    <input type="checkbox" aria-label={t('Show {attr} on the schematic', { attr: label() })} checked={attrVisible(sym, k)} onChange={(e) => toggle(k, e.target.checked)} />
                  </td>
                  <td>
                    {size !== undefined && (
                      <select aria-label={t('Text size of {attr}', { attr: label() })} value={size} onChange={(e) => apply((s) => ({ ...s, sym: setAttrSize(s.sym, k, Number(e.target.value)) }))}>
                        {SIZES.map((pt, i) => (
                          <option key={i} value={i}>
                            {pt} pt
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="tree-meta">{t('The names of the pins are shown or hidden in Pins.')}</p>
    </div>
  );
}

/** Atributos que pone el editor (salen del netlist y del módulo): no se escriben a mano */
const AUTOMATIC = new Set(['Prefix', 'SpiceModel', 'ModelFile']);

/** Paso «Detalles»: nombre del componente, cómo se lo ve en el selector y todos los atributos */
export function DetailsPanel({ name, a, state, apply, onRename }: { name: string; a: ModelAnalysis; state: ModelState; apply: Apply; onRename?(to: string): void }) {
  const sym = state.sym;
  const attrs = [...sym.matchAll(/^SYMATTR (\S+) ?(.*)$/gm)].map((m) => [m[1], m[2].trim()] as [string, string]);
  const prefix = symAttr(sym, 'Prefix') || 'X';
  const def = a.used;
  return (
    <div className="mdl-panel">
      <dl className="mdl-dl">
        <dt>{t('Component')}</dt>
        <dd>
          <code>{name}</code>
          {onRename && (
            <button type="button" className="tree-add" onClick={() => onRename(name)}>
              {t('Rename…')}
            </button>
          )}
          {onRename && def && !eq(def.name, name) && (
            <button type="button" className="tree-add" onClick={() => onRename(def.name)} title={t('Rename the component (its file and its symbol) after the .subckt or .model it uses')}>
              {t('Name it {name}', { name: def.name })}
            </button>
          )}
        </dd>
        <dt>
          <label htmlFor="mdl-desc">{t('Description')}</label>
        </dt>
        <dd>
          <Field
            id="mdl-desc"
            mono={false}
            value={symAttr(sym, 'Description')}
            placeholder={t('Text shown in the component picker')}
            onCommit={(v) => apply((s) => ({ ...s, sym: setSymAttr(s.sym, 'Description', v) }))}
          />
        </dd>
        <dt>
          <label htmlFor="mdl-inst">{t('First instance')}</label>
        </dt>
        <dd>
          <Field
            id="mdl-inst"
            value={symAttr(sym, 'InstName')}
            placeholder={`${prefix.toUpperCase() === 'X' ? 'U' : prefix[0].toUpperCase()}1`}
            check={(v) => (v && !/^[A-Za-z_]+\d+$/.test(v) ? t('Letters and a number, e.g. OA1 (the next ones are OA2, OA3…)') : null)}
            onCommit={(v) => apply((s) => ({ ...s, sym: setSymAttr(s.sym, 'InstName', v) }))}
          />
          <span className="tree-meta">{t('empty: numbered automatically')}</span>
        </dd>
        <dt>{t('File')}</dt>
        <dd>
          <code>{modelFileName(name)}</code>
        </dd>
        <dt>{t('Prefix')}</dt>
        <dd>
          <code>{prefix}</code> <span className="tree-meta">{def?.kind === 'model' ? t('the letter of the {type} device', { type: def.type ?? '' }) : t('X: a subcircuit')}</span>
        </dd>
      </dl>
      <details className="mdl-advanced">
        <summary>{t('All the attributes')}</summary>
        <p className="tree-meta">{t('The SYMATTR of the symbol (.asy), as LTspice reads them. Prefix, SpiceModel and ModelFile come from the netlist.')}</p>
        <table className="mdl-table">
          <tbody>
            {attrs.map(([k, v]) => (
              <tr key={k}>
                <th scope="row">
                  <code>{k}</code>
                </th>
                <td>
                  {AUTOMATIC.has(k) ? (
                    <code className="mdl-auto" title={t('Automatic')}>
                      {v}
                    </code>
                  ) : (
                    <Field label={k} value={v} onCommit={(x) => apply((s) => ({ ...s, sym: setSymAttr(s.sym, k, x) }))} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
