# Editor de modelos

Un módulo «Modelo» es un netlist (`NOMBRE.lib`, con un `.subckt` o un `.model`) y el símbolo que lo
usa (`NOMBRE.asy`); el formato está en `docs/turbo-formato.md`. El editor está pensado como el flujo
de **crear un componente**, de arriba abajo y de izquierda a derecha:

1. **Netlist** (arriba a la izquierda). Un modelo nuevo abre vacío, con cómo empezar: pegarlo o
   escribirlo, abrir un archivo de modelos (`.lib`, `.sub`, `.mod`…), copiar el de un componente o
   una plantilla (subcircuito, amplificador, amp. op., diodo, BJT, MOSFET, JFET). El texto se resalta
   y cada problema se marca en su línea, con su arreglo (p. ej. «Agregar .ends»). Si el archivo
   define varios componentes, «El símbolo usa» elige cuál.
2. **Pines**: a qué nodo va cada pin (un desplegable; elegir el de otro pin los intercambia), el
   nombre que muestra y de qué lado. Los nodos sin pin se agregan con un clic.
3. **Símbolo** (a la derecha): el mismo editor de dibujo que el de los subcircuitos. Se genera
   mientras nadie lo toque; «Usar un símbolo existente…» trae otro `.asy` (sus pines van a los nodos
   por SpiceOrder y se reacomodan en la tabla); «Regenerar» vuelve al generado.
4. **Parámetros** (lo que pasa cada instancia, con su valor por defecto) y **Rótulos** (qué se ve
   junto a cada instancia). **Detalles**: nombre del componente («Llamarlo X» lo renombra como su
   `.subckt`), descripción del selector y todos los `SYMATTR`.
5. **Usarlo**: la barra muestra el estado de cada paso (Netlist, Pines, Parámetros), el pie la
   línea que escribe cada instancia (la misma que el netlister) y «Colocar en el esquemático»
   cierra el editor con el componente en el cursor.

## Código

- `src/project/modelEdit.ts`: la lógica, sin React y con tests (`tests/unit/modelEdit.test.ts`).
  `parseModel` (definiciones y problemas del texto), `analyzeModel` (pines con su nodo, nodos sin
  pin, parámetros, problemas con su arreglo, línea de la instancia), las operaciones de cada paso
  y `normalizeModel`.
- `src/project/ModelEditor.tsx`: estado, deshacer y diseño; `ModelPanels.tsx`: las pestañas;
  `NetlistEditor.tsx`: el editor de texto resaltado.
- `tests/e2e/models.mjs`: el flujo entero en el navegador.

## Invariantes

- **Cada cambio pasa por `normalizeModel(next, nombre, prev)`**, que no toca el netlist:
  SpiceModel sigue a su definición (si se la renombró, la del mismo lugar), Prefix sale de lo que
  define, ModelFile es el archivo del módulo; un símbolo que nadie tocó (su dibujo y sus pines son
  los generados para el netlist anterior) se genera de nuevo; uno tocado no se redibuja, pero sus
  **pines siguen a sus nodos** (`mapNodes`: insertar, sacar, mover o renombrar un nodo no deja un pin
  en otro nodo sin aviso).
- Sacar un pin no corre los SpiceOrder de los otros (`removePinKeepOrder`).
- El netlister escribe un nodo por SpiceOrder **hasta el del último pin**: un hueco queda flotando
  (aviso), un nodo sin pin después del último falta en la línea y ngspice la rechaza (error).
- Netlist y símbolo cambian juntos (`onChange({ text, sym })`) y comparten un deshacer; lo escrito se
  guarda a los 400 ms y, al cerrar o cambiar de modelo, lo que quedó pendiente.
- Con el foco en el editor, las teclas no llegan al esquemático de abajo (salvo Ctrl+S, Ctrl+O y
  Ctrl+P); Ctrl+Z fuera de los campos de texto es el deshacer del modelo.
