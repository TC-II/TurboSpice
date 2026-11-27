import { useMemo, useState } from 'react';
import { t } from '../i18n/i18n.ts';
import type { Curve } from '../waveform/curves.ts';
import { DigitalLanes } from '../waveform/DigitalLanes.tsx';
import { RADIXES, radixLabel, type Radix } from '../waveform/digital.ts';
import { parseVcd } from '../waveform/vcd.ts';
import { palette, type Cursors } from '../waveform/view.ts';

type Range = [number, number];

/**
 * Las señales del .vcd de un testbench ($dumpvars), como en un panel digital: las del testbench,
 * o también las de los módulos de adentro
 */
export function TbWaves({ vcd, states }: { vcd: string; states?: Map<string, Map<number, string>> }) {
  const data = useMemo(() => parseVcd(vcd), [vcd]);
  const [radix, setRadix] = useState<Radix>('hex');
  const [inner, setInner] = useState(false);
  const [xRange, setXRange] = useState<Range | null>(null);
  const [cursors, setCursors] = useState<Cursors>({});
  const curves = useMemo(() => {
    const colors = palette();
    return data.signals
      .filter((s) => inner || s.scope.length === 1)
      .map(
        (s, i): Curve => ({
          // (las de adentro, con su instancia: dut.q)
          label: [...s.scope.slice(1), s.name].join('.'),
          trace: i,
          run: 0,
          color: colors[i % colors.length],
          dash: false,
          axis: 'y',
          x: s.x,
          y: s.y,
          hidden: false,
          digital: true,
          bits: s.bits,
          ...(s.bits > 1 && states?.has(s.name) ? { states: states.get(s.name) } : {}),
        }),
      );
  }, [data, inner, states]);
  const x = useMemo(() => Float64Array.of(0, data.end), [data]);
  if (!data.signals.length) return null;
  return (
    <section className="vm-waves">
      <div className="vm-waves-bar">
        <h4>{t('Waveforms ($dumpvars)')}</h4>
        <select value={radix} aria-label={t('Bus radix')} onChange={(e) => setRadix(e.target.value as Radix)}>
          {RADIXES.map((r) => (
            <option key={r} value={r}>
              {radixLabel[r]}
            </option>
          ))}
        </select>
        <label>
          <input type="checkbox" checked={inner} onChange={(e) => setInner(e.target.checked)} /> {t('Inner modules')}
        </label>
      </div>
      <DigitalLanes
        x={x}
        curves={curves}
        radix={() => radix}
        xRange={xRange}
        cursors={cursors}
        cursorMode={false}
        onCursor={(c) => setCursors((old) => ({ ...old, ...c }))}
        onZoom={setXRange}
        onWheelZoom={setXRange}
        onHover={() => {}}
      />
    </section>
  );
}
