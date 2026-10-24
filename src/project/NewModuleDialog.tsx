import { useState } from 'react';
import { t } from '../i18n/i18n.ts';
import { Modal } from '../schematic/dialogs.tsx';

export type ModuleKind = 'schematic' | 'verilog';

/** Palabras reservadas de Verilog que no pueden ser el nombre de un módulo */
const RESERVED = new Set('module endmodule input output inout wire reg logic always assign begin end if else case endcase for while initial parameter localparam function task posedge negedge integer genvar generate'.split(' '));

/**
 * Módulo nuevo del proyecto (#180, #209): un subcircuito esquemático (.asc) o un módulo Verilog
 * (.v); los dos con su símbolo y se colocan, se bajan y se editan igual.
 */
export function NewModuleDialog({ initial, check, onOk, onClose }: {
  initial: string;
  /** error del nombre (vacío si sirve) */
  check(name: string): string | null;
  onOk(name: string, kind: ModuleKind): void;
  onClose(): void;
}) {
  const [name, setName] = useState(initial);
  const [kind, setKind] = useState<ModuleKind>('schematic');
  const n = name.trim();
  const error = check(n) ?? (kind === 'verilog' && (!/^[A-Za-z_]\w*$/.test(n) || RESERVED.has(n)) ? t('Invalid Verilog module name: letters, digits and _') : null);
  const ok = () => !error && n && onOk(n, kind);
  return (
    <Modal title={t('New module')} onClose={onClose}>
      <div className="textdlg new-module">
        <div className="seg" role="radiogroup" aria-label={t('Kind of module')}>
          <label>
            <input type="radio" name="kind" checked={kind === 'schematic'} onChange={() => setKind('schematic')} /> {t('Schematic')}
          </label>
          <label>
            <input type="radio" name="kind" checked={kind === 'verilog'} onChange={() => setKind('verilog')} /> Verilog
          </label>
        </div>
        <p className="hint">
          {kind === 'schematic'
            ? t('A circuit drawn with components, with ports as pins (net labels with a port).')
            : t('A digital block written in Verilog: it is synthesized with Yosys and simulated with XSPICE. Its pins are the ports of the module.')}
        </p>
        <label className="row">
          {t('Name')}{' '}
          <input value={name} autoFocus spellCheck={false} aria-label={t('Name')} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} />
        </label>
        {error && n && <p className="err">{error}</p>}
        <div className="buttons">
          <button type="button" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="button" className="primary" disabled={!!error || !n} onClick={ok}>
            {t('Create')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
