// Los <input type="file"> ocultos de Archivo: importar a este proyecto (#157) y la carpeta lib de LTspice
import type { RefObject } from 'react';

export function FileInputs({
  importInput,
  importFiles,
  ltInput,
  doImportLtspice,
}: {
  importInput: RefObject<HTMLInputElement>;
  importFiles(files: File[]): void;
  ltInput: RefObject<HTMLInputElement>;
  doImportLtspice(files: File[]): void;
}) {
  return (
    <>
      {/* Archivo › Importar a este proyecto */}
      <input
        ref={importInput}
        type="file"
        hidden
        multiple
        accept=".turbo,.zip,.asc,.asy,.lib,.sub,.mod,.inc,.cir,.txt,.lb"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) importFiles(files);
        }}
      />
      {/* carpeta lib de LTspice (Archivo → Importar librería de LTspice) */}
      <input
        ref={ltInput}
        type="file"
        hidden
        {...{ webkitdirectory: '', directory: '' }}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) doImportLtspice(files);
        }}
      />
    </>
  );
}
