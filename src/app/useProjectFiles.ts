// Los archivos del proyecto (símbolos, modelos y módulos que van en el .turbo): agregarlos (si uno
// repetido cambió, se pregunta qué hacer), quitarlos y hacer el símbolo de un .subckt
import { useState, type MutableRefObject } from 'react';
import { moduleOf } from '../hdl/project.ts';
import { t } from '../i18n/i18n.ts';
import { PROJECT_DIR } from '../library/library.ts';
import { makeSymbol, subcktPins } from '../library/makeSymbol.ts';
import { mergeFiles, projectFileKind, type FileConflict } from '../project/project.ts';
import type { Project } from '../project/turbo.ts';

export interface ProjectFilesDeps {
  projectRef: MutableRefObject<Project>;
  editProject(p: Project): void;
  /** sintetiza un módulo Verilog agregado */
  synthAndReport(name: string): Promise<void>;
  setMessage(m?: string): void;
}

export function useProjectFiles({ projectRef, editProject, synthAndReport, setMessage }: ProjectFilesDeps) {
  // archivo repetido con otro contenido: se pregunta qué hacer
  const [conflict, setConflict] = useState<{ name: string; resolve(c: FileConflict): void } | null>(null);
  const askConflict = (name: string) => new Promise<FileConflict>((resolve) => setConflict({ name, resolve }));
  /** Agrega símbolos y modelos al proyecto (los demás tipos se ignoran) */
  const addProjectFiles = async (list: { name: string; text: string }[]) => {
    const incoming = list.flatMap((f) => {
      const kind = projectFileKind(f.name);
      return kind ? [{ name: f.name, kind, text: f.text }] : [];
    });
    if (!incoming.length) return;
    const r = await mergeFiles(projectRef.current.files, incoming, askConflict);
    if (r.added.length) {
      // (antes de sintetizar: synthAndReport busca el módulo en projectRef)
      projectRef.current = { ...projectRef.current, files: r.files };
      editProject(projectRef.current);
    }
    setMessage(r.added.length ? t('Added to the project: {p0}', { p0: r.added.join(', ') }) : t('Nothing was added (they were already there)'));
    // un .v agregado es un módulo: se sintetiza enseguida (así aparece su símbolo)
    for (const name of r.added) if (projectFileKind(name) === 'verilog') await synthAndReport(moduleOf({ name }));
  };
  const removeProjectFile = (name: string) => editProject({ ...projectRef.current, files: projectRef.current.files.filter((f) => f.name !== name) });
  /** Símbolo para un .subckt de un archivo de modelos del proyecto */
  const makeProjectSymbol = (file: string, name: string) => {
    const f = projectRef.current.files.find((x) => x.name === file);
    const pins = f && subcktPins(f.text, name);
    if (!pins) return setMessage(t('No .subckt {name} found in {file}', { name, file }));
    const sym = { name: `${name}.asy`, kind: 'symbol' as const, text: makeSymbol({ name, pins, block: false, modelFile: file }) };
    editProject({ ...projectRef.current, files: [...projectRef.current.files.filter((x) => x.name.toLowerCase() !== sym.name.toLowerCase()), sym] });
    setMessage(t('Symbol {name} created: it\'s in the component browser (P) under "{PROJECT_DIR}"', { name, PROJECT_DIR }));
  };
  return { conflict, setConflict, askConflict, addProjectFiles, removeProjectFile, makeProjectSymbol };
}
