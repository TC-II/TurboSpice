// Importar a este proyecto (#157) y exportar: subcircuitos (.zip con lo que usan, o su netlist),
// pasarlos a «My symbols and models» y el .zip para LTspice
import { useRef, type MutableRefObject } from 'react';
import { parseAsc } from '../asc/parse.ts';
import { verilogFile } from '../hdl/project.ts';
import { t } from '../i18n/i18n.ts';
import type { Library } from '../library/library.ts';
import { exportAllZip, exportSubcktNetlist, exportSubcktZip, exportVariantZip, importEntries, subcktFilesFor, subcktFilesFrom, type Imported } from '../project/exchange.ts';
import { mergeFiles, type FileConflict } from '../project/project.ts';
import { subcktSymbol } from '../project/subckt.ts';
import { asBenches, newId, type Project } from '../project/turbo.ts';
import { readZip, type ZipEntry } from '../project/zip.ts';
import type { UserFile } from '../schematic/autosave.ts';
import { download } from '../schematic/exportSchematic.ts';
import type { Tool } from '../schematic/SchematicEditor.tsx';
import { registerUserFile } from './helpers.ts';
import type { FileState } from './types.ts';

export interface ImportExportDeps {
  lib: Library;
  projectRef: MutableRefObject<Project>;
  editProject(p: Project): void;
  snapshot(): Project;
  markDirty(): void;
  leave(): Project;
  enter(p: Project, refit?: boolean): void;
  confirmDiscard(): boolean;
  openBytes(bytes: Uint8Array, name: string, at?: Pick<FileState, 'handle' | 'driveId' | 'driveVersion'>): Promise<void>;
  /** qué hacer con un archivo que ya está en el proyecto */
  askConflict(name: string): Promise<FileConflict>;
  userFiles: UserFile[];
  storeUserFiles(next: UserFile[]): void;
  setTool(tt: Tool): void;
  setMessage(m?: string): void;
}

export function useImportExport({ lib, projectRef, editProject, snapshot, markDirty, leave, enter, confirmDiscard, openBytes, askConflict, userFiles, storeUserFiles, setTool, setMessage }: ImportExportDeps) {
  // Importar a este proyecto (#157): un .zip (cada carpeta, y la raíz, es una variante) o archivos
  // sueltos (cada .asc, una variante); los símbolos y modelos van a los archivos del proyecto
  const importInput = useRef<HTMLInputElement>(null);
  const importFiles = async (list: File[]) => {
    // un .turbo es un proyecto entero: se abre (Abrir lleva a Importar)
    const turbo = list.find((f) => /\.turbo$/i.test(f.name));
    if (turbo) {
      if (!confirmDiscard()) return;
      try {
        return void (await openBytes(new Uint8Array(await turbo.arrayBuffer()), turbo.name, {}));
      } catch (e) {
        return setMessage(t('Could not open: {p0}', { p0: (e as Error).message }));
      }
    }
    try {
      let p = leave();
      const before = new Set(p.variants.map((v) => v.id));
      const variants: string[] = [];
      const files: Project['files'] = [];
      const damaged: Imported['damaged'] = [];
      const loose: ZipEntry[] = [];
      for (const f of list) {
        const data = new Uint8Array(await f.arrayBuffer());
        if (!/\.zip$/i.test(f.name)) {
          loose.push({ path: f.name, data });
          continue;
        }
        const r = importEntries(p, await readZip(data), f.name);
        p = r.project;
        variants.push(...r.variants);
        files.push(...r.files);
        damaged.push(...r.damaged);
      }
      if (loose.length) {
        const r = importEntries(p, loose);
        p = r.project;
        variants.push(...r.variants);
        files.push(...r.files);
        damaged.push(...r.damaged);
      }
      // cada .asc (o carpeta de un .zip) importado es un workbench propio con sus testbenches
      const fresh = p.variants.filter((v) => !before.has(v.id));
      const groups = [...p.groups, ...fresh.map((v) => ({ id: `g_${v.id}`, name: v.name }))];
      p = {
        ...p,
        groups,
        variants: p.variants.map((v) => {
          if (before.has(v.id)) return v;
          // (un .asc sin análisis no trae simulaciones: su único testbench es el circuito)
          const sims = v.sims.length ? v.sims : [{ id: newId('s'), asc: v.base, runs: [] }];
          return { ...v, activeSim: v.activeSim || sims[0].id, sims: sims.map((s) => ({ ...s, group: `g_${v.id}` })) };
        }),
      };
      const merged = await mergeFiles(p.files, files, askConflict);
      enter(asBenches({ ...p, files: merged.files }), true);
      // (el testbench importado todavía no tiene resultados: nada que medir con la punta de prueba)
      if (fresh.length) setTool({ kind: 'select' });
      markDirty();
      const parts = [
        ...(variants.length ? [`${variants.length === 1 ? t('the workbench') : t('{length} workbenches:', { length: variants.length })} ${variants.join(', ')}`] : []),
        ...(merged.added.length ? [`${merged.added.length === 1 ? t('the file') : t('{length} files:', { length: merged.added.length })} ${merged.added.join(', ')}`] : []),
      ];
      const imported = parts.length ? t('Imported {p0}', { p0: parts.join(' y ') }) : t('There was nothing to import (.asc, .asy, .lib, .sub or .zip)');
      // las líneas dañadas quedan tal cual en el testbench (no se pierden al guardar), pero hay que avisarlo
      const bad = damaged.map((d) => t('{file}: {n} lines could not be read and were kept as they are (the first one: {line})', { file: d.file, n: d.lines, line: d.first.slice(0, 80) }));
      setMessage([imported, ...bad].join(' · '));
    } catch (e) {
      setMessage(t('Could not import: {p0}', { p0: (e as Error).message }));
    }
  };
  // Exportar e importar subcircuitos (#180)
  const subImport = useRef<HTMLInputElement>(null);
  const exportSub = (name: string) => {
    const z = exportSubcktZip(snapshot(), name, lib);
    if (z) download(z.name, new Blob([z.bytes as BlobPart], { type: 'application/zip' }));
  };
  /** Copia el subcircuito (con su símbolo, los subcircuitos y modelos que usa) a My symbols and models (#199) */
  const subToUser = (name: string) => {
    const files = subcktFilesFor(snapshot(), name);
    if (!files.length) return;
    const next = [...userFiles];
    const added: string[] = [];
    const kept: string[] = [];
    for (const f of files) {
      if (f.kind === 'verilog') continue;
      const i = next.findIndex((x) => x.name.toLowerCase() === f.name.toLowerCase());
      // uno distinto con el mismo nombre no se pisa (lo más conservador): se avisa
      if (i >= 0 && next[i].text !== f.text) {
        kept.push(f.name);
        continue;
      }
      const uf: UserFile = { name: f.name, kind: f.kind, text: f.text, time: Date.now() };
      if (i >= 0) next[i] = uf;
      else next.push(uf);
      registerUserFile(lib, uf);
      added.push(f.name);
    }
    storeUserFiles(next);
    setMessage(
      [
        ...(added.length ? [t('Copied to My symbols and models: {p0}', { p0: added.join(', ') })] : []),
        ...(kept.length ? [t('Not replaced (My symbols and models already has a different one): {p0}', { p0: kept.join(', ') })] : []),
      ].join(' · '),
    );
  };
  const exportSubNetlist = (name: string) => {
    // un módulo Verilog (#209): su síntesis (primitivas de XSPICE: sirve para ngspice, no para LTspice)
    const vf = verilogFile(projectRef.current, name);
    if (vf) {
      if (!vf.synth) return setMessage(t('{name} was not synthesized yet', { name }));
      return download(`${name}.sub`, new Blob([vf.synth.subckt], { type: 'text/plain' }));
    }
    const r = exportSubcktNetlist(snapshot(), name, lib);
    if (!r) return setMessage(t('{name} has no ports: there is nothing to export as .sub', { name }));
    download(r.name, new Blob([r.text], { type: 'text/plain' }));
    if (r.warnings.length) setMessage(r.warnings[0]);
  };
  const importSubckts = async (list: File[]) => {
    try {
      const entries: ZipEntry[] = [];
      for (const f of list) {
        const data = new Uint8Array(await f.arrayBuffer());
        if (/\.zip$/i.test(f.name)) entries.push(...(await readZip(data)));
        else entries.push({ path: f.name, data });
      }
      const p0 = snapshot();
      const incoming = subcktFilesFrom(entries, p0.files, (n, asc) => subcktSymbol(n, parseAsc(asc)));
      if (!incoming.length) return setMessage(t('There was nothing to import: choose .asc subcircuits (with their .asy), .lib/.sub netlists or a .zip with them'));
      const merged = await mergeFiles(p0.files, incoming, askConflict);
      const p = { ...p0, modified: Date.now(), files: merged.files };
      projectRef.current = p;
      editProject(p);
      // qué entró y adónde fue: los .asc son subcircuitos del panel; los netlists y símbolos, archivos
      // del proyecto (no se ven en el panel); lo idéntico a lo que ya estaba no cambia
      // (sin los símbolos generados para los .asc que no traían el suyo)
      const chosen = new Set(entries.map((e) => e.path.replace(/^.*[\\/]/, '').toLowerCase()));
      const added = merged.files.filter((f) => merged.added.includes(f.name) && (f.kind !== 'symbol' || chosen.has(f.name.toLowerCase())));
      const names = (kind: string) => added.filter((f) => f.kind === kind).map((f) => f.name);
      const subs = names('schematic').map((n) => n.replace(/\.asc$/i, ''));
      const same = incoming.filter((f) => chosen.has(f.name.toLowerCase()) && p0.files.some((x) => x.name.toLowerCase() === f.name.toLowerCase() && x.text === f.text)).map((f) => f.name);
      const parts = [
        ...(subs.length ? [t('Subcircuits added to Modules: {list}', { list: subs.join(', ') })] : []),
        ...(names('model').length ? [t('Netlists added to the project files (their .subckt and .model are in Component…): {list}', { list: names('model').join(', ') })] : []),
        ...(names('symbol').length ? [t('Symbols: {list}', { list: names('symbol').join(', ') })] : []),
        ...(same.length ? [t('Already in the project, unchanged: {list}', { list: same.join(', ') })] : []),
      ];
      setMessage(parts.length ? parts.join(' · ') : t('Nothing was imported'));
    } catch (e) {
      setMessage(t('Could not import: {p0}', { p0: (e as Error).message }));
    }
  };
  const exportZip = (all: boolean) => {
    const p = snapshot();
    const z = all ? exportAllZip(p, lib) : exportVariantZip(p, p.activeVariant, lib);
    download(z.name, new Blob([z.bytes as BlobPart], { type: 'application/zip' }));
  };

  return { importInput, importFiles, subImport, exportSub, subToUser, exportSubNetlist, importSubckts, exportZip };
}
