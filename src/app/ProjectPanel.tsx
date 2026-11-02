// Junto al esquemático: el aviso del subcircuito que se edita, el panel del proyecto (testbenches,
// workbenches y módulos, #180), Ctrl+P para ir a cualquiera, y el <input> para importar subcircuitos
import type { ComponentProps, Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n/i18n.ts';
import { ProjectTree, QuickOpen } from '../project/Hierarchy.tsx';
import { modelModuleFile, modelModuleName, modelModules } from '../project/modelModule.ts';
import { modules, subName, updateSymbol } from '../project/subckt.ts';
import type { Project, ProjectFile } from '../project/turbo.ts';
import type { Tool } from '../schematic/SchematicEditor.tsx';
import { simName, type SimList } from '../sim/simList.ts';
import type { Dialog, HierLevel } from './types.ts';

type TP = ComponentProps<typeof ProjectTree>;

export interface ProjectPanelProps {
  project: Project;
  projectRef: MutableRefObject<Project>;
  editProject(p: Project): void;
  snapshot(): Project;
  sims: SimList;
  path: HierLevel[];
  curSub: string;
  curVerilog: ProjectFile | undefined;
  curModel: string;
  setCurModel(name: string): void;
  tool: Tool;
  treeOpen: boolean;
  /** el panel asoma (con el mouse en el borde) */
  treePeek: boolean;
  setTreePeek(on: boolean): void;
  treeShown: boolean;
  treeBenches: TP['benches'];
  treeSubs: TP['subs'];
  quickOpen: boolean;
  setQuickOpen: Dispatch<SetStateAction<boolean>>;
  setDialog(d: Dialog | null): void;
  go(next: HierLevel[]): void;
  goSim(id: string): void;
  openSub(name: string): void;
  benchItem: TP['onBenchItem'];
  newGroup: TP['onNewGroup'];
  groupAction: TP['onGroupAction'];
  renameGroupTo: TP['onRenameGroup'];
  moveBench: TP['onMoveBench'];
  newEmptyBench: TP['onNewBench'];
  renameProject: TP['onRenameProject'];
  benchAction: TP['onBenchAction'];
  renameBench: TP['onRenameBench'];
  newSubckt: TP['onNew'];
  newModel: TP['onNewModel'];
  renameModel(name: string): void;
  renameSub(name: string): void;
  deleteModel(name: string): void;
  deleteSub(name: string): void;
  exportSub: TP['onExport'];
  exportSubNetlist: TP['onExportNetlist'];
  subToUser: TP['onToUser'];
  subImport: RefObject<HTMLInputElement>;
  importSubckts(files: File[]): void;
}

export function ProjectPanel(props: ProjectPanelProps) {
  const { project, projectRef, editProject, snapshot, sims, path, curSub, curVerilog, curModel, setCurModel, tool, treeOpen, treePeek, setTreePeek, treeShown, treeBenches, treeSubs, quickOpen, setQuickOpen, setDialog, go, goSim, openSub } = props;
  const { benchItem, newGroup, groupAction, renameGroupTo, moveBench, newEmptyBench, renameProject, benchAction, renameBench, newSubckt, newModel, renameModel, renameSub, deleteModel, deleteSub, exportSub, exportSubNetlist, subToUser, subImport, importSubckts } = props;
  return (
    <>
      {curSub && (
        <div className={`sub-hint${curVerilog ? ' verilog' : ''}`} role="status">
          <strong>{curVerilog ? t('Verilog Editor') : t('Subcircuit Editor')}</strong>
          <span className="sub-hint-name">{curSub}</span>
          <span className="sub-hint-text">
            {curVerilog ? t('write the module; its ports are the pins of the symbol') : t('draw the circuit between the ports (net labels with a port, N)')}
          </span>
          <button onClick={() => go([])} title={t('Back to the testbench (Alt+↑ goes up one level)')}>
            {t('Return')}
          </button>
        </div>
      )}
      {treeShown && (
        <ProjectTree
          project={project.name}
          benches={treeBenches}
          groups={project.groups}
          peek={!treeOpen && treePeek}
          edgeOnly={!treeOpen && !treePeek}
          onEnter={() => !treeOpen && !treePeek && tool.kind === 'select' && setTreePeek(true)}
          onBenchItem={benchItem}
          onNewGroup={newGroup}
          onGroupAction={groupAction}
          onRenameGroup={renameGroupTo}
          onMoveBench={moveBench}
          onLeave={() => setTreePeek(false)}
          activeBench={sims.active}
          subs={treeSubs}
          current={curModel || curSub}
          onBench={goSim}
          onTestbench={() => path.length && go([])}
          onNewBench={newEmptyBench}
          onRenameProject={renameProject}
          onBenchAction={benchAction}
          onRenameBench={renameBench}
          onOpen={(n) => {
            if (modelModuleFile(projectRef.current, n)) setCurModel(n);
            else openSub(n);
          }}
          onNew={newSubckt}
          onNewModel={newModel}
          onNewVerilog={() => setDialog({ kind: 'newModule', module: 'verilog' })}
          onRename={(n) => (modelModuleFile(projectRef.current, n) ? renameModel(n) : renameSub(n))}
          onDelete={(n) => (modelModuleFile(projectRef.current, n) ? deleteModel(n) : deleteSub(n))}
          onExport={exportSub}
          onExportNetlist={exportSubNetlist}
          onToUser={subToUser}
          onImport={() => subImport.current?.click()}
          onUpdateSymbol={(n) => {
            const p = updateSymbol(snapshot(), n);
            projectRef.current = p;
            editProject(p);
          }}
        />
      )}
      {quickOpen &&
        createPortal(
        <QuickOpen
          items={[
            ...sims.items.map((x) => ({ key: `v:${x.id}`, label: simName(x) || t('No analysis'), hint: t('testbench') })),
            ...modules(project).map((f) => ({ key: `s:${subName(f.name)}`, label: subName(f.name), hint: f.kind === 'verilog' ? t('Verilog module') : t('subcircuit') })),
            ...modelModules(project).map((f) => ({ key: `m:${modelModuleName(f)}`, label: modelModuleName(f), hint: t('model') })),
          ]}
          onPick={(k) => {
            const id = k.slice(2);
            if (k.startsWith('m:')) return setCurModel(id);
            if (k.startsWith('s:')) return openSub(id);
            if (id !== sims.active) return goSim(id);
            if (path.length) go([]);
          }}
          onClose={() => setQuickOpen(false)}
        />,
          document.body,
        )}
      <input
        ref={subImport}
        data-subckt-import
        type="file"
        hidden
        multiple
        accept=".zip,.asc,.asy,.lib,.sub,.mod,.inc,.cir,.txt"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) importSubckts(files);
        }}
      />
    </>
  );
}
