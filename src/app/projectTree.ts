// Lo que muestra el panel del proyecto (#180): los testbenches de la variante, con sus parámetros, y
// los módulos (subcircuitos, Verilog y modelos) con sus usos, sus hijos y lo que quedó desactualizado
import type { AscDoc } from '../asc/model.ts';
import { parseAsc } from '../asc/parse.ts';
import { isStale, verilogPorts } from '../hdl/project.ts';
import { t } from '../i18n/i18n.ts';
import type { Library } from '../library/library.ts';
import type { TreeSub } from '../project/Hierarchy.tsx';
import { modelModuleName, modelModules, modelSymbolText } from '../project/modelModule.ts';
import { lineOf, storeActive, type variantOf } from '../project/project.ts';
import { staleInstances } from '../project/staleInstances.ts';
import { childSubckts, modules, storeSubckt, subName, subcktPorts, subcktSymbolText, symbolOutdated, usages } from '../project/subckt.ts';
import type { Project } from '../project/turbo.ts';
import { benchParams, benchVariables } from '../schematic/benchParams.ts';
import { analysisDetail, analysisLabel, type SimList } from '../sim/simList.ts';
import { ascText } from './helpers.ts';

type Usage = ReturnType<typeof usages>[number];

/** Los testbenches de la variante; el que se edita, con su circuito en vivo */
export function treeBenchesOf(variant: ReturnType<typeof variantOf>, sims: SimList, curSub: string, liveDoc: AscDoc) {
  return variant.sims.map((x) => {
    const line = sims.items.find((y) => y.id === x.id)?.line ?? '';
    const d = x.id === sims.active && !curSub ? liveDoc : parseAsc(x.asc);
    // sin nombre propio, el automático con el análisis en vivo (el que se está editando)
    return {
      id: x.id,
      name: x.name || (line ? analysisLabel(line) : t('No analysis')),
      detail: line ? analysisDetail(line) : t('No analysis'),
      ...(x.group ? { group: x.group } : {}),
      runs: x.runs.length,
      params: benchParams(d),
      steps: benchVariables(d),
    };
  });
}

/** Los módulos del proyecto (con lo que se edita guardado); `goUsage` va a una instancia */
export function treeSubsOf(project: Project, curSub: string, liveDoc: AscDoc, lib: Library, goUsage: (u: Usage, name: string) => void): TreeSub[] {
  const p = curSub ? storeSubckt(project, curSub, ascText(liveDoc)) : storeActive(project, ascText(liveDoc));
  const label = (asc: string, nm?: string) => nm || (lineOf(asc) ? analysisLabel(lineOf(asc)) : t('No analysis'));
  return modules(p)
    .map((f) => {
      const name = subName(f.name);
      // un módulo Verilog (#209): sus pines son los de la última síntesis
      if (f.kind === 'verilog')
        return {
          name,
          ports: verilogPorts(f, subcktSymbolText(p, name)).length,
          uses: usages(p, name, label).map((u) => ({ label: u.where.label, inst: u.inst, go: () => goUsage(u, name) })),
          children: [],
          outdated: false,
          text: false,
          type: 'verilog' as const,
          ...(isStale(f) ? { unsynthesized: true } : {}),
        };
      const stale = staleInstances(p, name, lib, label).map((u) => ({
        label: u.where.label,
        inst: u.inst,
        go: () => goUsage(u, name),
        detail: [
          ...(u.unconnected.length
            ? [u.unconnected.length === 1 ? t('pin {pins} not connected', { pins: u.unconnected[0] }) : t('pins {pins} not connected', { pins: u.unconnected.join(', ') })]
            : []),
          ...(u.dangling ? [t('a wire ends on the symbol without a pin (was a port removed?)')] : []),
        ].join('; '),
      }));
      return {
        ...(stale.length ? { stale } : {}),
        name,
        ports: subcktPorts(parseAsc(f.text)).length,
        uses: usages(p, name, (asc, nm) => nm || (lineOf(asc) ? analysisLabel(lineOf(asc)) : t('No analysis'))).map((u) => ({ label: u.where.label, inst: u.inst, go: () => goUsage(u, name) })),
        children: childSubckts(p, f.text),
        outdated: symbolOutdated(p, name),
        text: false,
      };
    })
    .concat(
      modelModules(p).map((f): TreeSub => {
        const name = modelModuleName(f);
        return {
          name,
          type: 'model',
          ports: (modelSymbolText(p, name)?.match(/^PIN\s/gm) ?? []).length,
          uses: usages(p, name, label).map((u) => ({ label: u.where.label, inst: u.inst, go: () => goUsage(u, name) })),
          children: [],
          outdated: false,
          text: false,
        };
      }),
    );
}
