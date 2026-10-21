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
  9 no llegaron a esa etapa). Las 18 diferencias no son pérdidas: 9 no son esquemáticos (metadatos
  `__MACOSX/._*`, documentación de TeX Live con extensión `.asc`, una página de error de GitHub
  guardada como `.asc`) y 9 son archivos que no guardó LTspice (generados por Schematic-Redraw,
  editados a mano, `text` en minúscula, espacios al final): TurboSpice escribe los mismos elementos
  en el orden y formato en que los guarda LTspice (WIRE, FLAG, SYMBOL, TEXT), igual que haría
  LTspice al volver a guardarlos.

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
- `Misc\jumper` une las redes de sus dos pines y no genera línea en la netlist (aunque su `.asy`
  tiene `Prefix J`). Verificado con la netlist de LTspice de `examples/Educational/160.asc`.
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

**Librería de LTspice del usuario** (**Archivo › Importar librería de LTspice**, #126): se elige la
carpeta `lib` de la instalación de LTspice y `sym/`, `sub/` y `cmp/` quedan en el IndexedDB del
navegador (no se publican: son de Analog Devices). Cada esquemático trae de ahí sólo lo que le
falta, después de la librería propia y de los archivos del usuario: sus símbolos, el archivo de
modelos de cada uno (`ModelFile`, o `SpiceModel` cuando es un archivo, como `LTC.lib` en los
símbolos de ADI: el subcircuito es `Value`), los `.lib`/`.include` de sus directivas y, como
LTspice, el archivo que define cada modelo o subcircuito usado que nadie más define.
Medido con los 4.152 ejemplos de LTspice: con la librería se dibujan completos 4.098 (sin ella,
67) y la netlist es idéntica a la de LTspice en 3.973 (57). La simulación coincide sólo en 134 de
3.957: muchos modelos de ADI están cifrados o usan dispositivos propios de LTspice que ngspice
no tiene.

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
| `.tran … startup` (medido con `LTspice -b`): el `.op` se hace con las fuentes V e I de valor **DC puro** del nivel superior en 0 y se llevan a su valor con una **rampa lineal de 20 µs** (fija, aunque el `.tran` sea más corto). SINE, PULSE, PWL… y las fuentes de adentro de subcircuitos (p.ej. `supply.lib`) no cambian; no es `uic` (el `.op` sí se hace). En 321 casos del corpus con `startup`: igual/parecido pasa de 8 a 31 (1 oscilador Colpitts empeora por el arranque); #100 | `V1 a 0 5` → `V1 a 0 DC 5 PWL(0 0 20u 5)` |
| `IC=` de capacitores e inductores (y `.ic I(L)`) con `.tran` sin `uic` (medido con `LTspice -b`): restricción del punto de operación, también con IC=0. El capacitor hace de fuente de tensión (también flotante: V(a,b)=IC) y el inductor de fuente de corriente sobre L sola (la `Rpar` conduce aparte: flujo = L·IC); después el transitorio sigue libre. Los inductores acoplados con `K` no se emulan (LTspice no fuerza su corriente de una forma simple). En 113 casos del corpus: igual/parecido pasa de 19 a 44 y distinto de 52 a 28; #103 | Capacitor a tierra: `.ic V(n)=IC`. Flotante: `B a b I=(time > 0) ? 0 : 1e6*(V(a,b)-(IC))`. Inductor: `B` en serie con L, `V=(time > 0) ? 0 : 1e6*((IC)-I(L))`. `IC=param` sin llaves → `{param}` |
| `.step param/fuente/temp/modelo` (lin, dec, oct, list; anidados) | Bucles `foreach` en un `.control` generado: `alterparam` + `reset`, `alter fuente dc=`, `altermod`, `option temp=`; una corrida (`tran1`, `tran2`…) por paso, etiquetada `R=2k` |
| `.step` con un `.control` propio en el esquemático | Se simula el primer valor (el bloque decide qué correr) y se avisa |
| `.param x 20` en una directiva | `.param x=20` |
| `.model X ako:BASE [tipo] (params)` (a-kind-of, también encadenados) | `.model X tipo(params de BASE + los nuevos)`; si BASE no está, se comenta y se avisa |
| Capacitor de la base de datos: `electrolytic` suelto (a veces con comilla), `MTBF=`, `ppPkg=` (66 casos del corpus fallaban; #111) | Se quitan (informativos) |
| Fuente B con `tripdv=`/`tripdt=` (35 casos con `Rpar`/`Cpar`; #112) | Se quitan; `Rpar`/`Cpar` como R/C en paralelo |
| `table(x, x1,y1, …)` en fuentes B (16 casos; #113) | `pwl(x, x1,y1, …)` de la fuente B |
| `table(x, x1,y1, …)` y `tbl(…)` (alias) fuera de las fuentes B (`.func`, `.param`, llaves: `.FUNC RT(x) table(x, 1,1, 2,1.2, …)`, `R1 a b {TBL(TEMP, 0,34k, 25,10k, …)}`), y en fuentes B con puntos que son parámetros o expresiones (`pwl` de la fuente B sólo admite literales: `tbl(V(s),-vc,-Fc,0,0,vc,Fc)`). Interpola lineal y mantiene el extremo fuera del rango | Cadena de ternarios con interpolación lineal; en B con puntos literales sigue siendo `pwl(x, …)` |
| Fuentes B escritas como línea de netlist (directiva del esquemático `Bvco a 0 V=1/64*TABLE(…)`, o dentro de un `.sub`/`.lib`, también partidas con `+`): llevan las mismas funciones que las B del esquemático (`table`, `round`, `u`, `if`, `log`, `sqrt`, `idt`, `delay`, `rand`…) | Misma traducción que a las B del esquemático; las líneas `+` de una B se unen |
| `I1 a b TBL(v1 i1 v2 i2 …)` (medido con `LTspice -b` con `.dc`: la corriente es la tabla de la **tensión de la propia fuente**, I = f(V(a,b)); con `G`/`E` no es válido) | `B_I1 a b I=<tabla>(V(a,b), …)` (el nombre pasa a `B_I1`) |
| Resultado en el corpus de los 144 archivos que mencionan `table(`, `tbl(` o `round(`: 8 pasan de error a *igual* (`1.5SMC75AT3_test`, `friction_models_*`, `PWMntest`…), 1 de *distinto* a *igual*, 4 a *incompleto* (ahora simulan, pero les faltan símbolos), 3 a *sólo TurboSpice* o *distinto*; ninguno empeora; #130 | |
| `idt(x[,ic[,reset]])`, `sdt` e `idtmod(x[,ic[,m[,o]]])` en fuentes B (medido con `LTspice -b`: la salida arranca en ic, con reset > 0,5 se queda en ic; idtmod = o + mod(ic+∫x, m), en [o, o+m)). También en fuentes B de archivos de modelos. En el corpus, de 25 casos con LTspice OK (todos fallaban): 10 igual/parecido, 4 distinto, 6 incompleto, 5 por otras causas (`.step dec`, inductor `Hc=`, MODULATE). De los distintos, `if(x,y,z)` y `u(0)` (0,5 en ngspice, 0 en LTspice) de la fuente B se apartan aparte; #123 | C de 1 F cargado por una fuente B de corriente: `B 0 n I=(time > 0) ? (x) : 1e6*((ic)-V(n))` (con reset: `((time > 0) && !((reset) > 0.5))`); la llamada pasa a `V(n)`, idtmod a `o+V(n)-m*floor(V(n)/m)` |
| `delay(x, t[, tmax])` en fuentes B. En el corpus, de 9 casos con LTspice OK: 4 igual/parecido, 2 distinto, 3 por otras causas (modelo faltante, dispositivo digital); #124 | t constante: línea de transmisión ideal adaptada (`T … Z0=1 TD={t}` + R de 1 Ω), exacta. t variable (con `V(`, `I(` o `time`): code model XSPICE `delay` con `has_delay_cnt` y `delmax=min(tmax, tstop)` (ngspice recorta `delmax` al final de la simulación, y con el 1 s anterior el retardo salía `t/1 s · tstop`: casi nulo; medido con `LTspice -b`, ahora los flancos coinciden salvo la cuantización al TSTEP; #131); muestrea al paso del `.tran` (TSTEP), así que con pulsos rápidos se aparta (2k.asc); se avisa |
| `rand(x)`, `random(x)`, `white(x)` en fuentes B (medido: rand escalonada en [0,1) que cambia en cada entero de x; random pasa por los mismos valores e interpola suave; white ≈ random − 0,5). ngspice no tiene equivalente: los valores no son los de LTspice (otra semilla), sí el rango y la forma. En el corpus, de 16 casos con LTspice OK: 3 parecido, 8 distinto (lo esperable con otra secuencia), 2 incompleto, 3 por otras causas; #125 | Hash pseudoaleatorio de floor(x): `h(n)=frac(sin(12.9898·n+78.233)·43758.5453)`; rand = h(floor(x)), random = interpolación smoothstep entre h(n) y h(n+1), white = random − 0,5 |
| `u(x)` en fuentes B (medido con `LTspice -b`): vale **0 en x = 0** (el escalón de la fuente B de ngspice da 0,5, y un detector de flancos `u(ddt(u(V(a))))` quedaba siempre activo). 56 casos del corpus lo usan: 2 pasan de *parecido* a *igual*, 1 de *distinto* a *parecido-forma*, el resto no cambia; #128 | `((x) > 0 ? 1 : 0)` (`uramp(0)` ya da 0 en ambos) |
| `if(x,y,z)` en fuentes B, `.param` y `.func` (medido con `LTspice -b`): y si **x ≥ 0,5**, si no z (0,5 da y, 0,4999 da z). La fuente B de ngspice no la evalúa así (daba siempre el mismo valor: `rampgen2`, una triangular con `idt(if(…))`, salía una rampa recta). 181 casos del corpus mencionan `if(`: ninguno cambia de categoría (casi todos fallan por otras causas o son comentarios); #129 | `((x) >= 0.5 ? (y) : (z))` |
| `Laplace=H(s)` en E, G y B (`E1 o 0 i 0 Laplace=1/(1+s/w0)`, `B1 o 0 V=V(a)-V(b) Laplace=…`, `Laplace(…)`, `Laplace {V(in)} = {H}`, también en archivos de modelos como `TCLib/fdnr.lib`). H se lleva a cociente de polinomios en s con los parámetros como expresiones de numparam (andan `.step` y parámetros de subcircuito); `mtol`, `window`, `nfft`, `cache` se ignoran. Lo no racional (`exp(-s*T)`, `sqrt(s)`, `abs(s)`, `s**alpha`) se avisa. En el corpus, de 47 casos con Laplace y LTspice OK (todos fallaban): 8 igual/parecido, 10 distinto, 3 incompleto, 17 no racionales (avisados), 9 por otras causas (`rand`, subcircuito, símbolos). En `.ac` la salida coincide exacta; en `.tran` LTspice calcula la Laplace por respuesta impulsiva y se aparta de la solución exacta (p.ej. segundo orden con ζ=0,5: LTspice sin sobrepico, ngspice 16 % como da la teoría); #110 | Parte propia → code model XSPICE `s_xfer` (con `denormalized_freq` si los coeficientes son de órdenes muy distintos); numerador de mayor grado → cadena de derivadores (C de 1 F + V de 0 V + H); la salida es el elemento original controlado por esa tensión |
| Nodos flotantes, sin camino de continua a tierra (entrada de E abierta, capacitores en serie, nodos internos de subcircuitos, también de librería). LTspice avisa (`WARNING: Node b is floating`) y les pone ~1e-12 S a tierra, pero a **un solo nodo por grupo flotante: el último creado** (el que nombra el aviso); con una fuente adentro del grupo eso fija el nivel (`C1 1 a`, `V3 a b 5`, `C2 b 0` → b ≈ 0, a ≈ 5). ngspice fallaba con matriz singular o daba otro punto de operación. Conducen en continua R, L, V, D, H, B con `V=`, la salida de E y de S/W, y Q/J/M entre sus terminales (no la compuerta); no conducen C, I, F, G, B con `I=` ni las entradas de E/G/S. Un elemento que no se reconoce (code models `A`, subcircuito que no está) no deja flotantes a sus nodos. En el corpus, de 61 casos con matriz singular y LTspice OK: 33 pasan a simular (2 igual, 17 distinto, 12 incompleto) y los 28 que siguen fallando casi siempre no tienen nodos flotantes ni para LTspice (les faltan elementos o fallan por otra causa); en una muestra de 300 igual/parecido no cambia ninguno por esto (7 eran *igual* falsos: a la netlist le faltaban las instancias de bloques jerárquicos y sólo se comparaban las fuentes). `TC045 - Girator Extras Parcial` sigue distinto: el nivel del grupo flotante es ruido numérico (LTspice deja en 0,16 V el nodo con gmin mientras circulan 4 A); #102 | `R__floatN <nodo> 0 1e12` al final de la netlist, uno por grupo; un nodo interno se nombra como lo aplana ngspice (`x_u2.i1out`, `x1.x2.m`). Ver `src/netlist/floating.ts` |
| `OpAmps\opamp` + `.lib opamp.sub` (Aol, GBW); `OpAmps\UniversalOpAmp` (`level1`) y `OpAmps\UniversalOpamp2` (`level2`: slew, `Rail`, `Ilimit`) — modelos de ADI, no redistribuibles | Modelos propios equivalentes en `library/sub` (#107, #116). En el corpus, 44 de los 92 casos con LTspice OK pasan a coincidir; `level2` difiere todavía cerca de la resonancia en filtros de Q muy alto (#117) |
| Integración por defecto `modified trap` | ngspice usa `trap` (diferencia conocida) |

Con varios `.step`, el primero es el que varía más rápido (bucle interno). **Pendiente de verificar
con el oráculo** (#10): LTspice no está disponible bajo `xvfb-run` en la máquina de desarrollo.
Un `.op` (o `.tf`) con un único `.step` genera además un gráfico de cada resultado en función del
valor barrido, como lo muestra LTspice.

## Resultados contra LTspice (corpus completo)

Corrida del 21/10/2026 (main en `f366c5d`): 5.572 casos (5.378 `.asc` únicos + 194 variantes de
simulación), cada uno con TurboSpice y con `LTspice -b`. Harness y clasificador en `tests/corpus/`
(`run.mjs`, `worker.mjs`, `analyze.mjs`; `rebuild-mirror.mjs` rearma el espejo del corpus);
hallazgos en [hallazgos-corpus.md](hallazgos-corpus.md). Entre paréntesis, la corrida del 20/10.

| Medición | Resultado |
|---|---|
| Representación (parse + render) | 4.095 ok (73 %; antes 3.633) · 1.471 con símbolos faltantes (1.929) · 6 timeout |
| Símbolos faltantes | 724 símbolos distintos (767) |
| Netlist vs `LTspice -netlist` | 3.018 idéntica (54 %; 2.659) · 378 equivalente (279) · 1.880 distinta (2.334) · 291 sin netlist de LTspice |
| Con directiva de simulación | 4.410 (LTspice simula 2.893 · falla 1.517) |
| Igual o parecido a LTspice | **1.019** (890): 922 igual · 76 parecido · 21 parecido-forma |
| Distinto (simula, no coincide) | 499 (445) |
| Incompleto (simula con símbolos faltantes; avisa desde #108) | 890 (1.113); 645 con LTspice OK (751) |
| Error en TurboSpice | 1.497: 867 fallan también en LTspice, **630 con LTspice OK** (700) |
| Sólo TurboSpice simula | 382 (307) |

| Grupo | casos | representación ok | netlist idéntica | igual + parecido |
|---|---|---|---|---|
| E3-Circuitos-Esquematicos | 254 | 254 | 234 | 36 de 58 |
| TC2-Circuitos-Esquematicos | 213 | 209 | 180 | 31 de 72 |
| TC2-Sim | 182 | 167 | 162 | 69 de 167 |
| sueltos | 724 | 694 | 601 | 204 de 542 |
| sueltos-librerias | 368 | 133 | 236 | 36 de 327 |
| sueltos-LargeCollection | 3.831 | 2.638 | 1.605 | 643 de 3.244 |

El `.tran … startup` (#100) está resuelto en una rama aparte, sin mezclar: no entra en esta corrida.

Los 700 errores con LTspice OK de la corrida del 20/10, por causa (primera pasada por mensaje de error):

| Causa | casos | issue |
|---|---|---|
| Símbolos faltantes | 269 | #106, #107, #108 |
| Modelo no encontrado | ~97 | #6 |
| Parámetros/funciones de LTspice (`electrolytic`, `tripdv`, `Rpar` en B, `table()`) — **arreglado** | 74 | #111, #112, #113 |
| Matriz singular / nodos flotantes — **arreglado** lo flotante (33 de 61 pasan a simular) | ~62 | #102 |
| Subcircuito no encontrado | 43 | — |
| Laplace en E/G/B — **arreglado** lo racional (quedan 17 no racionales, avisados) | 42 | #110 |
| Funciones de fuente B sin equivalente (`idt`, `sdt`, `idtmod`, `white`, `rand`, `random`, `delay`) — **arreglado** (de 50 casos en la corrida del 21/10: 0 quedan con *no such function*; 17 igual/parecido, 14 distinto, 8 incompleto, 11 fallan por otras causas) | ~35 | #123, #124, #125 |
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
