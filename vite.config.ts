/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

// el logo sale blanco en todo lo que no es main: el sitio /TurboSpice/dev/ (VITE_CHANNEL) y, en la
// máquina, cualquier rama que no sea main (dev, un worktree, o uno sin rama: «detached HEAD»).
// En la CI manda sólo VITE_CHANNEL (allí la rama puede no estar)
let branch = '';
try {
  branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
} catch {}

const isDev = process.env.VITE_CHANNEL === 'dev' || (!process.env.CI && branch !== '' && branch !== 'main');

// en dev el favicon también sale blanco, para distinguir la pestaña
const devFavicon = {
  name: 'dev-favicon',
  transformIndexHtml: (html: string) => (isDev ? html.replace('favicon.svg?v=2', 'favicon-dev.svg') : html),
};

// GitHub Pages sirve el sitio en /<repo>/
export default defineConfig({
  base: process.env.BASE_PATH ?? '/TurboSpice/',
  plugins: [react(), devFavicon],
  define: { 'import.meta.env.VITE_LOGO_DEV': JSON.stringify(isDev) },
  worker: { format: 'es' },
  // Yosys (#209) busca su wasm con new URL(…, import.meta.url): sin pre-empaquetar, Vite lo sirve tal cual
  optimizeDeps: { exclude: ['@yowasp/yosys'] },
  // los tests unitarios corren con la interfaz en español (sus mensajes esperados están en español)
  test: {
    setupFiles: ['tests/setup-i18n.ts'],
    // npm run coverage: cobertura de src/ (resumen en la consola, detalle en coverage/index.html)
    coverage: { provider: 'v8', include: ['src/**/*.{ts,tsx}'], exclude: ['src/i18n/es.ts', 'src/schematic/roughPen.js'], reporter: ['text-summary', 'json-summary', 'html'] },
  },
});
