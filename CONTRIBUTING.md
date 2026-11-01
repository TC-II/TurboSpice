# Cómo contribuir a TurboSpice

Lo de siempre, por escrito. Para levantar el proyecto: [README](README.md) (y en Windows,
[docs/setup-windows.md](docs/setup-windows.md)).

## Ramas

- `dev` es donde se integra el trabajo; se publica en `/TurboSpice/dev/`.
- `main` es la versión estable; se publica en `/TurboSpice/`.
- Los cambios entran a `dev` por PR, con la CI en verde.

## Antes de subir

```sh
npm run typecheck                 # tipos de src/, tests y scripts
npm run lint                      # ESLint (los avisos de exhaustive-deps no frenan; los errores sí)
npm test                          # unitarios (vitest)
node scripts/i18n/check.mjs       # textos en español fuera de es.ts o sin traducir
```

Si el cambio toca la interfaz, también el e2e de esa parte, con `npm run build && npm run preview`
corriendo: `node tests/e2e/<suite>.mjs` (lista en `package.json`, script `e2e`). Si toca el motor o
la netlist: `npm run smoke`, y `npm run hdl` para lo de Verilog.

La CI corre todo eso más los e2e en Chrome: ver `.github/workflows/deploy.yml`.

## Convenciones

- **Commits**: en castellano, con el área al principio y qué cambia para el usuario
  («Esquemático: …», «Visor: …», «Netlist: …»); `refs #N` o `Closes #N` si hay issue.
- **Textos de la interfaz**: en inglés con `t('…')` y la traducción en `src/i18n/es.ts`
  ([docs/i18n.md](docs/i18n.md)).
- **Números con prefijo SI**: `parseSpiceNumber` y `formatSi` de `src/netlist/spicenum.ts`; no hace
  falta otra tabla de sufijos. En SPICE «M» es mili; en el visor, mega
  ([docs/compatibilidad-ltspice.md](docs/compatibilidad-ltspice.md) § Números con prefijo SI).
- **Tests**: la lógica pura lleva test unitario en `tests/unit/`; los unitarios corren con la
  interfaz en español.
- **Nada de `any` ni `@ts-ignore`**: el código está libre de los dos y ESLint lo controla.
- **Archivos grandes** (`App.tsx`, `PlotPanel.tsx`, `SchematicEditor.tsx`): lo nuevo, mejor en un
  módulo o hook propio que en el componente (ver [docs/auditoria-calidad.md](docs/auditoria-calidad.md), fase 3).

## Referencias

- Motor (ngspice-47): `docs/ngspice/md/INDEX.md`.
- Formato `.turbo`: [docs/turbo-formato.md](docs/turbo-formato.md).
- Simulación mixta y Verilog: [docs/mixed-signal.md](docs/mixed-signal.md).
- Grafo del código: `graphify-out/GRAPH_REPORT.md` (`graphify query "…"`).
