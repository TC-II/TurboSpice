// Tipos compartidos por el modo esquemático y sus partes (src/app)
import type { AscDoc, Point } from '../asc/model.ts';
import type { SimResult } from '../engine/ngspice.ts';
import type { Level } from '../project/Hierarchy.tsx';
import type { saveFile } from '../schematic/fileio.ts';
import type { FoundLine } from '../schematic/directivesEdit.ts';
import type { AnalysisKind } from '../sim/analyses.ts';
import type { MeasTable } from '../sim/measResults.ts';
import type { SavableSignal } from '../sim/saves.ts';
import type { BuiltSimulation } from '../sim/schematicSim.ts';

export type Dialog =
  | { kind: 'picker'; forSymbol?: boolean; forNetlist?: boolean }
  | { kind: 'attrs'; index: number; label?: number; generic?: boolean }
  | { kind: 'switch'; index: number }
  | { kind: 'source'; index: number }
  | { kind: 'text'; index?: number; textKind: 'directive' | 'comment' }
  | { kind: 'flag'; index?: number; at?: Point; ioPin?: string }
  | { kind: 'sim'; found: FoundLine | null; analysis?: AnalysisKind }
  | { kind: 'control'; index: number }
  /** qué señales se guardan (#314); `signals` llega después de armar la netlist */
  | { kind: 'share'; url: string }
  | { kind: 'export' }
  | { kind: 'help' }
  | { kind: 'userfiles' }
  | { kind: 'importinfo' }
  | { kind: 'study' }
  | { kind: 'runs' }
  | { kind: 'about' }
  | { kind: 'settings' }
  | { kind: 'drive' }
  /** borrar una simulación (con el control deslizante) */
  | { kind: 'deleteSim'; id: string }
  | { kind: 'deleteVariant'; id: string }
  | { kind: 'projectfiles' }
  /** módulo nuevo (#209): esquemático o Verilog, el que se eligió en «+ New» */
  | { kind: 'newModule'; module: 'schematic' | 'verilog' }
  /** pedir un nombre (testbench o subcircuito, #180) */
  | { kind: 'name'; title: string; label: string; initial: string; check(name: string): string | null; onOk(name: string): void }
  /** parámetros y variables del testbench (#180) */
  | { kind: 'benchParams' }
  /** confirmar con el control deslizante */
  | { kind: 'slide'; title: string; message: string; onConfirm(): void }
  /** estilo de línea para las figuras indicadas y las que se dibujen después */
  | { kind: 'lineStyle'; shapes: number[] };

/** Nivel de la jerarquía abierto (#180): prefijo de sus vectores en ngspice y red de arriba de cada puerto */
export interface HierLevel extends Level {
  prefix: string;
  ports: Map<string, string>;
}

export interface SimRun {
  built: BuiltSimulation;
  result: SimResult;
  doc: AscDoc;
  meas: MeasTable | null;
}

export interface FileState {
  name: string;
  handle?: Parameters<typeof saveFile>[2];
  /** id del archivo en Google Drive (si se abrió o guardó ahí) */
  driveId?: string;
  /** versión del archivo en Drive cuando se abrió o guardó: si cambió, otro lo modificó (#156) */
  driveVersion?: string;
}

/** El panel de señales guardadas (#314, #364): qué se guarda y, armada la netlist, lo que se puede guardar */
export interface SavesState {
  mode: 'all' | 'some';
  signals?: SavableSignal[];
  built?: BuiltSimulation;
  /** gris mientras se simula: la punta de prueba grafica */
  inactive?: boolean;
  picking?: boolean;
}
