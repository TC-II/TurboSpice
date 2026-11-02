// Los editores de los módulos del proyecto, junto al esquemático: el símbolo de un subcircuito, un
// módulo «Modelo» (netlist y símbolo) y el código de un módulo Verilog (#209)
import { Suspense } from 'react';
import type { AscDoc } from '../asc/model.ts';
import type { SynthResult } from '../hdl/yosys.ts';
import { isStale, looksBehavioral, setHdlMode, storeVerilog, verilogSymbol, withParams } from '../hdl/project.ts';
import { VerilogModule } from '../hdl/VerilogModule.tsx';
import { ModelEditor, SymbolEditor } from '../lazyViews.ts';
import { modelModuleFile, modelSymbolText, storeModelSymbol, storeModelText } from '../project/modelModule.ts';
import { subcktSymbol } from '../project/subckt.ts';
import { setSymParams, symParams } from '../project/symbolEdit.ts';
import type { Project, ProjectFile } from '../project/turbo.ts';
import { useSchematic } from './context.ts';

export interface ModuleEditorsProps {
  project: Project;
  /** el módulo Verilog que se edita */
  curVerilog: ProjectFile | undefined;
  /** el módulo «Modelo» abierto */
  curModel: string;
  setCurModel(name: string): void;
  /** el .asy del subcircuito */
  symText: string | undefined;
  subPorts: string[];
  editSymbol(text: string): void;
  addPort(name: string): void;
  setSymW(w: number): void;
  liveDoc: AscDoc;
  synthModule(name: string, text?: string): Promise<SynthResult>;
  /** avisa si el subcircuito se usa en otros testbenches */
  warnShared(): void;
}

export function ModuleEditors({ project, curVerilog, curModel, setCurModel, symText, subPorts, editSymbol, addPort, setSymW, liveDoc, synthModule, warnShared }: ModuleEditorsProps) {
  const { projectRef, editProject, curSub, setDialog } = useSchematic();
  return (
    <>
    {curSub && symText && (
      <Suspense fallback={null}>
      <SymbolEditor
        name={curSub}
        text={symText}
        ports={subPorts}
        onChange={editSymbol}
        onParams={(ps) => editSymbol(curVerilog ? withParams(symText, ps) : setSymParams(symText, ps))}
        onReset={() =>
          editSymbol(curVerilog?.synth ? setSymParams(verilogSymbol(curSub, curVerilog.synth), symParams(symText)) : setSymParams(subcktSymbol(curSub, liveDoc).text, symParams(symText)))
        }
        onPickSymbol={() => setDialog({ kind: 'picker', forSymbol: true })}
        onWidth={setSymW}
        onAddPort={addPort}
      />
      </Suspense>
    )}
    {curModel && modelModuleFile(project, curModel) && (
      <Suspense fallback={null}>
      <ModelEditor
        name={curModel}
        text={modelModuleFile(project, curModel)!.text}
        symText={modelSymbolText(project, curModel) ?? ''}
        onText={(text) => {
          const p = storeModelText(projectRef.current, curModel, text);
          projectRef.current = p;
          editProject(p);
        }}
        onSymbol={(text) => {
          const p = storeModelSymbol(projectRef.current, curModel, text);
          projectRef.current = p;
          editProject(p);
        }}
        onPickSymbol={() => setDialog({ kind: 'picker', forSymbol: true })}
        onPickNetlist={() => setDialog({ kind: 'picker', forNetlist: true })}
        onClose={() => setCurModel('')}
      />
      </Suspense>
    )}
    {curVerilog && (
      <VerilogModule
        name={curSub}
        text={curVerilog.text}
        stale={isStale(curVerilog)}
        mode={curVerilog.hdl === 'behavioral' ? 'behavioral' : 'synth'}
        suggestBehavioral={curVerilog.hdl !== 'behavioral' && looksBehavioral(curVerilog.text)}
        onMode={(m) => {
          const p = setHdlMode(projectRef.current, curSub, m);
          projectRef.current = p;
          editProject(p);
        }}
        pins={curVerilog.synth?.pins ?? []}
        params={symText ? symParams(symText) : []}
        onText={(text) => {
          const p = storeVerilog(projectRef.current, curSub, text);
          projectRef.current = p;
          editProject(p);
          warnShared();
        }}
        onSynthesize={(text) => synthModule(curSub, text)}
        onParams={(ps) => symText && editSymbol(withParams(symText, ps))}
      />
    )}
    </>
  );
}
