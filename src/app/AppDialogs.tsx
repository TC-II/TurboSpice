// Los diálogos del modo esquemático: componentes, textos y simulaciones, archivos, Drive y configuración
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { baseName, type SymbolInst } from '../asc/model.ts';
import { decodeText } from '../asc/encoding.ts';
import type { DriveFile } from '../cloud/drive.ts';
import { DriveDialog } from '../cloud/AccountButton.tsx';
import { looksBehavioral, moduleOf, verilogFile, verilogPorts } from '../hdl/project.ts';
import { t } from '../i18n/i18n.ts';
import { PROJECT_DIR, USER_DIR, scanModels } from '../library/library.ts';
import { pdkOfSymbol } from '../library/pdk.ts';
import type { Connectivity } from '../netlist/connectivity.ts';
import { FileConflictDialog } from '../project/FileConflictDialog.tsx';
import { BenchParamsDialog, NameDialog } from '../project/Hierarchy.tsx';
import { NewModuleDialog } from '../project/NewModuleDialog.tsx';
import { variantOf, type FileConflict } from '../project/project.ts';
import { freeSubcktName } from '../project/subckt.ts';
import { projectName, type Project } from '../project/turbo.ts';
import { benchParams, benchVariables, setBenchParams } from '../schematic/benchParams.ts';
import { currentArrows } from '../schematic/currentArrows.tsx';
import {
  AboutDialog,
  AttributeDialog,
  ComponentPicker,
  FlagDialog,
  HelpDialog,
  ImportInfoDialog,
  LineStyleDialog,
  Modal,
  RunsDialog,
  SettingsDialog,
  ShareDialog,
  TextDialog,
  UserFilesDialog,
  type UserFileInfo,
} from '../schematic/dialogs.tsx';
import { replaceAnalysis } from '../schematic/directivesEdit.ts';
import { addFlag, deleteItems, patchLabels, setFlagName, setShapeStyle, setSymbolAttrs, setSymbolType, setText, setWindows } from '../schematic/edit.ts';
import { ExportView } from '../schematic/ExportView.tsx';
import { FONTS } from '../schematic/fonts.ts';
import type { Annotation } from '../schematic/NetNames.tsx';
import type { PartGroup } from '../schematic/PartTable.tsx';
import { PdkDialog } from '../schematic/PdkDialog.tsx';
import type { Tool } from '../schematic/SchematicEditor.tsx';
import { ControlDialog, SimulationDialog, type CircuitInfo, type Picker } from '../schematic/simDialogs.tsx';
import { SourceDialog } from '../schematic/SourceDialog.tsx';
import { StudyPanel, type StudyInfo } from '../schematic/StudyPanel.tsx';
import { SwitchDialog } from '../schematic/SwitchDialog.tsx';
import { setSwModel } from '../schematic/switchModel.ts';
import type { InstScope } from '../sim/context.ts';
import { controlBlock, controlBody } from '../sim/controlSnippets.ts';
import { simName, type SimList } from '../sim/simList.ts';
import { applyStudy, applyStudyCode, studyFromDoc } from '../sim/study.ts';
import { SlideConfirm } from '../ui/SlideConfirm.tsx';
import { TRACE_WIDTHS, setTraceWidth } from '../waveform/lineWidth.ts';
import { REPO } from './constants.ts';
import { ascText } from './helpers.ts';
import type { Dialog, FileState, HierLevel } from './types.ts';
import { useSchematic } from './context.ts';

type FileConflictAsk = { name: string; resolve(c: FileConflict): void };

export interface AppDialogsProps {
  dialog: Dialog | null;
  conn: Connectivity;
  setToolState(tt: Tool): void;
  shapeStyle: string;
  setShapeStyleState(style: string): void;
  makesCycle(types: string[]): boolean;
  adoptNetlistFor(type: string): Promise<void>;
  adoptSymbolFor(type: string): void;
  partGroups(s: SymbolInst): PartGroup[];
  sweepSubParam(index: number, param: string, value: string, attrs: Record<string, string>): void;
  /** se está eligiendo una red o un componente en el esquemático (el diálogo se oculta) */
  picking: boolean;
  picker: Picker;
  circuitInfo(): CircuitInfo;
  studyInfo(): StudyInfo;
  allRuns: { name: string }[];
  labels: Map<string, string>;
  hiddenRuns: Set<string>;
  setHiddenRuns(h: Set<string>): void;
  setOverlay(on: boolean): void;
  userFileInfo(): UserFileInfo[];
  addUserFiles(files: File[]): Promise<void>;
  removeUserFile(name: string): void;
  makeUserSymbol(file: string, name: string): void;
  project: Project;
  setProjectState(p: Project): void;
  openSub(name: string, select?: number): void;
  addProjectFiles(list: { name: string; text: string; hdl?: 'behavioral' }[]): Promise<void>;
  removeProjectFile(name: string): void;
  makeProjectSymbol(file: string, name: string): void;
  checkSubName(except?: string): (n: string) => string | null;
  createModule(name: string, kind: 'schematic' | 'verilog'): void;
  driveConflict: { name: string } | null;
  setDriveConflict(c: { name: string } | null): void;
  resolveDriveConflict(how: 'reload' | 'copy' | 'overwrite'): Promise<void>;
  conflict: FileConflictAsk | null;
  setConflict(c: FileConflictAsk | null): void;
  schFont: string;
  setSchFont(id: string): void;
  onSkin(name: string): void;
  hoverReveal: boolean;
  setHoverReveal(on: boolean): void;
  traceW: number;
  importInput: RefObject<HTMLInputElement>;
  file: FileState;
  setFile: Dispatch<SetStateAction<FileState>>;
  openDriveFile(d: DriveFile): Promise<void>;
  curSim: SimList['items'][number] | undefined;
  sims: SimList;
  deleteSim(id: string): void;
  deleteVariant(id: string): void;
  exportName(): string;
  slots: { tools: HTMLElement | null; tabs: HTMLElement | null };
  opAnnotations(all: boolean): Annotation[] | undefined;
  lvNow: HierLevel | undefined;
  simScope: InstScope | undefined;
}

export function AppDialogs(props: AppDialogsProps) {
  const { setDialog, lib, doc, commit, selection, tool, setTool, projectRef, curSub, sim, setMessage } = useSchematic();
  const { dialog, conn, setToolState, shapeStyle, setShapeStyleState, makesCycle, adoptNetlistFor, adoptSymbolFor, partGroups, sweepSubParam } = props;
  const { picking, picker, circuitInfo, studyInfo, allRuns, labels, hiddenRuns, setHiddenRuns, setOverlay } = props;
  const { userFileInfo, addUserFiles, removeUserFile, makeUserSymbol, project, setProjectState, openSub, addProjectFiles, removeProjectFile, makeProjectSymbol, checkSubName, createModule } = props;
  const { driveConflict, setDriveConflict, resolveDriveConflict, conflict, setConflict, schFont, setSchFont, onSkin, hoverReveal, setHoverReveal, traceW, importInput, file, setFile, openDriveFile } =
    props;
  const { curSim, sims, deleteSim, deleteVariant, exportName, slots, opAnnotations, lvNow, simScope } = props;
  return (
    <>
      {dialog?.kind === 'picker' && (
        <ComponentPicker
          lib={lib}
          onClose={() => setDialog(null)}
          onPick={(type) => {
            setDialog(null);
            // los símbolos del usuario se referencian por nombre, como los de junto al .asc en LTspice
            const dir = [USER_DIR, PROJECT_DIR].find((d) => type.startsWith(`${d}/`));
            const name = dir ? type.slice(dir.length + 1) : type;
            if (dialog.forNetlist) return void adoptNetlistFor(name);
            if (dialog.forSymbol) return adoptSymbolFor(name);
            // un módulo de library/verilog (DSP, #366): su .v se copia al proyecto y se sintetiza ahí
            const mod = baseName(name);
            const code = lib.bundle.verilog?.[mod];
            // (por nombre, como los del proyecto: así se usa su símbolo una vez sintetizado)
            // (con su símbolo dibujado, antes del .v: la síntesis conserva un dibujo que no es el generado)
            const sym = lib.bundle.symbols[name];
            if (code !== undefined && !verilogFile(projectRef.current, mod))
              void addProjectFiles([...(sym ? [{ name: `${mod}.asy`, text: sym }] : []), { name: `${mod}.v`, text: code, ...(looksBehavioral(code) ? { hdl: 'behavioral' as const } : {}) }]);
            const placed = code !== undefined ? mod : name;
            if (!makesCycle([placed])) setTool({ kind: 'place', type: placed, orient: 'R0' });
          }}
        />
      )}
      {dialog?.kind === 'source' && doc.symbols[dialog.index] && (
        <SourceDialog
          inst={doc.symbols[dialog.index]}
          def={lib.symbol(doc.symbols[dialog.index].type)}
          onClose={() => setDialog(null)}
          onAttributes={() => setDialog({ kind: 'attrs', index: dialog.index })}
          windowDefaults={lib.windowDefaults}
          onApply={(attrs, labels, type) => {
            setDialog(null);
            const s = doc.symbols[dialog.index];
            const changed = Object.fromEntries(Object.entries(attrs).filter(([k, v]) => v !== (s.attrs.get(k) ?? null)));
            let d = Object.keys(changed).length ? setSymbolAttrs(doc, dialog.index, changed) : doc;
            // con otro símbolo (DC ↔ forma de onda) los rótulos van a la posición por defecto del nuevo
            if (type && type !== s.type)
              d = setWindows(
                setSymbolType(d, dialog.index, type, lib),
                [...s.windows.keys()].map((win) => ({ sym: dialog.index, win, w: null })),
              );
            if (labels.size) d = patchLabels(d, [dialog.index], labels, lib);
            if (d !== doc) commit(d);
          }}
        />
      )}
      {dialog?.kind === 'switch' && doc.symbols[dialog.index] && (
        <SwitchDialog
          inst={doc.symbols[dialog.index]}
          def={lib.symbol(doc.symbols[dialog.index].type)}
          doc={doc}
          windowDefaults={lib.windowDefaults}
          onClose={() => setDialog(null)}
          onApply={(attrs, labels, model) => {
            setDialog(null);
            let d = Object.keys(attrs).length ? setSymbolAttrs(doc, dialog.index, attrs) : doc;
            if (labels.size) d = patchLabels(d, [dialog.index], labels, lib);
            // el switch nativo: su .model (si no estaba, una directiva nueva abajo del componente)
            if (model) {
              const s = doc.symbols[dialog.index];
              const next = setSwModel(d, model.name, model.params, { x: s.x - 48, y: s.y + 136 });
              if (JSON.stringify(next.texts) !== JSON.stringify(d.texts)) d = next;
            }
            if (d !== doc) commit(d);
          }}
        />
      )}
      {dialog?.kind === 'attrs' && doc.symbols[dialog.index] && !dialog.generic && pdkOfSymbol(doc.symbols[dialog.index].type) && (
        <PdkDialog
          inst={doc.symbols[dialog.index]}
          def={lib.symbol(doc.symbols[dialog.index].type)}
          lib={lib}
          windowDefaults={lib.windowDefaults}
          onAdvanced={() => setDialog({ ...dialog, generic: true })}
          onClose={() => setDialog(null)}
          onApply={(attrs, labels) => {
            setDialog(null);
            let d = Object.keys(attrs).length ? setSymbolAttrs(doc, dialog.index, attrs) : doc;
            d = patchLabels(d, [dialog.index], labels, lib);
            if (d !== doc) commit(d);
          }}
        />
      )}
      {dialog?.kind === 'attrs' && doc.symbols[dialog.index] && (dialog.generic || !pdkOfSymbol(doc.symbols[dialog.index].type)) && (
        <AttributeDialog
          inst={doc.symbols[dialog.index]}
          def={lib.symbol(doc.symbols[dialog.index].type)}
          parts={partGroups(doc.symbols[dialog.index])}
          windowDefaults={lib.windowDefaults}
          focusLabel={dialog.label}
          otherNames={doc.symbols.flatMap((s, i) => (i !== dialog.index && s.attrs.get('InstName') ? [s.attrs.get('InstName')!] : []))}
          onSweep={(param, value, attrs) => sweepSubParam(dialog.index, param, value, attrs)}
          onClose={() => setDialog(null)}
          onApply={(attrs, labels, toSelection) => {
            setDialog(null);
            let d = Object.keys(attrs).length ? setSymbolAttrs(doc, dialog.index, attrs) : doc;
            const syms = toSelection ? [dialog.index, ...selection.filter((r) => r.kind === 'symbol' && r.index !== dialog.index).map((r) => r.index)] : [dialog.index];
            d = patchLabels(d, syms, labels, lib);
            if (d !== doc) commit(d);
          }}
        />
      )}
      {dialog?.kind === 'text' && (
        <TextDialog
          initial={dialog.index !== undefined ? doc.texts[dialog.index].text : ''}
          kind={dialog.textKind}
          onClose={() => setDialog(null)}
          onApply={(text, kind) => {
            setDialog(null);
            if (dialog.index !== undefined) commit(setText(doc, dialog.index, { text, kind }));
            else setTool({ kind: 'text', text, textKind: kind });
          }}
        />
      )}
      {dialog?.kind === 'sim' && (
        <SimulationDialog
          initial={dialog.found?.value ?? null}
          analysis={dialog.analysis}
          info={circuitInfo()}
          picker={picker}
          hidden={!!picking}
          onClose={() => setDialog(null)}
          onApply={(line, ngspiceOnly) => {
            setDialog(null);
            if (dialog.found) commit(replaceAnalysis(doc, dialog.found, line, ngspiceOnly));
            else setTool({ kind: 'text', text: line, textKind: ngspiceOnly ? 'comment' : 'directive' });
          }}
        />
      )}
      {dialog?.kind === 'control' && (
        <ControlDialog
          initial={dialog.index >= 0 ? controlBody(doc.texts[dialog.index].text.split('\\n').join('\n')) : 'run\n'}
          picker={picker}
          hidden={!!picking}
          onClose={() => setDialog(null)}
          onRemove={
            dialog.index >= 0
              ? () => {
                  setDialog(null);
                  commit(deleteItems(doc, [{ kind: 'text', index: dialog.index }]));
                }
              : undefined
          }
          onApply={(body) => {
            setDialog(null);
            // En el archivo los saltos de línea son "\n" literales; se guarda como comentario
            const text = controlBlock(body).split('\n').join('\\n');
            if (dialog.index >= 0) commit(setText(doc, dialog.index, { text, kind: 'comment' }));
            else setTool({ kind: 'text', text, textKind: 'comment' });
          }}
        />
      )}
      {dialog?.kind === 'help' && <HelpDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === 'runs' && (
        <RunsDialog
          runs={allRuns.map((r) => ({ name: r.name, label: labels.get(r.name) ?? r.name }))}
          hidden={hiddenRuns}
          onClose={() => setDialog(null)}
          onApply={(h) => {
            setDialog(null);
            setHiddenRuns(h);
            setOverlay(true);
          }}
        />
      )}
      {dialog?.kind === 'study' && (
        <StudyPanel
          initial={studyFromDoc(doc, lib)}
          info={studyInfo()}
          picker={picker}
          hidden={!!picking}
          onClose={() => setDialog(null)}
          onApply={(st) => {
            setDialog(null);
            commit(applyStudy(doc, lib, st));
          }}
          onApplyCode={(code) => {
            setDialog(null);
            commit(applyStudyCode(doc, lib, code));
          }}
        />
      )}
      {dialog?.kind === 'userfiles' && (
        <UserFilesDialog files={userFileInfo()} hasSymbol={(n) => !!lib.symbol(n)} onAdd={addUserFiles} onRemove={removeUserFile} onMakeSymbol={makeUserSymbol} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'projectfiles' && (
        <UserFilesDialog
          project={project.name}
          files={project.files.map((f) => ({ name: f.name, kind: f.kind, items: f.kind === 'model' ? scanModels(f.text).subckts : f.kind === 'verilog' ? verilogPorts(f).map((x) => x.name) : [] }))}
          onEditVerilog={(name) => {
            setDialog(null);
            openSub(moduleOf({ name }));
          }}
          hasSymbol={(n) => !!lib.symbol(n)}
          onAdd={async (files) => addProjectFiles(await Promise.all(files.map(async (x) => ({ name: x.name, text: decodeText(new Uint8Array(await x.arrayBuffer())) }))))}
          onRemove={removeProjectFile}
          onMakeSymbol={makeProjectSymbol}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'newModule' && (
        <NewModuleDialog
          kind={dialog.module}
          initial={freeSubcktName(projectRef.current, dialog.module === 'verilog' ? 'VERILOG' : 'SUB')}
          check={checkSubName()}
          onOk={createModule}
          onClose={() => setDialog(null)}
        />
      )}
      {driveConflict && (
        <Modal title={t('The file changed in Google Drive')} onClose={() => setDriveConflict(null)}>
          <p>
            «{driveConflict.name}
            {t("» was modified in Google Drive (in another tab or computer) after you opened it. Nothing was saved, so those changes aren't overwritten.")}
          </p>
          <div className="buttons">
            <button onClick={() => resolveDriveConflict('reload')} title={t('Opens the Drive version; what you have here stays in Recent')}>
              {t('Reload the Drive version')}
            </button>
            <button onClick={() => resolveDriveConflict('copy')}>{t('Save mine as a copy')}</button>
            <button className="danger" onClick={() => resolveDriveConflict('overwrite')}>
              {t('Overwrite')}
            </button>
          </div>
        </Modal>
      )}
      {conflict && (
        <FileConflictDialog
          name={conflict.name}
          onChoose={(c) => {
            setConflict(null);
            conflict.resolve(c);
          }}
        />
      )}
      {dialog?.kind === 'settings' && (
        <SettingsDialog
          sections={[
            {
              title: t('Schematic'),
              rows: [
                {
                  kind: 'choice',
                  label: t('Schematic font'),
                  hint: t('The font of names, values, labels and comments on screen; text between $…$ is set with LaTeX'),
                  value: schFont,
                  options: FONTS.map((f) => ({ value: f.id, label: f.label })),
                  onChange: setSchFont,
                },
                {
                  kind: 'choice',
                  label: t('Symbol skin'),
                  hint: t('The drawing of the symbols; what a skin does not draw comes from Default'),
                  value: lib.skinName,
                  options: lib.skinNames().map((s) => ({ value: s, label: s })),
                  onChange: onSkin,
                },
              ],
            },
            {
              title: t('Project panel'),
              rows: [{ kind: 'checkbox', label: t('Show the project panel when the mouse approaches the edge (in select mode)'), checked: hoverReveal, onChange: setHoverReveal }],
            },
            {
              title: t('Plotter'),
              rows: [
                {
                  kind: 'choice',
                  label: t('Trace thickness'),
                  value: String(traceW),
                  options: TRACE_WIDTHS.map((w, i) => ({ value: String(w), label: [t('Thin'), t('Medium'), t('Thick')][i] })),
                  onChange: (v) => setTraceWidth(Number(v)),
                },
              ],
            },
          ]}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'about' && <AboutDialog repo={REPO} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'importinfo' && (
        <ImportInfoDialog
          onChoose={() => {
            setDialog(null);
            importInput.current?.click();
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'drive' && (
        <DriveDialog
          currentId={file.driveId}
          onOpen={openDriveFile}
          onRenamed={(f) => {
            if (f.id !== file.driveId) return;
            setFile({ ...file, name: f.name });
            setProjectState({ ...projectRef.current, name: projectName(f.name) });
          }}
          onTrashed={(id) => id === file.driveId && setFile({ ...file, driveId: undefined })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'benchParams' && (
        <BenchParamsDialog
          bench={(curSim && simName(curSim)) || ''}
          params={benchParams(doc)}
          variables={benchVariables(doc)}
          onApply={(ps) => {
            setDialog(null);
            const d = setBenchParams(doc, ps);
            if (ascText(d) !== ascText(doc)) commit(d);
          }}
          onStudy={() => setDialog({ kind: 'study' })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'name' && <NameDialog title={dialog.title} label={dialog.label} initial={dialog.initial} check={dialog.check} onOk={dialog.onOk} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'slide' && <SlideConfirm title={dialog.title} message={dialog.message} onConfirm={dialog.onConfirm} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'deleteSim' && (
        <SlideConfirm
          title={t('Delete the testbench')}
          message={t('«{p0}» will be deleted with its schematic, its simulation and its run history.', {
            p0: simName(sims.items.find((x) => x.id === dialog.id) ?? { id: '', line: '' }) || t('No analysis'),
          })}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            deleteSim(dialog.id);
          }}
        />
      )}
      {dialog?.kind === 'deleteVariant' && (
        <SlideConfirm
          title={t('Delete the variant')}
          message={t('«{p0}» will be deleted with all its simulations and their history.', { p0: variantOf(project, dialog.id).name })}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            deleteVariant(dialog.id);
          }}
        />
      )}
      {dialog?.kind === 'export' && (
        <ExportView
          doc={doc}
          lib={lib}
          conn={conn}
          name={exportName()}
          storeKey={`${project.created}/${sims.active ?? ''}/${curSub}`}
          toolsSlot={slots.tools}
          tabsSlot={slots.tabs}
          annotations={opAnnotations(true)}
          arrows={sim && (lvNow ? simScope : sim.doc === doc) ? currentArrows(doc, lib, simScope ? simScope.block.lt.elements : sim.built.lt.elements) : undefined}
          onClose={() => setDialog(null)}
          onMessage={setMessage}
        />
      )}
      {dialog?.kind === 'share' && <ShareDialog url={dialog.url} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'lineStyle' && (
        <LineStyleDialog
          initial={dialog.shapes.length ? (doc.shapes[dialog.shapes[0]]?.style ?? '') : shapeStyle}
          count={dialog.shapes.length}
          onClose={() => setDialog(null)}
          onApply={(style) => {
            setDialog(null);
            setShapeStyleState(style);
            if (tool.kind === 'shape') setToolState({ ...tool, style: style || undefined });
            if (dialog.shapes.length) commit(setShapeStyle(doc, dialog.shapes, style));
          }}
        />
      )}
      {dialog?.kind === 'flag' && (
        <FlagDialog
          initial={dialog.index !== undefined ? doc.flags[dialog.index].name : ''}
          initialPort={dialog.index !== undefined ? (doc.flags[dialog.index].ioPin ?? '') : (dialog.ioPin ?? 'BiDir')}
          port={!!curSub}
          onClose={() => setDialog(null)}
          onApply={(name, io) => {
            setDialog(null);
            if (dialog.index !== undefined) commit(setFlagName(doc, dialog.index, name, io));
            else if (dialog.at) commit(addFlag(doc, dialog.at, name, io || undefined));
            else setTool({ kind: 'flag', name, ioPin: io || undefined });
          }}
        />
      )}
    </>
  );
}
