/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

// rama de git al levantar el servidor local: en dev el logo sale blanco, como en /TurboSpice/dev/
let branch = '';
try {
  branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
} catch {}

const isDev = process.env.VITE_CHANNEL === 'dev' || branch === 'dev';

// en dev el favicon también sale blanco, para distinguir la pestaña
const devFavicon = {
  name: 'dev-favicon',
  transformIndexHtml: (html: string) =>
    isDev ? html.replace('favicon.svg?v=2', 'favicon-dev.svg') : html,
};

// GitHub Pages sirve el sitio en /<repo>/
export default defineConfig({
  base: process.env.BASE_PATH ?? '/TurboSpice/',
  plugins: [react(), devFavicon],
  define: { 'import.meta.env.VITE_BRANCH': JSON.stringify(branch) },
  worker: { format: 'es' },
  // Yosys (#209) busca su wasm con new URL(…, import.meta.url): sin pre-empaquetar, Vite lo sirve tal cual
  optimizeDeps: { exclude: ['@yowasp/yosys'] },
  // los tests unitarios corren con la interfaz en español (sus mensajes esperados están en español)
  test: { setupFiles: ['tests/setup-i18n.ts'] },
});
