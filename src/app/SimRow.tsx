// Segunda barra del modo esquemático: el proyecto (árbol y cápsula), New/Run, la punta de prueba,
// las redes, el punto de operación y la barra de la simulación del testbench
import type { ComponentProps, CSSProperties, Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AscDoc } from '../asc/model.ts';
import { t } from '../i18n/i18n.ts';
import type { Status } from '../NetlistMode.tsx';
import { ProjectCapsule } from '../project/ProjectCapsule.tsx';
import { SimBar } from '../schematic/SimBar.tsx';
import type { CircuitInfo, Picker } from '../schematic/simDialogs.tsx';
import { setAnalysisLine } from '../schematic/directivesEdit.ts';
import { controlText, isComplexLine } from '../sim/complexSim.ts';
import { simName, type SimList } from '../sim/simList.ts';
import { Icon } from '../ui/icons.tsx';
import { MenuButton, type MenuItem } from '../ui/Menu.tsx';
import type { Expanded } from '../ui/ResultsSplitter.tsx';
import { useSchematic } from './context.ts';

type Toggle = Dispatch<SetStateAction<boolean>>;

export interface SimRowProps {
  projectName: string;
  dirty: boolean;
  treeOpen: boolean;
  toggleTree(): void;
  schematicShown: boolean;
  setExpanded(e: Expanded): void;
  renameProject(name: string): Promise<void>;
  simItems: MenuItem[];
  simMenu: MutableRefObject<(() => void) | null>;
  canRun: boolean;
  running: boolean;
  status: Status;
  simulate(): void;
  abort(): void;
  curSim: SimList['items'][number] | undefined;
  /** el freno por memoria dejó los resultados sin graficar */
  stopHidden: boolean;
  showNets: boolean;
  hasNets: boolean;
  setShowNets: Toggle;
  showOp: boolean;
  setShowOp: Toggle;
  /** hay punto de operación para anotar */
  bias: boolean;
  docLine: string;
  circuitInfo(): CircuitInfo;
  picker: Picker;
  endPick(v: string | null): void;
  tbDoc: AscDoc | null;
  pdkBar: ComponentProps<typeof SimBar>['pdk'];
  simAllCorners(id: string, name: string, corner: string): void;
  openStudy(): void;
}

export function SimRow(props: SimRowProps) {
  const { curSub, sim, tool, setTool, lib, doc, setMessage, commit } = useSchematic();
  const { projectName, dirty, treeOpen, toggleTree, schematicShown, setExpanded, renameProject, simItems, simMenu, canRun, running, status, simulate, abort, curSim, stopHidden } = props;
  const { showNets, hasNets, setShowNets, showOp, setShowOp, bias, docLine, circuitInfo, picker, endPick, tbDoc, pdkBar, simAllCorners, openStudy } = props;
  return (
    <>
      {/* segunda barra: el proyecto (árbol y cápsula) y la simulación */}
      <div className="iconbar sim-row" role="toolbar" aria-label={t('Simulation')}>
        <div className="group">
          <ProjectCapsule
            project={projectName}
            bench={(curSim && simName(curSim)) || t('No analysis')}
            dirty={dirty}
            open={treeOpen}
            // en Resultados sin el esquemático: vuelve el esquemático (y el panel, abierto)
            onToggle={() => {
              if (schematicShown) return toggleTree();
              setExpanded('');
              if (!treeOpen) toggleTree();
            }}
            onRename={renameProject}
          />
        </div>
        <div className="group fixed">
          {/* un solo botón partido (#331): New elige el análisis (en otro testbench si éste ya tiene);
                Run corre el elegido (Re-Run si ya hay resultados). Se pinta la mitad que sigue */}
          <div className="sim-split">
            <MenuButton items={simItems} label={t('New simulation')} title={t('Simulations and analysis types')} className={canRun ? 'labeled' : 'primary'} openRef={simMenu}>
              <Icon name="caret" size={14} /> {t('New')}
            </MenuButton>
            {running ? (
              // el avance va en el botón (el % del tiempo o del barrido que lleva), que sigue cortando
              <button
                className="labeled sim-progress"
                onClick={abort}
                aria-label={t('Abort')}
                title={t('Abort the simulation (Alt+S)')}
                style={{ '--pct': `${status.kind === 'running' ? Math.min(100, status.percent) : 0}%` } as CSSProperties}
              >
                <Icon name="stop" /> <span className="pct">{status.kind === 'running' ? `${Math.floor(status.percent)} %` : t('Abort')}</span>
              </button>
            ) : (
              <button
                className={canRun ? 'primary' : 'run-off'}
                onClick={simulate}
                disabled={status.kind === 'loading' || !!curSub}
                aria-label={t('Run|verb')}
                aria-keyshortcuts="Alt+R Control+Enter"
                title={
                  curSub
                    ? t('Subcircuits are not simulated on their own: go up to a testbench (Alt+↑) to simulate')
                    : canRun
                      ? t('Run the simulation with these parameters (Alt+R / Ctrl+Enter)')
                      : t('Choose what to simulate')
                }
              >
                <Icon name="run" /> {sim && canRun ? t('Re-Run') : t('Run|verb')}
              </button>
            )}
          </div>
        </div>
        {/* siempre a la vista, en su propio grupo (separado de Simular); se habilitan cuando hay resultados (y punto de operación) */}
        <div className="group">
          <button
            className={tool.kind === 'probe' ? 'active' : ''}
            aria-label={t('Measure')}
            title={sim ? t('Probe: click a wire (voltage) or a component (current)') : t('Probe: simulate first')}
            disabled={!sim || stopHidden}
            onClick={() => setTool(tool.kind === 'probe' ? { kind: 'select' } : { kind: 'probe' })}
          >
            <Icon name="probe" />
          </button>
          <button
            className={showNets && hasNets ? 'active' : ''}
            aria-label={t('Nets')}
            aria-keyshortcuts="Alt+N"
            title={t('Show the names of all the nets, without changing the schematic') + ' (Alt+N)'}
            disabled={!hasNets}
            onClick={() => setShowNets((v) => !v)}
          >
            <Icon name="nets" />
          </button>
          <button
            className={showOp && bias ? 'active' : ''}
            aria-label={t('Annotate OP')}
            title={
              bias
                ? /^\.tran\b/i.test(docLine)
                  ? t('Annotate the values at t = 0 on the schematic: the bias with the initial conditions (with uic, the initial state)')
                  : t('Annotate the operating point on the schematic (without changing it)')
                : sim
                  ? t('Operating point: the circuit changed since the last simulation')
                  : t('Operating point: simulate first')
            }
            disabled={!bias}
            onClick={() => setShowOp((v) => !v)}
          >
            <Icon name="op" />
          </button>
        </div>
        <div className="bar-after">
          {curSub ? (
            <span className="sub-simbar">{t('Subcircuit {name}: it is simulated from the testbenches that use it', { name: curSub })}</span>
          ) : (
            <SimBar
              sim={curSim && { name: simName(curSim), custom: !!curSim.name, line: curSim.line }}
              info={circuitInfo()}
              lib={lib ?? undefined}
              state={running ? 'running' : status.kind === 'error' ? 'err' : status.kind === 'aborted' ? 'idle' : sim ? 'ok' : 'idle'}
              stateDetail={
                status.kind === 'running'
                  ? status.percent
                    ? `${status.percent.toFixed(0)} %`
                    : undefined
                  : // el texto del error va a la barra de estado, no a la de simulación
                    status.kind === 'aborted'
                    ? t('Simulation aborted')
                    : status.kind === 'done' && sim
                      ? t('done in {p0} ms', { p0: status.ms.toFixed(0) })
                      : undefined
              }
              picker={picker}
              onPickCancel={() => endPick(null)}
              control={curSim && isComplexLine(curSim.line) ? controlText(tbDoc ?? doc) : undefined}
              pdk={pdkBar}
              onAllCorners={curSim && pdkBar && !pdkBar.fixed ? () => simAllCorners(curSim.id, simName(curSim), pdkBar.corner) : undefined}
              onStudio={openStudy}
              onApply={(line) => (curSub ? setMessage(t('The analysis belongs to the testbench: go up (Alt+↑) to change it')) : commit(setAnalysisLine(doc, line)))}
            />
          )}
        </div>
        {/* el estado de la simulación (#243), a la derecha, bajo el avatar */}
        <div id="sim-state-slot" className="sim-state-slot" />
      </div>
    </>
  );
}
