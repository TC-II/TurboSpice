/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// GitHub Pages sirve el sitio en /<repo>/
export default defineConfig({
  base: process.env.BASE_PATH ?? '/TurboSpice/',
  plugins: [react()],
  worker: { format: 'es' },
  // Yosys (#209) busca su wasm con new URL(…, import.meta.url): sin pre-empaquetar, Vite lo sirve tal cual
  optimizeDeps: { exclude: ['@yowasp/yosys'] },
  // los tests unitarios corren con la interfaz en español (sus mensajes esperados están en español)
  test: { setupFiles: ['tests/setup-i18n.ts'] },
});
