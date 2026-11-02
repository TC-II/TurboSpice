// El subcircuito (o módulo Verilog) que se edita: su símbolo al día con los puertos (#199), editarlo,
// agregarle un puerto, y adoptar para él (o para el modelo abierto) el netlist o el .asy de otro
import { useEffect, useMemo, type MutableRefObject } from 'react';
import { baseName, type AscDoc } from '../asc/model.ts';
import { verilogFile, verilogPorts } from '../hdl/project.ts';
import { t } from '../i18n/i18n.ts';
import type { Library } from '../library/library.ts';
import { exportSubcktNetlist } from '../project/exchange.ts';
import {
  adoptModelSymbol,
  modelParams,
  modelSymbolText,
  setModelParams,
  setSymAttr as setModelAttr,
  storeModelSymbol,
  storeModelText,
  subcktParams,
  symAttr,
  syncModelAttrs,
} from '../project/modelModule.ts';
import { staleInstances } from '../project/staleInstances.ts';
import { moduleFile, storeSubckt, storeSymbol, subcktFile, subcktPorts, subcktSymbolText, symbolOutdated, updateSymbol } from '../project/subckt.ts';
import { adoptSymbol, symParams } from '../project/symbolEdit.ts';
import type { Project } from '../project/turbo.ts';
import { addFlag } from '../schematic/edit.ts';
import { fetchModelFile } from '../sim/schematicSim.ts';
import { ascText } from './helpers.ts';
import { useEvent } from './useEvent.ts';

export interface SubcktEditingDeps {
  project: Project;
  projectRef: MutableRefObject<Project>;
  setProjectState(p: Project): void;
  editProject(p: Project): void;
  snapshot(): Project;
  /** el subcircuito que se edita ('' en el testbench) */
  curSub: string;
  /** el módulo «Modelo» abierto */
  curModel: string;
  doc: AscDoc;
  liveDoc: AscDoc;
  docRef: MutableRefObject<AscDoc>;
  commit(d: AscDoc): void;
  lib: Library;
  warnShared(): void;
  setMessage(m?: string): void;
}

export function useSubcktEditing({ project, projectRef, setProjectState, editProject, snapshot, curSub, curModel, doc, liveDoc, docRef, commit, lib, warnShared, setMessage }: SubcktEditingDeps) {
  const curModule = curSub ? moduleFile(project, curSub) : undefined;
  const curVerilog = curModule?.kind === 'verilog' ? curModule : undefined;
  const subPorts = useMemo(
    () => (curVerilog ? verilogPorts(curVerilog, subcktSymbolText(project, curSub)).map((x) => x.name) : curSub ? subcktPorts(liveDoc) : []),
    [curSub, curVerilog, liveDoc, project],
  );
  const subPortsKey = subPorts.join(',');
  const syncPorts = useEvent(() => {
    if (!curSub || curVerilog) return;
    const p = storeSubckt(projectRef.current, curSub, ascText(docRef.current));
    if (!symbolOutdated(p, curSub)) return;
    const next = updateSymbol(p, curSub);
    projectRef.current = next;
    setProjectState(next);
    // las instancias ya colocadas no se recablean solas: avisar cuáles quedaron mal (#199)
    lib.setProjectFiles(next.files);
    const stale = staleInstances(next, curSub, lib, (_, nm) => nm ?? '');
    if (stale.length) setMessage(t('The ports of {name} changed: {insts} must be rewired (marked in the project panel)', { name: curSub, insts: stale.map((u) => u.inst).join(', ') }));
  });
  useEffect(() => syncPorts(), [curSub, subPortsKey, syncPorts]);
  const editSymbol = (text: string) => {
    if (!curSub) return;
    const p = storeSymbol(projectRef.current, curSub, text);
    projectRef.current = p;
    editProject(p);
    warnShared();
  };
  const symText = curSub ? subcktSymbolText(project, curSub) : undefined;
  /** Puerto nuevo pedido desde el símbolo (un pin con otro nombre): etiqueta con puerto debajo de las otras */
  const addPort = (name: string) => {
    const fs = doc.flags;
    const x = fs.length ? Math.min(...fs.map((f) => f.x)) : -128;
    const y = (fs.length ? Math.max(...fs.map((f) => f.y)) : -64) + 64;
    commit(addFlag(doc, { x, y }, name, 'BiDir'));
  };
  /** El netlist de un componente existente en el modelo que se edita (el dibujo no se toca): de un
   *  subcircuito del proyecto (o un módulo Verilog sintetizado), su .subckt; de uno de la librería,
   *  su archivo de modelos entero, tal cual. SpiceModel pasa a ser el .subckt/.model que usaba */
  const adoptNetlistFor = async (type: string) => {
    const p0 = projectRef.current;
    if (!curModel) return;
    const vf = verilogFile(p0, type);
    let net = vf ? vf.synth?.subckt : subcktFile(p0, type) ? exportSubcktNetlist(snapshot(), type, lib)?.text : undefined;
    let from = type;
    if (!net) {
      const asy = lib.symbolText(type);
      const at = (k: string) => (asy ? symAttr(asy, k) : '');
      // como el netlist: sin ModelFile, SpiceModel es el archivo y el nombre es Value2 o Value (#ltnetlist)
      const file = at('ModelFile') || (at('Prefix') === 'X' ? at('SpiceModel') : '');
      from = (at('ModelFile') ? at('SpiceModel') || at('Value') : at('Value2') || at('Value')).split(/\s/)[0];
      const rel = file ? lib.resolveModelFile(file) : undefined;
      try {
        net = rel ? (lib.userFile(rel) ?? (await fetchModelFile(rel))) : undefined;
      } catch {
        net = undefined;
      }
    }
    if (!net) return setMessage(t('{sym} has no netlist to import (only subcircuits and components with a model file)', { sym: baseName(type) }));
    let p = storeModelText(p0, curModel, net.endsWith('\n') ? net : `${net}\n`);
    const sym = modelSymbolText(p, curModel);
    // los parámetros del .subckt (params: G=1) van, en orden, a Value, Value2, SpiceLine y SpiceLine2
    const ps = from ? subcktParams(net, from) : [];
    if (sym && from) p = storeModelSymbol(p, curModel, setModelParams(syncModelAttrs(setModelAttr(sym, 'SpiceModel', from), net), ps.length ? ps : modelParams(sym)));
    projectRef.current = p;
    editProject(p);
    setMessage(t('Netlist of {sym} imported into {name}: check the pins of the symbol', { sym: baseName(type), name: curModel }));
  };
  /** Un .asy existente como símbolo del subcircuito (o del modelo) que se edita (#199) */
  const adoptSymbolFor = (type: string) => {
    const asy = lib.symbolText(type) ?? (curModel ? subcktSymbolText(projectRef.current, type) : undefined);
    if (asy && curModel) {
      // el código no se toca: los pines se pasan al .lib con «Update pins in .lib»
      const p = storeModelSymbol(projectRef.current, curModel, adoptModelSymbol(asy, modelSymbolText(projectRef.current, curModel) ?? '', curModel));
      projectRef.current = p;
      editProject(p);
      return setMessage(t('Symbol {sym} adopted: to pass its pins to the code, use «Update pins in .lib»', { sym: baseName(type) }));
    }
    if (!curSub || !asy) return setMessage(t('Symbol not found: {p0}', { p0: type }));
    if (subcktFile(projectRef.current, type)) return setMessage(t('Choose a symbol from the library, not another subcircuit'));
    const ports = subPorts.map((n) => ({ name: n, dir: liveDoc.flags.find((f) => f.name === n)?.ioPin }));
    editSymbol(adoptSymbol(asy, ports, symText ? symParams(symText) : []));
    setMessage(t('Symbol {sym} adopted: check the port of each pin («Port of each pin», under the symbol)', { sym: baseName(type) }));
  };
  return { curVerilog, subPorts, editSymbol, symText, addPort, adoptNetlistFor, adoptSymbolFor };
}
