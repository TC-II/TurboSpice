# Compatibilidad con LTspice

TurboSpice abre y guarda `.asc` de LTspice como formato nativo. Este documento reúne las reglas que
se verificaron contra LTspice 24.1.10 (`LTspice.exe -netlist` y `-b` bajo Wine, y en Windows) y contra
un corpus de 5.378 `.asc` reales (5.572 casos contando las variantes de simulación; ver
[Resultados contra LTspice](#resultados-contra-ltspice-corpus-completo)). La especificación de base es la de
[ASC-Parser](https://github.com/javierpetrucci/ASC-Parser/blob/main/LTSpice_ASC_ASY_Format_Specification.md);
acá van los agregados y las reglas de la netlist.

## Archivo `.asc`

- **Codificación**: windows-1252 o UTF-16LE, **con o sin BOM** (LTspice escribe UTF-16LE sin BOM cuando
  hay caracteres fuera de cp1252). Se guarda en la codificación original si alcanza.
- **Orden de líneas**: `Version`, `SHEET`, `WIRE`, `FLAG` (+ `IOPIN` justo después de su `FLAG`),
  `DATAFLAG`, `SYMBOL` (+ `WINDOW` y `SYMATTR`), `TEXT`, `LINE`, `RECTANGLE`, `CIRCLE`, `ARC`.
- **Tipos de símbolo**: las rutas usan `\\` y los espacios se escapan como `\ `
  (`TCLib\\Special\\74HCU04\ Not`).
- **`TEXT`**: `!` = directiva SPICE, `;` = comentario; los saltos de línea se guardan como `\n` literal.
- **`SYMATTR X ""`**: vacío explícito, gana al valor del `.asy`.
- **Figuras** (`LINE`, `RECTANGLE`, `CIRCLE`, `ARC` `Normal … [estilo]`): estilo 1 guiones, 2 puntos,
  3 raya y punto, 4 raya y dos puntos; sin estilo = sólida. `CIRCLE` y `ARC` llevan la caja de la
  elipse; en `ARC` siguen el punto **final** y después el de **inicio**, en sentido antihorario.
  Se eligen, mueven, copian, rotan y espejan como el resto (al espejar un arco se intercambian
  inicio y fin para que siga antihorario).
- Verificado: parse → serialize reproduce **4712/4712** archivos del corpus anterior línea por línea.
  Sobre el corpus completo (corrida del 20/10/2026) reproduce **5.351 de 5.369** (18 difieren,
  pendiente de revisar; 9 no llegaron a esa etapa).

## Guardado "todo explícito"

LTspice omite en las instancias lo que hereda del `.asy`. TurboSpice escribe siempre:

- `WINDOW` de todos los rótulos que define el símbolo, con su posición efectiva.
- `SYMATTR` de los atributos que afectan la netlist: `InstName`, `Value`, `Value2`, `SpiceModel`,
  `SpiceLine`, `SpiceLine2`, `Prefix`, `ModelFile`, `Def_Sub` (no `Description`).

**Posición de rótulos al rotar**: en R0/M0 LTspice usa los `WINDOW` del `.asy` y no escribe nada; en
cualquier otra orientación escribe posiciones propias por símbolo (p.ej. `res` en R90:
`WINDOW 0 0 56 VBottom 2` / `WINDOW 3 32 56 VTop 2`). La tabla está en `library/window-defaults.json`,
derivada del corpus (Mxx usa la misma que Rxx; para R180 sin dato se intercambian las ventanas 0 y 3).

**Posiciones óptimas** (#74): las de LTspice tienen problemas (el valor del inductor queda centrado
sobre la bobina), así que TurboSpice usa por defecto las de ASC-Parser (`library/window-positions.json`,
importadas de su `engine/component_defaults.js` con `npm run windows:import`), en las cuatro rotaciones
de los 58 símbolos que tiene; el resto sigue con las de LTspice. Valen al colocar, al rotar/espejar y al
volver un rótulo a su lugar. En un `.asc` de LTspice, un `WINDOW` igual al que LTspice pone solo cuenta
como «no movido» y se muestra en la posición óptima; uno distinto (movido a mano) se respeta. Al guardar
se escriben las posiciones óptimas, así que LTspice abre el archivo igual a como se ve en TurboSpice.
Arrastrar un rótulo lo mueve de a 8 desde donde estaba (las posiciones óptimas no caen en la grilla de 8).

**Rótulos movidos a mano** (#28): se guardan como `WINDOW` explícito (posición local del símbolo,
alineación y tamaño); ocultar un rótulo es `WINDOW n x y Invisible size`. Al rotar o espejar,
los rótulos que estaban en la posición por defecto pasan a la de la nueva orientación; los movidos
conservan su `WINDOW` (acompañan al cuerpo del símbolo) y los ocultos siguen ocultos.

Verificado: la netlist que genera LTspice del archivo guardado por TurboSpice es idéntica a la del
original en 29/30 casos de muestra (el restante LTspice no lo procesa ni siquiera en el original).

## Conectividad y netlist (como `LTspice -netlist`)

- Un punto de interés (pin, etiqueta, extremo de cable) sobre el **interior** de un cable se conecta.
  Dos cables que se cruzan por el medio **no**.
- Etiquetas con el mismo nombre son la misma red, **distinguiendo mayúsculas** (`-v` y `-V` quedan como
  redes distintas en la netlist; SPICE las une después).
- Nombre de red: tierra (`0`) > etiqueta (la primera en orden alfabético) > `N001`, `N002`…
  Las redes sin nombre se numeran según **el primer cable de cada red en el orden del archivo**
  (el `WIRE` de menor índice), no por posición: con esa regla las netlists de los 23 fixtures son
  idénticas a las de LTspice incluidos los nombres (antes, con "de arriba hacia abajo", 130/130
  equivalentes y 84 idénticas). Las redes sin cables (pines que se tocan) van al final.
- Pines sueltos: `NC_xx`; `SpiceOrder` faltantes en subcircuitos: `MP_xx` (mismo contador, en orden de
  elementos).
- Nombre del elemento: si `InstName` no empieza con la letra del prefijo → `P§InstName` (`R§5`, `X§U1`).
- BJT de 3 pines: 4º nodo `0` (sustrato). MOSFET de 3 pines: bulk = fuente (si la fuente está suelta,
  otro `NC_xx`).
- Valor: `SpiceModel Value Value2 SpiceLine SpiceLine2` (los no vacíos). `µ` → `u`.
- Subcircuitos (`X`): comentario `;§pnba` con los nombres de pin; `ModelFile` → `.lib` al final, en orden
  alfabético.
- Modelos implícitos por familia: `.model D D` + `.lib standard.dio`; `NPN`/`PNP` + `standard.bjt`;
  `NMOS`/`PMOS` + `standard.mos`; `NJF`/`PJF` + `standard.jft`.
- Comentarios `;x` → `* x`; directivas multilínea se separan; al final `.backanno` y `.end`.

## Símbolos, modelos y jerarquía del usuario

En LTspice los `.asy` y `.lib` propios suelen estar junto al `.asc`. En TurboSpice se agregan en
**Archivo › Mis símbolos y modelos** (o arrastrándolos) y quedan guardados en el navegador:

- un símbolo se busca por nombre (como los que están junto al `.asc`) y gana a los de la librería;
- un archivo de modelos se resuelve antes que los de la librería en `.lib`/`.include`/`ModelFile`;
- **jerarquía**: un símbolo `SymbolType BLOCK` cuyo nombre coincide con un `.asc` del usuario se
  convierte en `.subckt NOMBRE puertos…` (puertos en el orden de `SpiceOrder` de los pines del
  símbolo, conectados a las etiquetas del `.asc` con el mismo nombre). Los `.model`/`.param` del
  bloque quedan locales al subcircuito; los análisis del bloque se ignoran. En la netlist estilo
  LTspice va en una sección `* block symbol definitions` al final (formato pendiente de verificar
  con el oráculo, #10).
- Se pueden generar símbolos: uno rectangular para un `.subckt` (con `ModelFile`) o uno de bloque
  para un `.asc` (puertos = etiquetas con `IOPIN`, o todas si no hay).

## Estudio (barridos, tolerancias, mediciones)

El panel **Estudio** genera directivas que LTspice entiende, así que un estudio va y viene:

| Tarjeta | En el `.asc` |
|---|---|
| Barrer un componente | Valor `{R1}` + `.param R1=<original>` + `.step param R1 …` |
| Barrer un parámetro, fuente, temperatura o modelo | `.step param X …`, `.step V1 …`, `.step temp …`, `.step NPN 2N2222(BF) …` |
| Tolerancias Monte Carlo | `{mc(1k,0.05)}` (uniforme) o `{1k*(1+gauss(0.05/3))}` (normal, tol = 3σ) + `.step param run 1 N 1` |
| Tolerancias, caso peor | `{1k*(1+0.05*(2*binary(run,i)-1))}` + `.func binary(run,index) …` + `.step param run 0 2^n−1 1` |
| Mediciones | `.meas` (tiempo de subida, f a −3 dB, margen de fase… con plantillas reconocibles) |
| Tarjeta desactivada | La misma directiva en un comentario (`;.step …`), como se apaga a mano en LTspice |
| Paso personalizado | Bloque `;.control` (sólo TurboSpice); con las marcas `* antes de cada corrida`, `* después de cada corrida` y `* al final`, sus comandos se ubican dentro de los bucles del `.step` |

En ngspice: `mc()`, `gauss(x)` y `flat(x)` se traducen a `unif()`, `agauss()` y `aunif()` (se sortean de
nuevo en cada corrida); los `.meas` **no** se pasan a ngspice: TurboSpice los evalúa sobre los resultados
de cada corrida con la semántica de LTspice (`INTEG` de una densidad de ruido es √∫v²df).

## Directivas que sólo tiene ngspice

El bloque `.control … .endc` y los análisis `.pz`, `.sens`, `.disto`, `.sp` y `.pss` no existen en
LTspice. Se guardan como **comentario** (`TEXT … ;.control\n…`): LTspice los muestra como comentario y
los ignora, así que el `.asc` sigue simulando igual en LTspice; TurboSpice reconoce los comentarios que
empiezan con esas palabras y los ejecuta (en el esquemático se ven en violeta). Un comentario común como
`;.step …` sigue siendo un comentario.

## Traducción a ngspice (lo implícito de LTspice, explícito)

| LTspice | ngspice |
|---|---|
| Inductor sin `Rser` → **1 mΩ** en serie (medido: 1 V sobre 1 H da 1000 A) | `Rser=1m` explícito |
| `Rser`, `Lser`, `Rpar`, `Cpar` en L, C, V | Elementos reales agregados |
| Diodo ideal `D(Ron=… Vfwd=… Roff=… Vrev=… Rrev=… Ilimit=…)` — ngspice lo acepta pero lo trata como una resistencia (resultado erróneo sin aviso) | Fuente `B` lineal por tramos con la misma definición |
| `.lib archivo` (sin sección) | `.include` |
| Parámetros de instancia no declarados en el `.subckt` | Se agregan al encabezado con `params:` |
| `.end nombre` cerrando un subcircuito, `.param x 20` | `.ends`, `.param x=20` |
| `pi` predefinido en `.param` | `.param pi=…` |
| `.tran tstop` / `.tran 0 tstop` | `.tran tstop/1000 tstop` |
| `.step param/fuente/temp/modelo` (lin, dec, oct, list; anidados) | Bucles `foreach` en un `.control` generado: `alterparam` + `reset`, `alter fuente dc=`, `altermod`, `option temp=`; una corrida (`tran1`, `tran2`…) por paso, etiquetada `R=2k` |
| `.step` con un `.control` propio en el esquemático | Se simula el primer valor (el bloque decide qué correr) y se avisa |
| `.param x 20` en una directiva | `.param x=20` |
| `.model X ako:BASE [tipo] (params)` (a-kind-of, también encadenados) | `.model X tipo(params de BASE + los nuevos)`; si BASE no está, se comenta y se avisa |
| Capacitor de la base de datos: `electrolytic` suelto (a veces con comilla), `MTBF=`, `ppPkg=` (66 casos del corpus fallaban; #111) | Se quitan (informativos) |
| Fuente B con `tripdv=`/`tripdt=` (35 casos con `Rpar`/`Cpar`; #112) | Se quitan; `Rpar`/`Cpar` como R/C en paralelo |
| `table(x, x1,y1, …)` en fuentes B (16 casos; #113) | `pwl(x, x1,y1, …)` de la fuente B |
| Integración por defecto `modified trap` | ngspice usa `trap` (diferencia conocida) |

Con varios `.step`, el primero es el que varía más rápido (bucle interno). **Pendiente de verificar
con el oráculo** (#10): LTspice no está disponible bajo `xvfb-run` en la máquina de desarrollo.
Un `.op` (o `.tf`) con un único `.step` genera además un gráfico de cada resultado en función del
valor barrido, como lo muestra LTspice.

## Resultados contra LTspice (corpus completo)

Corrida del 20/10/2026: 5.572 casos (5.378 `.asc` únicos + 194 variantes de simulación), cada uno
con TurboSpice y con `LTspice -b`. Harness y clasificador en `tests/corpus/` (`run.mjs`,
`worker.mjs`, `analyze.mjs`); hallazgos en [hallazgos-corpus.md](hallazgos-corpus.md).

| Medición | Resultado |
|---|---|
| Representación (parse + render) | 3.633 ok (65 %) · 1.929 con símbolos faltantes · 10 timeout |
| Símbolos faltantes | 831 símbolos distintos |
| Netlist vs `LTspice -netlist` | 2.659 idéntica (48 %) · 279 equivalente · 2.334 distinta · 291 sin netlist de LTspice |
| Con directiva de simulación | 4.406 (LTspice simula 2.894 · falla 1.512) |
| Igual o parecido a LTspice | **890** (811 igual · 61 parecido · 18 parecido-forma) |
| Distinto (simula, no coincide) | 445 |
| Incompleto (simula con símbolos faltantes; no es "ok") | 1.113 (751 con LTspice OK; #108) |
| Error en TurboSpice | 1.507: 807 fallan también en LTspice, **700 con LTspice OK** |
| Sólo TurboSpice simula | 307 |

| Grupo | casos | representación ok | netlist idéntica | igual + parecido |
|---|---|---|---|---|
| E3-Circuitos-Esquematicos | 254 | 253 | 235 | 36 de 57 |
| TC2-Circuitos-Esquematicos | 213 | 209 | 180 | 32 de 72 |
| TC2-Sim | 182 | 165 | 162 | 69 de 168 |
| sueltos | 724 | 565 | 518 | 162 de 542 |
| sueltos-librerias | 368 | 131 | 225 | 36 de 327 |
| sueltos-LargeCollection | 3.831 | 2.310 | 1.339 | 555 de 3.240 |

Los 700 errores con LTspice OK, por causa (primera pasada por mensaje de error):

| Causa | casos | issue |
|---|---|---|
| Símbolos faltantes | 269 | #106, #107, #108 |
| Modelo no encontrado | ~97 | #6 |
| Parámetros/funciones de LTspice (`electrolytic`, `tripdv`, `Rpar` en B, `table()`) — **arreglado** | 74 | #111, #112, #113 |
| Matriz singular / nodos flotantes | ~62 | #102 |
| Subcircuito no encontrado | 43 | — |
| Laplace en E/G/B | 42 | #110 |
| Funciones de fuente B sin equivalente (`idt`, `sdt`, `white`, `rand`, `delay`) | ~35 | — |
| Inductor no lineal (`Hc=`, `Br=`, `Bs=`) | 14 | — |
| `.dc` sin paso, `.dc dec`/`list`, `.TEMP=`, `.noise … list` | ~20 | — |

Modelos faltantes: de los que no encuentra TurboSpice, 68 (en 137 archivos) están en casos donde
LTspice simula; otros 184 (en 307 archivos, BC548C, 2N5551C…) faltan también en LTspice. Detalle en #6.

Ya medido, no repetir: `.options rshunt=1e12` global baja los equivalentes de 350 a 337, y `tmax=1`
global los sube apenas a 359 pero pasa casos de *igual* a *distinto* (corrida de 1.165 casos).

## Herramientas

```sh
node tests/corpus/roundtrip.mjs <dirs>          # parse → serialize idéntico
node tests/corpus/explicit.mjs [--ltspice N] <dirs>   # guardado explícito (+ oráculo LTspice)
node tests/corpus/netlist.mjs <dirs>            # netlist vs LTspice -netlist (cacheada)
node tests/corpus/simulate.mjs <dirs>           # simulación en ngspice WASM
node scripts/derive-window-defaults.mjs <dirs>  # regenerar library/window-defaults.json
```

LTspice se ejecuta **sólo** bajo `xvfb-run` (muestra diálogos de error); sin `xvfb-run` las herramientas
usan únicamente netlists ya cacheadas.
