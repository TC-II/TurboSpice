# Dev2: cómo probar los cambios

Guía para revisar a mano lo que cambió en la rama `dev2`. El detalle de cada hallazgo está en
[`auditoria-dev2.md`](auditoria-dev2.md).

## Arrancar

```bash
git checkout dev2
npm install
npm run dev
```

Abrir `http://localhost:5173/TurboSpice/?example=Sample%20Project.turbo` en una pestaña nueva (el
autoguardado es por pestaña: no pisa lo que tengas abierto en otra).

Chequeos automáticos:

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && node scripts/i18n/check.mjs
```

Los e2e, con la versión compilada (`npm run build && npm run preview`). En Windows hay que decirle
dónde está Chrome:

```bash
CHROMIUM="C:/Program Files/Google/Chrome/Application/chrome.exe" node tests/e2e/save.mjs
```

## Recorrido rápido (10 minutos)

| #   | Qué hacer                                                                                                  | Qué tiene que pasar                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Mirar la pestaña del navegador                                                                             | Dice «Sample Project — TurboSpice»                                                                          |
| 2   | Colocar una resistencia (R, click, Esc)                                                                    | El título pasa a «• Sample Project — TurboSpice»                                                            |
| 3   | Menú › Ejemplos › Transfer functions                                                                       | Diálogo propio «Cambios sin guardar» (no el del navegador), con el foco en «Seguir editando»                |
| 4   | Escape                                                                                                     | Se cierra y el proyecto sigue igual. Repetir y elegir «Descartar los cambios»: abre el ejemplo              |
| 5   | Run                                                                                                        | El anillo de estado muestra un ✓ (y ✕ si hay error), no sólo el color                                       |
| 6   | Activar Bloq Mayús y apretar W, R, C                                                                       | Los atajos andan igual                                                                                      |
| 7   | Seleccionar un componente con sus cables y apretar Ctrl+R cuatro veces                                     | Vuelve exactamente al origen y la selección sigue siendo la misma                                           |
| 8   | Mantener Espacio, Alt+Tab a otra ventana, soltar, volver y hacer click                                     | El click selecciona (antes quedaba haciendo pan)                                                            |
| 9   | Menú › Archivo › Nuevo proyecto                                                                            | El lienzo vacío muestra «Este esquemático está vacío» con los atajos para empezar                           |
| 10  | Menú › Tutorial interactivo, Escape                                                                        | El mapa de la Academia se cierra. «Reiniciar el progreso» pregunta en el mismo lugar                        |
| 11  | `?` (ayuda de atajos)                                                                                      | Aparecen Ctrl+P, E · Enter, Alt+↑, F · Shift+F y Ctrl+1 · Ctrl+2 · Ctrl+0                                   |
| 12  | Cambiar el tema (sol/luna) con un gráfico a la vista                                                       | Las curvas cambian de color junto con la leyenda                                                            |

## Por área

### Netlist y simulación

- **`1A`:** una fuente de corriente con valor `1A` sobre una resistencia de 1 kΩ da 1 kV en el
  `.op` (antes, 1e-15 V).
- **Directivas en un mismo texto:** un comentario-directiva con `.ic I(L1)=1`, salto de línea,
  `.tran 1m uic`. La simulación corre y el inductor arranca con 1 A.
- **`.meas` incompleta:** agregar `.meas tran t1 when` y simular. La corrida termina y la medida
  aparece con un error legible («la condición WHEN está incompleta»).
- **`.dc` con incremento 0:** en Comando de simulación › DC, poner incremento 0. La caja queda en
  rojo y no deja aceptar.
- **Fuente inexistente:** un `.dc V9 0 5 1` sin V9 en el circuito: «La fuente V9 no existe en el
  circuito».
- **Nombre inválido:** renombrar R1 a `R 1` y simular: mensaje claro, sin «Error on line».
- **Diodo ideal:** con un diodo ideal, `I(D1)` se grafica y el `.op` anota su corriente.
- **Proyecto llamado «Error amp»:** simular; abre el gráfico, no la lista de problemas.

### Visor

- **Ejes:** un transitorio de 0 a 1 V muestra 0.25, 0.5, 0.75 (no 0.3, 0.5, 0.8).
- **Paneles:** con dos paneles, hacer zoom Y en el segundo y quitar el primero. El zoom y los
  markers se quedan con su panel. Lo mismo al subir o bajar un panel (U / Shift+U).
- **Eje Y log:** con eje Y logarítmico, alejar con la rueda sobre el eje. No se rompe.
- **`.dc` descendente:** `.dc V1 5 0 -1` dibuja la curva completa.
- **`sqrt(V(x))`** con V(x) negativo deja un hueco, no una línea en cero.
- **Vista guardada:** un panel digital, o uno con eje Y log, lo sigue siendo tras cambiar de
  análisis y volver.

### Editor

- **Tab en el bloque `.control`** inserta dos espacios donde está el cursor.
- **PWL › importar CSV** con `0,001;0,5` (coma decimal, `;` de separador) lee 1 ms y 0,5. Un
  archivo sin números deja los puntos como estaban y avisa.
- **Shift + recuadro** sobre algo ya seleccionado no lo duplica (rotar no lo «desplaza»).
- **Firefox:** el zoom con rueda de un mouse físico responde.

### Proyecto

- **`.asc` en UTF-8** con `10µ` en un valor: se lee `10µ`.
- **Zip de subcircuitos con `.asy`:** los símbolos se importan.
- **Link de una versión más nueva** con trabajo sin guardar: avisa que no pudo abrir y deja el
  trabajo recuperado.
- **Testbench llamado «Testbench 2»** a mano: conserva el nombre al guardar y reabrir.
- **Soltar un `.turbo` dañado** sobre la ventana: mensaje de error, el proyecto abierto no cambia.

### Seguridad

- Un comentario con `$\href{javascript:alert(1)}{ver}$` se ve como texto crudo, sin enlace.

## Estado de los e2e

Corridos en Chrome contra la versión compilada: `examples`, `editor`, `simulation`, `saves`,
`features`, `templates`, `wires`, `shortcuts`, `rotate`, `shapes`, `placing`, `dialogs`, `save`,
`hierarchy`, `deviceparams` y `panes` pasan. Tres tests se adaptaron al diálogo propio de
«Cambios sin guardar» y a la caja de «Ir a la línea» (`lib.mjs`, `save.mjs`, `shortcuts.mjs`).

- **`verilog` no termina en esta máquina:** el paso que compila con Icarus se queda esperando
  porque falta `public/engine/icarus/` (no se bajó ese motor acá); hasta ahí pasa 28 chequeos.
  La rama no toca `src/hdl`. Queda anotado que, sin esos archivos, la app debería decir «Falló»
  en vez de quedarse esperando.
- `performance` no se corrió.

## Lo que no se probó a mano

- Google Drive (hace falta iniciar sesión): el conflicto sin versión conocida sólo tiene tests
  unitarios.
- Firefox y pantallas táctiles (gestos cancelados, zoom con rueda): verificado por lectura y
  tests, no en el dispositivo.
- La carga del motor con un 404 tras un deploy.
