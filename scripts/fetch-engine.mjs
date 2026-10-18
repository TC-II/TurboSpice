// Baja el motor (ngspice.wasm y sus archivos) ya compilado desde el sitio
// publicado y lo deja en engine/dist-engine/, para no compilarlo en local.
//   node scripts/fetch-engine.mjs [urlBase]
// urlBase por defecto: https://tc-ii.github.io/TurboSpice/engine
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const base = (process.argv[2] ?? 'https://tc-ii.github.io/TurboSpice/engine').replace(/\/$/, '')
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'engine', 'dist-engine')
const files = [
  'ngspice.mjs', 'ngspice.wasm', 'spinit',
  'spice2poly.cm', 'analog.cm', 'digital.cm', 'xtradev.cm', 'xtraevt.cm', 'table.cm', 'tlines.cm',
]

mkdirSync(out, { recursive: true })
for (const f of files) {
  const res = await fetch(`${base}/${f}`)
  if (!res.ok) throw new Error(`${f}: HTTP ${res.status} (${base}/${f})`)
  writeFileSync(join(out, f), Buffer.from(await res.arrayBuffer()))
  console.log('ok', f)
}
console.log('Motor listo en', out)
