# TurboSpice

Simulador de circuitos tipo LTspice que corre **100% en el navegador**: el motor es
[ngspice](https://ngspice.sourceforge.io) compilado a WebAssembly, sin servidor.

Editor de esquemáticos con `.asc` de LTspice como formato nativo (ida y vuelta), todos los análisis de
ngspice, visor de resultados, Estudio (barridos, tolerancias, mediciones, bloques) y links para
compartir. Ver [docs/PLAN.md](docs/PLAN.md) y [docs/compatibilidad-ltspice.md](docs/compatibilidad-ltspice.md).

## Desarrollo

En Windows: [docs/setup-windows.md](docs/setup-windows.md) (doble clic en `start-turbospice.bat`).

```sh
bash engine/build.sh     # compila ngspice a WASM (requiere emsdk, ver engine/README.md)
npm install
npm run smoke            # tests del motor (compara contra ngspice nativo si coincide la versión)
npm run dev              # http://localhost:5173/TurboSpice/
npm run build            # sitio estático en dist/
npm run preview & npm run e2e   # e2e en Chromium (CHROMIUM=/ruta si no está en /usr/bin/chromium)
npm test                 # tests unitarios (vitest)
```

## Deploy

`.github/workflows/deploy.yml` compila el motor (cacheado), corre los tests y publica `dist/`
en GitHub Pages en cada push a `main`. En el repo: *Settings → Pages → Source: GitHub Actions*.

## Licencias

ngspice se distribuye bajo su licencia BSD modificada (ver `COPYING` en las fuentes de ngspice).
Los modelos en `library/` llevan su origen y licencia en `library/LICENSES.md`.
Dependencias de la interfaz: React (MIT), uPlot (MIT) y Blockly (Apache 2.0, se carga sólo al abrir
el editor de bloques).
