// Qué señales se guardan en la simulación del testbench (#314): todo, o sólo las elegidas, con
// búsqueda y atajos por jerarquía. Lo elegido se escribe como ".save V(out) I(R1)…" en el .asc.
import { useMemo, useState } from 'react';
import type { SavableSignal } from '../sim/saves.ts';
import { Modal } from './dialogs.tsx';
import { t } from '../i18n/i18n.ts';

const key = (r: string) => r.toLowerCase();

export function SavesDialog({ initial, signals, onApply, onClose }: {
  /** lo elegido (null: se guarda todo) */
  initial: string[] | null;
  /** las señales del circuito; undefined mientras se arma la netlist */
  signals: SavableSignal[] | undefined;
  onApply(refs: string[] | null): void;
  onClose(): void;
}) {
  const [mode, setMode] = useState<'all' | 'some'>(initial ? 'some' : 'all');
  // por defecto, las tensiones del nivel superior
  const [chosen, setChosen] = useState<Set<string> | null>(initial ? new Set(initial.map(key)) : null);
  const [query, setQuery] = useState('');
  const sel = useMemo(() => chosen ?? new Set((signals ?? []).filter((s) => !s.group && s.kind === 'voltage').map((s) => key(s.ref))), [chosen, signals]);
  const groups = useMemo(() => {
    const m = new Map<string, SavableSignal[]>();
    const q = query.trim().toLowerCase();
    for (const s of signals ?? []) {
      if (q && !s.ref.toLowerCase().includes(q)) continue;
      m.set(s.group, [...(m.get(s.group) ?? []), s]);
    }
    return [...m];
  }, [signals, query]);
  const set = (refs: SavableSignal[], on: boolean) => {
    const next = new Set(sel);
    for (const s of refs) (on ? next.add(key(s.ref)) : next.delete(key(s.ref)));
    setChosen(next);
  };
  const all = signals ?? [];
  // lo elegido que no está en la lista (escrito a mano en el .save) se conserva
  const extra = (initial ?? []).filter((r) => !all.some((s) => key(s.ref) === key(r)));
  const refs = [...all.filter((s) => sel.has(key(s.ref))).map((s) => s.ref), ...extra.filter((r) => sel.has(key(r)))];
  const shortcut = (label: string, list: SavableSignal[], on: boolean) => (
    <button type="button" className="link" disabled={!list.length} onClick={() => set(list, on)}>
      {label}
    </button>
  );

  return (
    <Modal title={t('Saved signals')} onClose={onClose} wide>
      <div className="savesdlg">
        <div className="saves-mode" role="radiogroup" aria-label={t('Save')}>
          <label className="check">
            <input type="radio" checked={mode === 'all'} onChange={() => setMode('all')} /> {t('Everything: every net voltage and every device current')}
          </label>
          <label className="check">
            <input type="radio" checked={mode === 'some'} onChange={() => setMode('some')} /> {t('Only the selected signals')}
          </label>
        </div>
        {mode === 'some' && (
          <>
            <p className="hint">{t('What the plots, the .meas and the Studio use is always saved too. Digital nodes (also inside Verilog blocks) are always saved.')}</p>
            <div className="saves-tools">
              <input type="search" placeholder={t('Search')} aria-label={t('Search')} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
              {shortcut(t('Top-level voltages'), all.filter((s) => !s.group && s.kind === 'voltage'), true)}
              {shortcut(t('All currents'), all.filter((s) => s.kind === 'current'), true)}
              {shortcut(t('Nothing from subcircuits'), all.filter((s) => s.group), false)}
              {shortcut(t('None'), all, false)}
              <span className="hint">{t('{n} selected', { n: refs.length })}</span>
            </div>
            <div className="saves-list">
              {!signals && <p className="hint">{t('Reading the circuit…')}</p>}
              {groups.map(([g, list]) => (
                <fieldset key={g} className="saves-group">
                  <legend>
                    {g || t('Top level')}{' '}
                    {shortcut(t('all'), list, true)} · {shortcut(t('none'), list, false)}
                  </legend>
                  {list.map((s) => (
                    <label key={s.ref} className="check">
                      <input type="checkbox" checked={sel.has(key(s.ref))} onChange={(e) => set([s], e.target.checked)} /> <code>{s.ref}</code>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="buttons">
        <button type="button" onClick={onClose}>{t('Cancel')}</button>
        <button type="button" className="primary" disabled={mode === 'some' && (!signals || !refs.length)} onClick={() => onApply(mode === 'all' ? null : refs)}>
          {t('OK')}
        </button>
      </div>
    </Modal>
  );
}
