# Compatibilidad con LTspice

TurboSpice abre y guarda `.asc` de LTspice como formato nativo. Este documento reúne las reglas que
se verificaron contra LTspice 24.1.10 (`LTspice.exe -netlist` y `-b` bajo Wine) y contra un corpus de
4712 `.asc` reales. La especificación de base es la de
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
- Verificado: parse → serialize reproduce **4712/4712** archivos del corpus línea por línea.

## Guardado "todo explícito"

LTspice omite en las instancias lo que hereda del `.asy`. TurboSpice escribe siempre:

- `WINDOW` de todos los rótulos que define el símbolo, con su posición efectiva.
- `SYMATTR` de los atributos que afectan la netlist: `InstName`, `Value`, `Value2`, `SpiceModel`,
  `SpiceLine`, `SpiceLine2`, `Prefix`, `ModelFile`, `Def_Sub` (no `Description`).

**Posición de rótulos al rotar**: en R0/M0 LTspice usa los `WINDOW` del `.asy` y no escribe nada; en
cualquier otra orientación escribe posiciones propias por símbolo (p.ej. `res` en R90:
`WINDOW 0 0 56 VBottom 2` / `WINDOW 3 32 56 VTop 2`). La tabla está en `library/window-defaults.json`,
derivada del corpus (Mxx usa la misma que Rxx; para R180 sin dato se intercambian las ventanas 0 y 3).

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
| Integración por defecto `modified trap` | ngspice usa `trap` (diferencia conocida) |

Con varios `.step`, el primero es el que varía más rápido (bucle interno). **Pendiente de verificar
con el oráculo** (#10): LTspice no está disponible bajo `xvfb-run` en la máquina de desarrollo.
Un `.op` (o `.tf`) con un único `.step` genera además un gráfico de cada resultado en función del
valor barrido, como lo muestra LTspice.

Corpus de la materia simulado en ngspice: 35/80 sin errores; de los restantes, 32 usan modelos de la
librería estándar de LTspice (`BC547C`, `1N4148`, …) que no se pueden redistribuir.

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
