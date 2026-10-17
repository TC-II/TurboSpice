import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// GitHub Pages sirve el sitio en /<repo>/
export default defineConfig({
  base: process.env.BASE_PATH ?? '/TurboSpice/',
  plugins: [react()],
  worker: { format: 'es' },
});
