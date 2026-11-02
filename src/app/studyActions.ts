// El Studio (#241) y los diálogos de simulación: Complex simulation, barrer un parámetro de un
// subcircuito (#180), lo que el Studio sabe del circuito y abrir el comando de análisis o el .control
import type { AscDoc } from '../asc/model.ts';
import { effectiveAttrs } from '../asc/resolve.ts';
import { t } from '../i18n/i18n.ts';
import type { Library } from '../library/library.ts';
import { formatParamList, parseParamList } from '../project/symbolEdit.ts';
import { findAnalysis, findControl } from '../schematic/directivesEdit.ts';
import { addText, setSymbolAttrs } from '../schematic/edit.ts';
import type { CircuitInfo } from '../schematic/simDialogs.tsx';
import type { StudyInfo } from '../schematic/StudyPanel.tsx';
import { parseAnalysis, type AnalysisKind } from '../sim/analyses.ts';
import { hasParkedControl, isComplexLine, unparkControl } from '../sim/complexSim.ts';
import type { Dialog } from './types.ts';

export interface StudyDeps {
  doc: AscDoc;
  docLine: string;
  curSub: string;
  lib: Library;
  commit(d: AscDoc): void;
  circuitInfo(): CircuitInfo;
  setDialog(d: Dialog | null): void;
  setMessage(m?: string): void;
}

export function studyActions({ doc, docLine, curSub, lib, commit, circuitInfo, setDialog, setMessage }: StudyDeps) {
  const openStudy = () => setDialog({ kind: 'study' });
  /**
   * Complex simulation (#241): si el testbench ya lo es, abre el Studio; si pasó a un análisis
   * simple, recupera su .control; si nunca tuvo, abre el Studio para armarlo
   */
  const complexSim = () => {
    if (curSub) return setMessage(t('The analysis belongs to the testbench: go up (Alt+↑) to change it'));
    if (!isComplexLine(docLine) && hasParkedControl(doc)) return commit(unparkControl(doc));
    openStudy();
  };
  /**
   * Barrer un parámetro de un subcircuito en una instancia (#180): la instancia pasa a usar
   * {U1_G} y se agrega «.step param U1_G list <valor>», que el Estudio muestra como un barrido
   */
  const sweepSubParam = (index: number, param: string, value: string, attrs: Record<string, string>) => {
    const s = doc.symbols[index];
    if (!s) return;
    const def = lib.symbol(s.type);
    const inst = s.attrs.get('InstName') ?? 'X';
    const pname = `${inst}_${param}`.replace(/\W/g, '_');
    const eff = attrs.SpiceLine ?? effectiveAttrs(s, def).get('SpiceLine') ?? '';
    const defaults = parseParamList(def?.attrs.get('SpiceLine') ?? '');
    const cur = new Map(parseParamList(eff).map(([k, v]) => [k.toLowerCase(), v]));
    cur.set(param.toLowerCase(), `{${pname}}`);
    const line = formatParamList(defaults.map(([k, d]): [string, string] => [k, cur.get(k.toLowerCase()) ?? d]).filter(([k, v], i) => v !== defaults[i][1] && k));
    let d = setSymbolAttrs(doc, index, { ...attrs, SpiceLine: line });
    const step = `.step param ${pname} list ${/^\{.*\}$/.test(value) ? '1' : value}`;
    if (!d.texts.some((tt) => tt.kind === 'directive' && new RegExp(`\\.step\\s+param\\s+${pname}\\b`, 'i').test(tt.text))) {
      const ys = [...d.symbols.map((x) => x.y), ...d.texts.map((x) => x.y), ...d.wires.flatMap((w) => [w.y1, w.y2]), 0];
      const xs = [...d.symbols.map((x) => x.x), ...d.wires.flatMap((w) => [w.x1, w.x2]), 0];
      d = addText(d, { x: Math.min(...xs), y: Math.max(...ys) + 96, align: 'Left', size: 2, kind: 'directive', text: step });
    }
    setDialog(null);
    commit(d);
    setMessage(t('{inst}: {param} = {{pname}}, swept with {step}. Edit the values in the Studio.', { inst, param, pname, step }));
    setDialog({ kind: 'study' });
  };
  const studyInfo = (): StudyInfo => {
    const found = findAnalysis(doc);
    const kind = found ? parseAnalysis(found.value)?.kind : undefined;
    const analysis = kind === 'ac' || kind === 'dc' || kind === 'noise' || kind === 'op' || kind === 'tf' ? kind : 'tran';
    const params = new Set<string>();
    for (const tt of doc.texts) {
      if (tt.kind !== 'directive') continue;
      for (const l of tt.text.split('\\n')) for (const m of l.matchAll(/^\s*\.param\s+(.*)$/gi)) for (const p of m[1].matchAll(/([A-Za-z_]\w*)\s*=/g)) params.add(p[1]);
    }
    return {
      components: doc.symbols
        .map((x) => effectiveAttrs(x, lib.symbol(x.type)))
        .filter((a) => a.get('Prefix'))
        .map((a) => ({ name: a.get('InstName') ?? '', prefix: (a.get('Prefix') ?? '')[0], value: a.get('Value') ?? '' }))
        .filter((c) => c.name),
      sources: circuitInfo().sources,
      nets: circuitInfo().nets,
      params: [...params],
      analysis,
    };
  };

  /** Menú de simulación; con un tipo de análisis, abre en ese tipo */
  const openSimulation = (analysis?: AnalysisKind) => setDialog({ kind: 'sim', found: findAnalysis(doc), analysis });
  const openControl = () => setDialog({ kind: 'control', index: findControl(doc) });
  return { openStudy, complexSim, sweepSubParam, studyInfo, openSimulation, openControl };
}
