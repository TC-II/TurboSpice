# Graph Report - TurboSpice  (2026-10-25)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 3054 nodes · 9300 edges · 130 communities (123 shown, 7 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 182 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b33c77a2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 108
- Community 109
- Community 110
- Community 111
- Community 112
- Community 113
- Community 114
- Community 115
- Community 116
- Community 117
- Community 118
- Community 119
- Community 120
- Community 121
- Community 122
- Community 123
- Community 124
- Community 125
- Community 126
- Community 127
- Community 128
- Community 129

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

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (51): AscEncoding, ApiFile, DriveClient, DriveFile, DriveUser, FOLDER_NAME, fromApi(), mimeOf() (+43 more)

### Community 1 - "Community 1"
Cohesion: 0.10
Nodes (58): subcktPins(), AttrInput(), ModelEditor(), addModelModule(), isModelModule(), key(), MODEL_ATTRS, MODEL_TYPES (+50 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (55): isNgspiceComment(), instancePinIssues(), CurrentArrowsLayer(), addText(), cutNew(), duplicateItems(), instLetter(), nextInstName() (+47 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (46): runs(), addGroup(), addSim(), applyValues(), ATTR_KEYS, blankVariant(), cloneVariant(), duplicateSim() (+38 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (22): cleanup(), Get_ng_vvp(), input(), report(), run(), step(), get_time(), init() (+14 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (46): andGate, andX(), arcPath(), arrow(), ASC_PARSER_SKINS, bjt(), bufTri(), C() (+38 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (44): sourceSyntax(), LabelPatch, CsvImport(), csvPoints(), DEFAULT_ARGS, Dim(), FieldDef, FieldKey (+36 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (39): activeAsc(), asBenches(), BENCHES, BenchGroup, docOf(), EXT, FileRun, FORMAT (+31 more)

### Community 8 - "Community 8"
Cohesion: 0.08
Nodes (36): ascText(), ShapeKind, attrValue(), badByDoc, badLines(), fields(), num(), parseAsc() (+28 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (45): clipboardImage(), HintBar(), isTyping(), lsGet(), lsSet(), SchematicMode(), userFileKind(), useTheme() (+37 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (39): t(), cmpApply(), FileConflictDialog(), BenchParamsDialog(), NameDialog(), ModuleKind, NewModuleDialog(), RESERVED (+31 more)

### Community 11 - "Community 11"
Cohesion: 0.09
Nodes (41): BarField, barRows(), COLUMNS, fieldProblem(), POINTS, SimBar(), SimState, STARTUP_TITLE (+33 more)

### Community 12 - "Community 12"
Cohesion: 0.11
Nodes (37): Block, Element, Bias, biasCommand(), biasParams(), bjtRegion(), circuitDirectives(), elementBias() (+29 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (16): registerUserFile(), baseName(), symbolPath(), Library, scanModels(), db(), importLtspiceLibrary(), libRelative() (+8 more)

### Community 14 - "Community 14"
Cohesion: 0.17
Nodes (35): onSegment(), addFlag(), addWire(), cutPieces(), cutThroughBodies(), dcSourcesAsCell(), dragSegment(), dragSegmentStraight() (+27 more)

### Community 15 - "Community 15"
Cohesion: 0.07
Nodes (29): ascCache, Dialog, EXAMPLES, FileState, HierLevel, Hover, PANEL_NAMES, Theme (+21 more)

### Community 16 - "Community 16"
Cohesion: 0.09
Nodes (34): AscDoc, DataFlag, DrawnShapeKind, Flag, FlagDir, GRID, ORIENTS, PinDef (+26 more)

### Community 17 - "Community 17"
Cohesion: 0.11
Nodes (37): defaultWindows(), effectiveAttrs(), effectiveWindows(), explicitSymbol(), ltspiceDefaultAs(), ltspiceWindows(), makeExplicit(), NETLIST_ATTRS (+29 more)

### Community 18 - "Community 18"
Cohesion: 0.09
Nodes (32): AccountButton(), Avatar(), DriveDialog(), importToDrive(), uniqueName(), Account, CLIENT_ID, drive (+24 more)

### Community 19 - "Community 19"
Cohesion: 0.14
Nodes (39): addC(), addP(), addR(), closing(), Coef, constOf(), constR(), divC() (+31 more)

### Community 20 - "Community 20"
Cohesion: 0.06
Nodes (29): jobs, one(), report, SP, want, readRaw(), args, conc (+21 more)

### Community 21 - "Community 21"
Cohesion: 0.08
Nodes (31): buildBundle(), LIB, MIN_SKIN_STROKE, normalizeSkin(), readText(), rel(), ROOT, walk() (+23 more)

### Community 22 - "Community 22"
Cohesion: 0.10
Nodes (36): belowTexts(), isDataText(), placeDataTexts(), sameExceptData(), EXTRA_ANALYSES, HOOK_MARKS, isControlBlock(), NGSPICE_ONLY (+28 more)

### Community 23 - "Community 23"
Cohesion: 0.05
Nodes (20): [a2, b2], canvas, code2, cursorHead(), errors, fftPick, headA(), headB() (+12 more)

### Community 24 - "Community 24"
Cohesion: 0.09
Nodes (23): errors, v, launchBrowser(), menu(), openExample(), pick(), resultsMenu(), resultsView() (+15 more)

### Community 25 - "Community 25"
Cohesion: 0.12
Nodes (28): react, BenchItem, KIND, loadCollapsed(), ProjectTree(), QuickOpen(), TreeBench, TreeSub (+20 more)

### Community 26 - "Community 26"
Cohesion: 0.13
Nodes (34): isComplexLine(), activeSim(), addSim(), analysisDetail(), analysisLabel(), analysisProblem(), compact(), defaultLine() (+26 more)

### Community 27 - "Community 27"
Cohesion: 0.12
Nodes (33): emptyDoc(), exportAllZip(), exportSubcktNetlist(), exportSubcktZip(), exportVariantZip(), Imported, runFilesOf(), safeName() (+25 more)

### Community 28 - "Community 28"
Cohesion: 0.10
Nodes (21): EngineClient, friendly(), Pending, Req, SimOutcome, DIGITAL_TYPE, NgspiceAssets, NgspiceFactory (+13 more)

### Community 29 - "Community 29"
Cohesion: 0.09
Nodes (30): vitest, alignedBox(), boxOf(), computeLocalBox(), fixedCache, flagBox(), flagDirection(), FONT_SIZE (+22 more)

### Community 30 - "Community 30"
Cohesion: 0.09
Nodes (18): Point, Net, PinRef, CurrentArrow, ItemRef, anchor(), Annotation, annotationBox() (+10 more)

### Community 31 - "Community 31"
Cohesion: 0.16
Nodes (24): SymbolDef, SymbolSource, bitNodeName(), busBits(), busWidth(), instArray(), isBusName(), partBits() (+16 more)

### Community 32 - "Community 32"
Cohesion: 0.11
Nodes (30): C, cdiv(), cmul(), cpow(), derivative(), ev(), EvalContext, evalTrace() (+22 more)

### Community 33 - "Community 33"
Cohesion: 0.09
Nodes (23): canEncodeCp1252(), CP1252_REVERSE, cp1252Byte(), decode(), decodeText(), detectEncoding(), encode(), args (+15 more)

### Community 34 - "Community 34"
Cohesion: 0.16
Nodes (26): download(), exportSchematic(), PROPS, schematicPng(), schematicSvg(), vectorExpr(), complexText(), CSV_HEAD (+18 more)

### Community 35 - "Community 35"
Cohesion: 0.09
Nodes (10): attachDrive(), clearToast(), driveContext(), FakeDrive, matches(), meta(), parseMultipart(), save() (+2 more)

### Community 36 - "Community 36"
Cohesion: 0.15
Nodes (25): SimVector, EXAMPLES, defaultTraces(), NetlistMode(), ScalarTable(), Status, StatusText(), Plot (+17 more)

### Community 37 - "Community 37"
Cohesion: 0.17
Nodes (30): AnalysisCard(), Card(), cleanPlot(), isNumeric(), kindOf(), MeasureCard(), PickInput(), plain() (+22 more)

### Community 38 - "Community 38"
Cohesion: 0.08
Nodes (25): MEASURE_KINDS, MeasureKind, Study, StudySweep, BLOCK_MEASURES, BlockJson, BLOCKS_MARK, COLORS (+17 more)

### Community 39 - "Community 39"
Cohesion: 0.14
Nodes (27): defaultAnalysis(), addMeasures(), addSweeps(), compOf(), defaultOptions(), defaultSignal(), engValue(), link() (+19 more)

### Community 40 - "Community 40"
Cohesion: 0.13
Nodes (25): SimRun, missingSymbolIn(), NgspiceNetlist, BY_LETTER, deviceExprUnit(), DeviceParam, deviceParams(), deviceRefs() (+17 more)

### Community 41 - "Community 41"
Cohesion: 0.15
Nodes (24): DATA_TAGS, DataTag, dataText(), fromBase64(), isDataTextOf(), readData(), toBase64(), writeData() (+16 more)

### Community 42 - "Community 42"
Cohesion: 0.13
Nodes (24): AGG, Aggregate, ANALYSIS_OF, cross(), Crossing, evalMeasures(), evalOne(), interp() (+16 more)

### Community 43 - "Community 43"
Cohesion: 0.20
Nodes (13): SweepTarget, allBlocks(), asCards(), blockMeasure(), chain(), compileBlocks(), Compiler, field() (+5 more)

### Community 45 - "Community 45"
Cohesion: 0.10
Nodes (22): ASC_TYPE, FileHandle, openFile(), openProjectFile(), PickedFile, PickerOpts, readAsc(), TURBO_TYPE (+14 more)

### Community 46 - "Community 46"
Cohesion: 0.09
Nodes (19): codemodels, DST, hashes, ROOT, SRC, OUT, result, sorted (+11 more)

### Community 47 - "Community 47"
Cohesion: 0.13
Nodes (25): isDigitalExpr(), Radix, acceptsTrace(), addTraceTo(), asDft(), asPlotView(), colorFor(), colorize() (+17 more)

### Community 48 - "Community 48"
Cohesion: 0.13
Nodes (19): WindowDefaults, CMP_DIR, LibraryBundle, LTSPICE_PREFIX, PROJECT_DIR, PROJECT_PREFIX, USER_DIR, USER_PREFIX (+11 more)

### Community 49 - "Community 49"
Cohesion: 0.17
Nodes (21): addVerilogModule(), applySynth(), IOPIN, isStale(), key(), looksBehavioral(), moduleOf(), portsOf() (+13 more)

### Community 50 - "Community 50"
Cohesion: 0.14
Nodes (20): allItems(), extractItems(), setShapeStyle(), hoverCoords(), hoverInfo(), netLabel(), short(), arcAngles() (+12 more)

### Community 51 - "Community 51"
Cohesion: 0.13
Nodes (22): dftCurves(), dftSampling(), evalOn(), evaluated, exprUnit(), isCurrentExpr(), paneCurves(), PaneData (+14 more)

### Community 52 - "Community 52"
Cohesion: 0.17
Nodes (18): Curve, formatRadix(), logicState(), DigitalLanes(), niceTicks(), Range, runs(), allFinite() (+10 more)

### Community 53 - "Community 53"
Cohesion: 0.17
Nodes (19): Analysis, analyze(), besselI0(), cosines(), defaultFs(), dft(), fftPow2(), isPow2() (+11 more)

### Community 54 - "Community 54"
Cohesion: 0.17
Nodes (20): addMarker(), asMarkers(), crossings(), delta(), horizontalCuts(), MarkCurve, MarkerAxis, MarkerKind (+12 more)

### Community 55 - "Community 55"
Cohesion: 0.09
Nodes (17): by, dirs, jobs, MIR, REPOS, SIB, SP, sueltos (+9 more)

### Community 56 - "Community 56"
Cohesion: 0.15
Nodes (18): defineBlocks(), isDark(), sourceOptions(), StudyBlocks(), targetOptions(), theme(), blockResultsFromLog(), blockDefinitions() (+10 more)

### Community 57 - "Community 57"
Cohesion: 0.18
Nodes (15): isTurboText(), compactTurbo(), dict1(), expandTurbo(), fromBase64Url(), ID_KEYS, isObj(), Json (+7 more)

### Community 58 - "Community 58"
Cohesion: 0.19
Nodes (18): electricalLine(), Bit, cosimSubckt(), GATES, HdlBlock, HdlError, ident(), paramValue() (+10 more)

### Community 59 - "Community 59"
Cohesion: 0.10
Nodes (12): C, engineRequests, errors, libRequests, lines, P, Q, svg (+4 more)

### Community 60 - "Community 60"
Cohesion: 0.11
Nodes (8): at(), chart, errors, modal, mv, results, svg, viewBox()

### Community 61 - "Community 61"
Cohesion: 0.13
Nodes (12): activeRow, at(), benchRows(), errors, goBench(), items(), openPanel(), probe() (+4 more)

### Community 62 - "Community 62"
Cohesion: 0.13
Nodes (16): args, ASC, bytes, clickTime(), CPU, DEFAULT, errors, fineWheel() (+8 more)

### Community 63 - "Community 63"
Cohesion: 0.14
Nodes (18): busBitNode(), addSteps(), B_FUNCTIONS, bTable(), DB_PARAMS, declaredParams(), fixTran(), hashRand() (+10 more)

### Community 64 - "Community 64"
Cohesion: 0.16
Nodes (13): FileSim, Sim, SimView, ComplexMode, traceLabel(), Marker, exportPng(), PlotPanel() (+5 more)

### Community 65 - "Community 65"
Cohesion: 0.22
Nodes (16): DftWindow, MAX_SAMPLES, bandwidth3dB(), cursorDiff(), nearestIndex(), Stats, stepPoint(), toCsv() (+8 more)

### Community 66 - "Community 66"
Cohesion: 0.12
Nodes (14): typescript@5.7.2, typescript, ALLOW, english, es, found, j, missing (+6 more)

### Community 67 - "Community 67"
Cohesion: 0.12
Nodes (15): COMMENTS, ex, example(), EXAMPLES, hideWaveValues(), inv, inv0, lib (+7 more)

### Community 68 - "Community 68"
Cohesion: 0.18
Nodes (11): es, getLang(), Lang, LANGS, locale(), setLang(), HistoryPanel(), HistoryPick (+3 more)

### Community 69 - "Community 69"
Cohesion: 0.19
Nodes (15): formatSpiceNumber(), parseSpiceNumber(), SUFFIX, MAX_RUNS, parseStep(), SI, siValue(), Step (+7 more)

### Community 70 - "Community 70"
Cohesion: 0.19
Nodes (16): Analysis, Sweep, analysisPoints(), BRANCHES, checkSimSize(), countVectors(), CURRENTS, fmtBytes() (+8 more)

### Community 71 - "Community 71"
Cohesion: 0.22
Nodes (16): MeasResult, downloadCsv(), fmtResult(), Histogram(), MeasPanel(), columnStats(), histogram(), isRun() (+8 more)

### Community 72 - "Community 72"
Cohesion: 0.14
Nodes (15): both, cf, cmp, files, inTs, isFile(), junk(), LT (+7 more)

### Community 73 - "Community 73"
Cohesion: 0.12
Nodes (12): args, BIG, bytes, CPU, errors, frames(), JSON_OUT, report() (+4 more)

### Community 74 - "Community 74"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+9 more)

### Community 75 - "Community 75"
Cohesion: 0.15
Nodes (16): dependencies, blockly@13.3.0, fflate@^0.8.3, react@18.3.1, react-dom@18.3.1, uplot@1.6.31, @yowasp/yosys@0.70.1258, license (+8 more)

### Community 76 - "Community 76"
Cohesion: 0.15
Nodes (15): Orient, refsKey(), setWindow(), transformItems(), transformPivot(), pivotNear(), symbolPivot(), bundle (+7 more)

### Community 77 - "Community 77"
Cohesion: 0.15
Nodes (13): compileBehavioral(), getWorker(), NoId, pending, request(), synthesizeVerilog(), EmProgram, RunYosys (+5 more)

### Community 78 - "Community 78"
Cohesion: 0.17
Nodes (10): clean(), compileIcarus(), firstError(), IcarusLoader, IcarusPort, IcarusResult, iconfig(), parseVvp() (+2 more)

### Community 79 - "Community 79"
Cohesion: 0.12
Nodes (9): before, errors, inside, inst, r, subText, svg, top (+1 more)

### Community 80 - "Community 80"
Cohesion: 0.15
Nodes (11): CASES, cmTotal, codemodels, compareNative(), DIST, HERE, nativeVersion, normName() (+3 more)

### Community 81 - "Community 81"
Cohesion: 0.12
Nodes (16): scripts, assets, build, corpus, dev, e2e, e2e:firefox, engine (+8 more)

### Community 82 - "Community 82"
Cohesion: 0.13
Nodes (11): count, esc(), files, lines, files, host, ls, ROOT (+3 more)

### Community 83 - "Community 83"
Cohesion: 0.13
Nodes (14): at, body, collisions, entries, es, files, quote(), ROOT (+6 more)

### Community 84 - "Community 84"
Cohesion: 0.27
Nodes (13): SchText, variantFromAscs(), variantFromAsc(), active(), findAnalysis(), FoundLine, lines(), removeAnalysis() (+5 more)

### Community 85 - "Community 85"
Cohesion: 0.14
Nodes (14): devDependencies, playwright-core@^1.49.1, @types/node@22.10.2, @types/react@18.3.12, @types/react-dom@18.3.1, vite@6.0.5, @vitejs/plugin-react@4.3.4, vitest@2.1.8 (+6 more)

### Community 86 - "Community 86"
Cohesion: 0.27
Nodes (12): CMP_COLUMNS, cmpCell(), cmpChoicesFor(), CmpColumn, CmpKind, CmpPart, compareCells(), kindOfFile() (+4 more)

### Community 87 - "Community 87"
Cohesion: 0.13
Nodes (11): codemodels, dir, DIST, doc, [file, out], lib, lt, me (+3 more)

### Community 88 - "Community 88"
Cohesion: 0.15
Nodes (11): enWords, esWords, files, parsed, rel(), SAME_IN_BOTH, spanish(), SPANISH_OK (+3 more)

### Community 89 - "Community 89"
Cohesion: 0.27
Nodes (14): steps, steps, steps, BASE_PATH, CHROMIUM, VITE_CHANNEL, VITE_GOOGLE_CLIENT_ID, steps (+6 more)

### Community 90 - "Community 90"
Cohesion: 0.16
Nodes (6): react-dom, App(), ErrorBoundary, Props, same(), State

### Community 91 - "Community 91"
Cohesion: 0.18
Nodes (7): circle(), diodeBody(), JFET, OUT, sourceCircle(), stub(), SYMBOLS

### Community 92 - "Community 92"
Cohesion: 0.30
Nodes (11): dcGroups(), fixFloatingNodes(), FLOAT_R, floatingNodes(), isGround(), logicalLines(), parseText(), positional() (+3 more)

### Community 93 - "Community 93"
Cohesion: 0.21
Nodes (14): bypassGrounded(), capacitorIcs(), convertElements(), expandElement(), expandStateFunctions(), fixBraces(), holdAtOp(), icValue() (+6 more)

### Community 94 - "Community 94"
Cohesion: 0.18
Nodes (12): ascEntry, at(), click(), doc, errors, lib, net, saved (+4 more)

### Community 95 - "Community 95"
Cohesion: 0.15
Nodes (12): env, EMSDK_VERSION, name, permissions, contents, id-token, pages, branches (+4 more)

### Community 96 - "Community 96"
Cohesion: 0.22
Nodes (12): context(), files(), insideFunction(), ROOT, scan(), SKIP, spanish(), SRC (+4 more)

### Community 97 - "Community 97"
Cohesion: 0.18
Nodes (10): vvpForEngine(), CASES, assets, behavioral(), codemodels, DIST, HERE, ICARUS (+2 more)

### Community 98 - "Community 98"
Cohesion: 0.19
Nodes (9): coupledInductors(), fixParam(), hasStartup(), ModelResolver, sinePeriods(), splitIc(), toNgspice(), tranHoldsIc() (+1 more)

### Community 99 - "Community 99"
Cohesion: 0.19
Nodes (10): adv, dialog, edit(), errors, openV1(), real, rightEdit(), show (+2 more)

### Community 100 - "Community 100"
Cohesion: 0.17
Nodes (6): chip, code, errors, inst, newModule(), openTree()

### Community 102 - "Community 102"
Cohesion: 0.17
Nodes (8): ctxMenu, errors, ghost, input, mid, real, svg, tops

### Community 103 - "Community 103"
Cohesion: 0.18
Nodes (8): ASC, at(), click(), errors, modal, real, shapes, svg

### Community 104 - "Community 104"
Cohesion: 0.18
Nodes (9): byId, events, open(), parent, self, settle(), t0, total (+1 more)

### Community 105 - "Community 105"
Cohesion: 0.18
Nodes (11): with, cache, if-no-files-found, key, name, node-version, path, pattern (+3 more)

### Community 106 - "Community 106"
Cohesion: 0.20
Nodes (8): chapters, cmp(), convert(), idx, index, lines, outDir, raw

### Community 107 - "Community 107"
Cohesion: 0.24
Nodes (7): SimPlot, Ctx, CurveContext, Resolver, Props, plot, sim

### Community 108 - "Community 108"
Cohesion: 0.20
Nodes (9): StudyInfo, MeasAnalysis, emptyStudy(), StudyMeasure, blocksCanExpress(), STUDY_TEMPLATES, TemplateCircuit, base() (+1 more)

### Community 109 - "Community 109"
Cohesion: 0.22
Nodes (10): concurrency, cancel-in-progress, group, concurrency, environment, needs, runs-on, name (+2 more)

### Community 110 - "Community 110"
Cohesion: 0.22
Nodes (10): strategy, site, suite, continue-on-error, if, needs, runs-on, strategy (+2 more)

### Community 111 - "Community 111"
Cohesion: 0.29
Nodes (6): ELECTRICAL, ELECTRICAL_NAMES, ElectricalParam, FAMILIES, ParamField(), VerilogModule()

### Community 112 - "Community 112"
Cohesion: 0.31
Nodes (9): current(), IDEAL_PARAMS, IdealDiodeResult, IdealModel, joinContinuations(), minR(), parseModelParams(), replaceIdealDiodes() (+1 more)

### Community 113 - "Community 113"
Cohesion: 0.20
Nodes (9): args, assets, codemodels, DIST, examples, lib, reasons, ROOT (+1 more)

### Community 114 - "Community 114"
Cohesion: 0.25
Nodes (8): CMP_FILES, stripLtspiceInfo(), patchModelFile(), patchSubckts(), prepareSimulation(), translateBLine(), CMP, lib

### Community 115 - "Community 115"
Cohesion: 0.25
Nodes (6): compareSim(), groups, interp(), jobs, report, SP

### Community 116 - "Community 116"
Cohesion: 0.25
Nodes (5): diff, ids, load(), maps, vars

### Community 117 - "Community 117"
Cohesion: 0.22
Nodes (4): asc, ltn, r, T

### Community 118 - "Community 118"
Cohesion: 0.46
Nodes (7): collectModels(), logicalLines(), merge(), ModelDef, parseAko(), parseParams(), replaceAko()

### Community 120 - "Community 120"
Cohesion: 0.29
Nodes (7): runs-on, name, needs, runs-on, jobs, build, e2e

### Community 121 - "Community 121"
Cohesion: 0.48
Nodes (4): ContextItem, ContextMenu(), EditRow(), text()

### Community 123 - "Community 123"
Cohesion: 0.33
Nodes (6): base, branch, channel, out, suite, include

### Community 124 - "Community 124"
Cohesion: 0.67
Nodes (5): benchParams(), benchVariables(), isParam(), lines(), setBenchParams()

### Community 125 - "Community 125"
Cohesion: 0.50
Nodes (4): FLOPS, GATES, params(), translateDigital()

### Community 126 - "Community 126"
Cohesion: 0.50
Nodes (3): LLVM_SYS_211_PREFIX, PATH, build-openvaf.sh script

## Knowledge Gaps
- **3 isolated node(s):** `LLVM_SYS_211_PREFIX`, `PATH`, `PATH`
  These have ≤1 connection - possible missing edges. (Counts symbols only; 980 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `Community 10` to `Community 0`, `Community 1`, `Community 3`, `Community 6`, `Community 7`, `Community 8`, `Community 9`, `Community 11`, `Community 12`, `Community 13`, `Community 15`, `Community 16`, `Community 18`, `Community 19`, `Community 22`, `Community 25`, `Community 26`, `Community 27`, `Community 28`, `Community 30`, `Community 31`, `Community 32`, `Community 34`, `Community 36`, `Community 37`, `Community 38`, `Community 39`, `Community 40`, `Community 41`, `Community 42`, `Community 43`, `Community 45`, `Community 48`, `Community 49`, `Community 50`, `Community 51`, `Community 52`, `Community 56`, `Community 57`, `Community 58`, `Community 63`, `Community 64`, `Community 65`, `Community 68`, `Community 69`, `Community 70`, `Community 71`, `Community 86`, `Community 90`, `Community 93`, `Community 98`, `Community 111`, `Community 112`, `Community 118`, `Community 121`, `Community 125`?**
  _High betweenness centrality (0.109) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `SchematicMode()` (e.g. with `.parts()` and `.removeModelFile()`) actually correct?**
  _`SchematicMode()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `LLVM_SYS_211_PREFIX`, `PATH`, `PATH` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05365686944634313 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `Community 29` to `Community 0`, `Community 1`, `Community 2`, `Community 3`, `Community 6`, `Community 8`, `Community 9`, `Community 10`, `Community 11`, `Community 12`, `Community 14`, `Community 15`, `Community 16`, `Community 17`, `Community 18`, `Community 21`, `Community 26`, `Community 27`, `Community 31`, `Community 32`, `Community 33`, `Community 34`, `Community 36`, `Community 38`, `Community 40`, `Community 41`, `Community 42`, `Community 45`, `Community 48`, `Community 49`, `Community 50`, `Community 52`, `Community 53`, `Community 54`, `Community 56`, `Community 57`, `Community 65`, `Community 68`, `Community 69`, `Community 70`, `Community 75`, `Community 76`, `Community 84`, `Community 85`, `Community 88`, `Community 107`, `Community 108`, `Community 114`, `Community 119`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.10048076923076923 - nodes in this community are weakly interconnected._
- **Why does `SchematicMode()` connect `Community 9` to `Community 0`, `Community 1`, `Community 2`, `Community 3`, `Community 6`, `Community 7`, `Community 8`, `Community 10`, `Community 11`, `Community 12`, `Community 13`, `Community 14`, `Community 15`, `Community 16`, `Community 17`, `Community 18`, `Community 22`, `Community 25`, `Community 26`, `Community 27`, `Community 28`, `Community 30`, `Community 31`, `Community 32`, `Community 33`, `Community 34`, `Community 36`, `Community 37`, `Community 40`, `Community 41`, `Community 45`, `Community 47`, `Community 48`, `Community 49`, `Community 50`, `Community 51`, `Community 56`, `Community 57`, `Community 64`, `Community 68`, `Community 71`, `Community 76`, `Community 77`, `Community 84`, `Community 86`, `Community 90`, `Community 111`, `Community 121`, `Community 124`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._