# Graph Report - TurboSpice  (2026-10-25)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 3054 nodes · 9300 edges · 130 communities (123 shown, 7 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 182 edges (avg confidence: 0.85)
- Token cost: 78,641 input · 2,204 output

## Graph Freshness
- Built from commit: `b33c77a2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Cliente de Google Drive
- Editor de modelos SPICE
- Edición en el esquemático
- Proyecto: bancos y variantes
- Cosimulación Icarus-ngspice
- Generador de símbolos LTspice
- Diálogo de fuentes
- Formato de archivo .turbo
- Parser y serializador ASC
- Modo esquemático y utilidades
- Diálogos de la interfaz
- Barra de simulación
- Punto de operación (bias)
- Biblioteca de símbolos y modelos
- Edición de cables y segmentos
- Estado de la app y variantes
- Modelo del documento ASC
- Atributos y ventanas de símbolos
- Cuenta de Google y Drive
- Álgebra de Laplace
- Scripts del corpus de pruebas
- Armado de la biblioteca
- Directivas y análisis del Estudio
- E2E: funcionalidades
- E2E: Playwright y ejemplos
- Árbol del proyecto
- Lista de simulaciones
- Exportación a ZIP y netlist
- Cliente del motor ngspice
- Geometría y textos
- Redes, pines y anotaciones
- Buses y netlist LTspice
- Evaluador de expresiones
- Codificación de texto CP1252
- Exportar esquemático y polos-ceros
- E2E: guardado en Drive
- Modo netlist y ejemplos
- Panel de Estudio
- Bloques del Estudio
- Plantillas de Estudio
- Parámetros de dispositivos
- Datos embebidos y hooks
- Mediciones .meas
- Compilador de bloques
- Módulo WASM de ngspice
- Apertura y guardado de archivos
- Copia del motor y defaults
- Vista de gráficos y trazas
- Rutas de biblioteca y símbolos
- Módulos Verilog del proyecto
- Formas y hover del esquemático
- Curvas y unidades
- Carriles digitales y ejes
- Transformada DFT
- Markers del visor
- Preparación del corpus
- Bloques con Blockly
- Compartir por enlace
- Síntesis con Yosys
- E2E: rendimiento
- E2E: atajos de teclado
- E2E: simulación
- Benchmark del gráfico
- Traducción a ngspice
- Panel de gráficos
- Cursores y mediciones del visor
- Chequeo de traducciones
- Generación de ejemplos
- Idiomas e historial
- Números SPICE y .step
- Estimación de tamaño de simulación
- Panel de resultados .meas
- Auditoría de modelos faltantes
- Benchmark de la app
- Configuración de TypeScript
- Dependencias del paquete
- Rotación y transformaciones
- Worker de Yosys
- Compilación con Icarus
- E2E: jerarquía
- Pruebas smoke del motor
- Scripts de npm
- Diccionario de share y renombres
- Codemod de i18n
- Edición de directivas
- Dependencias de desarrollo
- Archivos .cmp de componentes
- Worker del corpus
- Auditoría de i18n
- Pasos del workflow CI
- Raíz de la app React
- Generador de símbolos base
- Nodos flotantes
- Conversión de elementos LTspice
- E2E: editor
- Despliegue a Pages
- Escaneo de textos de UI
- Pruebas HDL
- Resolución de modelos
- E2E: diálogos
- Pruebas E2E de Verilog
- Vista y zoom del editor
- Pruebas E2E de colocación
- Pruebas E2E de formas
- Perfilado de arrastre
- Parámetros de pasos de CI
- Conversión del manual ngspice
- Trazas del visor
- Plantillas de Estudio
- Despliegue en Pages
- Matriz de suites CI
- Parámetros eléctricos Verilog
- Reemplazo de diodo ideal
- Script de simulación de ejemplos
- Preparación de modelos CMP
- Análisis comparativo de simulaciones
- Comparación de resultados esperados
- Conteo de issues
- Modelos AKO
- Decimación de formas de onda
- Jobs de build y E2E
- Menú contextual
- API del panel de gráficos
- Configuración de suite CI
- Parámetros del banco
- Traducción de compuertas digitales
- Build de OpenVAF
- Build de Icarus
- Build del motor ngspice
- Tipos de entorno Vite

## God Nodes (most connected - your core abstractions)
1. `SchematicMode()` - 327 edges
2. `t()` - 254 edges
3. `parseAsc()` - 88 edges
4. `Library` - 79 edges
5. `SchematicEditor()` - 71 edges
6. `vitest` - 68 edges
7. `AscDoc` - 53 edges
8. `LtNetlist` - 45 edges
9. `serializeAsc()` - 45 edges
10. `parseSpiceNumber()` - 41 edges

## Surprising Connections (you probably didn't know these)
- `one()` --indirect_call--> `done()`  [INFERRED]
  tests/corpus/exp.mjs → src/schematic/autosave.ts
- `wireGesture()` --indirect_call--> `showSimCommand()`  [INFERRED]
  src/schematic/SchematicEditor.tsx → tests/e2e/lib.mjs
- `fresh()` --calls--> `Library`  [EXTRACTED]
  tests/unit/ltspiceLib.test.ts → src/library/library.ts
- `saved()` --calls--> `LtNetlist`  [EXTRACTED]
  tests/e2e/wires.mjs → src/netlist/ltnetlist.ts
- `ng()` --calls--> `LtNetlist`  [EXTRACTED]
  tests/unit/complexSim.test.ts → src/netlist/ltnetlist.ts

## Import Cycles
- None detected.

## Communities (130 total, 7 thin omitted)

### Community 0 - "Cliente de Google Drive"
Cohesion: 0.05
Nodes (51): AscEncoding, ApiFile, DriveClient, DriveFile, DriveUser, FOLDER_NAME, fromApi(), mimeOf() (+43 more)

### Community 1 - "Editor de modelos SPICE"
Cohesion: 0.10
Nodes (58): subcktPins(), AttrInput(), ModelEditor(), addModelModule(), isModelModule(), key(), MODEL_ATTRS, MODEL_TYPES (+50 more)

### Community 2 - "Edición en el esquemático"
Cohesion: 0.08
Nodes (55): isNgspiceComment(), instancePinIssues(), CurrentArrowsLayer(), addText(), cutNew(), duplicateItems(), instLetter(), nextInstName() (+47 more)

### Community 3 - "Proyecto: bancos y variantes"
Cohesion: 0.11
Nodes (46): runs(), addGroup(), addSim(), applyValues(), ATTR_KEYS, blankVariant(), cloneVariant(), duplicateSim() (+38 more)

### Community 4 - "Cosimulación Icarus-ngspice"
Cohesion: 0.07
Nodes (22): cleanup(), Get_ng_vvp(), input(), report(), run(), step(), get_time(), init() (+14 more)

### Community 5 - "Generador de símbolos LTspice"
Cohesion: 0.08
Nodes (46): andGate, andX(), arcPath(), arrow(), ASC_PARSER_SKINS, bjt(), bufTri(), C() (+38 more)

### Community 6 - "Diálogo de fuentes"
Cohesion: 0.10
Nodes (44): sourceSyntax(), LabelPatch, CsvImport(), csvPoints(), DEFAULT_ARGS, Dim(), FieldDef, FieldKey (+36 more)

### Community 7 - "Formato de archivo .turbo"
Cohesion: 0.06
Nodes (39): activeAsc(), asBenches(), BENCHES, BenchGroup, docOf(), EXT, FileRun, FORMAT (+31 more)

### Community 8 - "Parser y serializador ASC"
Cohesion: 0.08
Nodes (36): ascText(), ShapeKind, attrValue(), badByDoc, badLines(), fields(), num(), parseAsc() (+28 more)

### Community 9 - "Modo esquemático y utilidades"
Cohesion: 0.12
Nodes (45): clipboardImage(), HintBar(), isTyping(), lsGet(), lsSet(), SchematicMode(), userFileKind(), useTheme() (+37 more)

### Community 10 - "Diálogos de la interfaz"
Cohesion: 0.09
Nodes (39): t(), cmpApply(), FileConflictDialog(), BenchParamsDialog(), NameDialog(), ModuleKind, NewModuleDialog(), RESERVED (+31 more)

### Community 11 - "Barra de simulación"
Cohesion: 0.09
Nodes (41): BarField, barRows(), COLUMNS, fieldProblem(), POINTS, SimBar(), SimState, STARTUP_TITLE (+33 more)

### Community 12 - "Punto de operación (bias)"
Cohesion: 0.11
Nodes (37): Block, Element, Bias, biasCommand(), biasParams(), bjtRegion(), circuitDirectives(), elementBias() (+29 more)

### Community 13 - "Biblioteca de símbolos y modelos"
Cohesion: 0.09
Nodes (16): registerUserFile(), baseName(), symbolPath(), Library, scanModels(), db(), importLtspiceLibrary(), libRelative() (+8 more)

### Community 14 - "Edición de cables y segmentos"
Cohesion: 0.17
Nodes (35): onSegment(), addFlag(), addWire(), cutPieces(), cutThroughBodies(), dcSourcesAsCell(), dragSegment(), dragSegmentStraight() (+27 more)

### Community 15 - "Estado de la app y variantes"
Cohesion: 0.07
Nodes (29): ascCache, Dialog, EXAMPLES, FileState, HierLevel, Hover, PANEL_NAMES, Theme (+21 more)

### Community 16 - "Modelo del documento ASC"
Cohesion: 0.09
Nodes (34): AscDoc, DataFlag, DrawnShapeKind, Flag, FlagDir, GRID, ORIENTS, PinDef (+26 more)

### Community 17 - "Atributos y ventanas de símbolos"
Cohesion: 0.11
Nodes (37): defaultWindows(), effectiveAttrs(), effectiveWindows(), explicitSymbol(), ltspiceDefaultAs(), ltspiceWindows(), makeExplicit(), NETLIST_ATTRS (+29 more)

### Community 18 - "Cuenta de Google y Drive"
Cohesion: 0.09
Nodes (32): AccountButton(), Avatar(), DriveDialog(), importToDrive(), uniqueName(), Account, CLIENT_ID, drive (+24 more)

### Community 19 - "Álgebra de Laplace"
Cohesion: 0.14
Nodes (39): addC(), addP(), addR(), closing(), Coef, constOf(), constR(), divC() (+31 more)

### Community 20 - "Scripts del corpus de pruebas"
Cohesion: 0.06
Nodes (29): jobs, one(), report, SP, want, readRaw(), args, conc (+21 more)

### Community 21 - "Armado de la biblioteca"
Cohesion: 0.08
Nodes (31): buildBundle(), LIB, MIN_SKIN_STROKE, normalizeSkin(), readText(), rel(), ROOT, walk() (+23 more)

### Community 22 - "Directivas y análisis del Estudio"
Cohesion: 0.10
Nodes (36): belowTexts(), isDataText(), placeDataTexts(), sameExceptData(), EXTRA_ANALYSES, HOOK_MARKS, isControlBlock(), NGSPICE_ONLY (+28 more)

### Community 23 - "E2E: funcionalidades"
Cohesion: 0.05
Nodes (20): [a2, b2], canvas, code2, cursorHead(), errors, fftPick, headA(), headB() (+12 more)

### Community 24 - "E2E: Playwright y ejemplos"
Cohesion: 0.09
Nodes (23): errors, v, launchBrowser(), menu(), openExample(), pick(), resultsMenu(), resultsView() (+15 more)

### Community 25 - "Árbol del proyecto"
Cohesion: 0.12
Nodes (28): react, BenchItem, KIND, loadCollapsed(), ProjectTree(), QuickOpen(), TreeBench, TreeSub (+20 more)

### Community 26 - "Lista de simulaciones"
Cohesion: 0.13
Nodes (34): isComplexLine(), activeSim(), addSim(), analysisDetail(), analysisLabel(), analysisProblem(), compact(), defaultLine() (+26 more)

### Community 27 - "Exportación a ZIP y netlist"
Cohesion: 0.12
Nodes (33): emptyDoc(), exportAllZip(), exportSubcktNetlist(), exportSubcktZip(), exportVariantZip(), Imported, runFilesOf(), safeName() (+25 more)

### Community 28 - "Cliente del motor ngspice"
Cohesion: 0.10
Nodes (21): EngineClient, friendly(), Pending, Req, SimOutcome, DIGITAL_TYPE, NgspiceAssets, NgspiceFactory (+13 more)

### Community 29 - "Geometría y textos"
Cohesion: 0.09
Nodes (30): vitest, alignedBox(), boxOf(), computeLocalBox(), fixedCache, flagBox(), flagDirection(), FONT_SIZE (+22 more)

### Community 30 - "Redes, pines y anotaciones"
Cohesion: 0.09
Nodes (18): Point, Net, PinRef, CurrentArrow, ItemRef, anchor(), Annotation, annotationBox() (+10 more)

### Community 31 - "Buses y netlist LTspice"
Cohesion: 0.16
Nodes (24): SymbolDef, SymbolSource, bitNodeName(), busBits(), busWidth(), instArray(), isBusName(), partBits() (+16 more)

### Community 32 - "Evaluador de expresiones"
Cohesion: 0.11
Nodes (30): C, cdiv(), cmul(), cpow(), derivative(), ev(), EvalContext, evalTrace() (+22 more)

### Community 33 - "Codificación de texto CP1252"
Cohesion: 0.09
Nodes (23): canEncodeCp1252(), CP1252_REVERSE, cp1252Byte(), decode(), decodeText(), detectEncoding(), encode(), args (+15 more)

### Community 34 - "Exportar esquemático y polos-ceros"
Cohesion: 0.16
Nodes (26): download(), exportSchematic(), PROPS, schematicPng(), schematicSvg(), vectorExpr(), complexText(), CSV_HEAD (+18 more)

### Community 35 - "E2E: guardado en Drive"
Cohesion: 0.09
Nodes (10): attachDrive(), clearToast(), driveContext(), FakeDrive, matches(), meta(), parseMultipart(), save() (+2 more)

### Community 36 - "Modo netlist y ejemplos"
Cohesion: 0.15
Nodes (25): SimVector, EXAMPLES, defaultTraces(), NetlistMode(), ScalarTable(), Status, StatusText(), Plot (+17 more)

### Community 37 - "Panel de Estudio"
Cohesion: 0.17
Nodes (30): AnalysisCard(), Card(), cleanPlot(), isNumeric(), kindOf(), MeasureCard(), PickInput(), plain() (+22 more)

### Community 38 - "Bloques del Estudio"
Cohesion: 0.08
Nodes (25): MEASURE_KINDS, MeasureKind, Study, StudySweep, BLOCK_MEASURES, BlockJson, BLOCKS_MARK, COLORS (+17 more)

### Community 39 - "Plantillas de Estudio"
Cohesion: 0.14
Nodes (27): defaultAnalysis(), addMeasures(), addSweeps(), compOf(), defaultOptions(), defaultSignal(), engValue(), link() (+19 more)

### Community 40 - "Parámetros de dispositivos"
Cohesion: 0.13
Nodes (25): SimRun, missingSymbolIn(), NgspiceNetlist, BY_LETTER, deviceExprUnit(), DeviceParam, deviceParams(), deviceRefs() (+17 more)

### Community 41 - "Datos embebidos y hooks"
Cohesion: 0.15
Nodes (24): DATA_TAGS, DataTag, dataText(), fromBase64(), isDataTextOf(), readData(), toBase64(), writeData() (+16 more)

### Community 42 - "Mediciones .meas"
Cohesion: 0.13
Nodes (24): AGG, Aggregate, ANALYSIS_OF, cross(), Crossing, evalMeasures(), evalOne(), interp() (+16 more)

### Community 43 - "Compilador de bloques"
Cohesion: 0.20
Nodes (13): SweepTarget, allBlocks(), asCards(), blockMeasure(), chain(), compileBlocks(), Compiler, field() (+5 more)

### Community 45 - "Apertura y guardado de archivos"
Cohesion: 0.10
Nodes (22): ASC_TYPE, FileHandle, openFile(), openProjectFile(), PickedFile, PickerOpts, readAsc(), TURBO_TYPE (+14 more)

### Community 46 - "Copia del motor y defaults"
Cohesion: 0.09
Nodes (19): codemodels, DST, hashes, ROOT, SRC, OUT, result, sorted (+11 more)

### Community 47 - "Vista de gráficos y trazas"
Cohesion: 0.13
Nodes (25): isDigitalExpr(), Radix, acceptsTrace(), addTraceTo(), asDft(), asPlotView(), colorFor(), colorize() (+17 more)

### Community 48 - "Rutas de biblioteca y símbolos"
Cohesion: 0.13
Nodes (19): WindowDefaults, CMP_DIR, LibraryBundle, LTSPICE_PREFIX, PROJECT_DIR, PROJECT_PREFIX, USER_DIR, USER_PREFIX (+11 more)

### Community 49 - "Módulos Verilog del proyecto"
Cohesion: 0.17
Nodes (21): addVerilogModule(), applySynth(), IOPIN, isStale(), key(), looksBehavioral(), moduleOf(), portsOf() (+13 more)

### Community 50 - "Formas y hover del esquemático"
Cohesion: 0.14
Nodes (20): allItems(), extractItems(), setShapeStyle(), hoverCoords(), hoverInfo(), netLabel(), short(), arcAngles() (+12 more)

### Community 51 - "Curvas y unidades"
Cohesion: 0.13
Nodes (22): dftCurves(), dftSampling(), evalOn(), evaluated, exprUnit(), isCurrentExpr(), paneCurves(), PaneData (+14 more)

### Community 52 - "Carriles digitales y ejes"
Cohesion: 0.17
Nodes (18): Curve, formatRadix(), logicState(), DigitalLanes(), niceTicks(), Range, runs(), allFinite() (+10 more)

### Community 53 - "Transformada DFT"
Cohesion: 0.17
Nodes (19): Analysis, analyze(), besselI0(), cosines(), defaultFs(), dft(), fftPow2(), isPow2() (+11 more)

### Community 54 - "Markers del visor"
Cohesion: 0.17
Nodes (20): addMarker(), asMarkers(), crossings(), delta(), horizontalCuts(), MarkCurve, MarkerAxis, MarkerKind (+12 more)

### Community 55 - "Preparación del corpus"
Cohesion: 0.09
Nodes (17): by, dirs, jobs, MIR, REPOS, SIB, SP, sueltos (+9 more)

### Community 56 - "Bloques con Blockly"
Cohesion: 0.15
Nodes (18): defineBlocks(), isDark(), sourceOptions(), StudyBlocks(), targetOptions(), theme(), blockResultsFromLog(), blockDefinitions() (+10 more)

### Community 57 - "Compartir por enlace"
Cohesion: 0.18
Nodes (15): isTurboText(), compactTurbo(), dict1(), expandTurbo(), fromBase64Url(), ID_KEYS, isObj(), Json (+7 more)

### Community 58 - "Síntesis con Yosys"
Cohesion: 0.19
Nodes (18): electricalLine(), Bit, cosimSubckt(), GATES, HdlBlock, HdlError, ident(), paramValue() (+10 more)

### Community 59 - "E2E: rendimiento"
Cohesion: 0.10
Nodes (12): C, engineRequests, errors, libRequests, lines, P, Q, svg (+4 more)

### Community 60 - "E2E: atajos de teclado"
Cohesion: 0.11
Nodes (8): at(), chart, errors, modal, mv, results, svg, viewBox()

### Community 61 - "E2E: simulación"
Cohesion: 0.13
Nodes (12): activeRow, at(), benchRows(), errors, goBench(), items(), openPanel(), probe() (+4 more)

### Community 62 - "Benchmark del gráfico"
Cohesion: 0.13
Nodes (16): args, ASC, bytes, clickTime(), CPU, DEFAULT, errors, fineWheel() (+8 more)

### Community 63 - "Traducción a ngspice"
Cohesion: 0.14
Nodes (18): busBitNode(), addSteps(), B_FUNCTIONS, bTable(), DB_PARAMS, declaredParams(), fixTran(), hashRand() (+10 more)

### Community 64 - "Panel de gráficos"
Cohesion: 0.16
Nodes (13): FileSim, Sim, SimView, ComplexMode, traceLabel(), Marker, exportPng(), PlotPanel() (+5 more)

### Community 65 - "Cursores y mediciones del visor"
Cohesion: 0.22
Nodes (16): DftWindow, MAX_SAMPLES, bandwidth3dB(), cursorDiff(), nearestIndex(), Stats, stepPoint(), toCsv() (+8 more)

### Community 66 - "Chequeo de traducciones"
Cohesion: 0.12
Nodes (14): typescript@5.7.2, typescript, ALLOW, english, es, found, j, missing (+6 more)

### Community 67 - "Generación de ejemplos"
Cohesion: 0.12
Nodes (15): COMMENTS, ex, example(), EXAMPLES, hideWaveValues(), inv, inv0, lib (+7 more)

### Community 68 - "Idiomas e historial"
Cohesion: 0.18
Nodes (11): es, getLang(), Lang, LANGS, locale(), setLang(), HistoryPanel(), HistoryPick (+3 more)

### Community 69 - "Números SPICE y .step"
Cohesion: 0.19
Nodes (15): formatSpiceNumber(), parseSpiceNumber(), SUFFIX, MAX_RUNS, parseStep(), SI, siValue(), Step (+7 more)

### Community 70 - "Estimación de tamaño de simulación"
Cohesion: 0.19
Nodes (16): Analysis, Sweep, analysisPoints(), BRANCHES, checkSimSize(), countVectors(), CURRENTS, fmtBytes() (+8 more)

### Community 71 - "Panel de resultados .meas"
Cohesion: 0.22
Nodes (16): MeasResult, downloadCsv(), fmtResult(), Histogram(), MeasPanel(), columnStats(), histogram(), isRun() (+8 more)

### Community 72 - "Auditoría de modelos faltantes"
Cohesion: 0.14
Nodes (15): both, cf, cmp, files, inTs, isFile(), junk(), LT (+7 more)

### Community 73 - "Benchmark de la app"
Cohesion: 0.12
Nodes (12): args, BIG, bytes, CPU, errors, frames(), JSON_OUT, report() (+4 more)

### Community 74 - "Configuración de TypeScript"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+9 more)

### Community 75 - "Dependencias del paquete"
Cohesion: 0.15
Nodes (16): dependencies, blockly@13.3.0, fflate@^0.8.3, react@18.3.1, react-dom@18.3.1, uplot@1.6.31, @yowasp/yosys@0.70.1258, license (+8 more)

### Community 76 - "Rotación y transformaciones"
Cohesion: 0.15
Nodes (15): Orient, refsKey(), setWindow(), transformItems(), transformPivot(), pivotNear(), symbolPivot(), bundle (+7 more)

### Community 77 - "Worker de Yosys"
Cohesion: 0.15
Nodes (13): compileBehavioral(), getWorker(), NoId, pending, request(), synthesizeVerilog(), EmProgram, RunYosys (+5 more)

### Community 78 - "Compilación con Icarus"
Cohesion: 0.17
Nodes (10): clean(), compileIcarus(), firstError(), IcarusLoader, IcarusPort, IcarusResult, iconfig(), parseVvp() (+2 more)

### Community 79 - "E2E: jerarquía"
Cohesion: 0.12
Nodes (9): before, errors, inside, inst, r, subText, svg, top (+1 more)

### Community 80 - "Pruebas smoke del motor"
Cohesion: 0.15
Nodes (11): CASES, cmTotal, codemodels, compareNative(), DIST, HERE, nativeVersion, normName() (+3 more)

### Community 81 - "Scripts de npm"
Cohesion: 0.12
Nodes (16): scripts, assets, build, corpus, dev, e2e, e2e:firefox, engine (+8 more)

### Community 82 - "Diccionario de share y renombres"
Cohesion: 0.13
Nodes (11): count, esc(), files, lines, files, host, ls, ROOT (+3 more)

### Community 83 - "Codemod de i18n"
Cohesion: 0.13
Nodes (14): at, body, collisions, entries, es, files, quote(), ROOT (+6 more)

### Community 84 - "Edición de directivas"
Cohesion: 0.27
Nodes (13): SchText, variantFromAscs(), variantFromAsc(), active(), findAnalysis(), FoundLine, lines(), removeAnalysis() (+5 more)

### Community 85 - "Dependencias de desarrollo"
Cohesion: 0.14
Nodes (14): devDependencies, playwright-core@^1.49.1, @types/node@22.10.2, @types/react@18.3.12, @types/react-dom@18.3.1, vite@6.0.5, @vitejs/plugin-react@4.3.4, vitest@2.1.8 (+6 more)

### Community 86 - "Archivos .cmp de componentes"
Cohesion: 0.27
Nodes (12): CMP_COLUMNS, cmpCell(), cmpChoicesFor(), CmpColumn, CmpKind, CmpPart, compareCells(), kindOfFile() (+4 more)

### Community 87 - "Worker del corpus"
Cohesion: 0.13
Nodes (11): codemodels, dir, DIST, doc, [file, out], lib, lt, me (+3 more)

### Community 88 - "Auditoría de i18n"
Cohesion: 0.15
Nodes (11): enWords, esWords, files, parsed, rel(), SAME_IN_BOTH, spanish(), SPANISH_OK (+3 more)

### Community 89 - "Pasos del workflow CI"
Cohesion: 0.27
Nodes (14): steps, steps, steps, BASE_PATH, CHROMIUM, VITE_CHANNEL, VITE_GOOGLE_CLIENT_ID, steps (+6 more)

### Community 90 - "Raíz de la app React"
Cohesion: 0.16
Nodes (6): react-dom, App(), ErrorBoundary, Props, same(), State

### Community 91 - "Generador de símbolos base"
Cohesion: 0.18
Nodes (7): circle(), diodeBody(), JFET, OUT, sourceCircle(), stub(), SYMBOLS

### Community 92 - "Nodos flotantes"
Cohesion: 0.30
Nodes (11): dcGroups(), fixFloatingNodes(), FLOAT_R, floatingNodes(), isGround(), logicalLines(), parseText(), positional() (+3 more)

### Community 93 - "Conversión de elementos LTspice"
Cohesion: 0.21
Nodes (14): bypassGrounded(), capacitorIcs(), convertElements(), expandElement(), expandStateFunctions(), fixBraces(), holdAtOp(), icValue() (+6 more)

### Community 94 - "E2E: editor"
Cohesion: 0.18
Nodes (12): ascEntry, at(), click(), doc, errors, lib, net, saved (+4 more)

### Community 95 - "Despliegue a Pages"
Cohesion: 0.15
Nodes (12): env, EMSDK_VERSION, name, permissions, contents, id-token, pages, branches (+4 more)

### Community 96 - "Escaneo de textos de UI"
Cohesion: 0.22
Nodes (12): context(), files(), insideFunction(), ROOT, scan(), SKIP, spanish(), SRC (+4 more)

### Community 97 - "Pruebas HDL"
Cohesion: 0.18
Nodes (10): vvpForEngine(), CASES, assets, behavioral(), codemodels, DIST, HERE, ICARUS (+2 more)

### Community 98 - "Resolución de modelos"
Cohesion: 0.19
Nodes (9): coupledInductors(), fixParam(), hasStartup(), ModelResolver, sinePeriods(), splitIc(), toNgspice(), tranHoldsIc() (+1 more)

### Community 99 - "E2E: diálogos"
Cohesion: 0.19
Nodes (10): adv, dialog, edit(), errors, openV1(), real, rightEdit(), show (+2 more)

### Community 100 - "Pruebas E2E de Verilog"
Cohesion: 0.17
Nodes (6): chip, code, errors, inst, newModule(), openTree()

### Community 102 - "Pruebas E2E de colocación"
Cohesion: 0.17
Nodes (8): ctxMenu, errors, ghost, input, mid, real, svg, tops

### Community 103 - "Pruebas E2E de formas"
Cohesion: 0.18
Nodes (8): ASC, at(), click(), errors, modal, real, shapes, svg

### Community 104 - "Perfilado de arrastre"
Cohesion: 0.18
Nodes (9): byId, events, open(), parent, self, settle(), t0, total (+1 more)

### Community 105 - "Parámetros de pasos de CI"
Cohesion: 0.18
Nodes (11): with, cache, if-no-files-found, key, name, node-version, path, pattern (+3 more)

### Community 106 - "Conversión del manual ngspice"
Cohesion: 0.20
Nodes (8): chapters, cmp(), convert(), idx, index, lines, outDir, raw

### Community 107 - "Trazas del visor"
Cohesion: 0.24
Nodes (7): SimPlot, Ctx, CurveContext, Resolver, Props, plot, sim

### Community 108 - "Plantillas de Estudio"
Cohesion: 0.20
Nodes (9): StudyInfo, MeasAnalysis, emptyStudy(), StudyMeasure, blocksCanExpress(), STUDY_TEMPLATES, TemplateCircuit, base() (+1 more)

### Community 109 - "Despliegue en Pages"
Cohesion: 0.22
Nodes (10): concurrency, cancel-in-progress, group, concurrency, environment, needs, runs-on, name (+2 more)

### Community 110 - "Matriz de suites CI"
Cohesion: 0.22
Nodes (10): strategy, site, suite, continue-on-error, if, needs, runs-on, strategy (+2 more)

### Community 111 - "Parámetros eléctricos Verilog"
Cohesion: 0.29
Nodes (6): ELECTRICAL, ELECTRICAL_NAMES, ElectricalParam, FAMILIES, ParamField(), VerilogModule()

### Community 112 - "Reemplazo de diodo ideal"
Cohesion: 0.31
Nodes (9): current(), IDEAL_PARAMS, IdealDiodeResult, IdealModel, joinContinuations(), minR(), parseModelParams(), replaceIdealDiodes() (+1 more)

### Community 113 - "Script de simulación de ejemplos"
Cohesion: 0.20
Nodes (9): args, assets, codemodels, DIST, examples, lib, reasons, ROOT (+1 more)

### Community 114 - "Preparación de modelos CMP"
Cohesion: 0.25
Nodes (8): CMP_FILES, stripLtspiceInfo(), patchModelFile(), patchSubckts(), prepareSimulation(), translateBLine(), CMP, lib

### Community 115 - "Análisis comparativo de simulaciones"
Cohesion: 0.25
Nodes (6): compareSim(), groups, interp(), jobs, report, SP

### Community 116 - "Comparación de resultados esperados"
Cohesion: 0.25
Nodes (5): diff, ids, load(), maps, vars

### Community 117 - "Conteo de issues"
Cohesion: 0.22
Nodes (4): asc, ltn, r, T

### Community 118 - "Modelos AKO"
Cohesion: 0.46
Nodes (7): collectModels(), logicalLines(), merge(), ModelDef, parseAko(), parseParams(), replaceAko()

### Community 120 - "Jobs de build y E2E"
Cohesion: 0.29
Nodes (7): runs-on, name, needs, runs-on, jobs, build, e2e

### Community 121 - "Menú contextual"
Cohesion: 0.48
Nodes (4): ContextItem, ContextMenu(), EditRow(), text()

### Community 123 - "Configuración de suite CI"
Cohesion: 0.33
Nodes (6): base, branch, channel, out, suite, include

### Community 124 - "Parámetros del banco"
Cohesion: 0.67
Nodes (5): benchParams(), benchVariables(), isParam(), lines(), setBenchParams()

### Community 125 - "Traducción de compuertas digitales"
Cohesion: 0.50
Nodes (4): FLOPS, GATES, params(), translateDigital()

### Community 126 - "Build de OpenVAF"
Cohesion: 0.50
Nodes (3): LLVM_SYS_211_PREFIX, PATH, build-openvaf.sh script

## Knowledge Gaps
- **3 isolated node(s):** `LLVM_SYS_211_PREFIX`, `PATH`, `PATH`
  These have ≤1 connection - possible missing edges. (Counts symbols only; 980 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `Diálogos de la interfaz` to `Cliente de Google Drive`, `Editor de modelos SPICE`, `Proyecto: bancos y variantes`, `Diálogo de fuentes`, `Formato de archivo .turbo`, `Parser y serializador ASC`, `Modo esquemático y utilidades`, `Barra de simulación`, `Punto de operación (bias)`, `Biblioteca de símbolos y modelos`, `Estado de la app y variantes`, `Modelo del documento ASC`, `Cuenta de Google y Drive`, `Álgebra de Laplace`, `Directivas y análisis del Estudio`, `Árbol del proyecto`, `Lista de simulaciones`, `Exportación a ZIP y netlist`, `Cliente del motor ngspice`, `Redes, pines y anotaciones`, `Buses y netlist LTspice`, `Evaluador de expresiones`, `Exportar esquemático y polos-ceros`, `Modo netlist y ejemplos`, `Panel de Estudio`, `Bloques del Estudio`, `Plantillas de Estudio`, `Parámetros de dispositivos`, `Datos embebidos y hooks`, `Mediciones .meas`, `Compilador de bloques`, `Apertura y guardado de archivos`, `Rutas de biblioteca y símbolos`, `Módulos Verilog del proyecto`, `Formas y hover del esquemático`, `Curvas y unidades`, `Carriles digitales y ejes`, `Bloques con Blockly`, `Compartir por enlace`, `Síntesis con Yosys`, `Traducción a ngspice`, `Panel de gráficos`, `Cursores y mediciones del visor`, `Idiomas e historial`, `Números SPICE y .step`, `Estimación de tamaño de simulación`, `Panel de resultados .meas`, `Archivos .cmp de componentes`, `Raíz de la app React`, `Conversión de elementos LTspice`, `Resolución de modelos`, `Parámetros eléctricos Verilog`, `Reemplazo de diodo ideal`, `Modelos AKO`, `Menú contextual`, `Traducción de compuertas digitales`?**
  _High betweenness centrality (0.109) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `SchematicMode()` (e.g. with `.parts()` and `.removeModelFile()`) actually correct?**
  _`SchematicMode()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `LLVM_SYS_211_PREFIX`, `PATH`, `PATH` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Cliente de Google Drive` be split into smaller, more focused modules?**
  _Cohesion score 0.05365686944634313 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `Geometría y textos` to `Cliente de Google Drive`, `Editor de modelos SPICE`, `Edición en el esquemático`, `Proyecto: bancos y variantes`, `Diálogo de fuentes`, `Parser y serializador ASC`, `Modo esquemático y utilidades`, `Diálogos de la interfaz`, `Barra de simulación`, `Punto de operación (bias)`, `Edición de cables y segmentos`, `Estado de la app y variantes`, `Modelo del documento ASC`, `Atributos y ventanas de símbolos`, `Cuenta de Google y Drive`, `Armado de la biblioteca`, `Lista de simulaciones`, `Exportación a ZIP y netlist`, `Buses y netlist LTspice`, `Evaluador de expresiones`, `Codificación de texto CP1252`, `Exportar esquemático y polos-ceros`, `Modo netlist y ejemplos`, `Bloques del Estudio`, `Parámetros de dispositivos`, `Datos embebidos y hooks`, `Mediciones .meas`, `Apertura y guardado de archivos`, `Rutas de biblioteca y símbolos`, `Módulos Verilog del proyecto`, `Formas y hover del esquemático`, `Carriles digitales y ejes`, `Transformada DFT`, `Markers del visor`, `Bloques con Blockly`, `Compartir por enlace`, `Cursores y mediciones del visor`, `Idiomas e historial`, `Números SPICE y .step`, `Estimación de tamaño de simulación`, `Dependencias del paquete`, `Rotación y transformaciones`, `Edición de directivas`, `Dependencias de desarrollo`, `Auditoría de i18n`, `Trazas del visor`, `Plantillas de Estudio`, `Preparación de modelos CMP`, `Decimación de formas de onda`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Should `Editor de modelos SPICE` be split into smaller, more focused modules?**
  _Cohesion score 0.10048076923076923 - nodes in this community are weakly interconnected._
- **Why does `SchematicMode()` connect `Modo esquemático y utilidades` to `Cliente de Google Drive`, `Editor de modelos SPICE`, `Edición en el esquemático`, `Proyecto: bancos y variantes`, `Diálogo de fuentes`, `Formato de archivo .turbo`, `Parser y serializador ASC`, `Diálogos de la interfaz`, `Barra de simulación`, `Punto de operación (bias)`, `Biblioteca de símbolos y modelos`, `Edición de cables y segmentos`, `Estado de la app y variantes`, `Modelo del documento ASC`, `Atributos y ventanas de símbolos`, `Cuenta de Google y Drive`, `Directivas y análisis del Estudio`, `Árbol del proyecto`, `Lista de simulaciones`, `Exportación a ZIP y netlist`, `Cliente del motor ngspice`, `Redes, pines y anotaciones`, `Buses y netlist LTspice`, `Evaluador de expresiones`, `Codificación de texto CP1252`, `Exportar esquemático y polos-ceros`, `Modo netlist y ejemplos`, `Panel de Estudio`, `Parámetros de dispositivos`, `Datos embebidos y hooks`, `Apertura y guardado de archivos`, `Vista de gráficos y trazas`, `Rutas de biblioteca y símbolos`, `Módulos Verilog del proyecto`, `Formas y hover del esquemático`, `Curvas y unidades`, `Bloques con Blockly`, `Compartir por enlace`, `Panel de gráficos`, `Idiomas e historial`, `Panel de resultados .meas`, `Rotación y transformaciones`, `Worker de Yosys`, `Edición de directivas`, `Archivos .cmp de componentes`, `Raíz de la app React`, `Parámetros eléctricos Verilog`, `Menú contextual`, `Parámetros del banco`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._