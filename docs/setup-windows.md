# Correr TurboSpice en Windows

TurboSpice tiene dos piezas:

- **El sitio** (`src/`, React/TypeScript): lo que editás todos los días.
- **El motor** (`engine/`): ngspice compilado a WebAssembly (`ngspice.wasm` y archivos asociados).
  Compilarlo requiere un entorno Linux, así que **no se compila en Windows**: lo compila GitHub
  Actions y vos bajás el resultado.

## Primera vez

1. Instalá [Node.js LTS](https://nodejs.org).
2. Clonás el repo y hacés doble clic en **`start-turbospice.bat`**.

El `.bat` hace todo: `npm install` si hace falta, baja el motor ya compilado desde el sitio publicado
(`https://tc-ii.github.io/TurboSpice/engine/`) si no está en `engine/dist-engine/`, levanta el servidor
de desarrollo y abre la app. Primero pregunta qué rama querés: **1** `main` en
<http://localhost:5173/TurboSpice/>, o **2** `dev` en <http://localhost:5182/TurboSpice/>. La opción 2
usa `.claude/worktrees/dev-local`, siempre en la última versión de `origin/dev`, sin tocar la rama de
tu copia. Dejá la ventana abierta mientras usás la app; cerrarla detiene el servidor. Si el puerto ya
está en uso, sólo abre el navegador.

Equivalente a mano:

```sh
npm install
npm run engine:fetch     # baja el motor a engine/dist-engine/ (una vez)
npm run dev
```

## Día a día (cambios en el sitio)

Editás `src/` y Vite recarga solo. El motor no se toca ni se recompila.

## Si modificás el motor

"Motor" = `engine/build.sh`, `engine/spinit`, parches o versión de ngspice. El flujo:

1. Hacés los cambios y los subís (`git push`) a una rama o a `main`.
2. GitHub Actions (`.github/workflows/deploy.yml`) compila el motor en Linux. La compilación se
   cachea con la clave `hash(engine/build.sh, engine/spinit)`, así que cambiar esos archivos la
   dispara.
3. Bajás el resultado, de una de dos formas:

   **a) Desde una rama o PR** (sin esperar al deploy). Cada corrida sube un artefacto `engine`:

   ```sh
   gh run list --branch <tu-rama> --limit 1      # copiá el id de la corrida
   gh run download <id> -n engine -D engine/dist-engine
   ```

   **b) Después de mergear a `main`**, cuando el deploy termina, desde el sitio publicado:

   ```sh
   npm run engine:fetch
   ```

   (para bajarlo de otra URL: `node scripts/fetch-engine.mjs https://.../engine`)
4. `npm run dev` y probás con el motor nuevo.

Nota: `start-turbospice.bat` sólo baja el motor si **no existe**. Para forzar el reemplazo, usá
alguno de los comandos de arriba (o borrá `engine/dist-engine/`).

## Compilar el motor en local (opcional)

Sólo hace falta si querés iterar sobre `build.sh` sin pasar por GitHub. Necesita Linux (WSL con
Ubuntu), emsdk 4.0.10, `bison`, `flex`, `gcc`, `curl`; ver [engine/README.md](../engine/README.md).
Compilar nativamente en Windows (MSYS2) no funciona: la herramienta `cmpp` de XSPICE falla.
