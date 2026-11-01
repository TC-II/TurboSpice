// Qué señales se guardan en la simulación del testbench (#314), en un panel a la derecha (#364):
// todo, o sólo las elegidas, con búsqueda y atajos por jerarquía. Se eligen acá o con la punta de
// prueba en el esquemático (un cable, su tensión; un componente, su corriente), y cada fila bajo el
// mouse resalta su red o su componente (y al revés). Lo elegido se escribe al momento como
// ".save V(out) I(R1)…" en el .asc.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SavableSignal } from '../sim/saves.ts';
import { rowDevice } from '../waveform/ScalarViews.tsx';
import { Icon } from '../ui/icons.tsx';
import { t } from '../i18n/i18n.ts';

const key = (r: string) => r.toLowerCase();

export function SavesPanel({ selection, mode, onMode, signals, max, onChange, hover, onHoverRow, picking, onPicking, blocked, onClose }: {
  /** lo elegido, tal como está en el esquemático (null: se guarda todo) */
  selection: string[] | null;
  /** «sólo lo elegido» sigue elegido aunque todavía no se haya marcado nada */
  mode: 'all' | 'some';
  onMode(m: 'all' | 'some'): void;
  /** las señales del circuito; undefined mientras se arma la netlist */
  signals: SavableSignal[] | undefined;
  /** cuántas entran en memoria, según la última simulación que se cortó por tamaño */
  max?: number;
  onChange(refs: string[] | null): void;
  /** lo que está bajo el mouse en el esquemático: sus referencias, o su componente */
  hover: { refs: string[]; device?: string };
  onHoverRow(ref: string | null): void;
  /** la punta de prueba elige señales en el esquemático */
  picking: boolean;
  onPicking(on: boolean): void;
  /** por qué no se puede elegir ahora (adentro de un subcircuito) */
  blocked?: string;
  onClose(): void;
}) {
  const some = !!selection || mode === 'some';
  const sel = useMemo(() => new Set((selection ?? []).map(key)), [selection]);
  const all = useMemo(() => signals ?? [], [signals]);
  // lo elegido que no está en la lista (escrito a mano en el .save) se muestra aparte
  const extra = useMemo(() => (selection ?? []).filter((r) => !all.some((s) => key(s.ref) === key(r))), [selection, all]);
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const m = new Map<string, SavableSignal[]>();
    const qq = q.trim().toLowerCase();
    for (const s of all) {
      if (qq && !s.ref.toLowerCase().includes(qq)) continue;
      m.set(s.group, [...(m.get(s.group) ?? []), s]);
    }
    return [...m];
  }, [all, q]);
  const set = (refs: string[], on: boolean) => {
    const cur = selection ?? [];
    const next = on ? [...cur, ...refs.filter((r) => !sel.has(key(r)))] : cur.filter((r) => !refs.some((x) => key(x) === key(r)));
    onChange(next);
  };
  const hot = useMemo(() => new Set(hover.refs.map(key)), [hover.refs]);
  const isHot = (ref: string) => hot.has(key(ref)) || (!!hover.device && rowDevice(ref) === hover.device.toUpperCase());
  // la fila de lo que está bajo el mouse en el esquemático, a la vista
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector('.saves-row.hl')?.scrollIntoView({ block: 'nearest' });
  }, [hover]);
  const n = selection?.length ?? 0;
  const over = max !== undefined && n > max;
  const shortcut = (label: string, refs: SavableSignal[], on: boolean) => (
    <button type="button" className="link" disabled={!refs.length} onClick={() => set(refs.map((s) => s.ref), on)}>
      {label}
    </button>
  );
  const row = (ref: string) => (
    <label key={ref} className={`check saves-row${isHot(ref) ? ' hl' : ''}`} data-ref={ref} onMouseEnter={() => onHoverRow(ref)} onMouseLeave={() => onHoverRow(null)}>
      <input type="checkbox" checked={sel.has(key(ref))} onChange={(e) => set([ref], e.target.checked)} /> <code>{ref}</code>
    </label>
  );

  return (
    <aside className="saves-panel" aria-label={t('Saved signals')}>
      <header>
        <span className="saves-title">{t('Saved signals')}</span>
        <button className="close" onClick={onClose} aria-label={t('Close the saved signals')} title={t('Close the saved signals')}>
          <Icon name="close" size={14} />
        </button>
      </header>
      <div className="saves-body">
        {blocked && <p className="hint">{blocked}</p>}
        {!blocked && (
        <div className="saves-mode" role="radiogroup" aria-label={t('Save')}>
          <label className="check">
            <input type="radio" checked={!some} onChange={() => (onMode('all'), onChange(null))} /> {t('Everything: every net voltage and every device current')}
          </label>
          <label className="check">
            <input type="radio" checked={some} onChange={() => onMode('some')} /> {t('Only the selected signals')}
          </label>
        </div>
        )}
        {some && !blocked && (
          <>
            <button type="button" className={`saves-pick${picking ? ' active' : ''}`} aria-pressed={picking} onClick={() => onPicking(!picking)}>
              <Icon name="probe" size={16} /> {picking ? t('Picking on the schematic') : t('Pick on the schematic')}
            </button>
            <p className="hint">
              {picking
                ? t('Click a wire for its voltage or a component for its current; click again to unselect.')
                : t('With the probe, click a wire for its voltage or a component for its current.')}
            </p>
            <p className="hint">{t('What the plots, the .meas and the Studio use is always saved too. The unnamed internal nodes of Verilog blocks are never saved.')}</p>
            {max !== undefined && (
              <p className="hint saves-max">
                {max >= 1
                  ? t('The last simulation didn\'t fit in memory: at its pace, up to {max} signals fit (the plotted ones count too).', { max })
                  : t('The last simulation didn\'t fit in memory even with one signal: save only the end with «Save from».')}
              </p>
            )}
            <div className="saves-tools">
              <input type="search" placeholder={t('Search')} aria-label={t('Search')} value={q} onChange={(e) => setQ(e.target.value)} />
              {shortcut(t('Top-level voltages'), all.filter((s) => !s.group && s.kind === 'voltage'), true)}
              {shortcut(t('All currents'), all.filter((s) => s.kind === 'current'), true)}
              {shortcut(t('Digital signals between blocks'), all.filter((s) => !s.group && s.kind === 'digital'), true)}
              {shortcut(t('Nothing from subcircuits'), all.filter((s) => s.group), false)}
              <button type="button" className="link" disabled={!n} onClick={() => onChange([])}>
                {t('None')}
              </button>
            </div>
            <p className={over ? 'hint saves-count saves-over' : 'hint saves-count'} role="status">
              {max !== undefined ? t('{n} selected of at most {max}', { n, max }) : t('{n} selected', { n })}
              {over && ` — ${t('too many: the simulation will stop again')}`}
            </p>
            {!n && <p className="hint">{t('Nothing selected yet: until you choose, everything is saved.')}</p>}
            <div className="saves-list" ref={list}>
              {!signals && <p className="hint">{t('Reading the circuit…')}</p>}
              {groups.map(([g, refs]) => (
                <fieldset key={g} className="saves-group">
                  <legend>
                    {g || t('Top level')}{' '}
                    {shortcut(t('all'), refs, true)} · {shortcut(t('none'), refs, false)}
                  </legend>
                  {refs.map((s) => row(s.ref))}
                </fieldset>
              ))}
              {extra.length > 0 && (
                <fieldset className="saves-group">
                  <legend>{t('Written in the .save')}</legend>
                  {extra.map(row)}
                </fieldset>
              )}
            </div>
          </>
        )}
        <p className="hint">{t('The changes go to the schematic as a .save: simulate again (Alt+R) to use them.')}</p>
      </div>
    </aside>
  );
}
