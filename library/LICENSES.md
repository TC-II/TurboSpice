# Origen y licencias de la librería

| Ruta | Origen | Condiciones |
|---|---|---|
| `sym/TCLib/`, `sub/TCLib/` | **TCLib**, librería de Teoría de Circuitos (ITBA) — Javier Petrucci y Agustín Gullino | Incluida con permiso de los autores. Algunos modelos dentro de TCLib (p.ej. LM741, TL082, LF398) pueden provenir de fabricantes. |
| `sym/res.asy` | Resistor "properly shaped" — Javier Petrucci y Agustín Gullino (ITBA) | Con permiso de los autores. |
| `sym/nm_nobulk.asy`, `sym/pm_nobulk.asy`, `sym/voltage2.asy` | De la raíz de `sym/` del repo [TC2Lib--LTSPICE](https://github.com/TC-II/TC2Lib--LTSPICE) (TCLib) | Con permiso de los autores. |
| `sym/*.asy` (resto: cap, ind, voltage, diode, npn, nmos, signal, cell, xtal, …) | Propios de TurboSpice, generados por `scripts/gen-base-symbols.mjs` | Gráficos y descripciones propios. Pines, `SpiceOrder`, `Prefix`, `Value` y `WINDOW` replican los de LTspice como datos de interoperabilidad, para que un `.asc` se conecte igual en ambos programas. |
| `sym/{npn2,npn3,npn4,pnp2,pnp4,lpnp,res2,load,load2,varactor,TVSdiode,ltline,mesfet}.asy`, `sym/Misc/*.asy` (salvo EuropeanResistor), `sym/Digital/*.asy` y sus `skins/default/*.svg` (salvo `npn2.svg` y `pnp2.svg`, que son los `npn.svg`/`pnp.svg` del skin Default de ASC-Parser, commit `bd7465d`) | Propios de TurboSpice, generados por `scripts/gen-ltspice-symbols.mjs` | Gráficos propios con la estética del skin Default de ASC-Parser. Pines, `SpiceOrder`, `Prefix`, `Value`, `WINDOW` y atributos de netlist replican los de LTspice (`lib/sym` y `lib/sym/Misc`) como datos de interoperabilidad. |
| `sub/opamp.sub`, `sub/UniversalOpAmp1.lib`, `sub/UniversalOpAmp2.lib` | Propios de TurboSpice | Modelos escritos desde cero con el mismo uso (nombres de subcircuito y parámetros) que los de LTspice, para que un `.asc` que los usa simule. No contienen código de Analog Devices. |
| `skins/default/*.svg` (resto) | Skin "Default" de [ASC-Parser](https://github.com/javierpetrucci/ASC-Parser) (Javier Petrucci), commit en `skins/default/.source-commit` | Con permiso del autor. Se normalizan al construir la librería (`scripts/build-library.mjs`). |
| `window-positions.json` | Posiciones óptimas de los rótulos por símbolo y orientación, de [ASC-Parser](https://github.com/javierpetrucci/ASC-Parser) (`engine/component_defaults.js`, Javier Petrucci); commit en `window-positions.source-commit`. Se actualiza con `npm run windows:import` | Con permiso del autor. |
| `window-defaults.json` | Derivado por `scripts/derive-window-defaults.mjs` de esquemáticos `.asc` guardados por LTspice | Datos de posición observados (no contiene contenido de terceros). |

La librería estándar de LTspice (`lib/cmp/standard.*`, `lib/sub`, `lib/sym` de Analog Devices) **no** se
redistribuye: su licencia no lo permite. Cada usuario puede importar la de su propia instalación
(**Archivo › Importar librería de LTspice**, `src/library/ltspiceLib.ts`): queda sólo en el IndexedDB de
su navegador y no se sube a ningún lado. Los modelos que hagan falta para todos se reemplazan por
modelos con licencia libre.

`tests/fixtures/asc/`: ejercicios de práctica de Teoría de Circuitos II (ITBA), con permiso; las `.net`
de referencia las generó LTspice 24.1.10 a partir de esos archivos.
