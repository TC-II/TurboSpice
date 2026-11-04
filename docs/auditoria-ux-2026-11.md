# Auditoría de UI/UX y accesibilidad (noviembre de 2026)

Evaluación heurística (las 10 heurísticas de Nielsen) y revisión de accesibilidad (WCAG 2.2, nivel AA)
de la interfaz de TurboSpice. Se hizo con los skills `nielsen-heuristics-audit` y
`wcag-accessibility-audit` (`.claude/skills/`), sobre el dev server en el navegador integrado
(Chromium, 1440×900), con el ejemplo **Transfer functions**, en tema oscuro y claro, más una lectura
del código de la UI. Complementa la QA funcional de [`qa-2026-11.md`](qa-2026-11.md): acá no se
buscan bugs de simulación sino problemas de uso y de acceso.

**Límites:** no se probó con lector de pantalla real (NVDA/VoiceOver) ni con usuarios; los
contrastes se midieron con un script sobre los colores calculados (sin axe ni Lighthouse). Las
severidades son una estimación del evaluador.

## Resumen

| Severidad (Nielsen)  | Cantidad |
| -------------------- | -------- |
| 3 — Mayor            | 4        |
| 2 — Menor            | 7        |
| 1 — Cosmético        | 4        |

La base es buena: los botones de la barra tienen nombre accesible, los menús se manejan con flechas
y Escape devuelve el foco al botón, los errores de simulación dicen qué falló y cómo arreglarlo, los
campos inválidos tienen `aria-invalid`, el estado de la simulación es un `role="status"`, el idioma
actualiza `<html lang>` y a 720 px de ancho (equivale a zoom 200 %) la barra se pliega en un menú "…"
sin scroll horizontal.

**Los tres arreglos de mayor impacto:**

1. Hacer que el `Modal` compartido (26 diálogos) retenga y devuelva el foco y sea `aria-modal`.
2. Subir el contraste del texto blanco sobre el acento en tema oscuro (botón Run, pestañas activas).
3. Que el árbol del proyecto sea una sola parada de Tab (foco itinerante con flechas).

## Hallazgos

### Severidad 3 — Mayor

**A1. Los diálogos no retienen ni devuelven el foco.** WCAG 2.4.3 (A), 2.1.2; Nielsen H3.
El `Modal` de [`src/schematic/dialogs.tsx:52`](../src/schematic/dialogs.tsx) tiene `role="dialog"`
pero no `aria-modal`, no encierra el foco y no lo devuelve al cerrar. Probado en Propiedades de R1:
Tab pasa de OK a la barra de herramientas de atrás (Schematic, Results…), con el diálogo todavía
abierto. Al cerrar el buscador de componentes con Escape el foco queda en `<body>`, no en el botón
Component. Se usa en 26 lugares, así que un solo arreglo cubre todo: `aria-modal="true"`, ciclo de
Tab dentro de la caja (o `inert` en el resto de la app) y guardar `document.activeElement` al abrir
para devolverlo al cerrar. Lo mismo para los otros `role="dialog"` sueltos (`Hierarchy.tsx`,
`Tutorial.tsx`, `ExportView.tsx`).
**Arreglado:** `useDialogFocus` (`src/ui/useDialogFocus.ts`) en `Modal`, Ctrl+P (`QuickOpen`) y el
mapa de la Academy; `aria-modal="true"` en los tres. La tarjeta de una misión y la vista de exportar
quedan sin modal a propósito (se trabaja con la app mientras están abiertas). Probado en
`tests/e2e/dialogs.mjs`.

**A2. Texto blanco sobre el acento en tema oscuro: 3,2:1.** WCAG 1.4.3 (AA).
`--accent: #5b8def` con texto `#fff` en el botón Run / Re-Run, las pestañas activas Schematic y
Results y el botón Results del panel. Para texto de 14 px hace falta 4,5:1. En tema claro
(`#2f6fdb`) da 4,75:1 y pasa. Opciones: un acento más oscuro sólo para fondos de botón en tema oscuro
(p. ej. `#3f6fd6`, 4,7:1) o texto oscuro sobre el acento actual.
**Arreglado:** nueva variable `--accent-fill` (`#3f6fd6` en oscuro, igual a `--accent` en claro)
para todos los fondos con texto blanco; `--accent` sigue igual para texto y bordes.

**A3. El árbol del proyecto ocupa decenas de paradas de Tab.** WCAG 2.4.1 (A); Nielsen H7.
Cada testbench son 2–3 paradas (expandir, nombre, historial) y cada workbench otras 3 (plegar,
nombre, + Testbench). Con **Transfer functions** hacen falta unas 80 pulsaciones de Tab para pasar
del árbol al panel de resultados. El nombre ya dice "↑ ↓ to go through the testbenches": falta que
el árbol sea una sola parada (`tabIndex` itinerante, `role="tree"`/`treeitem` con
`aria-expanded`), con → / ← para expandir y plegar y los botones de fila accesibles desde el ítem
enfocado (o con atajos). Alternativa más barata: un enlace "Ir al esquemático / a resultados" al
principio y regiones con `aria-label` para saltar.

**A4. El esquemático no se puede usar con teclado.** WCAG 2.1.1 (A); Nielsen H7.
El `<svg class="editor">` no tiene `tabIndex`, rol ni nombre, y no hay forma de enfocar o elegir un
componente ni de moverlo con flechas: abrir Propiedades exige doble click. Los atajos globales (P,
R, Ctrl+R…) sí andan. Es habitual en editores de esquemáticos (LTspice tampoco), pero para cumplir
2.1.1 alcanzaría con: que el lienzo sea enfocable con nombre ("Esquemático"), Tab / Shift+Tab para
recorrer componentes, Enter para abrir sus propiedades y flechas para mover lo seleccionado una
celda de la grilla.

### Severidad 2 — Menor

**B1. El estado de la simulación se distingue sólo por color.** WCAG 1.4.1 (A).
El anillo arriba a la derecha es verde (terminó) o rojo (error), indistinguibles para daltónicos
rojo-verde. El lector de pantalla sí lo lee (`aria-label`), y el error aparece además como texto en
la barra de mensajes, así que el impacto es bajo. Agregar una forma: ✓ dentro del anillo y ✕ o "!"
en error (`.sim-state.ok/.err`, `styles.css:779`).

**B2. Gráfico sin indicador de foco ni nombre.** WCAG 2.4.7 (AA), 4.1.2.
En modo cursores `.pane-chart` toma foco (`tabIndex=0`) y mueve el cursor con flechas
([`PaneView.tsx:918`](../src/waveform/PaneView.tsx)), pero `styles.css:520` le quita el `outline` y
no tiene `aria-label`. Darle un borde en `:focus-visible` y un nombre ("Gráfico: V(in), V(out) —
flechas mueven el cursor").

**B3. Bordes de campos casi invisibles en tema oscuro.** WCAG 1.4.11 (AA).
`--border: #2e3239` sobre `--bg: #16181c` es ≈1,4:1; los límites de un control deberían tener 3:1.
Afecta las cajas de la barra de simulación (Stop time, Save from…) y del diálogo de propiedades.

**B4. Texto de dibujo en tema claro: 2,75:1.** WCAG 1.4.3 (AA).
`--sch-drawing: #1fa8d6` sobre blanco: es el color de las notas explicativas de los ejemplos
("First-order low-pass (RC)…"). Oscurecer a algo como `#0b7fa8` (≈4,5:1). Relacionado: los nombres
de workbench en el árbol (`--accent` sobre `--bg-alt`) dan 4,36:1, apenas por debajo.

**B5. Nombres de workbench recortados.** Nielsen H6, H8.
"1st order lo…", "2nd order l…": el botón "+ Testbench" de cada fila se come el ancho y el nombre
no se lee entero. Mostrar "+ Testbench" sólo al pasar el mouse o con el foco en la fila (o como
ícono "+"), y dejar el nombre completo en `title`.

**B6. Buscador de componentes: sin "sin resultados" ni botón de cerrar.** Nielsen H1, H3.
Ya anotado en la QA y sigue igual: buscar `zzqx` deja la lista vacía sin mensaje, y sólo se cierra
con Escape o click afuera. Además el campo no tiene etiqueta (sólo `placeholder`) y la lista no
expone la opción activa (`role="listbox"`/`option`, `aria-activedescendant`).

**B7. Controles chicos.** WCAG 2.5.8 (AA).
116 controles miden menos de 24×24 px: flechas de expandir del árbol (16×15), historial de corridas
(17×17), casillas UIC / .startup (13×13), "+ Testbench" (80×19). Varios cumplen por la excepción
de espaciado, pero las flechas del árbol están pegadas al nombre. Agrandar el área de click con
`padding` sin cambiar el dibujo.

### Severidad 1 — Cosmético

**C1. Lienzo vacío sin guía.** Nielsen H10. Un proyecto nuevo muestra un lienzo vacío. Una línea
tenue en el centro ("Agregá un componente con P, o abrí un ejemplo / el tutorial") ayuda al primer
uso; el tutorial existe pero está dentro del menú.

**C2. Título de la pestaña fijo.** WCAG 2.4.2; Nielsen H1. `document.title` es siempre
"TurboSpice". Con varias pestañas (el autoguardado es por pestaña) conviene "• Transfer functions —
TurboSpice", con el punto si hay cambios sin guardar.

**C3. Botones de tema e idioma sin estado en el nombre.** WCAG 4.1.2. El `aria-label` es "Change
theme" / "Change language"; el estado actual sólo está en `title`. Usar "Tema: automático" o
`aria-pressed`/`aria-describedby`.

**C4. Sin `<main>`.** WCAG 1.3.1. Hay `banner`, `navigation`, `toolbar` y `complementary` pero no un
`main`; envolver la zona de esquemático y resultados en `<main>` facilita saltar con lector de
pantalla.

## Lo que está bien

- Barra de herramientas con `role="toolbar"`, grupos con nombre y todos los íconos con `aria-label`
  y `title`.
- Menús: `role="menuitem"`, `aria-haspopup`, `aria-expanded`, `aria-keyshortcuts`; flechas
  entran a submenús y Escape devuelve el foco al botón.
- Errores claros y con solución ("the stop time must be greater than 0. Complete the boxes marked
  in red"), campo con `aria-invalid` y pestaña Errors.
- Diálogo de propiedades con etiquetas asociadas en todos los campos y casillas.
- Indicador de foco visible del navegador en casi todos los controles.
- Respeta `prefers-reduced-motion` en las animaciones principales.
- Ayuda contextual por análisis (ícono "i") y tutorial interactivo.

## Orden sugerido

1. A1 (un solo componente) y A2 + B3 + B4 (variables de color en `styles.css`): rápidos y de alto
   impacto.
2. B1, B2, B5, B6, C2–C4: arreglos chicos y localizados.
3. A3 (árbol con foco itinerante) y B7.
4. A4 (teclado en el esquemático): el más grande; conviene diseñarlo aparte.

Después de los arreglos: repetir con axe (`@axe-core/playwright` en los e2e existentes daría un
chequeo automático en CI) y una pasada con NVDA u Orca.
