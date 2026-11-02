// Lo que el modo esquemático pone en la barra de la app: tema, idioma y compartir (arriba a la
// derecha) y las vistas, esquemático y resultados, con su disposición (#38, #55)
import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getLang, t } from '../i18n/i18n.ts';
import { Icon } from '../ui/icons.tsx';
import type { Expanded } from '../ui/ResultsSplitter.tsx';
import type { Theme } from './storage.ts';

export function AppBarRight({ slot, theme, setTheme, switchLang, exporting, doShare }: {
  slot: HTMLElement;
  theme: Theme;
  setTheme(tt: Theme): void;
  switchLang(): void;
  exporting: boolean;
  doShare(): void;
}) {
  return createPortal(
    <>
      <button
        className="theme-btn"
        aria-label={t('Change theme')}
        title={t('Theme: {p0}', { p0: theme === 'auto' ? t('automatic (system)') : theme === 'light' ? t('light') : t('dark') })}
        onClick={() => setTheme(theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto')}
      >
        <Icon name={theme === 'dark' ? 'moon' : 'sun'} />
        {theme === 'auto' && <span className="auto">A</span>}
      </button>
      <button
        className="lang-btn"
        aria-label={t('Change language')}
        title={t('Language: English · Spanish (the page reloads; your work is kept)')}
        onClick={switchLang}
      >
        <span className={getLang() === 'en' ? 'on' : ''}>EN</span>
        <span className={getLang() === 'es' ? 'on' : ''}>ES</span>
      </button>
      {!exporting && <button className="share-btn" aria-label={t('Share')} title={t('Copy a link that opens this circuit')} onClick={doShare}>
        <Icon name="share" />
        <span className="txt">{t('Share')}</span>
      </button>}
    </>,
    slot,
  );
}

export function ViewTabs({ slot, hasSim, schematicShown, resultsShown, setExpanded, resultsSide, setSide }: {
  slot: HTMLElement;
  /** hay resultados */
  hasSim: boolean;
  schematicShown: boolean;
  resultsShown: boolean;
  setExpanded(e: Expanded): void;
  resultsSide: boolean;
  setSide(side: boolean): void;
}) {
  // las vistas arrancan donde termina el panel del proyecto (--tree-w), si hay lugar
  const viewTabs = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const align = () => {
      const nav = viewTabs.current;
      const first = nav?.firstElementChild;
      if (!nav || !first) return;
      nav.style.marginLeft = '';
      // en pantallas angostas la barra se reacomoda: correrlas la haría desbordar
      if (matchMedia('(max-width: 700px)').matches) return;
      const treeW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tree-w'));
      const gap = parseFloat(getComputedStyle(nav).columnGap) || 0;
      const shift = treeW - (first.getBoundingClientRect().right + gap / 2);
      if (shift > 0) nav.style.marginLeft = `${shift}px`;
    };
    align();
    document.fonts?.ready.then(align);
    addEventListener('resize', align);
    return () => removeEventListener('resize', align);
  });
  // Botones de vista (#55): el botón entero hace lo mismo. Si la vista no está, se agrega en
  // pantalla partida; si ya están las dos, la cruz la cierra; si es la única, no hace nada
  const viewsBoth = schematicShown && resultsShown;
  const showSchematicView = () => {
    if (!hasSim) return;
    if (!schematicShown) setExpanded('');
    else if (resultsShown) setExpanded('results');
  };
  const showResultsView = () => {
    if (!hasSim) return;
    if (!resultsShown) setExpanded('');
    else if (schematicShown) setExpanded('schematic');
  };
  const viewCls = (shown: boolean) => [shown && 'active', shown && !viewsBoth && 'alone'].filter(Boolean).join(' ');
  // segmento de la derecha del botón: cruz si la vista se ve, flechita si no. Siempre está (con
  // el mismo ancho) para que el botón no cambie de tamaño al presionarlo
  const viewAct = (shown: boolean, enabled: boolean) => {
    const on = enabled && !(shown && !viewsBoth);
    return <span className={on ? 'view-act' : 'view-act idle'} aria-hidden="true">{on && <Icon name={shown ? 'close' : 'caret'} size={12} />}</span>;
  };
  return createPortal(
    <>
      {/* vistas: con las dos prendidas, pantalla partida */}
      <nav className="tabs view-tabs" aria-label={t('Views')} ref={viewTabs}>
        <button className={viewCls(schematicShown)} aria-pressed={schematicShown} onClick={showSchematicView} title={!hasSim ? t('Schematic') : viewsBoth ? t('Close the schematic (the results stay full screen)') : schematicShown ? t('Schematic') : t('Add the schematic in split screen (Ctrl+0)')}>
          {t('Schematic')}
          {viewAct(schematicShown, true)}
        </button>
        <button
          className={viewCls(resultsShown)}
          aria-pressed={resultsShown}
          disabled={!hasSim}
          onClick={showResultsView}
          title={!hasSim ? t('No results yet: simulate first') : viewsBoth ? t('Close the results (the schematic stays full screen)') : resultsShown ? t('Results') : t('Add the results in split screen (Ctrl+0)')}
        >
          {t('Results')}
          {viewAct(resultsShown, hasSim)}
        </button>
      </nav>
      <div className="layout-btns" role="group" aria-label={t('Results layout')}>
        <button className={resultsSide ? 'active' : ''} aria-pressed={resultsSide} aria-label={t('Results on the side')} title={t('Results on the side')} onClick={() => setSide(true)}>
          <Icon name="layoutSide" size={16} />
        </button>
        <button className={!resultsSide ? 'active' : ''} aria-pressed={!resultsSide} aria-label={t('Results below')} title={t('Results below')} onClick={() => setSide(false)}>
          <Icon name="layoutStack" size={16} />
        </button>
      </div>
    </>,
    slot,
  );
}
