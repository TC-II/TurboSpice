# Formato `.turbo`: proyectos, testbenches, subcircuitos e historial

> **Versión 2 (#180, 22/10/2026).** Un proyecto tiene **testbenches** (cada uno con su propio
> esquemático y su configuración de simulación) y **archivos comunes** (subcircuitos, símbolos y
> modelos). Reemplaza a las variantes con varias simulaciones de la versión 1: al abrir un `.turbo`
> de la versión 1, cada simulación de cada variante pasa a ser un testbench («Variante · Simulación»
> si había varias variantes; el nombre de la variante si tenía una sola), y una variante sin
> simulaciones, un testbench con su circuito base.
>
> ```
> Proyecto.turbo
> ├─ files/          subcircuitos (.asc + su .asy BLOCK), símbolos (.asy) y modelos (.lib/.sub)
> └─ Testbench       «Bode», «Respuesta al escalón»: su esquemático + su simulación (análisis,
>    │               estudio, vista del visor) — puede usar los subcircuitos del proyecto
>    └─ Corridas     historial: el circuito exacto de cada vez que se simuló
> ```
>
> JSON de la versión 2: `"version": 2`, `"activeTestbench": "s1"` y `"testbenches": [{ "id",
> "name", "current", "view", "runs" }]` (cada uno como una simulación de abajo, con `"group"` opcional).
> `"name"` es opcional y hace de marca: **sin** él, el testbench lleva el nombre automático de su
> análisis (`Tran 0 - 100m`, `AC 100Hz - 100KHz`, `.OP`, `DC Sweep`, `Noise 1Hz - 1MHz`,
> `Poles and Zeros`…), que se recalcula cada vez que cambian el análisis o sus límites; **con** él
> (el usuario lo renombró) el nombre queda fijo. Al abrir, un `"Testbench N"` (el nombre que se
> ponía antes por defecto) se toma como automático. `"groups": [{ "id", "name" }]` agrupa testbenches (en el panel
> del proyecto, colapsables; al abrir un `.turbo` de la versión 1, una variante con varias
> simulaciones pasa a ser un grupo). `files[].kind` puede ser `"symbol"`, `"model"` o `"schematic"`
> (subcircuito). No hay `variants` ni circuito base. Un proyecto siempre tiene al menos un testbench.
>
> El resto de este documento describe la versión 1 (variantes), que se sigue pudiendo abrir.

> Especificación acordada el 22/10/2026. Reemplaza al `.asc` suelto como archivo de trabajo de
> TurboSpice; el `.asc` sigue siendo el formato de intercambio con LTspice (importar / exportar).

## 1. Vocabulario

```
Filtro RC.turbo          Proyecto   — el archivo: se abre, se guarda en Drive, se comparte
├─ files/                           — .asy / .lib / .sub del proyecto (comunes a todas las variantes)
└─ Variante              «Pasabajos 1er orden», «Con buffer»
   └─ Simulación         «Transitorio 0-20ms»: su propio esquemático, análisis, estudio y vista
      ├─ Actual          el circuito que se está editando (todavía sin simular)
      └─ Corridas        historial: fecha y hora + el circuito exacto de cada vez que se simuló
```

- **Proyecto**: el `.turbo`. Su nombre es el nombre del archivo; renombrarlo desde la cápsula
  renombra también el archivo (local y en Drive).
- **Variante**: una alternativa de diseño dentro del proyecto. Es lo que antes era "el `.asc`".
- **Simulación**: un perfil con nombre propio. Guarda **el esquemático completo** además del análisis,
  el estudio (`.step`, `.meas`, tolerancias, bloques) y la vista del visor. Editar el circuito dentro de
  una simulación cambia sólo esa simulación.
- **Corrida**: una entrada del historial de una simulación (inmutable).

## 2. Estructura del JSON

```jsonc
{
  "format": "turbospice",
  "version": 1,
  "name": "Filtro RC",                 // = nombre del archivo, sin extensión
  "created": "2026-10-22T14:03:00Z",
  "modified": "2026-10-22T15:40:12Z",
  "files": [                           // comunes a todo el proyecto
    { "name": "OPAMP_TC2.sub", "kind": "model",  "text": "…" },
    { "name": "OPAMP_TC2.asy", "kind": "symbol", "text": "…" }
  ],
  "activeVariant": "v1",
  "variants": [
    {
      "id": "v1",
      "name": "Pasabajos 1er orden",
      "base": "sha256:…",              // circuito base de la variante (fuera de toda simulación)
      "activeSim": "s1",               // "" = se está editando la base
      "sims": [
        {
          "id": "s1",
          "name": "Transitorio 0-20ms",
          "current": "sha256:…",       // el circuito actual (puede tener cambios sin simular)
          "runs": [                    // la más nueva al final
            { "id": "r1", "time": "2026-10-22T15:01:44Z", "asc": "sha256:…",
              "summary": "+C3, −R2, R1 1k→2k2, cambió OPAMP_TC2",
              // opcional (#199): archivos del proyecto que usó (subcircuitos y modelos)
              "files": { "OPAMP_TC2.asc": "sha256:…", "OPAMP_TC2.asy": "sha256:…" } }
          ]
        }
      ]
    }
  ],
  "blobs": {                           // contenido direccionado por hash: cada .asc una sola vez
    "sha256:…": "Version 4\nSHEET 1 880 680\n…"
  }
}
```

**Qué es cada `.asc` del JSON.** Es el texto completo del `.asc`, como lo escribe hoy
`serializeAsc`: componentes, cables, la directiva de análisis de **esa** simulación, el estudio y la
vista (`;.plot`, `;.sims`, bloques, como hoy). Eso hace que cada simulación sea exportable tal cual a
LTspice. Dentro del `.turbo` cada simulación tiene un solo análisis, así que el `;.sims` actual
(una lista de varios análisis en un `.asc`) se reemplaza por la lista de simulaciones del JSON.
El orden de `sims` es el orden de los testbenches en el panel del proyecto (se cambia arrastrándolos, #218).

**Historial deduplicado (`blobs`).** `current`, `base` y cada corrida guardan sólo el hash; el texto
está una sola vez en `blobs`. Si muchas corridas tienen el mismo circuito, no se repite. Es robusto
porque no hay diferencias que reconstruir: cada hash apunta a un `.asc` completo y válido por sí solo.
- Al guardar se eliminan los blobs que ya no referencia nadie.
- Al abrir se verifica cada hash. Un blob corrupto invalida sólo las corridas que lo usan (se
  marcan como dañadas), nunca el resto del proyecto.
- Sin límite de corridas por ahora.
- Cada corrida puede guardar en `files` la versión de los subcircuitos (`.asc` + `.asy`) y modelos
  del proyecto que usó (también como hashes en `blobs`, así que una versión que no cambió no se
  repite). Sirve para mostrar «cambió OPAMP_TC2» entre corridas. Si uno de esos blobs no verifica,
  sólo se pierde ese dato; la corrida sigue sana. Es opcional: los `.turbo` sin `files` se abren igual.

**Qué no va en el `.turbo`.** Las curvas y los resultados (pueden pesar MB). Los de la última corrida
de cada simulación van a un cache en IndexedDB, con la corrida como clave. Si no están (otra máquina,
cache borrado), la simulación se ve sin curvas hasta que se vuelve a correr. Tampoco van las pilas de
deshacer (§5).

## 3. Reglas de comportamiento

### Variantes (cápsula superior)
- La cápsula muestra `Proyecto · Variante` y tiene una flecha, igual que Simular.
- Al desplegarla, la primera línea es un botón partido **Clone Current | Blank**:
  - *Clone Current* copia la variante actual completa (base, simulaciones e historial) con otro nombre.
  - *Blank* crea una variante vacía: sin circuito y sin simulaciones.
- Debajo, la lista de variantes. A la derecha de cada una, *duplicar* y *borrar*.
- **Renombrar**: doble clic sobre la palabra (en la cápsula, cada parte por separado, o en la lista).
  El texto pasa a ser un campo editable con todo seleccionado. Enter o clic afuera guardan; Esc cancela.
  Si el nombre ya existe en el proyecto, el borde se pone rojo y no deja guardar.
- **Borrar** (variante o simulación): un popup en el que hay que arrastrar un slider de punta a punta
  para confirmar.

### Simulaciones
- Una simulación nueva copia el esquemático que está en pantalla en ese momento.
- Desde la lista se renombra con doble clic y se duplica o borra con los botones a la derecha (igual
  que las variantes).
- **Aviso de valores**: si cambiás el **valor** de un componente que existe con el mismo `InstName` y
  el mismo valor viejo en otras simulaciones de la variante, aparece el aviso
  *"R1 = 1k también en 3 simulaciones · Aplicar"*. Ignorarlo no hace nada. Agregar o quitar
  componentes o cables no ofrece nada.

### Al simular
1. Si el circuito o los parámetros cambiaron desde la última corrida, se agrega una corrida nueva con (#149)
   su resumen de cambios. Si no cambió nada, sólo se actualiza la fecha de la última.
2. Autoguardado local (IndexedDB) del proyecto entero. (#150)
3. Autoguardado en Drive (ver §6). (#151)

### Historial
- El reloj aparece alineado a la derecha del nombre de la simulación, **sólo si tiene corridas**.
- Al hacer clic, se agrega una columna a la derecha del esquemático. Arriba de todo está
  *Actual (sin simular)* y debajo las corridas (fecha, hora y resumen de cambios).
- Con ↑/↓ o con clic, el esquemático muestra al instante el circuito de esa corrida, en modo **sólo
  lectura**.
- **Cambios contra la corrida anterior**: lo agregado en verde, lo quitado como fantasma rojo y lo
  modificado en ámbar. Los componentes se identifican por `InstName` (si renombrás R1 a R5, se ve
  como que se quitó R1 y se agregó R5). Los cables se comparan por segmento.
- Acciones sobre una corrida:
  - **Restore**: la trae al presente, pasa a ser *Actual* y se puede simular normalmente. Queda como
    un paso en el Ctrl+Z.
  - **Clonar como simulación nueva**.

## 4. Archivos del proyecto (`files`)
- Los `.asy`, `.lib` y `.sub` del proyecto son comunes a todas sus variantes.
- Al resolver un símbolo o modelo, el orden es: archivos del proyecto → archivos propios del usuario
  (`UserFile`, IndexedDB) → librería de TurboSpice.
- Si al importar llega un archivo con el mismo nombre y **otro contenido**, se pregunta qué hacer:
  reemplazar, mantener el existente o renombrar el nuevo.
- En el `.asy` BLOCK de un subcircuito, los parámetros van en `SYMATTR SpiceLine` y su rótulo en
  `WINDOW 39 x y Top 2` (formato estándar de LTspice, sin campos nuevos). El Editor de subcircuitos
  lo dibuja como en la instancia y permite moverlo; las instancias nuevas usan esa posición.
- **Módulos «Modelo»** (editor de módulos, panel del proyecto → Módulos → «+ Modelo»): un archivo
  `"kind": "model"` con `"module": "model"` (`NOMBRE.lib`, la netlist con un `.subckt` o un `.model`)
  más su símbolo `NOMBRE.asy` (`"kind": "symbol"`), que lo usa con `SYMATTR ModelFile NOMBRE.lib` y
  lleva `Prefix`, `Value`, `SpiceModel`, `SpiceLine`… y los pines con `PinName`/`SpiceOrder`, como
  un par `.sub` + `.asy` de TCLib. Sin `"module"` es un archivo de modelos común. Ejemplo:

  ```json
  { "name": "MYAMP.lib", "kind": "model", "module": "model", "text": ".subckt MYAMP in out\n…\n.ends MYAMP\n" },
  { "name": "MYAMP.asy", "kind": "symbol", "text": "Version 4\nSymbolType CELL\n…\nSYMATTR ModelFile MYAMP.lib\n…" }
  ```

## 5. Deshacer
- Una pila de deshacer **por simulación** (y otra para la base de la variante). Al cambiar de
  simulación, se cambia de pila. El tope sigue siendo de 200 pasos.
- *Aplicar a N simulaciones* agrega un paso en la pila de cada una.
- Crear, borrar o renombrar variantes y simulaciones queda fuera del Ctrl+Z.
- Las pilas no se guardan en el `.turbo`: al recargar empiezan vacías (para volver atrás está el
  historial).

## 6. Guardado y Google Drive
- **Local**: al editar, con un *debounce* de unos segundos; al simular, inmediato.
- **Drive**: al simular y al guardar a mano. Las subidas se encolan y se manda sólo la última (nunca
  dos en paralelo).
- **Conflictos**: al abrir se guarda el `version` del archivo en Drive. Antes de cada subida se compara
  con el de Drive; si cambió (otra pestaña u otra máquina), **no se sobrescribe** y se avisa, con las
  opciones de recargar la de Drive, guardar la mía como copia o sobrescribir.
- El archivo se sube como `application/json`, marcado con `appProperties` (`turbospice=1`).
  `list()` muestra los `.turbo`.
- Se usa la subida *resumable* si el JSON supera los 5 MB.
- Se mantiene el scope `drive.file` y la carpeta `TurboSpice`.

## 7. Importar y exportar
- **Abrir un `.asc`**: crea en memoria un proyecto con una variante y una simulación por cada
  análisis del `;.sims` (o una sola, si no hay). Al guardar se escribe un `.turbo`; el `.asc` no se toca.
- **Importar a un proyecto**: un `.zip` o varios archivos arrastrados. Cada `.asc` se agrega como
  variante y los `.asy`/`.lib`/`.sub` van a `files` (con la regla de conflictos de §4).
- **Exportar una variante**: un `.zip` con un `.asc` por simulación (el *Actual*, sin historial),
  llamados `<Simulación>.asc`, más los archivos del proyecto que usan esos `.asc`.
- **Exportar todo**: un solo `.zip` con una carpeta por variante, cada una con el mismo contenido que
  la exportación de esa variante.

## 8. Sin migración
No se convierten los autoguardados locales ni los `.asc` que ya están en Drive (no hay usuarios
todavía). Para probar, se arma `examples/prueba.turbo` con varias variantes, un par de simulaciones
por variante, corridas con cambios entre ellas y un `.asy`/`.sub` tomados de `TC2Lib--LTSPICE` y
modificados.

## 9. Partes (un issue cada una)
1. Formato `.turbo`: tipos, lectura y escritura, blobs y verificación de hashes. (#149)
2. Cápsula y lista de variantes: Clone Current/Blank, renombrar, duplicar, borrar con slider. (#150)
3. Simulaciones con esquemático propio y aviso *Aplicar a N simulaciones*. (#151)
4. Historial de corridas: columna, ↑/↓, Restore y clonar. (#152)
5. Cambios entre corridas: resaltado en el esquemático y resumen. (#153)
6. Ctrl+Z por simulación. (#154)
7. Archivos del proyecto: resolución de símbolos y modelos, y conflictos al importar. (#155)
8. Drive: `.turbo`, cola de guardado, detección de conflictos y subida resumable. (#156)
9. Importar y exportar: `.asc`, `.zip` por variante y Exportar todo. (#157)
10. `examples/prueba.turbo` de prueba. (#158)

## 10. Implementación (22/10/2026)

Las diez partes están hechas (#149–#158). Detalles que se decidieron al implementar:

- **Un `.asc` abierto** queda como «Variante 1» del proyecto (no con el nombre del archivo, que ya es
  el del proyecto).
- **Importar un `.zip`**: cada carpeta es una variante y los `.asc` de la raíz forman una sola variante
  con el nombre del zip, con una simulación por `.asc`. Así un zip exportado vuelve igual. Los `.asc`
  sueltos (sin zip) son una variante cada uno.
- **Soltar archivos**: un `.turbo` o un `.asc` solo se abre; varios archivos, un `.zip`, o símbolos y
  modelos se importan al proyecto.
- **Base de la variante**: se elige en Simular › «Circuito base (sin simulación)». Al borrar la última
  simulación, su circuito (sin el comando de análisis) pasa a ser la base.
- **Renombrar el proyecto** con un archivo del equipo: el navegador no puede renombrarlo; el próximo
  Ctrl+S pide dónde guardarlo con el nombre nuevo. En Drive se renombra en el momento.
- **Exportar a LTspice**: verificado con `LTspice -netlist` sobre los ejemplos exportados.
- **Drive**: la cola, la versión y la subida por partes están probadas con un `fetch` falso
  (`tests/unit/drive.test.ts`); falta probarlas con una cuenta real.
- **Proyectos de ejemplo** (`npx vite-node scripts/make-examples.ts`, desde los `.asc` de `examples/`):
  - `public/examples/Sample Project.turbo` (antes `prueba.turbo`): es lo que ve un usuario nuevo la
    primera vez. Tres variantes con corridas y un opamp como archivo del proyecto (`OA_Sample`); el
    inversor lleva `AC 1` en la fuente para que la simulación «Bandwidth» tenga excitación.
  - `public/examples/Examples.turbo`: los ejemplos sueltos, una variante cada uno. Archivo › Examples
    abre el proyecto en la variante elegida.
  - `public/examples/ADC.turbo` (`npx vite-node scripts/make-adc.ts`, desde `examples/adc/`: los
    esquemáticos de los testbenches son `.asc` ahí, editados en TurboSpice; el script arma el
    proyecto y sintetiza el Verilog): simulación mixta, un workbench por convertidor. **Flash 3-bit**: escalera de 8 resistencias y 7
    comparadores dibujados uno por uno, y el codificador en Verilog con su símbolo dibujado a mano.
    **SAR 8-bit**: redistribución de carga (arreglo binario de capacitores y 25 llaves, en arreglos), el
    comparador CMOS como subcircuito (`COMP`), la llave `ASW` como módulo «Modelo» (el `aswitch` de
    XSPICE) y la lógica en Verilog. **Sigma-delta**: integrador RC y dos bloques Verilog, el modulador
    (`MODULATOR`, cuantizador de 1 bit) y el downsampler (`DOWNSAMPLER`, cuenta los unos cada 64
    ciclos). En el menú de ejemplos es una sola entrada, «ADCs».
- **Exportar**: queda sólo «Export project» (una carpeta por variante); exportar una sola variante se
  sacó del menú.
- **My symbols and models**: es uno solo para todos los proyectos. Con sesión de Google se guarda en
  `TurboSpice/My symbols and models.json` de Drive (`src/cloud/userLibrary.ts`); el navegador guarda
  una copia y al iniciar sesión se unen (por nombre, gana el más nuevo).
