// Preferencias de la interfaz que quedan en el navegador: el panel del proyecto (abierto, o a la vista
// al acercar el mouse, #251), la letra del esquemático (#328), el grosor de las trazas y el ancho del
// panel del símbolo
import { useEffect, useState } from 'react';
import { t } from '../i18n/i18n.ts';
import { fontChoice, loadFont } from '../schematic/fonts.ts';
import { setMeasureFont } from '../schematic/geometry.ts';
import { useTraceWidth } from '../waveform/lineWidth.ts';
import { SCH_FONT_KEY } from './constants.ts';
import { lsGet, lsSet } from './storage.ts';

/** `hasSubs`: el proyecto tiene subcircuitos o modelos (sin elección del usuario, el panel se abre) */
export function useLayoutPrefs(hasSubs: boolean, setMessage: (m?: string) => void) {
  // el panel se muestra al acercar el mouse al borde izquierdo (si se tildó, en modo selección)
  const [hoverReveal, setHoverRevealState] = useState(() => lsGet('turbospice.treeHover') === '1');
  // letra del esquemático (#328): una variable de CSS y la que mide los textos
  const [schFont, setSchFontState] = useState(() => fontChoice(lsGet(SCH_FONT_KEY)).id);
  useEffect(() => {
    const c = fontChoice(schFont);
    const apply = () => {
      document.documentElement.style.setProperty('--sch-font', c.css);
      setMeasureFont(c.css);
    };
    loadFont(c).then(apply, () => setMessage(t('Could not load the font «{name}»', { name: c.label })));
  }, [schFont, setMessage]);
  const setSchFont = (id: string) => (lsSet(SCH_FONT_KEY, id), setSchFontState(id));
  const traceW = useTraceWidth();
  const setHoverReveal = (on: boolean) => (lsSet('turbospice.treeHover', on ? '1' : '0'), setHoverRevealState(on));
  const [treePeek, setTreePeek] = useState(false);
  // panel de proyecto: lo que eligió el usuario; si nunca eligió, abierto si hay subcircuitos. Quien
  // entra por primera vez lo ve abierto, como al crear un proyecto nuevo (y así queda)
  const [treePref, setTreePref] = useState<boolean | null>(() => {
    const v = lsGet('turbospice.tree');
    return v === '1' ? true : v === '0' ? false : lsGet('turbospice.welcomed') ? null : true;
  });
  useEffect(() => {
    if (!lsGet('turbospice.welcomed') && lsGet('turbospice.tree') === null) lsSet('turbospice.tree', '1');
    lsSet('turbospice.welcomed', '1');
  }, []);
  const treeOpen = treePref ?? hasSubs;
  // la barra de jerarquía sólo con subcircuitos (o el panel abierto): sin ellos no ocupa lugar
  // ancho del panel del símbolo (se arrastra su borde izquierdo)
  const [symW, setSymWState] = useState(() => {
    try {
      return Number(localStorage.getItem('turbospice.symW')) || 420;
    } catch {
      return 420;
    }
  });
  const setSymW = (w: number) => {
    setSymWState(w);
    try {
      localStorage.setItem('turbospice.symW', String(Math.round(w)));
    } catch {
      /* sin almacenamiento */
    }
  };
  // con «mostrar al acercar el mouse» el panel oculto queda como un borde visible (#251)
  const treeShown = treeOpen || treePeek || hoverReveal;
  return { hoverReveal, setHoverReveal, schFont, setSchFont, traceW, treePeek, setTreePeek, setTreePref, treeOpen, symW, setSymW, treeShown };
}
