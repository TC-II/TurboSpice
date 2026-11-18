# Auditoría y depuración «Dev2» (noviembre de 2026)

Revisión de correctitud por áreas, pruebas en el navegador y correcciones sobre la rama `dev2`
(sale de `dev`, sólo local). El foco pedido fue **bugs funcionales** y **UX / pulido**: que la app
deje de sentirse hecha «a parches» y se comporte como un producto terminado. Complementa
[`auditoria-calidad.md`](auditoria-calidad.md) (calidad de código, cerrada),
[`qa-2026-11.md`](qa-2026-11.md) (QA manual) y [`auditoria-ux-2026-11.md`](auditoria-ux-2026-11.md)
(heurísticas y accesibilidad). Cómo probar cada cambio: [`dev2-como-probar.md`](dev2-como-probar.md).

## Método

1. **Línea base** de calidad (typecheck, lint, formato, tests, i18n).
2. **Cinco revisiones de sólo lectura** por área (netlist y simulación, visor, editor, proyecto e
   importación, consistencia de interfaz), cada hallazgo con `archivo:línea`, escenario y nivel de
   confianza. Salieron 62 hallazgos.
3. **Pruebas en el navegador** (dev server, en una pestaña aparte del proyecto en curso).
4. **Correcciones**, cada una confirmada antes de tocarla (con un test que falla cuando la lógica
   es testeable) y con su test unitario.
5. **Verificación**: typecheck, lint (0 avisos), formato, i18n, tests unitarios, build, e2e y
   comprobación en el navegador.

## Resumen

| Área                     | Hallazgos | Arreglados | Quedan (ver § Pendiente) |
| ------------------------ | --------- | ---------- | ------------------------ |
| Netlist, medidas y motor | 13        | 11         | 2                        |
| Visor de resultados      | 15        | 14         | 1                        |
| Editor de esquemáticos   | 11        | 10         | 1                        |
| Proyecto e importación   | 10        | 8          | 2                        |
| Interfaz y consistencia  | 13        | 9          | 4                        |

Tests unitarios: **1755**, todos en verde (los arreglos sumaron unos 115 casos).

## 1. Lo más grave que se encontró

1. **Seguridad: un rótulo LaTeX podía ejecutar JavaScript.** MathJax se cargaba con el paquete
   `html`, así que `$\href{javascript:…}{ver}$` en un comentario (que llega por un link compartido
   o un `.asc` ajeno) se dibujaba como enlace ejecutable en el origen de la app, donde está el
   token de Google Drive. Arreglo doble en `src/schematic/latex.ts`: no se carga el paquete `html`
   y el SVG que devuelve MathJax pasa por un filtro que quita enlaces y manejadores.
2. **Pérdida de trabajo al abrir un link o ejemplo que falla.** Con trabajo sin guardar, abrir un
   link de una versión más nueva (o un `?example=` sin red) dejaba la pestaña con un proyecto
   vacío y el autoguardado pisaba la sesión recuperada. Ahora se sigue con la sesión guardada y
   se avisa qué falló; si la sesión misma es ilegible, queda en Recientes como trabajo sin
   guardar (`src/app/useProjectSession.ts`).
3. **Guardar en Drive pisaba una versión más nueva sin avisar** cuando el reciente se había
   abierto sin poder leer Drive (token vencido). Sin versión conocida, ahora se trata como
   posible conflicto y sale el diálogo de siempre (`driveChanged` en `src/app/useDrive.ts`).
4. **Una `.meas` incompleta tiraba abajo la corrida después de simular** (`TypeError` sobre
   `undefined`): se perdían los resultados y no se podía abrir el Estudio. `parseMeas` devuelve
   ahora un error legible por línea.
5. **Directivas de varias líneas en un mismo texto** (`.ic I(L1)=1` + `.tran … uic`): la netlist
   salía rota o perdía la corriente inicial y la rampa `startup` en silencio. Un único
   `directiveLines` (`src/netlist/directives.ts`) reemplaza los `split` dispares.
6. **`1A` se simulaba como 1 atto-ampere.** ngspice-47 lee el sufijo `a` como 10⁻¹⁸; para
   LTspice (y para cualquiera que lo escribe) `1A` es un ampere. La netlist ahora le quita la
   unidad a los valores de R, C, L, V e I antes de mandarlos al motor (`stripAmpereUnit`).

## 2. Correcciones por área

### Netlist, medidas y motor

- Directivas con `\n` literal: `.ic`, `.tran uic` y `startup` (ver arriba).
- `.meas`: líneas incompletas, `RISE={n}` y `FROM=` vacío dan un mensaje claro; los cruces que
  parten exactamente del umbral (un pulso 0→1 con `VAL=0`) ahora se cuentan, sin contar dos veces.
- `.dc` con incremento 0 y `.tran` con pasos negativos se rechazan en el formulario, en vez del
  «Error on line N» de ngspice. Se revisó que ninguna línea de los ejemplos quede bloqueada.
- `1A` = 1 ampere (ver arriba).
- **Diodo ideal:** se emite como fuente `B`, pero los nombres seguían diciendo `D1`: `I(D1)` y la
  anotación del punto de operación salían vacías. Se actualizan los nombres y `Id(D1)` usa la
  corriente de la fuente.
- **Carga del motor:** `manifest.json`, `spinit` y los code models comprueban la respuesta; tras
  un deploy, un 404 dice qué archivo falta en vez de un error de JSON o de wasm.
- **Falsos «errores»:** un proyecto llamado «Error amp» hacía que toda corrida contara como con
  errores (se buscaba la palabra en cualquier línea del log, incluido el título).
- **Reintento por matriz singular** acotado al mensaje real de ngspice (antes, cualquier línea con
  la palabra «singular» duplicaba el tiempo de simulación).
- **Nombres de componente inválidos** («R 1», con paréntesis, `;`, `,` o `=`) bloquean la
  simulación con un mensaje claro, igual que los nombres repetidos, en vez de romper la netlist.
- **Fuente inexistente** en `.dc`, `.noise` o `.tf`: «La fuente V9 no existe en el circuito», en
  vez de «circuit not parsed».

### Visor de resultados

- **Etiquetas de ejes equivocadas** con paso 2,5: un eje 0–1 mostraba «0.3, 0.5, 0.8».
- **Estado por panel desfasado:** al quitar, insertar o intercambiar paneles, el zoom Y y los
  markers quedaban en el panel equivocado. Hay una sola función de remapeo
  (`src/waveform/paneIndex.ts`) para todo lo que se guarda por número de panel.
- **Trazas digitales** en las tablas de cursores y de Stats daban valores sin sentido.
- **Eje Y logarítmico:** la rueda y el paneo podían dejar el mínimo ≤ 0 y romper el eje.
- **`ln`, `log`, `sqrt` y `^`** sobre un valor real negativo devolvían un número falso; ahora
  es un hueco en el gráfico.
- **Barrido `.dc` descendente** (`.dc V1 5 0 -1`) salía vacío (N tramos de un punto).
- **`V(out)@2`** con `.step` y corridas de distinto largo: se remuestrea a la corrida actual.
- **La vista guardada perdía** paneles digitales, eje Y log, alto de paneles y la base numérica.
- **CSV desalineado** si el primer panel era de DFT.
- **Colores:** al cambiar claro/oscuro las curvas conservaban el color viejo y no coincidían con
  la leyenda.
- Con una sola corrida visible se dibujaba otra (la oculta); la columna −3 dB aparecía en
  paneles DFT e ignoraba el rango visible; el cursor interpolaba lineal en un eje log; el modo
  netlist pasaba `−∞` (dB de 0) al gráfico.

### Editor de esquemáticos

- **Atajos de letras con Bloq Mayús** no hacían nada (W, R, C…).
- **Tab en el bloque `.control`** partía la línea y mandaba el cursor al final.
- **Importar CSV de puntos PWL** con coma decimal leía mal los números, borraba los puntos si
  el archivo no servía y no ordenaba por tiempo.
- **Espacio «pegado»** tras Alt+Tab (cada click hacía pan).
- **Un gesto cancelado** (táctil, lápiz) confirmaba el movimiento y disparaba el click derecho.
- **Shift + recuadro** duplicaba la selección y el componente «viajaba» al rotar.
- **Rotar o espejar** dejaba la selección apuntando a otros cables: cuatro giros no volvían al
  origen. La selección se reubica como al mover (`transformSelection`).
- **Zoom con rueda en Firefox** con mouse físico era casi nulo.
- **Recargar la librería de LTspice** con un `.asy` modificado devolvía el viejo.
- **Cortar** podía borrar otros elementos si se editaba mientras se pedía el portapapeles.

### Proyecto e importación

- `.asc` en **UTF-8** (con o sin BOM): `10µ` se leía `10Âµ`. Los de LTspice en windows-1252 y
  UTF-16 siguen leyéndose igual.
- Los símbolos **`.asy`** nunca se importaban junto con los subcircuitos.
- Guardar en Drive sin versión conocida (ver arriba).
- **Ejemplos:** un 404 o la falta de red dan un mensaje, no un rechazo sin manejar.
- Un testbench llamado a mano **«Testbench 2»** perdía el nombre al guardar.
- **Subcircuitos en ciclo** (A→B→A, por un `.turbo` o un zip) desaparecían del árbol y no se
  podían abrir para arreglar el ciclo.
- Soltar un **`.turbo` dañado** sobre la ventana: ahora avisa.
- **`?example=` en el servidor de desarrollo** abría un proyecto vacío: StrictMode corría dos veces
  la restauración inicial y la segunda pisaba el ejemplo. En la versión compilada no pasaba.

### Interfaz y consistencia

- **Sin diálogos del navegador.** Los tres `confirm`/`prompt` nativos (descartar cambios,
  reiniciar la Academia, ir a una línea) se reemplazaron por interfaz propia, traducida y con el
  estilo de la app. «Cambios sin guardar» es un diálogo modal que se apila sobre el que lo pidió
  (por ejemplo «Mis proyectos») y Cancelar vuelve a él.
- **Ayuda de atajos al día:** faltaban Ctrl+P, E / Enter, Alt+↑, F / Shift+F y Ctrl+2, y la
  descripción de Ctrl+1 / Ctrl+0 no coincidía con lo que hacen.
- **El mapa de la Academia cierra con Escape**, como el resto de los diálogos.
- **Lienzo vacío con guía** de por dónde empezar (hallazgo C1 de la auditoría de UX).
- **Estado de la simulación** con ✓ o ✕ además del color (B1); **foco visible** en el gráfico
  (B2); **bordes de campos** y color de las notas con más contraste (B3, B4).
- **Título de la pestaña** con el nombre del proyecto y «•» si hay cambios sin guardar (C2);
  landmark `main` (C4); el tema y el idioma actuales en el nombre accesible de sus botones (C3).
- Un texto en castellano fijo en la interfaz en inglés (`Activar …` del panel de Estudio).

## 3. Segunda tanda (después de la revisión)

Arreglos de la lista de pendientes y pedidos nuevos, en commits aparte.

- **Correr no marca el proyecto como modificado.** El historial de corridas se guarda en el
  proyecto (y en el autoguardado) sin pedir «Cambios sin guardar» al abrir otro.
- **Verilog:** la pastilla de estado pasa a «Falló» si Yosys o Icarus no llegan a correr, y el
  aviso dice cuál motor falló (o que no está instalado en el servidor).
- **Escape con diálogos apilados** cierra sólo el de arriba.
- **Autoguardado:** si el almacenamiento está lleno o bloqueado, avisa una vez (y
  `data-autosave` queda en `failed`).
- **Motor:** manifest, `spinit`, codemodels y el wasm compilado se cargan una vez por Worker; una
  corrida tras otra ya no va a la red. Al desmontar la app el Worker se termina sin crear otro.
- **Visor:** el CSV de polos y ceros sigue el idioma; las tablas de cursores y estadísticas dicen
  cuántas trazas no muestran.
- **Eje logarítmico con zoom:** marcas propias (`logTicks`): décadas, 1-2-5, 1-2-3-5 o 1…9 según el
  lugar, y pasos lineales cuando lo visible es menos de una década. Antes, con mucho zoom el eje se
  quedaba sin números (uPlot arrancaba las marcas en el mínimo exacto, de a una década).
- **Menú del botón derecho de un panel:** exportar como PDF con estilo LaTeX (como pgfplots:
  Latin Modern, marcas hacia adentro, leyenda arriba, el eje derecho si lo hay), como `.tex` con
  pgfplots, los datos en CSV (todo o lo que se ve), PNG o al portapapeles; ajustar la vista o Y,
  eje Y log, grilla, agregar, mover o quitar el panel. En modo cursores el botón derecho sigue
  poniendo el cursor B.
- **«+ Testbench»** al final de cada workbench, como una rama más (igual que «+ Workbench» al final
  del proyecto).
- **Grosor de las líneas según el zoom:** antes era el mismo en pantalla con cualquier zoom (de
  cerca, finas al lado de los símbolos; de lejos, gruesas). Ahora crece con la raíz del zoom, en
  escalones: cambia cada vez que el zoom crece o baja √2 (de a 2^¼ ≈ 1,19), con el grosor de la
  Configuración en la relación de referencia (cuerpo de una R de ~84 px, grosor medio) y nunca
  menos de la mitad. Se eligió entre cuatro variantes probadas (fija, proporcional, escalones
  proporcionales y raíz).

## 4. Pendiente

Lo que se encontró y **no** se tocó, con el motivo. Ordenado por lo que más conviene encarar.

### Bugs

1. **Los archivos borrados de «Mis símbolos y modelos» reaparecen** si el borrado no llegó a
   Drive (`mergeUserFiles` une por nombre, sin registro de borrados). Necesita una decisión de
   formato (lista de borrados o lista completa con fecha).
2. **`1A` fuera de los valores de componentes:** `.param i=1A`, valores dentro de bibliotecas
   `.lib` y directivas de texto siguen llegando al motor tal cual (atto).
3. **El PNG del visor omite los paneles digitales** (se dibujan aparte de uPlot). El menú del
   panel tampoco exporta un panel digital como PDF o PNG; sí como CSV.

### Consistencia (lo que todavía se nota «a parches»)

4. **Validación despareja entre diálogos:** Simulación deshabilita Aceptar con errores;
   Propiedades y Fuente sólo avisan y aceptan `4,7k` o `abc`. Falta una política única, y que
   Propiedades rechace nombres con espacios o paréntesis al escribirlos (hoy lo frena la
   simulación).
5. **Enter para confirmar:** unos diálogos son `<form>`, otros no, otros piden Ctrl+Enter.
   Propuesta: resolverlo una vez en el `Modal` compartido.
6. **Escape o click afuera descartan sin preguntar** en los diálogos con mucho contenido
   (bloque `.control`, Fuente).
7. **Etiquetas distintas para lo mismo** (OK / Apply / Close / Add) y terminología en español
   (Borrar / Quitar; Traza / Señal / Curva). Es una decisión de redacción: no se tocó para no
   cambiar textos que el tutorial y los e2e citan.
8. **Estilos sin escala:** 40 `z-index`, 204 `font-size` y 159 colores hex sueltos en
   `styles.css`; cinco clases distintas para el botón de cerrar. Refactor grande y de riesgo
   visual: conviene hacerlo con capturas de comparación.
9. **Accesibilidad:** el árbol del proyecto sigue siendo decenas de paradas de Tab (A3) y el
   esquemático no se puede usar con teclado (A4); el buscador rápido no tiene etiqueta ni
   `listbox` (B6); controles de 16 px (B7); nombres recortados en el árbol (B5).

## 5. Verificación

- `npm run typecheck`, `npm run lint` (0 avisos), `npm run format:check`,
  `node scripts/i18n/check.mjs` y `npm test` (1755 tests): en verde.
- `npm run build`: compila.
- e2e (16 suites en verde, `verilog` incompleta por falta del motor Icarus local) y pruebas a mano:
  ver [`dev2-como-probar.md`](dev2-como-probar.md).
