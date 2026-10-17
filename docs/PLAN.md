# TurboSpice — Plan maestro

Simulador de circuitos tipo LTspice que corre 100% en el navegador: ngspice compilado a
WebAssembly, interfaz para dibujar esquemáticos, hosteado como sitio estático en GitHub Pages.

## Decisiones

| Tema | Decisión |
|---|---|
| Motor | ngspice-47 compilado por nosotros (Emscripten, `libngspice`), ver `engine/README.md` |
| Frontend | Vite + TypeScript + React; esquemático en SVG custom |
| Archivo | **`.asc` de LTspice como formato nativo** (ida y vuelta), guardado con todo explícito. Ver `docs/compatibilidad-ltspice.md` |
| Guardado | Abrir/Guardar local (File System Access API, fallback descarga) + compartir por URL comprimida (fase 3) |
| Modelos | Librería en el repo con metadatos de licencia + modelos del usuario + importador local de LTspice |
| XSPICE | Completo desde v1 (analog, digital, spice2poly, xtradev, xtraevt, table, tlines) |
| UX | Inspirada en LTspice (atajos y flujo de probe), UI moderna propia |

### Licencias de modelos

Las librerías que trae LTspice (`lib/cmp/*`, `lib/sub/*`, `lib/sym/*`) son © Analog Devices y su
licencia no permite redistribuirlas; varios modelos ADI/LT están encriptados. **No se suben al repo**:
el importador de LTspice procesa la carpeta `lib/` del usuario en su navegador (IndexedDB local).
En `library/` sólo van modelos con licencia que permita redistribución (ngspice, KiCad, propios,
fabricantes que lo permitan), registrados en `library/LICENSES.md`.

## Estructura

```
engine/          build.sh, spinit, smoke/ (tests contra ngspice nativo)
library/         models/<origen>/, symbols/*.json, LICENSES.md, index.json (generado)
scripts/         build-library.ts
src/engine/      ngspice.ts (wrapper API), worker.ts, client.ts
src/schematic/   modelo de datos, editor SVG, herramientas
src/netlist/     conectividad (union-find) → netlist SPICE
src/analyses/    diálogos y generación de cada análisis
src/waveform/    visor (uPlot), cursores, expresiones
src/io/          .tsch, importador .asc/.asy, share-URL
src/library/     catálogo, buscador, modelos del usuario
```

## Análisis soportados

| Análisis | Presentación |
|---|---|
| `.op` | Anotación sobre el esquemático + tabla |
| `.dc` (anidado) | Curvas vs. variable de barrido |
| `.ac` | Bode (dB/fase), Nyquist |
| `.tran` (+ `.four`, FFT) | Formas de onda, FFT |
| `.noise` | Densidad espectral + ruido integrado |
| `.tf` | Tabla: ganancia, Rin, Rout |
| `.sens` | Tabla de sensibilidades |
| `.pz` | Plano s + tabla |
| `.disto` | HD2/HD3/IM |
| `.sp` | S-params (mag/fase, Smith) — puertos: `V… portnum N z0 Z` |
| `.pss` | Experimental en ngspice |
| `.meas` | Panel de mediciones |
| `.control` | Editor de scripts (Monte Carlo, `alter`, `foreach`) |
| `.step` (LTspice) | Traducido a loop `.control`, curvas superpuestas |

- Directivas SPICE libres en el esquemático.
- Probe de corriente: el netlister agrega `.options savecurrents` / `.save @dev[i]` según lo pedido.
- Señales digitales XSPICE: `ngSpice_AllEvtNodes` / `ngGet_Evt_NodeInfo`.

## Editor de esquemáticos

- Componentes, cables en grilla, etiquetas de red, tierra, puertos, textos, directivas. Undo/redo.
- Atajos tipo LTspice: `R` `C` `L` `D` `G`, `F3`/`W` cable, `F4` etiqueta, `Ctrl+R` rotar,
  `Ctrl+E` espejar, `F2` componente, `F5` borrar, `F7` mover, `F8` arrastrar.
- Símbolos: `.asy` de LTspice (TCLib + base propios) con el skin SVG de ASC-Parser.
- Netlister: union-find → redes; nombres desde etiquetas; `.include` de modelos usados;
  avisos de pines flotantes / nodos sin camino DC a tierra; expansión de `Rser`/`Rpar`/`Cpar` estilo LTspice.

## Librería de modelos

- `scripts/build-library.ts` parsea `library/models/` → `index.json` (nombre, tipo, pines, origen, licencia).
- En runtime: buscador sobre el catálogo; al simular se hace fetch de los archivos usados y se escriben en el FS.
- Modelos del usuario (`.lib/.mod/.sub`, arrastrar o pegar) embebidos en el `.tsch`.
- Asistente para mapear pines de un subckt a un símbolo.
- Importador local de LTspice: `.asy` + modelos → IndexedDB; avisa encriptados / primitivas sólo-LTspice.

## Visor de formas de onda

uPlot, múltiples paneles, ejes log/lin, dB/fase, cursores con Δ, expresiones (`V(out)/V(in)`),
probe por click (Alt+click potencia), export CSV/PNG.

## Fases

| Fase | Entregable | Estado |
|---|---|---|
| 0. Motor | ngspice WASM con todos los análisis + XSPICE, smoke test vs nativo | ✅ |
| 1. Base web | Vite+React, Worker, netlist → simular → plot, deploy a Pages | ✅ |
| 2. Editor | Esquemático SVG `.asc` nativo, TCLib + skin, netlister validado contra LTspice, probe | ✅ |
| 3. Archivos | share-URL (#1), export netlist/CSV/PNG/SVG (#12), autoguardado y recientes (#5) | ✅ |
| 4. Librería | Símbolos, modelos y bloques jerárquicos del usuario, generador de símbolos (#11) | ✅ (falta catálogo de modelos libres) |
| 5. Análisis | Diálogos (#13), visor con paneles/cursores/expresiones/Bode/Smith/.pz (#3), vista recordada `.plt` (#14) | ✅ |
| 6. LTspice | `.step` (#7), `ako:` (#8), numeración de nodos (#9); importador de la librería estándar (#6, pendiente) | parcial |
| 7. Pulido | Anotación OP (#2), nombres de redes (#15), menús, temas, ayuda, táctil (#4), e2e | ✅ |
| 8. Estudio | Barridos, tolerancias, mediciones (`.meas` en JS), FFT/THD, pasos `.control`, bloques Blockly (#16–#23) | ✅ |

Pendiente: #6 (modelos de la librería estándar de LTspice: decidir importador local vs librería propia)
y #10 (oráculo de LTspice bajo `xvfb-run`: verificar anidamiento de `.step`, lectura de `.plt` escritos por
TurboSpice, netlists jerárquicas y numeración de nodos sobre todo el corpus).

## Riesgos

1. ~~Code models XSPICE en WASM~~ — resuelto con `dlopen` de side modules (fase 0).
2. Licencias de modelos de fabricantes — revisar uno por uno.
3. Compatibilidad LTspice — el importador debe avisar, no fallar en silencio.
4. `.pss` experimental; OSDI/Verilog-A fuera de v1 (requeriría compilar modelos a wasm).
