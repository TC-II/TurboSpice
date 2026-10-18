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

## Google Drive (opcional)

Con un OAuth Client ID de Google aparece un circulito de cuenta arriba a la derecha: con la sesión
iniciada, *Guardar* sube el `.asc` a la carpeta **TurboSpice** del Drive del usuario y *Archivo → Abrir
de Google Drive…* lista esos archivos. El guardado en el equipo y el autoguardado siguen igual
(*Archivo → Guardar en el equipo…*). Se usa Google Identity Services con el scope mínimo
`drive.file`: la app sólo ve los archivos que creó ella. Sin Client ID no aparece nada de esto.

Para crear el Client ID (no hay secreto: el ID es público y va en el JavaScript):

1. En [Google Cloud Console](https://console.cloud.google.com/) crear (o elegir) un proyecto.
2. *APIs y servicios → Biblioteca*: habilitar **Google Drive API**.
3. *APIs y servicios → Pantalla de consentimiento de OAuth* (Google Auth Platform): tipo *Externo*,
   nombre de la app y mail de contacto; en *Acceso a los datos* agregar el scope
   `https://www.googleapis.com/auth/drive.file`. Mientras esté en modo *Prueba*, sólo pueden entrar los
   usuarios agregados como *usuarios de prueba*; para abrirlo a todos, *Publicar app* (`drive.file` no
   requiere verificación de Google).
4. *Credenciales → Crear credenciales → ID de cliente de OAuth*, tipo **Aplicación web**. En
   **Orígenes autorizados de JavaScript** agregar (sólo el origen, sin ruta):
   - `http://localhost:5173` (desarrollo, `npm run dev`) y `http://localhost:4173` (`npm run preview`)
   - `https://<usuario>.github.io` (GitHub Pages)

   No hacen falta URIs de redirección.
5. Copiar el ID (`….apps.googleusercontent.com`):
   - local: `cp .env.example .env.local` y completar `VITE_GOOGLE_CLIENT_ID` (`.env.local` no se commitea);
   - deploy: en el repo, *Settings → Secrets and variables → Actions → Variables*, crear la variable
     `VITE_GOOGLE_CLIENT_ID` (el workflow de deploy la pasa al build).
6. Para abrir cualquier `.asc` del Drive (no sólo los que guardó TurboSpice) se usa el
   [Google Picker](https://developers.google.com/drive/picker): habilitar **Google Picker API** y crear
   una **API key** (*Credenciales → Crear credenciales → Clave de API*), restringida a la *Google Picker
   API* y a los sitios `http://localhost:5173/*`, `http://localhost:4173/*` y `https://tc-ii.github.io/*`.
   Va en `VITE_GOOGLE_API_KEY` (local y variable del repo, igual que el Client ID). Es pública; el
   archivo elegido queda accesible para la app y nada más (sigue siendo `drive.file`).

## Licencias

ngspice se distribuye bajo su licencia BSD modificada (ver `COPYING` en las fuentes de ngspice).
Los modelos en `library/` llevan su origen y licencia en `library/LICENSES.md`.
Dependencias de la interfaz: React (MIT), uPlot (MIT) y Blockly (Apache 2.0, se carga sólo al abrir
el editor de bloques).
