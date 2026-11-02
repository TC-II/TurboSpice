// La barra de herramientas de la app (archivo, historial, dibujo, edición) y el menú de la flecha de
// Resultados (exportar y las otras vistas)
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { SimPlot } from '../engine/ngspice.ts';
import type { GoogleState } from '../cloud/google.ts';
import { t } from '../i18n/i18n.ts';
import { ltNetlistText } from '../netlist/ltnetlist.ts';
import { download } from '../schematic/exportSchematic.ts';
import type { EditorHandle, Tool } from '../schematic/SchematicEditor.tsx';
import type { MenuItem } from '../ui/Menu.tsx';
import type { ToolGroup } from '../ui/Toolbar.tsx';
import type { PlotPanelHandle } from '../waveform/PlotPanel.tsx';
import { scaleOf } from '../waveform/series.ts';
import type { ResultsView } from './ResultsPanel.tsx';
import type { Dialog, SimRun } from './types.ts';

type Toggle = Dispatch<SetStateAction<boolean>>;

export interface ToolActions {
  google: Pick<GoogleState, 'account'>;
  history: { undo(): void; redo(): void; canUndo: boolean; canRedo: boolean };
  tool: Tool;
  setTool(tt: Tool): void;
  curSub: string;
  shapeItems: MenuItem[];
  editor: RefObject<EditorHandle>;
  showGrid: boolean;
  setShowGrid: Toggle;
  netHover: boolean;
  setNetHover: Toggle;
  setDialog(d: Dialog | null): void;
  doNew(): void;
  doSave(saveAs: boolean): void;
  doExport(): void;
  doOpen(): void;
  startMove(stretch: boolean): void;
  rotateOrMirror(op: 'rotate' | 'mirror'): void;
  deleteSelection(): void;
}

export function buildToolGroups({
  google,
  history,
  tool,
  setTool,
  curSub,
  shapeItems,
  editor,
  showGrid,
  setShowGrid,
  netHover,
  setNetHover,
  setDialog,
  doNew,
  doSave,
  doExport,
  doOpen,
  startMove,
  rotateOrMirror,
  deleteSelection,
}: ToolActions): ToolGroup[] {
  const toolGroups: ToolGroup[] = [
    {
      id: 'file',
      label: t('File'),
      // si falta lugar, lo primero que pasa a «Más herramientas» (también está en el menú y con atajos)
      priority: 0,
      tools: [
        { icon: 'new', label: t('New'), title: t('New project'), onClick: doNew },
        { icon: 'save', label: t('Save'), title: google.account ? t('Save to Google Drive') : t('Save'), shortcut: 'Ctrl+S', onClick: () => doSave(false) },
        {
          icon: 'pdf',
          label: t('Export to PDF'),
          title: t('Export to PDF or LaTeX'),
          onClick: doExport,
        },
        // con la sesión de Google, Abrir muestra «Mis simulaciones»; sin sesión, Abrir/Importar
        google.account
          ? { icon: 'open', label: t('Open'), title: t('My simulations (Google Drive)'), onClick: () => setDialog({ kind: 'drive' }) }
          : { icon: 'open', label: t('Open'), title: t('Open (import .turbo, .zip, .asc…)'), shortcut: 'Ctrl+O', onClick: doOpen },
      ],
    },
    {
      id: 'history',
      label: t('History'),
      // deshacer y rehacer, antes que Dibujo
      priority: 2,
      tools: [
        { icon: 'undo', label: t('Undo'), title: t('Undo'), shortcut: 'Ctrl+Z', onClick: history.undo, disabled: !history.canUndo },
        { icon: 'redo', label: t('Redo'), title: t('Redo'), shortcut: 'Ctrl+Shift+Z', onClick: history.redo, disabled: !history.canRedo },
      ],
    },
    {
      id: 'draw',
      label: t('Drawing'),
      // lo último que se esconde: se dibuja con estas
      priority: 3,
      tools: [
        { icon: 'select', label: t('Select'), title: t('Select and move'), shortcut: 'Esc', onClick: () => setTool({ kind: 'select' }), active: tool.kind === 'select' },
        { icon: 'wire', label: t('Wire'), title: t('Wire'), shortcut: 'W', onClick: () => setTool({ kind: 'wire', start: null }), active: tool.kind === 'wire' },
        { icon: 'component', label: t('Component'), title: t('Component'), shortcut: 'P', onClick: () => setDialog({ kind: 'picker' }), active: tool.kind === 'place' },
        { icon: 'ground', label: t('Ground'), title: t('Ground (GND)'), shortcut: 'G', onClick: () => setTool({ kind: 'flag', name: '0' }), active: tool.kind === 'flag' && tool.name === '0' },
        { icon: 'label', label: t('Label'), title: t('Net label'), shortcut: 'N', onClick: () => setDialog({ kind: 'flag' }) },
        ...(curSub ? [{ icon: 'label', label: t('Port'), title: t('Subcircuit port: a net label that becomes a pin of the symbol'), onClick: () => setDialog({ kind: 'flag', ioPin: 'BiDir' }) }] : []),
        { icon: 'text', label: t('Text'), title: t('Text (comment)'), shortcut: 'T', onClick: () => setTool({ kind: 'comment' }), active: tool.kind === 'comment' },
        { icon: 'shapes', label: t('Shapes'), title: t('Shapes: line, rectangle, circle, arc'), items: shapeItems, active: tool.kind === 'shape' || tool.kind === 'pencil' },
        { icon: 'directive', label: t('Directive'), title: t('Free SPICE directive'), shortcut: '.', onClick: () => setDialog({ kind: 'text', textKind: 'directive' }) },
      ],
    },
    {
      id: 'edit',
      label: t('Editing'),
      // después de Archivo (todo con atajo: M, Ctrl+R, Ctrl+E, Supr…)
      priority: 1,
      tools: [
        { icon: 'fit', label: t('Fit'), title: t('Fit to view (Z: zoom to a box, Shift+Z: previous zoom)'), shortcut: t('Space'), onClick: () => editor.current?.fit() },
        { icon: 'grid', label: t('Grid'), title: t('Show or hide the grid'), shortcut: 'Ctrl+G', onClick: () => setShowGrid((v) => !v), active: showGrid },
        // resaltar la red bajo el cursor (#340), el mismo modo que la tecla H
        { icon: 'highlight', label: t('Highlight'), title: t('Highlight the net under the cursor'), shortcut: 'H', onClick: () => setNetHover((v) => !v), active: netHover },
        { icon: 'move', label: t('Move'), title: t('Move (without stretching wires)'), shortcut: 'M', onClick: () => startMove(false), active: tool.kind === 'move' && !tool.stretch },
        { icon: 'rotate', label: t('Rotate'), title: t('Rotate'), shortcut: 'Ctrl+R', onClick: () => rotateOrMirror('rotate') },
        { icon: 'mirror', label: t('Mirror'), title: t('Mirror'), shortcut: 'Ctrl+E', onClick: () => rotateOrMirror('mirror') },
        { icon: 'delete', label: t('Delete'), title: t('Delete'), shortcut: 'Del', onClick: deleteSelection, active: tool.kind === 'delete' },
      ],
    },
  ];
  return toolGroups;
}

export interface ResultsMenuDeps {
  sim: SimRun | null;
  project: { name: string };
  panel: ResultsView;
  setPanel(p: ResultsView): void;
  plot: SimPlot | undefined;
  plotPanel: RefObject<PlotPanelHandle>;
  pltInput: RefObject<HTMLInputElement>;
  exportPlt(): void;
  ascName(): string;
  /** cuántos problemas tiene la corrida */
  problems: unknown[];
}

export function buildResultsItems({ sim, project, panel, setPanel, plot, plotPanel, pltInput, exportPlt, ascName, problems }: ResultsMenuDeps): MenuItem[] {
  // Flecha de Resultados: exportar y las otras vistas (netlist, log, problemas, mediciones)
  const exportBase = () => project.name;
  const canExportPlot = panel === 'plot' && !!plot && !!scaleOf(plot);
  const resultsItems: MenuItem[] = !sim
    ? []
    : [
        {
          label: t('Export'),
          items: [
            { label: t('Traces to CSV'), disabled: !canExportPlot, onClick: () => download(`${exportBase()}.csv`, new Blob([plotPanel.current?.csv() ?? ''], { type: 'text/csv' })) },
            {
              label: t('Plot to PNG'),
              disabled: !canExportPlot,
              onClick: async () => {
                const b = await plotPanel.current?.png();
                if (b) download(`${exportBase()}.png`, b);
              },
            },
            { label: t('View to .plt (LTspice)'), onClick: () => exportPlt() },
            { label: t('Import .plt view…'), shortcut: 'O', onClick: () => pltInput.current?.click() },
            'sep',
            { label: 'Netlist .cir (ngspice)', onClick: () => download(`${exportBase()}.cir`, new Blob([sim.built.netlist], { type: 'text/plain' })) },
            {
              label: 'Netlist .net (LTspice)',
              onClick: () =>
                download(
                  `${exportBase()}.net`,
                  new Blob(
                    [
                      `* ${ascName()}
${ltNetlistText(sim.built.lt)}
`,
                    ],
                    { type: 'text/plain' },
                  ),
                ),
            },
          ],
        },
        'sep',
        { label: 'Netlist', checked: panel === 'netlist', onClick: () => setPanel('netlist') },
        ...(sim.meas ? [{ label: t('Measurements ({length})', { length: sim.meas.names.length }), checked: panel === 'meas', onClick: () => setPanel('meas') }] : []),
        { label: t('Errors{p0}', { p0: problems.length ? ` (${problems.length})` : '' }), checked: panel === 'problems', onClick: () => setPanel('problems') },
        { label: 'Log', shortcut: 'Ctrl+L', checked: panel === 'log', onClick: () => setPanel('log') },
      ];
  return resultsItems;
}
