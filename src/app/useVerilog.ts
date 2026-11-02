// Módulos Verilog (#209): <nombre>.v + <nombre>.asy, como un subcircuito esquemático. Sintetizar
// (Yosys) o compilar el comportamiento (Icarus), y las instancias con otros parameter (variantes)
import { useRef, type MutableRefObject } from 'react';
import { compileBehavioral, synthesizeVerilog } from '../hdl/client.ts';
import { applySynth, isStale, moduleOf, verilogFile, verilogModules, verilogSources, vvpFileOf } from '../hdl/project.ts';
import { applyVariants, renameSubckt as renameVariant, withSubckts } from '../hdl/variants.ts';
import type { SynthResult } from '../hdl/yosys.ts';
import { t } from '../i18n/i18n.ts';
import { PROJECT_DIR, type Library } from '../library/library.ts';
import type { Status } from '../NetlistMode.tsx';
import type { Project } from '../project/turbo.ts';

export interface VerilogDeps {
  lib: Library;
  projectRef: MutableRefObject<Project>;
  editProject(p: Project): void;
  setLibVersion(f: (v: number) => number): void;
  setStatus(s: Status): void;
  setMessage(m?: string): void;
}

export function useVerilog({ lib, projectRef, editProject, setLibVersion, setStatus, setMessage }: VerilogDeps) {
  /** Sintetiza el módulo `name` (con `text`, o el código que tiene el proyecto) y guarda el resultado y su símbolo */
  const synthModule = async (name: string, text?: string): Promise<SynthResult> => {
    const f = verilogFile(projectRef.current, name);
    if (!f) return { error: t('There is no Verilog module {name}', { name }), log: '' };
    const src = text ?? f.text;
    const code = src.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
    if (!new RegExp(`^\\s*module\\s+${name}\\b`, 'm').test(code)) return { error: t('{file} has to define the module {name} (the name of the file)', { file: f.name, name }), log: '' };
    const sources = verilogSources(projectRef.current, { name: f.name, text: src });
    // comportamiento: Icarus (.vvp para d_cosim); si no, síntesis con Yosys
    const r = f.hdl === 'behavioral' ? await compileBehavioral(sources, f.name, name, vvpFileOf(name)) : await synthesizeVerilog(sources, f.name, name);
    if (r.block) {
      const p = applySynth(projectRef.current, name, src, r.block, r.vvp);
      projectRef.current = p;
      editProject(p);
      lib.setProjectFiles(p.files);
      setLibVersion((v) => v + 1);
    }
    return r;
  };
  const synthAndReport = async (name: string) => {
    setMessage(t('Synthesizing {name}…', { name }));
    try {
      const r = await synthModule(name);
      setMessage(r.error ? t('{name}: {error}', { name, error: r.error }) : t('{name}: symbol ready in the component browser (F2) under "{PROJECT_DIR}"', { name, PROJECT_DIR }));
    } catch (e) {
      setMessage(t('Yosys could not run: {msg}', { msg: (e as Error).message }));
    }
  };
  /** Antes de simular: sintetiza los módulos Verilog que cambiaron desde la última vez */
  const synthStale = async () => {
    for (const f of verilogModules(projectRef.current).filter(isStale)) {
      setStatus({ kind: 'running', percent: 0, text: t('Synthesizing {name}…', { name: f.name }) });
      const r = await synthModule(moduleOf(f));
      if (r.error) throw new Error(`${f.name}: ${r.error}`);
    }
  };
  /**
   * Antes de mandar la netlist al motor: las instancias con otro parameter usan su propia síntesis
   * (en memoria mientras no cambie el código), y los bloques de comportamiento necesitan su .vvp
   */
  const variantCache = useRef(new Map<string, { subckt: string; vvp?: string }>());
  const withVariants = async (netlist: string): Promise<{ netlist: string; files: Record<string, string>; warnings: string[] }> => {
    const p = projectRef.current;
    const mods = verilogModules(p).filter((f) => f.synth);
    const v = applyVariants(
      netlist,
      mods.map((f) => ({ name: moduleOf(f), params: f.synth!.params })),
    );
    const files: Record<string, string> = {};
    for (const f of mods) if (f.synth!.vvp) files[vvpFileOf(moduleOf(f))] = f.synth!.vvp;
    const subs: string[] = [];
    for (const n of v.needs) {
      const f = verilogFile(p, n.module)!;
      const k = `${n.name}\u0000${f.hdl ?? ''}\u0000${f.text}`;
      let hit = variantCache.current.get(k);
      if (!hit) {
        const label = `${moduleOf(f)} (${Object.entries(n.params)
          .map(([a, b]) => `${a}=${b}`)
          .join(' ')})`;
        setStatus({ kind: 'running', percent: 0, text: t('Synthesizing {name}…', { name: label }) });
        const r =
          f.hdl === 'behavioral'
            ? await compileBehavioral(verilogSources(p), f.name, moduleOf(f), vvpFileOf(n.name), n.params)
            : await synthesizeVerilog(verilogSources(p), f.name, moduleOf(f), n.params);
        if (!r.block) throw new Error(`${label}: ${r.error}`);
        hit = { subckt: renameVariant(r.block.subckt, r.block.name, n.name), ...(r.vvp ? { vvp: r.vvp } : {}) };
        variantCache.current.set(k, hit);
      }
      subs.push(hit.subckt);
      if (hit.vvp) files[vvpFileOf(n.name)] = hit.vvp;
    }
    // Icarus (libvvp) corre una sola simulación por vez: un solo bloque de comportamiento
    const cosims = (withSubckts(v.netlist, subs).match(/^\s*x\S*\s.*$/gim) ?? []).filter((l) => mods.some((f) => f.synth!.vvp && new RegExp(`\\s${moduleOf(f)}(__\\w+)?(\\s|$)`, 'i').test(l)));
    if (cosims.length > 1) throw new Error(t('Only one behavioral Verilog block (Icarus) per simulation for now: there are {n}', { n: cosims.length }));
    return { netlist: withSubckts(v.netlist, subs), files, warnings: v.warnings };
  };
  return { synthModule, synthAndReport, synthStale, withVariants };
}
