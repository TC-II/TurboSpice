# Rendimiento

Auditoría del 22/10/2026 (issues #182–#191). Objetivo: que la app ande ágil en la mayor cantidad de
hardware posible, incluidas notebooks viejas y conexiones lentas.

## Cómo se mide

Todo por script, contra un build de producción (`npm run build && npm run preview`, o `vite preview`
de otro `--outDir`):

```sh
node tests/perf/bench.mjs http://localhost:4173/TurboSpice/            # tabla de tiempos
node tests/perf/bench.mjs <url> --cpu 6 --json salida.json               # más lento, con detalle
node tests/perf/bench.mjs <url> --asc "otro.asc"                         # otro esquemático grande
```

- La CPU se frena con CDP (`Emulation.setCPUThrottlingRate`, 4× por defecto) para emular hardware
  modesto. Los tiempos son por evento: desde que se despacha hasta el cuadro siguiente.
- El esquemático grande por defecto es `TC2-Sim/TC017 - Triangulo Estrella Kenelly.asc` (817
  símbolos, 1.638 cables, ~9.100 nodos SVG); si no está, una grilla de 800 resistencias.
- `tests/perf/profile.mjs <url> <asc> <paso>` perfila un paso (`hover`, `pan`, `wheel`, `move`,
  `undo`, `open`) y lista el tiempo propio y total por función. Con `TRACE=1`, el tiempo del hilo
  principal por fase de Blink (estilo, layout, pintado). Conviene contra un build sin minificar
  (`npx vite build --minify false`).
- `tests/e2e/performance.mjs` verifica que los arreglos se comporten bien (no los tiempos).

## Resultados (CPU 4×, esquemático grande)

| Acción | antes | después | issue |
|---|---|---|---|
| Ctrl+Z tras mover todo | 25.648 ms | ~530 ms | #182, #183 |
| mover todo (por evento) | 363 ms | ~230 ms | #182, #183, #184 |
| pasar el mouse (por evento) | 74 ms | 33 ms | #182, #187, #188 |
| panear (por evento, mediana) | 114 ms | 49 ms | #186 |
| zoom con la rueda (por evento, mediana) | 208 ms | 35 ms | #185, #186 |
| librería de arranque | 2.844 kB (430 kB gzip) | 943 kB (~140 kB gzip) | #189 |
| motor tras un deploy sin cambios en él | ~2,4 MB de nuevo | 0 (Cache Storage) | #191 |

En paneo y zoom el p95 (~130–180 ms) es el único cuadro caro del gesto: el de aplicar la vista al
soltar. En el esquemático chico (el Sample Project) todo ya cabía en un cuadro (17 ms) y sigue igual.

## Reglas que salieron de la auditoría

- **Nada de estado de alta frecuencia en `SchematicMode`** (App.tsx). Un `setState` ahí re-renderiza
  toda la vista: barra de simulación, panel de resultados, diálogos. Lo que cambia con el mouse vive
  en un componente chico que se suscribe (como `HintBar`, #187).
- **Los `AscDoc` son inmutables** después de parsear: cada edición arma objetos nuevos (verificado:
  ningún `attrs.set`/`windows.set` sobre una instancia existente). Las cachés de geometría
  (`symbolBox`, rótulos, `flagDirection`, `fixedPoints`) son `WeakMap` por objeto y dependen de eso.
  Si alguna vez se modifica un documento en el lugar, hay que invalidarlas.
- **`Library.symbol()` está memorizado por tipo**: cualquier método nuevo que cambie qué símbolo
  resuelve un tipo tiene que llamar a `symbolsChanged()` (vacía la memoria y sube `lib.rev`).
- **Nada de propiedades CSS custom en la raíz del SVG que cambien con la vista**: invalidan el estilo
  de todos los nodos (#185). Los trazos usan `vector-effect: non-scaling-stroke`.
- **Paneo, rueda y pellizco en esquemáticos pesados** (más de `HEAVY_NODES` = 1.500 nodos) mueven el
  `<svg>` ya pintado con un `transform` CSS y aplican la vista al terminar (al soltar, o 150 ms
  después del último giro de la rueda; en un gesto largo, cada tanto). Durante el gesto lo que entra
  por los bordes recién aparece al aplicarla (#186).
- Lo que no hace falta para ver el primer esquemático se baja después: las listas de pasivos
  (`cmp-passives.json`, #189) y el motor (arranca cuando llegó la librería, #190).
- El motor se guarda en Cache Storage con el hash de cada archivo (`public/engine/manifest.json`):
  GitHub Pages cambia el ETag de todo en cada deploy y si no se volvería a bajar entero (#191).

## Segunda tanda (#195)

Medido con `tests/perf/bench.mjs` (CPU 4×, Chromium headless sin GPU) sobre la grilla de 800
resistencias (TC017 no estaba en esta máquina; 7.252 nodos SVG):

| Acción | antes | después |
|---|---|---|
| mover todo (por evento) | 66 ms (p95 136) | 17 ms (p95 33) |
| panear (por evento) | 17 ms (p95 67) | 17 ms (p95 25) |
| pasar el mouse (por evento) | 69 ms | 53 ms |
| abrir el esquemático grande | 662 ms | 578 ms |
| JS de arranque | 860 kB (303 kB gzip) | 783 kB (270 kB gzip) |

- **Nivel de detalle**: cada `<text>` del esquemático lleva la clase `fsN` de su tamaño y el `<svg>`
  la clase `lod-N` con cuántos tamaños quedan por debajo de `MIN_TEXT_PX` (3 px) en pantalla; el
  CSS los oculta. La clase cambia sólo con la escala (en un gesto pesado, al aplicar la vista). No
  afecta la exportación (`schematicSvg` no copia `display`).
- **uPlot diferido**: `PlotPanel` y `Plot` se cargan con `lazy()` (`waveform/lazy.ts`) y se
  precargan en `requestIdleCallback` cuando el motor está listo.
- **Mover todo**: si la selección abarca todo lo que se ve (símbolos, cables, etiquetas, figuras y
  los textos visibles) en un esquemático pesado, nada se estira: durante el arrastre se traslada el
  `<g class="schematic">` con un atributo `transform` y el documento se arma una sola vez al soltar.
  Mover una parte sigue armando la vista previa en cada movimiento.

## Lo que queda (medido, sin arreglar)

- **El costo de fondo del SVG son los textos**: con los 1.634 textos ocultos, cambiar el `viewBox`
  baja de 105 a 39 ms por cuadro. Al alejar ya se ocultan (#195); a escala legible siguen pesando.
- Aun moviendo sólo el `transform`, Blink recorre el pintado del SVG en cada cuadro (~5 ms sin
  frenar la CPU, ~33 ms a 4×, medido en Chrome headless): por eso el paneo queda en ~50 ms y no en
  un cuadro.
- Imagen del esquemático durante el gesto (#195, punto 2): no se hizo. Depende de medir con GPU
  real (las mediciones son en headless sin GPU) y con el nivel de detalle el paneo ya bajó.
- Mover una parte de un esquemático pesado (con cables que se estiran) sigue en un documento nuevo
  por movimiento.
