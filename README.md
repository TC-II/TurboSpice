# TurboSpice

Simulador de circuitos tipo LTspice que corre **100% en el navegador**: el motor es
[ngspice](https://ngspice.sourceforge.io) compilado a WebAssembly, sin servidor.

Estado: fase 1 (netlist → simulación → gráficos). Ver [docs/PLAN.md](docs/PLAN.md).

## Desarrollo

```sh
bash engine/build.sh     # compila ngspice a WASM (requiere emsdk, ver engine/README.md)
npm install
npm run smoke            # tests del motor (compara contra ngspice nativo si coincide la versión)
npm run dev              # http://localhost:5173/TurboSpice/
npm run build            # sitio estático en dist/
npm run preview & npm run e2e   # e2e en Chromium (CHROMIUM=/ruta si no está en /usr/bin/chromium)
```

## Deploy

`.github/workflows/deploy.yml` compila el motor (cacheado), corre los tests y publica `dist/`
en GitHub Pages en cada push a `main`. En el repo: *Settings → Pages → Source: GitHub Actions*.

## Licencias

ngspice se distribuye bajo su licencia BSD modificada (ver `COPYING` en las fuentes de ngspice).
Los modelos en `library/` llevan su origen y licencia en `library/LICENSES.md`.
