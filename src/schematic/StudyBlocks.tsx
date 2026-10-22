// Editor de bloques del Estudio (Blockly). Se carga aparte (import dinámico) para no agrandar
// la carga inicial. Los bloques y su compilación están en src/sim/studyBlocks.ts.
import { useEffect, useRef } from 'react';
import * as Blockly from 'blockly/core';
import 'blockly/blocks';
import * as En from 'blockly/msg/en';
import * as Es from 'blockly/msg/es';
import { blockDefinitions, toolbox, type WorkspaceJson } from '../sim/studyBlocks.ts';
import type { StudyInfo } from './StudyPanel.tsx';
import { getLang, t } from '../i18n/i18n.ts';

// los textos propios de Blockly (menús, «Eliminar bloque»…), en el idioma de la interfaz
Blockly.setLocale((getLang() === 'es' ? Es : En) as unknown as Record<string, string>);

/** Opciones de los desplegables "qué variar": se leen del circuito abierto */
let currentInfo: StudyInfo | null = null;

function targetOptions(): [string, string][] {
  const info = currentInfo;
  const opts: [string, string][] = [];
  for (const c of info?.components ?? []) if (/^[RCL]$/i.test(c.prefix)) opts.push([`${c.name} (${c.value})`, `component:${c.name}`]);
  for (const s of info?.sources ?? []) opts.push([t('source {s}', { s }), `source:${s}`]);
  for (const p of info?.params ?? []) opts.push([t('parameter {p}', { p }), `param:${p}`]);
  opts.push([t('the temperature'), 'temp']);
  return opts;
}

let defined = false;
function defineBlocks() {
  if (defined) return;
  defined = true;
  Blockly.common.defineBlocksWithJsonArray(blockDefinitions());
  // desplegables con los componentes, fuentes y parámetros del circuito
  for (const type of ['ts_for_list', 'ts_for_range', 'ts_set']) {
    const def = Blockly.Blocks[type];
    const init = def.init;
    def.init = function (this: Blockly.Block) {
      init.call(this);
      const old = this.getField('TARGET')!;
      const input = old.getParentInput();
      const idx = input.fieldRow.indexOf(old);
      input.removeField('TARGET');
      input.insertFieldAt(idx, new Blockly.FieldDropdown(targetOptions as () => [string, string][], (v) => v), 'TARGET');
    };
  }
}

function theme(dark: boolean): Blockly.Theme {
  return Blockly.Theme.defineTheme(dark ? 'ts-dark' : 'ts-light', {
    name: dark ? 'ts-dark' : 'ts-light',
    base: Blockly.Themes.Classic,
    componentStyles: dark
      ? {
          workspaceBackgroundColour: '#1e2126',
          toolboxBackgroundColour: '#16181c',
          toolboxForegroundColour: '#e4e6ea',
          flyoutBackgroundColour: '#262a30',
          flyoutForegroundColour: '#e4e6ea',
          scrollbarColour: '#4a4f57',
          insertionMarkerColour: '#ffffff',
        }
      : { workspaceBackgroundColour: '#fafbfc', toolboxBackgroundColour: '#f4f5f7', flyoutBackgroundColour: '#eceef1' },
    fontStyle: { family: 'system-ui, sans-serif', size: 11 },
  });
}

const isDark = () => {
  const tt = document.documentElement.getAttribute('data-theme');
  return tt ? tt === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};

export default function StudyBlocks({ initial, info, onChange }: { initial: WorkspaceJson; info: StudyInfo; onChange(ws: WorkspaceJson): void }) {
  const host = useRef<HTMLDivElement>(null);
  const changed = useRef(onChange);
  changed.current = onChange;
  currentInfo = info;

  useEffect(() => {
    defineBlocks();
    const ws = Blockly.inject(host.current!, {
      toolbox: toolbox() as Blockly.utils.toolbox.ToolboxDefinition,
      renderer: 'zelos',
      theme: theme(isDark()),
      trashcan: true,
      zoom: { controls: true, wheel: true, startScale: 0.75, maxScale: 2, minScale: 0.3 },
      grid: { spacing: 24, length: 2, colour: isDark() ? '#30353d' : '#dde0e5', snap: true },
      move: { scrollbars: true, drag: true, wheel: false },
    });
    try {
      Blockly.serialization.workspaces.load(initial as object, ws);
    } catch {
      // un programa que no se puede cargar (bloques de otra versión): se empieza vacío
    }
    const listener = (e: Blockly.Events.Abstract) => {
      if (e.isUiEvent) return;
      changed.current(Blockly.serialization.workspaces.save(ws) as WorkspaceJson);
    };
    ws.addChangeListener(listener);
    // para pruebas automáticas: cargar un programa (JSON de Blockly) en el editor
    (host.current as HTMLDivElement & { loadProgram?(json: object): void }).loadProgram = (json) => {
      Blockly.serialization.workspaces.load(json, ws);
      changed.current(Blockly.serialization.workspaces.save(ws) as WorkspaceJson);
    };
    const ro = new ResizeObserver(() => Blockly.svgResize(ws));
    ro.observe(host.current!);
    return () => {
      ro.disconnect();
      ws.dispose();
    };
    // el programa inicial se carga una sola vez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="study-blocks" ref={host} />;
}
