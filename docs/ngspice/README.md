# Manual de ngspice-47

Manual oficial de la versión de ngspice que usa el motor (`engine/build.sh` compila ngspice-47). Está acá como referencia para desarrollar: sintaxis de netlist, análisis, comandos de `.control` y code models XSPICE.

- `ngspice-47-manual.pdf`: el original. Fuente: <https://sourceforge.net/projects/ngspice/files/ng-spice-rework/47/ngspice-47-manual.pdf> (sha256 `6be9ad36be99dc3234dc44464cce6a38ba2e98266539dda5bae3212752e036ca`).
- `md/`: el mismo manual en **Markdown**, un archivo por capítulo (los capítulos largos, una carpeta con un archivo por sección N.M). Empezar por [`md/INDEX.md`](md/INDEX.md), que lista archivos y secciones hasta N.M.K. Dentro de un archivo, `grep -n "^#" <archivo>` da los títulos con número de línea, y `grep -rn "<texto>" docs/ngspice/md` busca en todo. Los ejemplos de código quedan indentados (bloques de código en Markdown).

Para regenerar `md/` (requiere `pdftotext`, de poppler):

```bash
node scripts/ngspice-manual.mjs
```

## Capítulos más útiles para TurboSpice

| Cap. | Tema | Para qué |
|---|---|---|
| 2 | Circuit Description | `.param`, expresiones, funciones de numparam, `.subckt`, `.include`/`.lib` |
| 4–5 | Fuentes y fuentes B | formas de onda, `pwl`, funciones de las fuentes B |
| 7 | Device Models | parámetros de modelos (diodo, BJT, MOS, JFET) |
| 8 | XSPICE | code models (`delay`, digitales, bridges, `d_cosim`) |
| 11 | Analyses and Output Control | `.op`, `.ac`, `.tran`, `.noise`, `.pz`, `.sens`, `.meas`, `.save`, `.options` |
| 13 | Interactive Interpreter | comandos de `.control` (`alter`, `alterparam`, `foreach`, `let`, `meas`, `setplot`, `reset`…) y variables (`set`) — base del Estudio y de los bloques |
| 15 | Shared library | API de `ngSpice_Init`/`ngSpice_Command` que usa `src/engine/ngspice.ts` |
| 18 | Statistical circuit analysis | Monte Carlo (`agauss`, `aunif`, `rndseed`…) |
| 25 | Error Messages | interpretar el log |

## Licencia

El manual está bajo **Creative Commons Attribution Share-Alike 4.0 (CC-BY-SA 4.0)**. Partes de los capítulos 12 y 25–29 son de dominio público, y el capítulo 30 está bajo BSD de 3 cláusulas (ver capítulo 29 del manual). Autores: el equipo de ngspice (<https://ngspice.sourceforge.io/>). Se redistribuye sin modificaciones. El `.txt` es una conversión de formato, con la misma licencia.
