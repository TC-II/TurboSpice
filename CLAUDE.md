# TurboSpice — notas para agentes

- **Referencia de ngspice-47** (el motor): manual en Markdown en `docs/ngspice/md/`. Empezar por `docs/ngspice/md/INDEX.md`; buscar con `grep -rn "<texto>" docs/ngspice/md` y leer sólo la sección necesaria (`grep -n "^#" <archivo>` da los títulos con su línea). No leer el PDF.
  - Comandos de `.control` (Estudio, bloques): `docs/ngspice/md/13-interactive-interpreter/13.05-commands.md`.
  - Análisis y `.meas`/`.save`/`.options`: `docs/ngspice/md/11-analyses-and-output-control-batch/`.
  - Expresiones y funciones de `.param`: `docs/ngspice/md/02-circuit-description.md`; fuentes B: `05-…`.
- PDK sky130 y GF180 (modelos, traducción a ltpsa, carga por dispositivo): `docs/pdk.md`.
- Simulación mixta, Verilog y Verilog-A: `docs/mixed-signal.md`. Compatibilidad con LTspice: `docs/compatibilidad-ltspice.md`. Formato `.turbo`: `docs/turbo-formato.md`. Estabilidad (`.stb`, sondas de lazo): `docs/estabilidad.md`. Idiomas: `docs/i18n.md`.
- **Grafo del código** (graphify): `graphify-out/GRAPH_REPORT.md` y `graph.json`. Consultar con `graphify query "<pregunta>"`, `graphify explain "<símbolo>"`, `graphify affected "<símbolo>"`. Regenerar tras cambios grandes: `graphify update .` (sin LLM).
