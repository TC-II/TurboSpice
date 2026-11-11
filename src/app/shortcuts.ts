// Atajos de teclado del modo esquemático: los del esquemático, los del visor de formas de onda y los de los dos
import { useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import type { DrawnShapeKind } from '../asc/model.ts';
import { t } from '../i18n/i18n.ts';
import type { ItemRef } from '../schematic/geometry.ts';
import type { EditorHandle, Tool } from '../schematic/SchematicEditor.tsx';
import type { PlotAction, PlotPanelHandle } from '../waveform/PlotPanel.tsx';
import { isTyping } from './helpers.ts';
import type { Dialog } from './types.ts';

type Toggle = Dispatch<SetStateAction<boolean>>;

/** Lo que usan los atajos: el estado de este render y las acciones */
export interface ShortcutActions {
  dialog: Dialog | null;
  history: { undo(): void; redo(): void };
  status: { kind: string };
  running: boolean;
  selection: ItemRef[];
  allRuns: unknown[];
  hasNets: boolean;
  area: MutableRefObject<'schematic' | 'viewer'>;
  editor: RefObject<EditorHandle>;
  plotPanel: RefObject<PlotPanelHandle>;
  pltInput: RefObject<HTMLInputElement>;
  /** las teclas van al visor de formas de onda (el mouse está ahí y muestra un gráfico) */
  viewerKeys(): boolean;
  simulate(): void;
  abort(): void;
  showLog(): void;
  doSave(saveAs: boolean): void;
  doOpen(): void;
  setQuickOpen(open: boolean): void;
  goUp(): void;
  reapplyView(): void;
  undoPanes(redo?: boolean): void;
  setDialog(d: Dialog | null): void;
  setMessage(m?: string): void;
  rotateOrMirror(op: 'rotate' | 'mirror'): void;
  copySelection(cut?: boolean): void;
  /** `data`: lo que trae el evento paste del navegador (sin pedir permiso); sin él, se lee el portapapeles */
  paste(data?: DataTransfer | null): void;
  setTool(tt: Tool): void;
  selectAll(): void;
  setSelection(s: ItemRef[]): void;
  setShowGrid: Toggle;
  setShowLoose: Toggle;
  setShowNets: Toggle;
  setNetHover: Toggle;
  openControl(): void;
  openStudy(): void;
  openSimulation(): void;
  zoomBox(): void;
  descend(si: number): boolean;
  startMove(stretch: boolean): void;
  shapeTool(shape: DrawnShapeKind): () => void;
  /** F: lápiz; Shift+F: goma; estando en ese modo, vuelve a seleccionar */
  pencilTool(eraser?: boolean): void;
  deleteSelection(): void;
}

/** Instala los atajos; se vuelven a instalar en cada render, con las acciones de ese render */
export function useShortcuts(a: ShortcutActions) {
  const {
    dialog,
    history,
    status,
    running,
    selection,
    allRuns,
    hasNets,
    area,
    editor,
    plotPanel,
    pltInput,
    viewerKeys,
    simulate,
    abort,
    showLog,
    doSave,
    doOpen,
    setQuickOpen,
    goUp,
    reapplyView,
    undoPanes,
  } = a;
  const {
    setDialog,
    setMessage,
    rotateOrMirror,
    copySelection,
    paste,
    setTool,
    selectAll,
    setSelection,
    setShowGrid,
    setShowLoose,
    setShowNets,
    setNetHover,
    openControl,
    openStudy,
    openSimulation,
    zoomBox,
    descend,
    startMove,
    shapeTool,
    pencilTool,
    deleteSelection,
  } = a;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog || isTyping(e)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key;
      // letra sin importar Shift/Bloq Mayús (Shift se mira aparte)
      const lk = k.length === 1 ? k.toLowerCase() : k;
      const handled = () => e.preventDefault();
      // en los dos contextos
      if (e.altKey && lk === 'r') return handled(), !running && status.kind !== 'loading' && simulate();
      if (e.altKey && lk === 's') return handled(), running && abort();
      if (ctrl && lk === 'l') return handled(), showLog();
      if (ctrl && k === 'Enter') return handled(), !running && status.kind !== 'loading' && simulate();
      if (ctrl && lk === 's') return handled(), doSave(e.shiftKey);
      if (ctrl && lk === 'o') return handled(), doOpen();
      if (ctrl && lk === 'p') return handled(), setQuickOpen(true);
      if (e.altKey && k === 'ArrowUp') return handled(), goUp();
      if (k === ' ' && !e.altKey) {
        // Espacio tocado = ajustar (al soltarlo); mantenido + arrastrar desplaza
        handled();
        if (ctrl && viewerKeys()) reapplyView();
        return;
      }
      if (viewerKeys()) {
        const act = (a: PlotAction) => (handled(), plotPanel.current?.action(a));
        if (ctrl && lk === 'z') return handled(), undoPanes(e.shiftKey);
        if (ctrl && lk === 'y') return act('autoY');
        if (ctrl && lk === 'g') return act('grid');
        if (!ctrl && !e.altKey) {
          switch (lk) {
            case 'z':
              return act(e.shiftKey ? 'zoomPrev' : 'zoomBox');
            // A y D ponen los markers A y D, con sus diferencias (como en ViVA); T va a la caja de trazas
            case 'a':
              return act('markA');
            case 't':
              return act('addTrace');
            case 'p':
              return act('addPane');
            case 'b':
              return act('addPaneBelow');
            case 'u':
              return act(e.shiftKey ? 'paneDown' : 'paneUp');
            case 'd':
              return act('markD');
            case 'm':
              return act(e.shiftKey ? 'clearMarkers' : 'markPoint');
            case 'v':
              return act('markV');
            case 'h':
              return act('markH');
            case 'Delete':
              if (plotPanel.current?.markerSelected()) return act('deleteMarker');
              break;
            case 'Backspace':
              return act('removeTraces');
            case 'c':
              return act(e.shiftKey ? 'clearCursors' : 'cursor');
            case 's':
              if (!e.shiftKey) return;
              handled();
              if (allRuns.length > 1) setDialog({ kind: 'runs' });
              else setMessage(t("This analysis doesn't have several runs (.step)"));
              return;
            case 'o':
              return handled(), pltInput.current?.click();
            case 'Escape':
              plotPanel.current?.action('cancel');
              return;
          }
          // el resto de las letras no van al esquemático
          if (k.length === 1) return;
        }
      }
      if (ctrl && lk === 'z') return handled(), e.shiftKey ? history.redo() : history.undo();
      if (ctrl && lk === 'y') return handled(), history.redo();
      if (ctrl && lk === 'r') return handled(), rotateOrMirror('rotate');
      if (ctrl && lk === 'e') return handled(), rotateOrMirror('mirror');
      if (ctrl && lk === 'c') return handled(), copySelection();
      if (ctrl && lk === 'x') return handled(), copySelection(true);
      // Ctrl+V: lo atiende el evento paste del navegador (más abajo), que no muestra el cartel "Pegar"
      if (ctrl && lk === 'v') return;
      if (ctrl && lk === 'a') return handled(), setTool({ kind: 'select' }), selectAll();
      if (ctrl && lk === 'g') return handled(), setShowGrid((v) => !v);
      if (ctrl && lk === 'u') return handled(), setShowLoose((v) => !v);
      if (e.altKey && lk === 'c') return handled(), openControl();
      if (e.altKey && lk === 'n') return handled(), hasNets && setShowNets((v) => !v);
      if (e.altKey && lk === 'e') return handled(), openStudy();
      if (e.altKey) return;
      if (ctrl) return;
      if (lk === 'z') return handled(), e.shiftKey ? editor.current?.zoomPrev() : zoomBox();
      if (lk === 'h') return handled(), setNetHover((v) => !v);
      switch (k) {
        case 'Escape':
          plotPanel.current?.action('cancel');
          setTool({ kind: 'select' });
          setSelection([]);
          return;
        case 'e':
        case 'Enter': {
          const sel = selection.length === 1 && selection[0].kind === 'symbol' ? selection[0].index : -1;
          if (sel >= 0 && descend(sel)) return handled();
          if (k === 'Enter') return;
          return handled(), setMessage(t('Select an instance of a project subcircuit to enter it (E or double-click)'));
        }
        case 'a':
          return handled(), openSimulation();
        case 'p':
          return handled(), setDialog({ kind: 'picker' });
        case 'm':
          return handled(), startMove(false);
        case 'j':
          return handled(), shapeTool('LINE')();
        case 'k':
          return handled(), shapeTool('RECTANGLE')();
        case 'o':
          return handled(), shapeTool('CIRCLE')();
        case 'u':
          return handled(), shapeTool('ARC')();
        case 'w':
          return handled(), setTool({ kind: 'wire', start: null });
        case 'f':
        case 'F':
          // lápiz; con Shift, la goma
          return handled(), pencilTool(e.shiftKey);
        case 'n':
          return handled(), setDialog({ kind: 'flag' });
        case 'Delete':
        case 'Backspace':
          return handled(), deleteSelection();
        case '?':
          return handled(), setDialog({ kind: 'help' });
        case 'r':
          return setTool({ kind: 'place', type: 'res', orient: 'R0' });
        case 'c':
          return setTool({ kind: 'place', type: 'cap', orient: 'R0' });
        case 'l':
          return setTool({ kind: 'place', type: 'ind', orient: 'R0' });
        case 'd':
          return setTool({ kind: 'place', type: 'diode', orient: 'R0' });
        case 'v':
          return setTool({ kind: 'place', type: 'voltage', orient: 'R0' });
        case 'i':
          return setTool({ kind: 'place', type: 'current', orient: 'R0' });
        case 'g':
          return setTool({ kind: 'flag', name: '0' });
        case '.':
          return handled(), setDialog({ kind: 'text', textKind: 'directive' });
        case 't':
          return handled(), setTool({ kind: 'comment' });
        case 'Home':
          return handled(), editor.current?.fit();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.ctrlKey || e.metaKey || e.altKey || dialog || isTyping(e)) return;
      e.preventDefault();
      if (viewerKeys()) plotPanel.current?.action('fit');
      else if (area.current === 'schematic' && !editor.current?.spacePanned()) editor.current?.fit();
    };
    const onPaste = (e: ClipboardEvent) => {
      const el = e.target;
      if (dialog || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;
      e.preventDefault();
      paste(e.clipboardData);
    };
    window.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  });
}
