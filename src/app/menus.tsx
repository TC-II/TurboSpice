// El menú de la app (Archivo, Editar, Dibujar, Simular, Ver…) y los desplegables de figuras y de simulación
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { DrawnShapeKind } from '../asc/model.ts';
import type { GoogleState } from '../cloud/google.ts';
import { dateTime, locale, t } from '../i18n/i18n.ts';
import type { LtspiceIndex } from '../library/ltspiceLib.ts';
import type { RecentFile } from '../schematic/autosave.ts';
import type { ItemRef } from '../schematic/geometry.ts';
import type { EditorHandle, Tool } from '../schematic/SchematicEditor.tsx';
import { ANALYSES, ANALYSIS_LINE, type AnalysisKind } from '../sim/analyses.ts';
import type { Bias } from '../sim/bias.ts';
import { isComplexLine } from '../sim/complexSim.ts';
import { AnalysisIcon } from '../ui/analysisIcons.tsx';
import type { MenuDef, MenuItem } from '../ui/Menu.tsx';
import { ADC, AMPS, DSP, GF180, REPO, SAMPLE, SKY130, STABILITY, TRANSFER } from './constants.ts';
import type { Theme } from './storage.ts';
import type { Dialog, SimRun } from './types.ts';

type Toggle = Dispatch<SetStateAction<boolean>>;

/** Lo que usan los menús del modo esquemático: su estado y sus acciones */
export interface MenuActions {
  google: Pick<GoogleState, 'account'>;
  history: { undo(): void; redo(): void; canUndo: boolean; canRedo: boolean };
  status: { kind: string };
  running: boolean;
  sim: SimRun | null;
  bias: Bias | undefined;
  selection: ItemRef[];
  docLine: string;
  editor: RefObject<EditorHandle>;
  ltIndex: LtspiceIndex | undefined;
  ltInput: RefObject<HTMLInputElement>;
  recent: RecentFile[];
  shapeStyle: string;
  theme: Theme;
  setTheme(tt: Theme): void;
  setDialog(d: Dialog | null): void;
  setTool(tt: Tool): void;
  setTutorialOpen(open: boolean): void;
  shapeTool(shape: DrawnShapeKind): () => void;
  openLineStyle(): void;
  paste(): Promise<void>;
  newSim(kind: AnalysisKind): void;
  complexSim(): void;
  openSimulation(): void;
  openSaves(): void;
  openStudy(): void;
  openControl(): void;
  doImport(): Promise<void>;
  doRemoveLtspice(): Promise<void>;
  doNew(): void;
  doOpen(): void;
  doSave(saveAs: boolean): void;
  doSaveLocal(saveAs: boolean): void;
  exportZip(all: boolean): void;
  doShare(): void;
  doExport(): void;
  exportNetlist(which: 'net' | 'cir'): void;
  copySelection(cut?: boolean): void;
  deleteSelection(): void;
  selectAll(): void;
  rotateOrMirror(op: 'rotate' | 'mirror'): void;
  startMove(stretch: boolean): void;
  run(): void;
  abort(): void;
  showLog(): void;
  showOp: boolean;
  setShowOp: Toggle;
  netHover: boolean;
  setNetHover: Toggle;
  zoomBox(): void;
  showGrid: boolean;
  setShowGrid: Toggle;
  showLoose: boolean;
  setShowLoose: Toggle;
  showSimCommand: boolean;
  toggleSimCommand(): void;
  showNets: boolean;
  setShowNets: Toggle;
  resultsSide: boolean;
  setSide(side: boolean): void;
  treeOpen: boolean;
  toggleTree(): void;
  resultsShown: boolean;
  toggleResultsPanel(): void;
  onNetlist(): void;
  doExample(name: string, variant?: string): void;
  doRecent(i: number): void;
}

export function buildMenus(a: MenuActions): { menus: MenuDef[]; shapeItems: MenuItem[]; simItems: MenuItem[] } {
  const { google, history, status, running, sim, bias, selection, docLine, editor, ltIndex, ltInput, recent, shapeStyle, theme, setTheme, setDialog, setTool, setTutorialOpen } = a;
  const {
    shapeTool,
    openLineStyle,
    paste,
    newSim,
    complexSim,
    openSimulation,
    openSaves,
    openStudy,
    openControl,
    doImport,
    doRemoveLtspice,
    doNew,
    doOpen,
    doSave,
    doSaveLocal,
    exportZip,
    doShare,
    doExport,
    exportNetlist,
  } = a;
  const {
    copySelection,
    deleteSelection,
    selectAll,
    rotateOrMirror,
    startMove,
    run,
    abort,
    showLog,
    showOp,
    setShowOp,
    netHover,
    setNetHover,
    zoomBox,
    showGrid,
    setShowGrid,
    showLoose,
    setShowLoose,
  } = a;
  const { showSimCommand, toggleSimCommand, showNets, setShowNets, resultsSide, setSide, treeOpen, toggleTree, resultsShown, toggleResultsPanel, onNetlist, doExample, doRecent } = a;
  const placeTool = (type: string) => () => setTool({ kind: 'place', type, orient: 'R0' });
  // Figuras: en el menú Dibujar y en el botón de la barra (#64)
  const shapeItems: MenuItem[] = [
    { label: t('Line'), shortcut: 'J', onClick: shapeTool('LINE') },
    { label: t('Rectangle'), shortcut: 'K', onClick: shapeTool('RECTANGLE') },
    { label: t('Circle'), shortcut: 'O', onClick: shapeTool('CIRCLE') },
    { label: t('Arc'), shortcut: 'U', onClick: shapeTool('ARC') },
    { label: t('Pencil (freehand)'), onClick: () => setTool({ kind: 'pencil', ...(shapeStyle ? { style: shapeStyle } : {}) }) },
    { label: t('Paste image'), onClick: () => void paste() },
    'sep',
    { label: t('Line style…'), onClick: () => openLineStyle() },
  ];
  // Desplegable de Simular: los tipos de análisis (configuran la simulación del testbench, con
  // sus parámetros en la barra), las señales guardadas, solas, y al final los comandos a mano y los
  // análisis programados. Los testbenches
  // se eligen en el panel del proyecto (#180)
  const simItems: MenuItem[] = [
    ...ANALYSES.map((x) => ({
      label: x.label,
      lead: <AnalysisIcon kind={x.kind} />,
      title: docLine && !isComplexLine(docLine) ? t('New testbench with this simulation: {help}', { help: x.help }) : t('Simulation of this testbench: {help}', { help: x.help }),
      current: ANALYSIS_LINE.exec(docLine)?.[1].toLowerCase() === x.kind,
      onClick: () => newSim(x.kind),
    })),
    {
      label: t('Complex simulation'),
      lead: <AnalysisIcon kind="complex" />,
      title: t('The Studio or a .control block decides what is simulated, instead of a single analysis'),
      current: isComplexLine(docLine),
      onClick: complexSim,
    },
    'sep',
    {
      label: t('Saved signals…'),
      title: t('Save everything, or only some voltages and currents (smaller simulations)'),
      onClick: () => openSaves(),
    },
    'sep',
    { label: t('Simulation command…'), shortcut: 'A', onClick: () => openSimulation() },
    { label: t('SPICE directive…'), shortcut: '.', onClick: () => setDialog({ kind: 'text', textKind: 'directive' }) },
    { label: t('Studio…'), shortcut: 'Alt+E', onClick: openStudy },
    { label: t('.control block…'), shortcut: 'Alt+C', onClick: openControl },
  ];
  // Lo que no entra en Archivo (#303): archivos del proyecto, símbolos y modelos, biblioteca de LTspice
  const libraryItems: MenuItem[] = [
    ...(google.account ? [{ label: t('Import from computer…'), onClick: () => doImport() }] : []),
    { label: t('Project files…'), title: t('Subcircuits, symbols and models saved in the .turbo, for all testbenches'), onClick: () => setDialog({ kind: 'projectfiles' }) },
    { label: t('My symbols and models…'), onClick: () => setDialog({ kind: 'userfiles' }) },
    {
      label: ltIndex ? t('LTspice library') : t('Import LTspice library…'),
      items: [
        { label: ltIndex ? t('Import again…') : t('Choose the lib folder…'), onClick: () => ltInput.current?.click() },
        ...(ltIndex
          ? [
              {
                label: t('{symbols} symbols, {models} model files ({p2})', { symbols: ltIndex.count.symbols, models: ltIndex.count.models, p2: new Date(ltIndex.time).toLocaleDateString(locale()) }),
                disabled: true,
                onClick: () => {},
              },
              { label: t('Remove'), onClick: doRemoveLtspice },
            ]
          : []),
      ],
    },
  ];
  const menus: MenuDef[] = [
    // el tutorial, arriba de todo y con ícono: es lo primero que busca quien recién llega
    { label: t('Interactive tutorial'), icon: 'school', onClick: () => setTutorialOpen(true) },
    {
      label: t('File'),
      items: [
        { label: t('New project'), onClick: doNew },
        ...(google.account ? [{ label: t('My simulations (Google Drive)…'), onClick: () => setDialog({ kind: 'drive' }) }] : []),
        { label: t('Open/Import…'), title: t('.turbo, .zip, .asc (each one, a testbench), .asy, .lib, .sub'), shortcut: 'Ctrl+O', onClick: doOpen },
        { label: t('Save'), shortcut: 'Ctrl+S', onClick: () => doSave(false) },
        { label: t('Save as…'), shortcut: 'Ctrl+Shift+S', onClick: () => doSave(true) },
        'sep',
        { label: t('Export .turbo file'), title: t('Saves the project (.turbo) on this computer'), onClick: () => doSaveLocal(true) },
        { label: t('Export .zip for LTspice'), title: t('A .zip for LTspice: an .asc per testbench and the project files they use'), onClick: () => exportZip(true) },
        { label: t('Share link…'), onClick: doShare },
        { label: t('Import symbols and models'), title: t('Pending: not implemented yet (#{n})', { n: 304 }), disabled: true, onClick: () => {} },
        'sep',
        { label: t('Export to PDF…'), title: t('Export to PDF or LaTeX'), onClick: doExport },
        {
          label: t('Export'),
          items: [
            { label: t('Export LTspice netlist (.net)'), onClick: () => exportNetlist('net') },
            { label: t('Export ngspice netlist (.cir)'), onClick: () => exportNetlist('cir') },
          ],
        },
      ],
    },
    {
      label: t('Edit'),
      items: [
        { label: t('Undo'), shortcut: 'Ctrl+Z', onClick: history.undo, disabled: !history.canUndo },
        { label: t('Redo'), shortcut: 'Ctrl+Shift+Z', onClick: history.redo, disabled: !history.canRedo },
        'sep',
        { label: t('Cut'), shortcut: 'Ctrl+X', onClick: () => copySelection(true), disabled: !selection.length },
        { label: t('Copy'), shortcut: 'Ctrl+C', onClick: () => copySelection(), disabled: !selection.length },
        { label: t('Paste'), shortcut: 'Ctrl+V', onClick: paste },
        { label: t('Delete'), shortcut: 'Del', onClick: deleteSelection },
        { label: t('Select all'), shortcut: 'Ctrl+A', onClick: () => (setTool({ kind: 'select' }), selectAll()) },
        'sep',
        { label: t('Rotate'), shortcut: 'Ctrl+R', onClick: () => rotateOrMirror('rotate') },
        { label: t('Mirror'), shortcut: 'Ctrl+E', onClick: () => rotateOrMirror('mirror') },
        'sep',
        { label: t('Move (without stretching wires)'), shortcut: 'M', onClick: () => startMove(false) },
      ],
    },
    {
      label: t('Draw'),
      items: [
        { label: t('Wire'), shortcut: 'W', onClick: () => setTool({ kind: 'wire', start: null }) },
        { label: t('Component…'), shortcut: 'P', onClick: () => setDialog({ kind: 'picker' }) },
        { label: t('Resistor'), shortcut: 'R', onClick: placeTool('res') },
        { label: 'Capacitor', shortcut: 'C', onClick: placeTool('cap') },
        { label: 'Inductor', shortcut: 'L', onClick: placeTool('ind') },
        { label: t('Diode'), shortcut: 'D', onClick: placeTool('diode') },
        { label: t('Voltage source'), shortcut: 'V', onClick: placeTool('voltage') },
        { label: t('Current source'), shortcut: 'I', onClick: placeTool('current') },
        { label: t('Ground'), shortcut: 'G', onClick: () => setTool({ kind: 'flag', name: '0' }) },
        { label: t('Net label…'), shortcut: 'N', onClick: () => setDialog({ kind: 'flag' }) },
        'sep',
        { label: t('SPICE directive…'), shortcut: '.', onClick: () => setDialog({ kind: 'text', textKind: 'directive' }) },
        { label: t('Comment'), shortcut: 'T', onClick: () => setTool({ kind: 'comment' }) },
        'sep',
        ...shapeItems,
      ],
    },
    {
      label: t('Simulate'),
      items: [
        { label: t('Simulate'), shortcut: 'Alt+R', onClick: run, disabled: running || status.kind === 'loading' },
        { label: t('Abort'), shortcut: 'Alt+S', onClick: abort, disabled: !running },
        { label: t('View the log'), shortcut: 'Ctrl+L', onClick: showLog, disabled: !sim },
        'sep',
        ...simItems,
        'sep',
        { label: t('Probe'), onClick: () => setTool({ kind: 'probe' }), disabled: !sim },
        { label: t('Annotate operating point'), onClick: () => setShowOp((v) => !v), disabled: !bias, checked: showOp },
      ],
    },
    {
      label: t('View'),
      items: [
        { label: t('Highlight net'), title: t('Highlight the net under the cursor'), shortcut: 'H', onClick: () => setNetHover((v) => !v), checked: netHover },
        'sep',
        { label: t('Fit to view'), shortcut: t('Space'), onClick: () => editor.current?.fit() },
        { label: t('Zoom to a box'), shortcut: 'Z', onClick: zoomBox },
        { label: t('Previous zoom'), shortcut: 'Shift+Z', onClick: () => editor.current?.zoomPrev() },
        { label: t('Grid'), shortcut: 'Ctrl+G', onClick: () => setShowGrid((v) => !v), checked: showGrid },
        { label: t('Unconnected pin marks'), shortcut: 'Ctrl+U', onClick: () => setShowLoose((v) => !v), checked: showLoose },
        {
          label: t('Show directives'),
          title: t('Draw .tran, .ac…, .param, .step, .meas and .control on the schematic, like LTspice (they are edited from the simulation bar, the project panel and the Studio)'),
          onClick: toggleSimCommand,
          checked: showSimCommand,
        },
        { label: t('Net names'), shortcut: 'Alt+N', onClick: () => setShowNets((v) => !v), checked: showNets },
        { label: t('Results on the side'), onClick: () => setSide(!resultsSide), checked: resultsSide },
        { label: t('Project panel (subcircuits)'), onClick: toggleTree, checked: treeOpen },
        { label: t('Results panel'), shortcut: 'Ctrl+1 / Ctrl+0', onClick: toggleResultsPanel, disabled: !sim, checked: resultsShown },
        'sep',
        { label: t('Netlist editor (SPICE)'), onClick: onNetlist },
        'sep',
        { label: t('Automatic theme (system)'), onClick: () => setTheme('auto'), checked: theme === 'auto' },
        { label: t('Light theme'), onClick: () => setTheme('light'), checked: theme === 'light' },
        { label: t('Dark theme'), onClick: () => setTheme('dark'), checked: theme === 'dark' },
      ],
    },
    { label: t('Settings…'), onClick: () => setDialog({ kind: 'settings' }) },
    {
      label: t('Examples'),
      items: [
        { label: 'Sample Project', onClick: () => doExample(SAMPLE) },
        {
          label: 'Transfer functions',
          title: t('RC and RLC: every first- and second-order transfer function, one workbench each with its step response, Bode plot and pole-zero map'),
          onClick: () => doExample(TRANSFER),
        },
        {
          label: 'Transistor amplifiers',
          title: t('Common emitter, degenerated common emitter, common collector and common base, each with a BJT and a MOSFET side by side: waveforms, frequency response and bias point'),
          onClick: () => doExample(AMPS),
        },
        {
          label: 'Loop stability',
          title: t('Loop gain (.stb) with the single-ended and the differential loop probe: Tian and GFT methods, phase and gain margins, root locus and the step response that confirms them'),
          onClick: () => doExample(STABILITY),
        },
        { label: 'sky130', title: t('SkyWater sky130 PDK: NMOS output curves and a CMOS inverter in the tt, ff and ss corners'), onClick: () => doExample(SKY130) },
        { label: 'gf180', title: t('GlobalFoundries GF180MCU PDK: NMOS output curves and a CMOS inverter in the tt, ff and ss corners'), onClick: () => doExample(GF180) },
        {
          label: 'ADCs',
          title: t('Mixed-signal: the «ADC» project has a flash, a SAR and a sigma-delta ADC (Verilog, a CMOS comparator and component arrays), one workbench each'),
          onClick: () => doExample(ADC),
        },
        {
          label: 'DSP',
          title: t('Digital signal processing with the DSP library (fixed point, Q1.15): FIR, IIR and CIC filters, an NCO and a mixer, one workbench each'),
          onClick: () => doExample(DSP),
        },
      ],
    },
    {
      label: t('Recent'),
      items: recent.map((r, i) => ({
        label: `${r.name.replace(/\.(asc|turbo)$/i, '')}${r.unsaved ? t(' (unsaved)') : ''}`,
        title: dateTime(r.time),
        onClick: () => doRecent(i),
      })),
    },
    { label: t('Files and libraries'), items: libraryItems },
    {
      label: t('Help'),
      items: [
        { label: t('Keyboard shortcuts'), shortcut: '?', onClick: () => setDialog({ kind: 'help' }) },
        { label: t('Interactive tutorial'), onClick: () => setTutorialOpen(true) },
        { label: t('Report a problem'), onClick: () => window.open(`${REPO}/issues`, '_blank', 'noopener') },
      ],
    },
    // directo en el menú (no dentro de Ayuda), con ícono, para que se encuentre
    { label: t('About TurboSpice'), icon: 'info', onClick: () => setDialog({ kind: 'about' }) },
  ];
  return { menus, shapeItems, simItems };
}
