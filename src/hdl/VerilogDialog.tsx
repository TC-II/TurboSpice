import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/i18n.ts';
import { Modal } from '../schematic/dialogs.tsx';
import type { SynthResult } from './yosys.ts';

/** Verilog para un archivo nuevo */
export const verilogTemplate = (module: string) => `// ${t('Synthesizable Verilog: inputs on the left of the symbol, outputs on the right.')}
// ${t('Instance parameters: vcc (supply and logic levels) and tpd (delay of each gate).')}
module ${module} (
  input clk,
  input rst,
  output reg [3:0] q
);
  always @(posedge clk or posedge rst)
    if (rst) q <= 0;
    else q <= q + 1;
endmodule
`;

/**
 * Editor de un archivo Verilog del proyecto (#209). «Sintetizar» corre Yosys y muestra los pines
 * o el error; «Guardar» sintetiza y, si anda, guarda el .v con su .sub y su .asy.
 */
export function VerilogDialog({ name: initialName, initial, isNew, taken, synth, onSave, onClose }: {
  name: string;
  initial: string;
  /** archivo nuevo: se puede elegir el nombre */
  isNew: boolean;
  /** nombres de archivo ya usados en el proyecto */
  taken: string[];
  synth(name: string, text: string): Promise<SynthResult>;
  onSave(name: string, text: string, result: SynthResult): void;
  onClose(): void;
}) {
  const [name, setName] = useState(initialName);
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SynthResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ta.current?.focus(), []);

  const fileName = /\.s?v$/i.test(name.trim()) ? name.trim() : `${name.trim()}.v`;
  const nameError = !name.trim()
    ? t('Missing the file name')
    : isNew && taken.some((x) => x.toLowerCase() === fileName.toLowerCase())
      ? t('There\'s already a file {name} in the project', { name: fileName })
      : null;

  const run = async (save: boolean) => {
    if (busy || nameError) return;
    setBusy(true);
    setFailure(null);
    try {
      const r = await synth(fileName, text);
      setResult(r);
      if (save && r.block) onSave(fileName, text, r);
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t('Verilog «{name}»', { name: fileName })} onClose={onClose} wide>
      <div className="textdlg verilogdlg">
        {isNew && (
          <label className="row">
            {t('File')}{' '}
            <input value={name} onChange={(e) => setName(e.target.value)} aria-label={t('File name')} spellCheck={false} />
          </label>
        )}
        <textarea
          ref={ta}
          rows={18}
          spellCheck={false}
          value={text}
          aria-label={t('Verilog code')}
          onChange={(e) => {
            setText(e.target.value);
            setResult(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run(true);
          }}
        />
        <p className="hint">
          {t('Synthesizable subset (Yosys): no # delays, initial blocks only to set a reg\'s initial value, no testbenches. The first time, Yosys (~15 MB) is downloaded.')}
        </p>
        {busy && <p className="hint">{t('Synthesizing…')}</p>}
        {nameError && <p className="err">{nameError}</p>}
        {failure && <p className="err">{t('Yosys could not run: {msg}', { msg: failure })}</p>}
        {result?.error && <p className="err">{result.error}</p>}
        {result?.block && (
          <p className="ok">
            {t('Module {name}: inputs {ins}; outputs {outs}', { name: result.block.name, ins: result.block.inputs.join(' ') || '—', outs: result.block.outputs.join(' ') })}
          </p>
        )}
        {result?.block?.warnings.map((w) => <p key={w} className="hint">{w}</p>)}
        {result?.log.trim() && (
          <details>
            <summary>{t('Yosys output')}</summary>
            <pre className="log">{result.log}</pre>
          </details>
        )}
        <div className="buttons">
          <button type="button" onClick={onClose}>{t('Cancel')}</button>
          <button type="button" onClick={() => run(false)} disabled={busy || !!nameError}>{t('Synthesize')}</button>
          <button type="button" className="primary" onClick={() => run(true)} disabled={busy || !!nameError} title={t('Synthesizes and saves the .v, its .sub and its symbol in the project (Ctrl+Enter)')}>
            {t('Save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
