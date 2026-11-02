# Auditoría de calidad y consistencia — TurboSpice

Fecha: 2026-11-01 · Commit auditado: `888ee42` · Alcance: `src/`, `tests/`, `scripts/`, CI, docs.

## 1. Qué se corrió

| Control | Resultado |
|---|---|
| `tsc -b` (sólo `src/`) | ✅ sin errores (15 s) |
| `vitest run` | ✅ 71 archivos, **1094 tests**, 18 s |
| `node scripts/i18n/check.mjs` | ⚠️ 2 textos sin traducir: `"Fast"` (`src/App.tsx:3272`), `"Rectangular"` (`src/waveform/PlotPanel.tsx:580`) |
| `vite build` | ✅ con aviso: chunk principal **949 kB** (327 kB gzip) y `StudyBlocks` 868 kB (226 kB gzip) |
| `tsc` incluyendo `tests/unit` y `scripts/*.ts` | ❌ **32 errores** (29 por importar `build-library.mjs` sin tipos, 3 reales, ver H-2) |
| `npm audit --omit=dev` | ✅ 0 vulnerabilidades en producción |
| `npm audit` (dev) | ⚠️ 6 (2 críticas: vitest/tinypool; 1 alta: vite dev server) |
| `npm run smoke` / e2e | ⏭️ no se pudieron correr: la red del entorno bloquea `tc-ii.github.io` y no hay emsdk para compilar el motor |

## 2. Fortalezas (mantener)

- **Tipado estricto real**: `strict`, `noUnused*`, cero `any`, cero `@ts-ignore`, sólo 6 `as unknown as`.
- **Tests amplios**: 84 de 140 módulos de `src/` tienen test unitario directo; los que faltan son casi todos
  UI o glue de workers. Además hay smoke del motor contra ngspice nativo, e2e en Chrome/Firefox, corpus de
  `.asc` y benchmarks.
- **Entrada no confiable bien validada**: `parseTurbo` verifica estructura y hash de cada blob; los `catch`
  silenciosos (41) son casi todos degradaciones deliberadas y comentadas (portapapeles, `localStorage`).
- **Sin XSS evidente**: los dos `dangerouslySetInnerHTML` insertan skins SVG del bundle generado en build
  (`scripts/build-library.mjs`), no contenido del usuario.
- **i18n con control automático** (script + `i18n-audit.test.ts`), docs por tema y commits descriptivos
  con referencia a issue.

## 3. Hallazgos

Severidad: **A** = riesgo de regresión o bug real · **M** = deuda que frena · **B** = prolijidad.

### Arquitectura y mantenibilidad

**H-1 (A) Componentes monolíticos.** `SchematicMode` (`src/App.tsx:365-4290`) son ~3900 líneas en una sola
función con **93 `useState`/`useRef`**, ~190 funciones internas y 5 `eslint-disable … exhaustive-deps`
(`App.tsx:484, 488, 569, 693, 944`). Le siguen `PlotPanel.tsx` (2172 líneas; `PaneView` sola ~1200),
`SchematicEditor.tsx` (1593), `es.ts` (1808, datos), `tongspice.ts` (1134), `studyBlocks.ts` (1093).
Consecuencias: la mayoría de las features tocan `App.tsx` (16 de los últimos 30 commits), re-render de todo el
árbol por cualquier cambio de estado, dependencias de efectos silenciadas a mano y conflictos de merge
frecuentes entre ramas.

**H-2 (A) `tests/` y `scripts/` no se tipan.** `tsconfig.json` sólo incluye `src`; vitest transpila sin
chequear. Al incluirlos aparecen errores reales que hoy pasan desapercibidos:
- `tests/unit/project.test.ts:66` arma un `Project` sin `groups` (el fixture quedó viejo respecto del tipo).
- `tests/unit/skins.test.ts:31` y `tests/unit/i18n-audit.test.ts:28` (tipos implícitos).
- 29 × `TS7016`: `scripts/build-library.mjs` se importa desde TS sin `.d.ts`.

**H-3 (M) Utilidades duplicadas con semántica distinta.**
- Parseo de números con sufijo, tres implementaciones: `netlist/spicenum.ts` (SPICE: `M` = mili, acepta
  `mil`, `µ` y `μ`), `waveform/expr.ts:26` (sin `μ` U+03BC ni `mil`) y `waveform/dft.ts:196` (`M` = **mega**).
  En la misma interfaz, `10M` vale 10·10⁻³ en un campo de componente y 10·10⁶ en un campo del visor.
- Formato SI, cuatro tablas: `netlist/step.ts:85` (`Meg`), `waveform/series.ts:69` (`M`),
  `sim/studyTemplates.ts:97` (`meg`, `u`), `sim/sources.ts:190` (`Meg`, `u`). Un valor mostrado como `1M`
  y copiado a un campo SPICE cambia nueve órdenes de magnitud.
- `niceStep` está tres veces (`waveform/pz.ts:83`, `waveform/scales.ts:96`, `schematic/SourceDialog.tsx:849`).
- `addSim`/`removeSim`/`duplicateSim` existen con firmas distintas en `sim/simList.ts` y
  `project/project.ts`: no es duplicación de lógica, pero el nombre igual confunde en imports y búsquedas.

**H-4 (M) Bundle inicial pesado.** 949 kB minificado en el chunk de entrada: todo el editor, diálogos, panel
de Estudio y Google se cargan al abrir. `StudyBlocks` (Blockly) ya va aparte, bien.

### Calidad de pruebas y CI

**H-5 (A) La CI corre 7 de las 17 suites e2e.** La matriz de `deploy.yml` tiene `features, save, panes,
verilog, examples, simulation, editor`. Quedan fuera **`templates, wires, shortcuts, rotate, shapes,
placing, dialogs, hierarchy, deviceparams, performance`** — justo las que cubren la edición de cables y el
movimiento, donde están varios de los últimos bugs (#315). También quedan fuera `npm run hdl` y el corpus.

**H-6 (M) E2E con esperas fijas.** 144 `waitForTimeout`/`setTimeout`/`sleep` en `tests/e2e/*.mjs`
(`features.mjs` 43, `save.mjs` 26, `hierarchy.mjs` 19): fuente típica de tests lentos e intermitentes.
Conviene esperar condiciones (`waitForSelector`, `waitForFunction`, un evento de «simulación terminada»).

**H-7 (M) Sin linter ni formateador.** No hay ESLint ni Prettier, pero el código tiene comentarios
`eslint-disable` que no hace cumplir nadie. El estilo varía entre carpetas (p.ej. `scripts/fetch-engine.mjs`
sin `;`, `src/` con `;`). Las reglas de hooks de React (`rules-of-hooks`, `exhaustive-deps`) atraparían
bugs reales en un archivo con 93 hooks.

**H-8 (B) Sin medición de cobertura.** No está `@vitest/coverage-v8`; el dato «84/140 módulos importados»
es aproximado y no dice qué ramas de `tongspice.ts`/`studyBlocks.ts` se ejercitan.

### Dependencias

**H-9 (M) Toolchain de desarrollo atrasado y vulnerable.** vite 6.0.5, vitest 2.1.8, plugin-react 4.3.4,
TypeScript 5.7. Las vulnerabilidades son del servidor de desarrollo y de vitest (no llegan al sitio), pero
afectan a quien corre `npm run dev`/`vitest` en una máquina con navegador abierto. Rangos mezclados:
casi todo fijo, salvo `fflate` y `playwright-core` con `^`.

### Consistencia del repositorio y la documentación

**H-10 (M) Documentación desactualizada.**
- `docs/PLAN.md` § Estructura describe `src/analyses/`, `src/io/`, el formato `.tsch` y
  `scripts/build-library.ts`, que no existen (hoy: `src/sim/`, `src/asc/`, `.turbo`, `build-library.mjs`).
- `README.md` § Deploy dice «en cada push a `main`»; el workflow publica `main` y `dev` (`/dev/`) y en PR
  corre build + e2e.
- `graphify-out/` (6,3 MB versionados) se generó desde `b33c77a2`, que ya no está en la historia: el grafo
  que `CLAUDE.md` recomienda consultar está desfasado.

**H-11 (B) Archivos de entorno personal o de una sola vez en el repo.**
- `.claude/launch.json` tiene rutas absolutas de Windows de worktrees personales (`C:/_DATA/ITBA/…`).
- `docs/issues-open.json` y `docs/issues-open.created.json` son la salida de una carga de issues.
- `tests/setup-i18n.ts` está en `.gitignore` y a la vez versionado (y lo necesita `vite.config.ts`).

**H-12 (B) Detalles.** Dos textos sin traducción (ver §1). `engine/worker.ts:70` y `hdl/yosysWorker.ts:19`
usan `new Function('u','return import(u)')`, lo que obliga a permitir `unsafe-eval` si algún día se agrega
una CSP (documentar el motivo o usar `import(/* @vite-ignore */ u)`).

## 4. Plan propuesto

Ordenado por impacto/esfuerzo. Cada fase se puede mergear sola; las fases 0–1 no cambian comportamiento.

### Fase 0 — Red de seguridad (≈1–2 días)

| # | Tarea | Hallazgo | Criterio de aceptación |
|---|---|---|---|
| 0.1 | Agregar a la matriz e2e de CI las 10 suites que faltan (agrupar las cortas en un job para no multiplicar runners) y un job para `npm run hdl` | H-5 | Las 17 suites corren en cada PR |
| 0.2 | `tsconfig.test.json` que incluya `tests/unit`, `tests/setup-i18n.ts` y `scripts/**/*.ts`; `build-library.d.mts` para el `.mjs`; arreglar los 3 errores reales; `npm run typecheck` corre ambos proyectos y la CI lo ejecuta | H-2 | `npm run typecheck` en verde con tests incluidos |
| 0.3 | Traducir `"Fast"` y `"Rectangular"`; correr `scripts/i18n/check.mjs` en CI con salida ≠ 0 si falta algo | H-12 | Check en CI |
| 0.4 | Sacar `tests/setup-i18n.ts` del `.gitignore`; reemplazar `.claude/launch.json` por una versión sin rutas personales (o ignorarlo); mover `docs/issues-open*.json` fuera de `docs/` o borrarlos | H-11 | Repo sin archivos personales |

### Fase 1 — Herramientas de consistencia (≈2–3 días)

| # | Tarea | Hallazgo | Criterio |
|---|---|---|---|
| 1.1 | ESLint (flat config) con `typescript-eslint` + `eslint-plugin-react-hooks`; arrancar con `exhaustive-deps` en *warn* y `rules-of-hooks` en *error*; `npm run lint` en CI | H-7 | Lint en CI; los `eslint-disable` existentes pasan a ser reales |
| 1.2 | Prettier con la configuración que ya sigue `src/` (comillas simples, `;`, ancho ~140) y un commit único de formato para `scripts/` y `tests/` (sin tocar `src/` si ya cumple, para no ensuciar `git blame`) | H-7 | `prettier --check` en CI |
| 1.3 | `@vitest/coverage-v8` y reporte en CI (sin umbral al principio; umbral por carpeta para `netlist/`, `asc/`, `sim/` después) | H-8 | Reporte de cobertura publicado como artefacto |
| 1.4 | Actualizar vitest (≥3) y vite (≥6.x parcheado, idealmente 7) y plugin-react; fijar `fflate` y `playwright-core` | H-9 | `npm audit` sin altas ni críticas |

### Fase 2 — Unificar utilidades (≈2 días)

| # | Tarea | Hallazgo | Criterio |
|---|---|---|---|
| 2.1 | Módulo único `src/units/si.ts` con `parseSpiceNumber` (SPICE), `parseViewerSi` (convención del visor, `M` = mega, explícita en el nombre) y `formatSi(x, { style: 'spice' \| 'display' })`; migrar `expr.ts`, `dft.ts`, `step.ts`, `series.ts`, `studyTemplates.ts`, `sources.ts` | H-3 | Una sola tabla de sufijos; tests de tabla con `µ`/`μ`/`mil`/`M`/`Meg` para ambas convenciones |
| 2.2 | Decidir producto: ¿los campos del visor aceptan `M` = mega? Si sí, mostrar siempre `Meg` en todo valor que pueda copiarse a un campo SPICE | H-3 | Decisión anotada en `docs/compatibilidad-ltspice.md` |
| 2.3 | Un `niceStep` en `waveform/scales.ts`, reusado por `pz.ts` y `SourceDialog.tsx`; renombrar `simList.addSim…` a `addSimLine…` (o similar) | H-3 | Sin funciones homónimas exportadas |

### Fase 3 — Partir los monolitos (incremental, 1–2 semanas repartidas)

Regla: **una extracción por PR, sin cambiar comportamiento**, con las 17 suites e2e de la fase 0 como red.

1. **`SchematicMode` (`App.tsx`)** — extraer por dominio a hooks y componentes:
   - `useProjectState` (proyecto, variantes, testbenches, historial, autoguardado),
   - `useSimulation` (correr, cancelar, corridas, resultados, `.op`),
   - `useCloud` (cuenta, Drive, conflictos),
   - `useResultsPanes` (paneles, splitter, plot/log/meas),
   - menús y atajos a `src/app/menus.ts` / `src/app/shortcuts.ts`,
   - diálogos a componentes propios.
   Meta: `App.tsx` < 1000 líneas y ningún `eslint-disable exhaustive-deps`.
   Si el estado compartido sigue siendo grande, introducir un `useReducer` + contexto por dominio (no hace
   falta una librería externa).
2. **`PlotPanel.tsx`** — separar `PaneView` en interacción (pan/zoom/markers), dibujo y tablas
   (`CursorTable`/`StatsTable` ya están aisladas: moverlas de archivo).
3. **`SchematicEditor.tsx`** — separar el manejo de herramientas (máquina de estados de `Tool`) del render;
   la lógica pura ya vive en `schematic/edit.ts`, seguir esa línea.
4. **`tongspice.ts`/`studyBlocks.ts`** — partir por responsabilidad (traducción de elementos, directivas,
   `.step`, fuentes) sólo cuando haya cobertura medida (1.3).

### Fase 4 — Rendimiento de carga y robustez de e2e (≈3–4 días)

| # | Tarea | Hallazgo | Criterio |
|---|---|---|---|
| 4.1 | `React.lazy` para diálogos grandes (`SourceDialog`, `SymbolEditor`, `ModelEditor`, `StudyPanel`, `Hierarchy`) y para `cloud/` | H-4 | Chunk de entrada < 600 kB minificado |
| 4.2 | Reemplazar esperas fijas por esperas de condición, empezando por `features`, `save` y `hierarchy`; exponer en `window` (sólo en e2e) un indicador de «simulación terminada» / «guardado» | H-6 | < 30 esperas fijas; tiempo total de e2e medido antes/después |
| 4.3 | Documentar por qué se usa `new Function` en los workers o cambiarlo por `import(/* @vite-ignore */)` | H-12 | Comentario o cambio aplicado |

### Fase 5 — Documentación viva (≈medio día, después recurrente)

- Actualizar `docs/PLAN.md` § Estructura y `README.md` § Deploy.
- Decidir si `graphify-out/` se versiona: si sí, regenerarlo en CI (`graphify update .`) en cada push a `dev`;
  si no, ignorarlo y generarlo localmente.
- Agregar `CONTRIBUTING.md` corto: comandos de control (`typecheck`, `lint`, `test`, i18n), regla de «una
  extracción por PR» de la fase 3 y convención de commits que ya se usa.

## 5. Métricas para seguir el avance

| Métrica | Hoy | Meta |
|---|---|---|
| Líneas de `App.tsx` | 4361 (2026-11-02: 970 ✅; 1281 después de Prettier, el mismo código) | < 1000 |
| Archivo más grande de `src/` (sin datos ni `es.ts`) | `PlotPanel.tsx` 2172 (2026-11-02: `SchematicEditor.tsx` 1337, `PaneView.tsx` 955, `PlotPanel.tsx` 821) | — |
| Hooks en `SchematicMode` | 93 (2026-11-02: 34 `useState`/`useRef`, 96 llamadas a hooks en total) | < 25 por componente |
| `eslint-disable` | 5 (sin linter) (2026-11-02: 0 de `exhaustive-deps` en `src/`, 0 avisos) | 0 con linter activo |
| Suites e2e en CI | 7/17 | 17/17 |
| Esperas fijas en e2e | 144 | < 30 |
| Errores de tipos en tests/scripts | 32 | 0 |
| Chunk de entrada | 949 kB | < 600 kB |
| Tablas de sufijos SI | 7 | 1 (hecho: 3 tablas con nombre, un solo núcleo) |
| Vulnerabilidades dev altas/críticas | 3 | 0 |

## 6. Avance

### Fase 0 (sobre `dev`, 2026-11-01)

| # | Estado | Detalle |
|---|---|---|
| 0.1 | ✅ | La matriz e2e corre las 17 suites: las 7 de antes y tres entradas nuevas: `edit-tools` (wires, rotate, shapes, placing, dialogs, shortcuts), `study` (templates, deviceparams, hierarchy) y `performance`. `hierarchy.mjs` (que arrancaba con Alt+B, ya sacado de la interfaz) se reescribió con el flujo actual: arma `DIV` con «+ Nuevo › Subcircuito», mira el subcircuito por la franja «Editor de subcircuito» (ya no hay migas) y el aviso de edición compartida duplicando la simulación; corre en `study`. En `performance`, la tolerancia del zoom alrededor del cursor pasó a 1,5 px de pantalla (en la CI se corría 1,7 unidades, menos de un píxel con esa vista). El job `build` corre además `npm run hdl` después del smoke. `placing.mjs` estaba desfasado de la interfaz: el botón de propagar (#229) ahora dice «Propagar» y el detalle va en su `title`, y a 1280 px la barra pasa el grupo de dibujo (con Figuras) a «Más herramientas», así que el test usa 1600 px. |
| 0.2 | ✅ | `tsconfig.test.json` (src + `tests/unit` + `scripts/**/*.ts`), con tipos para `scripts/build-library.mjs` y `tests/corpus/compare.mjs` (`.d.mts`). `npm run typecheck` chequea los dos proyectos y la CI corre el de tests. Se corrigieron los errores reales: el fixture de proyecto v1 sin `groups` y la recursión sin tipo de `i18n-audit.test.ts`. |
| 0.3 | ✅ | `scripts/i18n/check.mjs` también sale con error si falta una traducción, y la CI lo corre. Tenía un falso positivo: no leía las claves sin comillas de `es.ts` (`Rectangular: …`). El comentario de netlist `* PDK …, esquina …` pasó a inglés (`corner`) y se permite el `sin(2*pi*V(` del modulador. En `dev` ya estaba traducido «Fast». |
| 0.4 | ✅ | En `dev` ya se habían resuelto `tests/setup-i18n.ts` (fuera del `.gitignore`) y `.claude/launch.json` (ignorado). Se borraron `docs/issues-open*.json`, que eran la salida de una carga de issues ya hecha y siguen en la historia de git. |

Observación de producto que surgió de 0.1: a 1280 px de ancho, un tamaño común en notebooks, la barra
de herramientas escondía todo el grupo de dibujo (Cable, Componente, Tierra…) en «Más herramientas».
Resuelto el 2026-11-02: los grupos de la barra tienen prioridad (`ToolGroup.priority`) y, si falta lugar, se
esconden primero Archivo (está también en el menú y con atajos), después Editar (todo con atajo), después
Historial; Dibujo es lo último. A 1280 px, con la interfaz en español, se ven Historial y Dibujo.
`placing.mjs` volvió a 1280 px.

### Fase 1

| # | Estado | Detalle |
|---|---|---|
| 1.1 | ✅ | `eslint.config.js` con las recomendadas de JS y TypeScript, `rules-of-hooks` (error) y `exhaustive-deps` (aviso); `npm run lint` y paso en la CI. Se respetan las secuencias con coma y el `catch {}` vacío del estilo de la casa; `roughPen.js` (port de ASC-Parser) queda fuera. Encontró un bug en `tests/perf/plot.mjs` (`addTrace` fuera de su alcance), un test de `.turbo` que no probaba la `\` que decía (`'\ '` es un espacio en JS), inicializaciones muertas y dos `eslint-disable` sobrantes. Quedaban 17 avisos de `exhaustive-deps` (casi todos en `App.tsx`, `SchematicEditor.tsx` y los diálogos), para la fase 3. Desde el 2026-11-02: **0 avisos** y ningún `eslint-disable` de `exhaustive-deps` en `src/` (queda uno de `no-control-regex`, justificado, en `hdl/yosys.ts`). |
| 1.2 | ✅ | Aplicado el 2026-11-02, sin ramas abiertas: Prettier 3.3.3 (`.prettierrc.json`: ancho 200, comillas simples, `;`, `quoteProps: preserve` para no tocar las claves de `es.ts`, `endOfLine: auto` por las copias con CRLF de Windows). Sólo el código TS/JS de `src/`, `tests/`, `scripts/` y la raíz (`.prettierignore`: fuera el CSS, que va con una regla por línea, los datos, la documentación y `roughPen.js`). Un solo commit de formato (`36c74ff`, 249 archivos, +9450/−3833), en `.git-blame-ignore-revs` (GitHub lo usa solo; en local, `git config blame.ignoreRevsFile .git-blame-ignore-revs`). `npm run format` / `npm run format:check`, y la CI corre el segundo. Como el formateo abre en varias líneas lo que estaba en una, los archivos crecen: `App.tsx` pasó de 985 a 1281 líneas con el mismo código. |
| 1.3 | ✅ | `@vitest/coverage-v8` y `npm run coverage`; la CI corre los unitarios con cobertura, publica el resumen en la página del run y el detalle como artefacto `coverage`. Línea de base (líneas de `src/`): **47 %** en total; `netlist` 96 %, `asc` 94 %, `sim` 89 %, `hdl` 65 %, `library` 65 %, `project` 60 %, `waveform` 35 %, `schematic` 31 %, `engine` 18 %, `ui` 6 %, `App.tsx`/`NetlistMode.tsx` 0 % (la interfaz la cubren los e2e). Sin umbral todavía. |
| 1.4 | ✅ | vite 6.0.5 → 6.4.5 (misma serie: corrige todo lo del servidor de desarrollo), vitest 2.1.8 → 5.0.5, plugin-react 4.3.4 → 4.7.0; `fflate` y `playwright-core` fijos. `overrides` de `minimatch` a 11.0.3 (ESLint traía la 10.x, con un ReDoS moderado). `npm audit`: **0 vulnerabilidades** (antes 6, con 2 críticas y 1 alta). |

### Fase 2

| # | Estado | Detalle |
|---|---|---|
| 2.1 | ✅ | Un solo núcleo en `netlist/spicenum.ts`: `formatSi(x, cifras, tabla)` con tres tablas con nombre (`SPICE_PREFIXES` con `u`/`Meg`, `LTSPICE_PREFIXES` con `µ`/`Meg`, `DISPLAY_PREFIXES` con `µ`/`M`), `spiceSuffix` y `parseDisplayNumber`. `si`, `siValue`, `engValue` y `engNumber` quedan como envoltorios de una línea (no cambia ninguna llamada); `expr.ts` y `dft.ts` usan las tablas compartidas. Comparación contra las versiones anteriores sobre ~200 000 valores: `si` (el visor) idéntica; en las demás ningún valor cambia, sólo el texto en tres casos: `1meg` → `1Meg` en las tarjetas del Estudio, el redondeo a 1000 corregido (`siValue` podía mostrar «1000m») y ≥10¹² con `T` en vez de «1070G». Las expresiones del visor ahora leen `μ` (antes daban error) y `mil` como en SPICE (antes valía 1 m). Tests en `tests/unit/si.test.ts`. |
| 2.2 | ✅ | Decisión: las dos convenciones de «M» se quedan (mili en SPICE, mega en el visor y sus campos), documentadas en `docs/compatibilidad-ltspice.md` § Números con prefijo SI. |
| 2.3 | ✅ | `niceStep` (paso redondo para *n* divisiones) queda sólo en `waveform/pz.ts`; `SourceDialog.tsx` lo importa (y gana la guarda de rango vacío). El de `scales.ts`, que hace otra cosa (el paso lindo ≥ x, con 2,5), pasa a llamarse `niceStepAbove`. Las `addSim`/`duplicateSim`/`removeSim`/`renameSim`/`selectSim`/`withSims` de `sim/simList.ts` no las usa la interfaz (usa las de `project/project.ts`): quedan marcadas `@deprecated`, sólo para armar el formato viejo en los tests de la migración. |

### Fase 5

| # | Estado | Detalle |
|---|---|---|
| 5.1 | ✅ | `docs/PLAN.md` § Estructura al día (sin `src/analyses/`, `src/io/`, `.tsch` ni `build-library.ts`); `README.md` § Deploy con las dos ramas y los controles de la CI, y los comandos nuevos. |
| 5.2 | ✅ | `graphify-out/` ya se regeneró en `dev` (desde `2b19d1b`). Queda versionado; conviene regenerarlo tras cambios grandes, como dice `CLAUDE.md`. |
| 5.3 | ✅ | `CONTRIBUTING.md`: ramas, controles antes de subir, convenciones (commits, `t()`, números SI, tests). |

### Fase 3

| # | Estado | Detalle |
|---|---|---|
| 3.1 | ✅ | `App.tsx`: **4908 → 970 líneas** (meta < 1000 ✅) en 43 extracciones, una por commit y sin cambios de comportamiento (las 17 suites e2e pasan después de cada tanda). Lo que salió vive en `src/app/` (46 archivos, ~6000 líneas), por dominio: **proyecto y sesión** (`useProjectSession`: cargar, recientes, restaurar al entrar, autoguardado, idioma; `saving`, `projectFiles`, `useProjectFiles`, `useImportExport`, `useDrive`, `useUserFiles`); **navegación y jerarquía** (`navigation`, `modules`, `benches`, `useSubcktEditing`, `ModuleEditors`, `ProjectPanel`, `projectTree`); **simulación** (`runActions` y `simulate`: correr y mostrar; `useVerilog`, `studyActions`, `circuitInfo`, `runHistory`, `Problems`); **resultados** (`ResultsPanel`, `useTraces`, `useProbe`, `useOpPoint`, `useHighlights`, `useSavesPanel`); **edición** (`clipboard`, `contextMenus`, `usePicker`, `EditorArea`); **interfaz** (`AppDialogs`, `menus`, `toolbars`, `shortcuts`, `AppBarSlots`, `SimRow`, `StatusBar`, `HintBar`, `FileInputs`, `useLayoutPrefs`, `tutorialProbe`). Las partes reciben lo que usan por props o por un objeto de dependencias (`{...{ a, b }}` en la llamada); las que se declaran más abajo en `SchematicMode` van envueltas (`() => f()`). Después: `SchematicContext` (`src/app/context.ts`) con lo que comparten las partes (librería, circuito y `commit`, proyecto, herramienta, selección, simulación, diálogos y avisos): los diálogos, el editor, los paneles y las barras lo leen con `useSchematic()`, y sus listas de props bajan entre 4 y 11 nombres cada una. Y **ningún `eslint-disable`** en `App.tsx` ni en `src/app/` (0 avisos de `exhaustive-deps` ahí): `useEvent` (`src/ui/useEvent.ts`, lo que en React 19 es `useEffectEvent`) deja que un efecto corra sólo con su disparador y use lo del último render; los `useMemo` que se recalculan cuando la librería cambia por dentro nombran `libVersion` (`void libVersion`). Quedaban 12 avisos de `exhaustive-deps` en `SchematicEditor.tsx`, `SourceDialog.tsx`, `dialogs.tsx` y `PdkDialog.tsx` (resueltos en 3.3). |
| 3.2 | ✅ | `PlotPanel.tsx` (2251 líneas ya formateado) → **821**: `PaneView.tsx` (cada panel: el gráfico de uPlot, ejes, zoom, cursores, markers y leyenda; 955), `paneDraw.ts` (lo que se dibuja sobre el canvas además de las curvas: el eje que acerca la rueda, el muestreo de la DFT, polos y ceros, markers y cursores con sus lecturas), `PlotTables.tsx` (`CursorTable`, `StatsTable`), `plotExport.ts` (PNG y lecturas de markers para los e2e) y `plotShared.ts` (constantes y formatos). Sin cambios de comportamiento (`1bc652e`). |
| 3.3 | ✅ | `SchematicEditor.tsx` (1726) → **1337**: `editorTypes.ts` (`Tool`, `View`, `Drag`, `EditorHandle`…), `editorDoc.ts` (cuentas sobre el documento: caja, recuadro, cables sueltos, figuras por clicks, posición de la cápsula), `useEditorView.ts` (tamaño del lienzo, zoom, vistas anteriores, rueda y gestos que mueven lo ya pintado, #186) e `InlineEditor.tsx`. `SchematicEditor` sigue exportando lo de antes, así que nadie cambió sus imports. `useEvent` pasó a `src/ui/` para usarlo también en el editor y los diálogos. Después, **0 avisos de `exhaustive-deps`** y ningún `eslint-disable` de esa regla en `src/` (`7776505`): los efectos que corren con su disparador usan `useEvent`; lo que un diálogo calcula una vez al abrirse va en `useState(() => …)` (antes `useMemo(…, [])`); `PzPlane` memoriza los puntos y `PlotPanel` la configuración de la DFT con sus dependencias reales; `PaneView` lee `xRange` e `index` del ref `live` al crear el gráfico. Las 18 suites e2e pasan. Lo que sigue grande: el manejo del puntero de `SchematicEditor` (~550 líneas, una máquina de estados por herramienta) y el efecto que arma el gráfico en `PaneView`; partirlos pide pasar su estado a un reducer, sin red de seguridad más fina que los e2e. |

### Fase 4

| # | Estado | Detalle |
|---|---|---|
| 4.1 | ✅ | Carga diferida de lo que se usa a pedido: las traducciones (`es.ts`, 173 kB, sólo si la interfaz está en español: `loadTranslations()` en `main.tsx` antes de importar la app), el editor de símbolos y de modelos, el tutorial (`src/lazyViews.ts`) y el exportador TikZ. Camino de carga inicial: **1162 kB → 917 kB** (entrada 147 kB + `App` 770 kB), −21 %. `roughPen.js` (44 kB, el trazo Tremor) también se baja a pedido desde el 2026-11-02: `useTremor()` en `tremor.ts` lo pide la primera vez que se elige Tremor en el export y vuelve a dibujar cuando llega; mientras tanto la hoja se ve limpia y los botones de exportar esperan. |
| 4.2 | ✅ | De 146 esperas fijas a 8, todas justificadas: 4 en `save` prueban que algo *no* pasa (no sube, no borra, no pide otro token), la de `menu()` respeta la espera de doble clic de la lista de simulaciones (#151) una en `features` separa dos clics para que no cuenten como doble clic, y las de `wires` y `rotate` dejan pasar un momento entre dos Ctrl+S porque Chrome descarta una descarga automática pegada a la anterior. Ayudantes en `tests/e2e/lib.mjs`: `frames` (dos cuadros pintados: lo que React y uPlot redibujan tras un evento), `until` (reintenta una condición), `steady` (el esquemático dejó de reacomodarse; después de simular se reajusta un instante después) y `autosaved` (la app marca `data-autosave="pending"|"saved"` en `<html>`). En `save`, `settle` espera además `data-drive` ≠ `busy` (la app lo marca mientras sube a Drive o tiene guardados en cola). Tiempo de las 16 suites que corren en local (sin `verilog`): 206 s → ~145 s (tres pasadas sin fallas). |
| 4.3 | ✅ | Sin cambios: el `new Function('u', 'return import(u)')` de `engine/worker.ts` y `hdl/yosysWorker.ts` ya está justificado en el código (el servidor de desarrollo de Vite le agrega `?import` a un `import()` con URL variable y rechaza los archivos de `public/`; `/* @vite-ignore */` no lo evita). Si algún día se agrega una CSP, va a necesitar `'unsafe-eval'` en los workers o servir el motor fuera de `public/`. |

### Pendiente

Seguimiento, con el detalle para retomarlo: **issue #344**.


Nada del plan (fases 0 a 5). Para más adelante, si hace falta:

- Partir `tongspice.ts` y `studyBlocks.ts` (fase 3, punto 4) ahora que hay cobertura medida (1.3).
- El manejo del puntero de `SchematicEditor` y el efecto del gráfico de `PaneView` (3.3).
- Umbrales de cobertura por carpeta (1.3).
