// La barra de estado bajo el esquemático, con lo que dice del mouse o de la herramienta y las
// preguntas pendientes: la corrida vieja que se mira, aplicar un valor en otros testbenches y la
// vista guardada en el navegador
import type { MutableRefObject } from 'react';
import { locale, t } from '../i18n/i18n.ts';
import type { Connectivity } from '../netlist/connectivity.ts';
import type { ValueChange } from '../project/project.ts';
import { hoverCoords, hoverInfo } from '../schematic/hoverInfo.ts';
import type { PlotView } from '../waveform/view.ts';
import { HintBar, toolHint, type Hover } from './HintBar.tsx';
import { useSchematic } from './context.ts';

export interface StatusBarProps {
  hoverSink: MutableRefObject<((h: Hover) => void) | undefined>;
  savesPicking: boolean;
  conn: Connectivity;
  message: string | undefined;
  /** la corrida vieja que se está mirando */
  viewed: { id: string; time: number } | undefined;
  restoreRun(id: string): void;
  setViewRun(id: string): void;
  valueOffer: { changes: ValueChange[]; sims: string[] } | null;
  applyValueOffer(): void;
  setValueOffer(v: null): void;
  /** se está eligiendo en el esquemático */
  picking: boolean;
  offerView: PlotView | null;
  fileName: string;
  acceptOfferedView(): void;
  setOfferView(v: null): void;
}

export function StatusBar({ hoverSink, savesPicking, conn, message, viewed, restoreRun, setViewRun, valueOffer, applyValueOffer, setValueOffer, picking, offerView, fileName, acceptOfferedView, setOfferView }: StatusBarProps) {
  const { tool, doc, lib, setMessage } = useSchematic();
  return (
    <>
    {/* los avisos y estados van todos en la barra de abajo, a la derecha (#342): también las
        preguntas (aplicar un valor en las otras simulaciones, agregar una vista guardada) y
        la corrida vieja que se está mirando. Elegir en el esquemático no pone cartel: la
        barra dice qué clickear (Esc cancela) */}
    <HintBar
      sink={hoverSink}
      text={(hover) => (savesPicking ? t('Click a wire (voltage) or a component (current) to save it, or again to stop saving it') : tool.kind === 'select' ? (hover?.ref ? hoverInfo(doc, lib, conn, hover.ref).join(' · ') : hover ? hoverCoords(hover.at) : '') : toolHint(tool))}
      message={message}
      onDismiss={() => setMessage(undefined)}
      offers={
        <>
          {viewed && (
            <span className="status-offer history">
              {t('Run from')}{' '}{new Date(viewed.time).toLocaleString(locale())} {t('· read-only')}
              <button onClick={() => restoreRun(viewed.id)}>{t('Restore')}</button>
              <button onClick={() => setViewRun('')}>{t('Back to current')}</button>
            </span>
          )}
          {valueOffer && !picking && (
            <span className="status-offer">
              {valueOffer.changes.map((c) => `${c.inst} = ${c.from}`).join(', ')} {t('also in')}{' '}
              {valueOffer.sims.length === 1 ? t('1 simulation') : t('{length} simulations', { length: valueOffer.sims.length })}
              <button onClick={applyValueOffer} title={t('Change to {p0} in the other simulations', { p0: valueOffer.changes.map((c) => `${c.inst} = ${c.to}`).join(', ') })}>
                {t('Apply')}
              </button>
              <button onClick={() => setValueOffer(null)}>No</button>
            </span>
          )}
          {offerView && !picking && (
            <span className="status-offer">
              {t('There\'s a results view of')}{' '}{fileName} {t('saved in this browser. Add it to the .asc?')}
              <button onClick={acceptOfferedView}>{t('Add')}</button>
              <button onClick={() => setOfferView(null)}>No</button>
            </span>
          )}
        </>
      }
    />
    </>
  );
}
