// ESLint (fase 1 de docs/auditoria-calidad.md): las reglas recomendadas de JS y TypeScript y las
// dos reglas clásicas de hooks de React. `npm run lint` lo corre y la CI también.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  {
    ignores: ['dist/', 'node_modules/', 'engine/', 'public/', 'graphify-out/', 'docs/', 'library/', 'examples/', 'test-results/', '.cache/', '.claude/',
      // port tal cual de ASC-Parser (engine/rough_pen.js): se mantiene igual al original
      'src/schematic/roughPen.js'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.worker } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['scripts/**/*.{ts,mjs,js}', 'tests/**/*.{ts,mjs,js}', 'engine/**/*.mjs', '*.{js,ts}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    rules: {
      // estilo de la casa: `cond && f()`, `c ? f() : g()` y `f(), g()` como sentencias (la regla no
      // tiene opción para las secuencias con coma)
      '@typescript-eslint/no-unused-expressions': 'off',
      // catch {} vacío: «si falla, se sigue» a propósito (almacenamiento bloqueado, archivos opcionales)
      'no-empty': ['error', { allowEmptyCatch: true }],
      // `_` delante: parámetro o variable que no se usa a propósito (lo mismo pide noUnusedLocals)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
    },
  },
);
