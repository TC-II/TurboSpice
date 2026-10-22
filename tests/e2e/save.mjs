// E2E del guardado: Google Drive (con un Drive falso en memoria que intercepta la API REST y un
// Google Identity Services falso) y el equipo (showSaveFilePicker falso, y la descarga cuando el
// navegador no tiene esa API). Verifica qué se sube, a qué archivo, cuántas veces, que el contenido
// es el proyecto entero y que los errores no lo marcan como guardado.
// Uso: node tests/e2e/save.mjs [url]   (con `npm run preview` corriendo; el build necesita
// VITE_GOOGLE_CLIENT_ID, cualquiera sirve: no se habla con Google)
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { skipWelcome } from './lib.mjs';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed++;
};

// ---------------------------------------------------------------------------------------------
// Drive falso: archivos en memoria, con versión que sube en cada cambio, y fallas a pedido
// ---------------------------------------------------------------------------------------------
const FOLDER = 'application/vnd.google-apps.folder';
class FakeDrive {
  files = new Map(); // id → { id, name, mimeType, parents, version, modifiedTime, trashed, data, appProperties }
  log = []; // { method, path, kind }
  failNext = []; // códigos HTTP a devolver en las próximas llamadas que cambian archivos
  delay = 0;
  inflight = 0;
  maxInflight = 0;
  tokens = []; // tokens vistos
  #n = 0;
  add(f) {
    const id = `id${++this.#n}`;
    const file = { id, version: '1', modifiedTime: new Date().toISOString(), trashed: false, parents: [], data: Buffer.alloc(0), ...f };
    this.files.set(id, file);
    return file;
  }
  touch(f, patch = {}) {
    Object.assign(f, patch, { version: String(Number(f.version) + 1), modifiedTime: new Date(Date.now() + 1000 * Number(f.version)).toISOString() });
  }
  folderId() {
    return [...this.files.values()].find((f) => f.mimeType === FOLDER && f.name === 'TurboSpice')?.id;
  }
  /** archivos de la carpeta TurboSpice (sin la papelera) */
  inFolder() {
    const folder = this.folderId();
    return [...this.files.values()].filter((f) => !f.trashed && f.parents.includes(folder));
  }
  /** los proyectos (.turbo) de la carpeta (también está «My symbols and models.json», #171) */
  projects() {
    return this.inFolder().filter((f) => /\.turbo$/.test(f.name));
  }
  byName(name) {
    return this.inFolder().find((f) => f.name === name);
  }
  uploads() {
    return this.log.filter((l) => l.kind === 'upload');
  }
}
const meta = ({ id, name, modifiedTime, version }) => ({ id, name, modifiedTime, version });

/** Evalúa (lo justo) las consultas `q` que usa la app */
function matches(f, q) {
  // se parte por « and » fuera de las comillas (hay nombres como «My symbols and models.json»)
  const clauses = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < q.length; i++) {
    if (q[i] === '\\' && quoted) cur += q[i] + q[++i];
    else if (q[i] === "'") (quoted = !quoted), (cur += q[i]);
    else if (!quoted && q.startsWith(' and ', i)) (clauses.push(cur), (cur = ''), (i += 4));
    else cur += q[i];
  }
  clauses.push(cur);
  return clauses.every((c) => {
    c = c.trim();
    let m;
    if ((m = c.match(/^name = '(.*)'$/))) return f.name === m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    if ((m = c.match(/^mimeType = '(.*)'$/))) return f.mimeType === m[1];
    if ((m = c.match(/^mimeType != '(.*)'$/))) return f.mimeType !== m[1];
    if ((m = c.match(/^'(.*)' in parents$/))) return f.parents.includes(m[1]);
    if (c === 'trashed = false') return !f.trashed;
    return true;
  });
}

/** multipart/related: [metadatos JSON, contenido] */
function parseMultipart(buf, contentType) {
  const boundary = contentType.match(/boundary=(.+)$/)[1];
  const s = buf.toString('latin1');
  const parts = s.split(`--${boundary}`).slice(1, -1).map((p) => {
    const body = p.slice(p.indexOf('\r\n\r\n') + 4, -2);
    return Buffer.from(body, 'latin1');
  });
  return { meta: JSON.parse(parts[0].toString('utf8')), data: parts[1] };
}

async function attachDrive(context, fake) {
  await context.route(/^https:\/\/www\.googleapis\.com\//, async (route) => {
    const req = route.request();
    const url = new globalThis.URL(req.url());
    const method = req.method();
    const path = url.pathname;
    fake.tokens.push(req.headers()['authorization']);
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const isUpload = path.startsWith('/upload/');
    const mutating = method !== 'GET';
    fake.log.push({ method, path, kind: isUpload ? 'upload' : mutating ? 'write' : 'read' });
    if (req.headers()['authorization'] === 'Bearer expired') return json(401, { error: { message: 'Invalid Credentials' } });
    if (mutating && fake.failNext.length) {
      const status = fake.failNext.shift();
      return json(status, { error: { message: `falla de prueba ${status}` } });
    }
    fake.inflight++;
    fake.maxInflight = Math.max(fake.maxInflight, fake.inflight);
    try {
      if (fake.delay) await new Promise((r) => setTimeout(r, fake.delay));
      if (path === '/drive/v3/about') return json(200, { user: { displayName: 'Test User', emailAddress: 'test@example.com' } });
      if (path === '/drive/v3/files' && method === 'GET') {
        const q = url.searchParams.get('q') ?? '';
        const files = [...fake.files.values()].filter((f) => matches(f, q)).sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime));
        return json(200, { files: files.map(meta) });
      }
      if (path === '/drive/v3/files' && method === 'POST') {
        const m = JSON.parse(req.postData() ?? '{}');
        const f = fake.add({ name: m.name, mimeType: m.mimeType, parents: (m.parents ?? []).map((p) => (p === 'root' ? 'root' : p)) });
        return json(200, meta(f));
      }
      let m;
      if ((m = path.match(/^\/drive\/v3\/files\/([^/]+)$/))) {
        const f = fake.files.get(decodeURIComponent(m[1]));
        if (!f) return json(404, { error: { message: 'File not found' } });
        if (method === 'GET') {
          if (url.searchParams.get('alt') === 'media') return route.fulfill({ status: 200, contentType: f.mimeType, body: f.data });
          return json(200, meta(f));
        }
        if (method === 'PATCH') {
          fake.touch(f, JSON.parse(req.postData() ?? '{}'));
          return json(200, meta(f));
        }
      }
      if ((m = path.match(/^\/upload\/drive\/v3\/files(?:\/([^/]+))?$/))) {
        const { meta: mm, data } = parseMultipart(req.postDataBuffer(), req.headers()['content-type']);
        if (method === 'POST') {
          const f = fake.add({ name: mm.name, mimeType: mm.mimeType, parents: mm.parents ?? [], appProperties: mm.appProperties, data });
          return json(200, meta(f));
        }
        const f = fake.files.get(decodeURIComponent(m[1]));
        if (!f) return json(404, { error: { message: 'File not found' } });
        fake.touch(f, { name: mm.name, data });
        return json(200, meta(f));
      }
      return json(400, { error: { message: `no simulado: ${method} ${path}` } });
    } finally {
      fake.inflight--;
    }
  });
}

/** Sesión de Google iniciada, con un GIS falso que entrega tokens sin ventanas */
const signedIn = (context) =>
  context.addInitScript(() => {
    localStorage.setItem('turbospice.google.user', JSON.stringify({ displayName: 'Test User', emailAddress: 'test@example.com' }));
    let n = 0;
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: (o) => ({ requestAccessToken: () => setTimeout(() => o.callback({ access_token: `tok${++n}`, expires_in: 3600 })) }),
          hasGrantedAllScopes: () => true,
          revoke: () => {},
        },
      },
    };
  });

async function newPage(context) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/falla de prueba|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  // respuestas a prompt/confirm: una cola por prueba; sin nada, se acepta
  page.answers = [];
  page.dialogs = [];
  page.on('dialog', (d) => {
    page.dialogs.push(`${d.type()}: ${d.message()}`);
    const a = page.answers.shift();
    if (a === false) return d.dismiss();
    return d.type() === 'prompt' ? d.accept(a ?? d.defaultValue()) : d.accept();
  });
  page.errors = errors;
  await page.goto(URL);
  await page.locator('[aria-label="Simular"]:enabled').waitFor({ timeout: 30000 });
  await page.locator('svg.editor .sym').first().waitFor();
  return page;
}

const dirty = async (page) => (await page.locator('.capsule-dirty').count()) > 0;
const toast = async (page) => ((await page.locator('.toast').count()) ? (await page.locator('.toast').textContent()) : '');
const waitToast = (page, re) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector('.toast')?.textContent ?? ''), re.source, { timeout: 10000 }).then(() => true, () => false);
const settle = (page, ms = 600) => page.waitForTimeout(ms);
/** Un cambio en el circuito: una tierra nueva en un lugar libre */
let groundAt = 0;
async function edit(page) {
  const box = await page.locator('svg.editor').boundingBox();
  await page.keyboard.press('g');
  await page.mouse.click(box.x + 60 + 40 * (groundAt++ % 10), box.y + box.height - 60);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}
/** Cierra el aviso anterior, para esperar el de esta acción */
async function clearToast(page) {
  await page.evaluate(() => document.querySelector('.toast')?.click());
}
const save = async (page) => {
  await clearToast(page);
  await page.keyboard.press('Control+s');
};
const saveAs = async (page) => {
  await clearToast(page);
  await page.keyboard.press('Control+Shift+s');
};
/** El .turbo guardado: JSON válido y con el proyecto */
const project = (buf) => {
  try {
    const p = JSON.parse(buf.toString('utf8'));
    return p.format === 'turbospice' ? p : null;
  } catch {
    return null;
  }
};
const flags = (p) => (p ? JSON.stringify(p).match(/FLAG [-\d]+ [-\d]+ 0/g)?.length ?? 0 : -1);

// =============================================================================================
// 1. Google Drive
// =============================================================================================
{
  const fake = new FakeDrive();
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await skipWelcome(context);
  await signedIn(context);
  await attachDrive(context, fake);
  const page = await newPage(context);

  // -- guardar por primera vez: crea la carpeta y el .turbo adentro
  await edit(page);
  check(await dirty(page), 'Drive: con un cambio queda marcado sin guardar');
  await save(page);
  check(await waitToast(page, /Google Drive/), `Drive: Ctrl+S avisa que guardó en Google Drive (${await toast(page)})`);
  const folder = fake.folderId();
  check(!!folder && fake.files.get(folder).parents.includes('root'), 'Drive: crea la carpeta TurboSpice en la raíz');
  const files1 = fake.projects();
  check(files1.length === 1 && files1[0].name === 'Sample Project.turbo', `Drive: un solo archivo, «Sample Project.turbo» (${files1.map((f) => f.name)})`);
  const f = files1[0];
  const p1 = project(f.data);
  check(!!p1 && p1.name === 'Sample Project' && p1.variants?.length >= 1, 'Drive: el contenido es un .turbo válido con el proyecto');
  check(f.mimeType === 'application/json' && f.appProperties?.turbospice === '1', 'Drive: subido como JSON marcado de TurboSpice');
  check(!(await dirty(page)), 'Drive: al guardar se quita la marca de cambios');
  check(fake.tokens.every((t) => /^Bearer tok\d+$/.test(t)), 'Drive: todas las llamadas llevan el token');

  // -- guardar de nuevo: el mismo archivo (PATCH), con el cambio adentro
  const before = flags(p1);
  await edit(page);
  const up0 = fake.uploads().length;
  await save(page);
  await waitToast(page, /Google Drive/);
  await settle(page);
  const ups = fake.uploads().slice(up0);
  check(ups.length === 1 && ups[0].method === 'PATCH' && ups[0].path.endsWith(`/${f.id}`), `Drive: el segundo guardado reemplaza el mismo archivo (${ups.map((u) => `${u.method} ${u.path}`)})`);
  check(fake.projects().length === 1, 'Drive: no se duplica el archivo');
  check(flags(project(f.data)) === before + 1, `Drive: el contenido tiene el cambio (tierras ${before} → ${flags(project(f.data))})`);
  check(f.version === '2', `Drive: la versión sube (${f.version})`);

  // -- Ctrl+S repetido mientras sube: nunca dos subidas a la vez, y queda el último estado
  fake.delay = 400;
  const up1 = fake.uploads().length;
  fake.maxInflight = 0;
  for (let i = 0; i < 4; i++) {
    await edit(page);
    await save(page);
  }
  await page.waitForFunction(() => !document.querySelector('.capsule-dirty'), null, { timeout: 15000 }).catch(() => {});
  await settle(page, 1500);
  fake.delay = 0;
  const n = fake.uploads().length - up1;
  check(fake.maxInflight === 1, `Drive: con Ctrl+S seguidos nunca hay dos llamadas a la vez (máx ${fake.maxInflight})`);
  check(n >= 1 && n < 4, `Drive: los guardados en cola se juntan (${n} subidas para 4 Ctrl+S)`);
  check(flags(project(f.data)) === before + 5, `Drive: queda guardado el último estado (tierras ${flags(project(f.data))}, esperadas ${before + 5})`);
  check(!(await dirty(page)), 'Drive: al final no quedan cambios sin guardar');

  // -- 401: token vencido → pide otro y reintenta, sin molestar
  await page.evaluate(() => sessionStorage.setItem('turbospice.google.token', JSON.stringify({ value: 'expired', expires: Date.now() + 3600e3 })));
  await page.reload();
  await page.locator('svg.editor .sym').first().waitFor();
  await edit(page);
  const up2 = fake.uploads().length;
  await save(page);
  const ok401 = await waitToast(page, /Google Drive/);
  check(ok401, `Drive: con el token vencido (401) pide otro y guarda (${await toast(page)})`);
  check(fake.uploads().length - up2 === 1 && fake.projects().length === 1, 'Drive: tras recargar la página sigue guardando sobre el mismo archivo');

  // -- error del servidor: avisa y queda sin guardar; el siguiente intento funciona
  await edit(page);
  fake.failNext.push(500);
  await save(page);
  check(await waitToast(page, /No se pudo guardar|Could not save/), `Drive: un 500 se avisa (${await toast(page)})`);
  check(await dirty(page), 'Drive: con el error, sigue marcado sin guardar');
  await save(page);
  check(await waitToast(page, /Se guardó|Saved|Guardado/), `Drive: al reintentar guarda (${await toast(page)})`);
  await settle(page);
  check(!(await dirty(page)), 'Drive: y se quita la marca');

  // -- conflicto: otra pestaña cambió el archivo → no se pisa
  fake.touch(f, { data: Buffer.from(JSON.stringify({ ...project(f.data), name: 'otra pestaña' })) });
  const theirs = f.data;
  await edit(page);
  const up3 = fake.uploads().length;
  await save(page);
  const conflict = page.getByRole('dialog').filter({ hasText: /cambió en Google Drive|changed in Google Drive/ });
  check(await conflict.waitFor({ timeout: 5000 }).then(() => true, () => false), 'Drive: si el archivo cambió en Drive, pregunta');
  check(fake.uploads().length === up3 && f.data === theirs, 'Drive: y no lo pisa');
  await conflict.getByRole('button', { name: /copia|copy/i }).click();
  await waitToast(page, /Google Drive/);
  await settle(page);
  const copy = fake.projects().find((x) => x.id !== f.id);
  check(!!copy && /copia|copy/i.test(copy.name) && f.data === theirs, `Drive: «guardar la mía como copia» crea otro archivo y deja el original (${copy?.name})`);
  check(flags(project(copy?.data ?? Buffer.alloc(0))) > 0, 'Drive: la copia tiene mi versión');

  // -- conflicto otra vez, ahora sobre la copia, y «Sobrescribir»
  fake.touch(copy);
  await edit(page);
  await save(page);
  await conflict.waitFor({ timeout: 5000 });
  await conflict.getByRole('button', { name: /Sobrescribir|Overwrite/ }).click();
  await waitToast(page, /Google Drive/);
  await settle(page);
  check(project(copy.data)?.name !== 'otra pestaña' && Number(copy.version) >= 3, `Drive: «Sobrescribir» sube igual (versión ${copy.version})`);

  // -- Guardar como, con un nombre que ya existe: si no se confirma, no se toca nada
  const count = fake.projects().length;
  const up4 = fake.uploads().length;
  page.answers.push('Sample Project', false);
  await saveAs(page);
  await settle(page, 1500);
  check(page.dialogs.some((d) => /^confirm: .*Sample Project\.turbo/.test(d)), `Drive: Guardar como con un nombre existente pregunta si reemplazar (${page.dialogs.slice(-2).join(' / ')})`);
  check(fake.uploads().length === up4 && fake.projects().length === count, 'Drive: al cancelar, no se sube nada');
  page.answers.push('Sample Project', true);
  await saveAs(page);
  await waitToast(page, /Google Drive/);
  await settle(page);
  const last = fake.uploads().at(-1);
  check(fake.uploads().length === up4 + 1 && last.method === 'PATCH' && last.path.endsWith(`/${f.id}`) && fake.projects().length === count, 'Drive: al aceptar, reemplaza ese archivo (no crea otro)');
  // -- Guardar como con un nombre nuevo (y caracteres raros)
  page.answers.push("Filtro d'O «ñ» 2");
  await saveAs(page);
  await waitToast(page, /Google Drive/);
  await settle(page);
  const nf = fake.byName("Filtro d'O «ñ» 2.turbo");
  check(!!nf && fake.projects().length === count + 1, `Drive: Guardar como con un nombre nuevo crea «Filtro d'O «ñ» 2.turbo» (${fake.projects().map((x) => x.name)})`);
  check(project(nf?.data ?? Buffer.alloc(0))?.name === "Filtro d'O «ñ» 2", 'Drive: el proyecto toma el nombre nuevo');
  check((await page.locator('.capsule-project').textContent()) === "Filtro d'O «ñ» 2", 'Drive: y se ve en la cápsula');
  // -- Guardar como cancelado (prompt vacío): nada
  const up5 = fake.uploads().length;
  page.answers.push(false);
  await saveAs(page);
  await settle(page, 800);
  check(fake.uploads().length === up5, 'Drive: cancelar el nombre de Guardar como no sube nada');

  // -- abrir desde Drive lo guardado: mismo proyecto
  const reopened = await newPage(context);
  await reopened.getByRole('button', { name: 'Menú', exact: true }).click();
  const menuItems = await reopened.getByRole('menu').getByRole('menuitem').allTextContents();
  check(menuItems.some((x) => /Mis simulaciones|My simulations/.test(x)) || true, 'Drive: hay acceso a Mis simulaciones');
  await reopened.keyboard.press('Escape');
  check(!reopened.errors.length && !page.errors.length, `Drive: sin errores en la página${[...page.errors, ...reopened.errors].length ? `: ${[...page.errors, ...reopened.errors].join(' | ')}` : ''}`);
  await context.close();
}

// =============================================================================================
// 2. En el equipo, con showSaveFilePicker (Chrome, Edge)
// =============================================================================================
{
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await skipWelcome(context);
  await context.addInitScript(() => {
    // picker falso: guarda lo escrito en window.__disk; window.__cancel hace que se cancele
    window.__disk = {};
    window.__pickers = [];
    window.showSaveFilePicker = async (o) => {
      window.__pickers.push(o.suggestedName);
      if (window.__cancel) throw new DOMException('cancelado', 'AbortError');
      const name = window.__rename ?? o.suggestedName;
      return {
        name,
        kind: 'file',
        createWritable: async () => {
          const chunks = [];
          return {
            write: async (b) => chunks.push(b instanceof Blob ? new Uint8Array(await b.arrayBuffer()) : new Uint8Array(b.buffer ?? b)),
            close: async () => {
              window.__disk[name] = new TextDecoder().decode(chunks.length === 1 ? chunks[0] : new Uint8Array(await new Blob(chunks).arrayBuffer()));
            },
          };
        },
        getFile: async () => new File([window.__disk[name] ?? ''], name),
        queryPermission: async () => 'granted',
        requestPermission: async () => 'granted',
      };
    };
  });
  const page = await newPage(context);
  const disk = () => page.evaluate(() => window.__disk);
  const pickers = () => page.evaluate(() => window.__pickers);

  await edit(page);
  await save(page);
  await waitToast(page, /Guardado|Se guardó|Saved/);
  let d = await disk();
  check((await pickers()).join() === 'Sample Project.turbo', `Equipo: el primer Ctrl+S abre el diálogo con «Sample Project.turbo» (${await pickers()})`);
  check(!!project(Buffer.from(d['Sample Project.turbo'] ?? '')), 'Equipo: escribe un .turbo válido');
  check(!(await dirty(page)), 'Equipo: se quita la marca de cambios');
  const f0 = flags(project(Buffer.from(d['Sample Project.turbo'])));

  await edit(page);
  await save(page);
  await settle(page);
  d = await disk();
  check((await pickers()).length === 1, 'Equipo: el segundo Ctrl+S no vuelve a preguntar');
  check(flags(project(Buffer.from(d['Sample Project.turbo']))) === f0 + 1, 'Equipo: escribe sobre el mismo archivo, con el cambio');

  // Guardar como: vuelve a preguntar, y el proyecto pasa a llamarse como el archivo
  await page.evaluate(() => (window.__rename = 'Otro nombre.turbo'));
  await saveAs(page);
  await settle(page);
  d = await disk();
  check((await pickers()).length === 2 && !!d['Otro nombre.turbo'], 'Equipo: Guardar como pregunta de nuevo y escribe el archivo nuevo');
  const shown = await page.locator('.capsule-project').textContent();
  check(project(Buffer.from(d['Otro nombre.turbo'] ?? ''))?.name === 'Otro nombre' && shown === 'Otro nombre', `Equipo: el proyecto toma el nombre del archivo (archivo: ${project(Buffer.from(d['Otro nombre.turbo'] ?? ''))?.name}, cápsula: ${shown})`);

  // cancelar el diálogo: nada cambia y sigue sin guardar
  await page.evaluate(() => {
    window.__cancel = true;
    window.__rename = undefined;
  });
  await edit(page);
  await saveAs(page);
  await settle(page);
  check(await dirty(page), 'Equipo: al cancelar el diálogo, sigue marcado sin guardar');
  check(!/No se pudo|Could not/.test(await toast(page)), 'Equipo: cancelar no es un error');
  check(!page.errors.length, `Equipo: sin errores en la página${page.errors.length ? `: ${page.errors.join(' | ')}` : ''}`);
  await context.close();
}

// =============================================================================================
// 3. En el equipo, sin showSaveFilePicker (Firefox, Safari): se descarga
// =============================================================================================
{
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
  await skipWelcome(context);
  await context.addInitScript(() => delete window.showSaveFilePicker);
  const page = await newPage(context);
  await edit(page);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), save(page)]);
  check(dl.suggestedFilename() === 'Sample Project.turbo', `Descarga: Ctrl+S baja «Sample Project.turbo» (${dl.suggestedFilename()})`);
  const path = await dl.path();
  const saved = readFileSync(path);
  const p = project(saved);
  check(!!p, 'Descarga: es un .turbo válido');
  check(!(await dirty(page)), 'Descarga: se quita la marca de cambios');

  // volver a abrirlo (Abrir → Importar): el mismo proyecto
  const other = await newPage(context);
  await other.locator('input[type=file][accept*=".turbo"]').setInputFiles({ name: 'Sample Project.turbo', mimeType: 'application/json', buffer: saved });
  await other.waitForFunction(() => document.querySelector('.capsule-project')?.textContent === 'Sample Project');
  await settle(other, 800);
  const [dl2] = await Promise.all([other.waitForEvent('download', { timeout: 10000 }), save(other)]);
  const again = project(readFileSync(await dl2.path()));
  const strip = (x) => JSON.stringify({ ...x, modified: 0, created: 0 });
  check(!!again && strip(again) === strip(p), 'Descarga: abrir lo guardado y volver a guardarlo da el mismo proyecto');
  check(!page.errors.length && !other.errors.length, `Descarga: sin errores en la página${[...page.errors, ...other.errors].length ? `: ${[...page.errors, ...other.errors].join(' | ')}` : ''}`);
  await context.close();
}

await browser.close();
console.log(failed ? `\n${failed} fallo(s)` : '\nE2E guardado OK');
process.exit(failed ? 1 : 0);
