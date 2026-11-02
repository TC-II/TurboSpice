// El editor del esquemático con todo lo que dibuja encima (redes, OP, flechas, resaltados), el menú
// del botón derecho de un comentario y, al costado, el historial de corridas del testbench (#152)
import type { ComponentProps, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n/i18n.ts';
import type { Connectivity } from '../netlist/connectivity.ts';
import { HistoryPanel } from '../project/HistoryPanel.tsx';
import { modelModuleFile, modelModuleName } from '../project/modelModule.ts';
import { moduleFile, subName } from '../project/subckt.ts';
import { deleteItems, setText } from '../schematic/edit.ts';
import { SchematicEditor, type EditorHandle } from '../schematic/SchematicEditor.tsx';
import { TextMenu } from '../schematic/TextMenu.tsx';
import { moveOpTag, type OpTags } from '../sim/opPins.ts';
import { simName, type SimList } from '../sim/simList.ts';
import { useSchematic } from './context.ts';

type EP = ComponentProps<typeof SchematicEditor>;
type HP = ComponentProps<typeof HistoryPanel>;
type TextMenuAt = { index: number; at: { x: number; y: number } };

export interface EditorAreaProps {
  conn: Connectivity;
  editor: RefObject<EditorHandle>;
  docKey: number;
  /** el foco está en la caja de trazas: el esquemático queda en la punta de prueba (#341) */
  traceFocus: boolean;
  netHover: boolean;
  showGrid: boolean;
  showLoose: boolean;
  showSimCommand: boolean;
  savesOpen: boolean;
  /** la corrida vieja que se mira ('' = la actual) */
  viewRun: string;
  makesCycle(types: string[]): boolean;
  symbolMenu: EP['onSymbolMenu'];
  netMenu: EP['onNetMenu'];
  textMenu: TextMenuAt | null;
  setTextMenu(m: TextMenuAt | null): void;
  closeTextMenu(): void;
  descend: EP['onDescend'];
  editItem: EP['onEdit'];
  onProbe: EP['onProbe'];
  onProbePair: EP['onProbePair'];
  deviceMenu: EP['deviceMenu'];
  plotExpr: EP['onPlotExpr'];
  rowNet: string | undefined;
  traceNetShown: string | undefined;
  rowSymbol: number;
  rowElement: { sym: number } | undefined;
  onHoverSymbol: EP['onHoverSymbol'];
  setHoverTarget: NonNullable<EP['onHoverTarget']>;
  netColors: EP['netColors'];
  shownNets: EP['netNames'];
  describe: EP['describe'];
  annotations: EP['annotations'];
  opSel: string | undefined;
  setOpSel(key: string | undefined): void;
  setOpTags(f: (tags: OpTags) => OpTags): void;
  arrows: EP['currentArrows'];
  pickValue: EP['pickValue'];
  endPick: EP['onPicked'];
  onHover: EP['onHover'];
  historyDiff: EP['diff'];
  unsaved: EP['unsaved'];
  historyOpen: boolean;
  setHistoryOpen(open: boolean): void;
  curSim: SimList['items'][number] | undefined;
  curRuns: HP['runs'];
  viewed: { id: string } | undefined;
  currentChanges: HP['currentChanges'];
  setViewRun(id: string): void;
  restoreRun(id: string): void;
  cloneRun(id: string): void;
}

export function EditorArea(props: EditorAreaProps) {
  const { doc, lib, commit, tool, setTool, selection, setSelection, sim, curSub, projectRef, setDialog } = useSchematic();
  const { conn, editor, docKey, traceFocus, netHover, showGrid, showLoose, showSimCommand, savesOpen, viewRun, makesCycle } = props;
  const {
    symbolMenu,
    netMenu,
    textMenu,
    setTextMenu,
    closeTextMenu,
    descend,
    editItem,
    onProbe,
    onProbePair,
    deviceMenu,
    plotExpr,
    rowNet,
    traceNetShown,
    rowSymbol,
    rowElement,
    onHoverSymbol,
    setHoverTarget,
    netColors,
    shownNets,
    describe,
    annotations,
    opSel,
    setOpSel,
    setOpTags,
    arrows,
    pickValue,
    endPick,
    onHover,
    historyDiff,
    unsaved,
  } = props;
  const { historyOpen, setHistoryOpen, curSim, curRuns, viewed, currentChanges, setViewRun, restoreRun, cloneRun } = props;
  return (
    <>
      {textMenu &&
        doc.texts[textMenu.index] &&
        createPortal(
          <TextMenu
            at={textMenu.at}
            text={doc.texts[textMenu.index]}
            onClose={closeTextMenu}
            onChange={(patch) => commit(setText(doc, textMenu.index, patch))}
            onEdit={() => editor.current?.editText(textMenu.index)}
            onDialog={() => setDialog({ kind: 'text', index: textMenu.index, textKind: doc.texts[textMenu.index].kind })}
            onDelete={() => {
              commit(deleteItems(doc, [{ kind: 'text', index: textMenu.index }]));
              setSelection([]);
            }}
          />,
          document.body,
        )}
      <SchematicEditor
        handle={editor}
        onSymbolMenu={symbolMenu}
        onNetMenu={netMenu}
        unsaved={unsaved}
        onTextMenu={(index, at) => (setTextMenu({ index, at }), true)}
        onDescend={descend}
        docKey={docKey}
        netHover={netHover}
        doc={doc}
        lib={lib}
        conn={conn}
        commit={commit}
        tool={traceFocus && tool.kind === 'select' && sim ? { kind: 'probe' } : tool}
        setTool={setTool}
        selection={selection}
        setSelection={setSelection}
        onEdit={editItem}
        onEditLabel={(index, label) => setDialog({ kind: 'attrs', index, label })}
        onProbe={onProbe}
        onProbePair={onProbePair}
        deviceMenu={deviceMenu}
        onPlotExpr={plotExpr}
        onDropSubckt={(name) => {
          const m = modelModuleFile(projectRef.current, name);
          if (m) return viewRun ? null : modelModuleName(m);
          const f = moduleFile(projectRef.current, name);
          return f && !viewRun && !makesCycle([subName(f.name)]) ? subName(f.name) : null;
        }}
        highlightNet={rowNet ?? traceNetShown}
        highlightSymbol={rowSymbol >= 0 ? rowSymbol : rowElement?.sym}
        onHoverSymbol={onHoverSymbol}
        onHoverTarget={savesOpen ? setHoverTarget : undefined}
        netColors={netColors}
        netNames={shownNets}
        onNameNet={(at) => setDialog({ kind: 'flag', at })}
        describe={describe}
        annotations={annotations}
        selectedAnnotation={opSel}
        onSelectAnnotation={(key) => {
          setOpSel(key);
          if (key) setSelection([]);
        }}
        onMoveAnnotation={(key, dx, dy) => setOpTags((p) => moveOpTag(p, key, dx, dy))}
        currentArrows={arrows}
        pickValue={pickValue}
        onPicked={endPick}
        showGrid={showGrid}
        showLoose={showLoose}
        showSimCommand={showSimCommand}
        onHover={onHover}
        diff={historyDiff}
      />
      {historyOpen && curSim && !curSub && (
        <HistoryPanel
          sim={simName(curSim) || t('No analysis')}
          runs={curRuns}
          picked={viewed?.id ?? ''}
          currentChanges={currentChanges}
          onPick={setViewRun}
          onRestore={restoreRun}
          onClone={cloneRun}
          onClose={() => {
            setHistoryOpen(false);
            setViewRun('');
          }}
        />
      )}
    </>
  );
}
