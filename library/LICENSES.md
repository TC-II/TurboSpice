# Origen y licencias de la librería

| Ruta | Origen | Condiciones |
|---|---|---|
| `sym/TCLib/`, `sub/TCLib/` | **TCLib**, librería de Teoría de Circuitos (ITBA) — Javier Petrucci y Agustín Gullino | Incluida con permiso de los autores. Algunos modelos dentro de TCLib (p.ej. LM741, TL082, LF398) pueden provenir de fabricantes. |
| `sym/res.asy` | Resistor "properly shaped" — Javier Petrucci y Agustín Gullino (ITBA) | Con permiso de los autores. |
| `sym/*.asy` (resto: cap, ind, voltage, diode, npn, nmos, …) | Propios de TurboSpice, generados por `scripts/gen-base-symbols.mjs` | Gráficos y descripciones propios. Pines, `SpiceOrder`, `Prefix`, `Value` y `WINDOW` replican los de LTspice como datos de interoperabilidad, para que un `.asc` se conecte igual en ambos programas. |
| `skins/default/*.svg` | Skin "Default" de [ASC-Parser](https://github.com/javierpetrucci/ASC-Parser) (Javier Petrucci), commit en `skins/default/.source-commit` | Con permiso del autor. Se normalizan al construir la librería (`scripts/build-library.mjs`). |
| `window-positions.json` | Posiciones óptimas de los rótulos por símbolo y orientación, de [ASC-Parser](https://github.com/javierpetrucci/ASC-Parser) (`engine/component_defaults.js`, Javier Petrucci); commit en `window-positions.source-commit`. Se actualiza con `npm run windows:import` | Con permiso del autor. |
| `window-defaults.json` | Derivado por `scripts/derive-window-defaults.mjs` de esquemáticos `.asc` guardados por LTspice | Datos de posición observados (no contiene contenido de terceros). |

La librería estándar de LTspice (`lib/cmp/standard.*`, `lib/sub`, `lib/sym` de Analog Devices) **no** se
redistribuye: su licencia no lo permite. Los modelos que hagan falta de ahí se importan localmente desde
la instalación de LTspice de cada usuario (fase 6) o se reemplazan por modelos con licencia libre.

`tests/fixtures/asc/`: ejercicios de práctica de Teoría de Circuitos II (ITBA), con permiso; las `.net`
de referencia las generó LTspice 24.1.10 a partir de esos archivos.
