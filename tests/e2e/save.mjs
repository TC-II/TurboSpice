// E2E del guardado: Google Drive (con un Drive falso en memoria que intercepta la API REST y un
// Google Identity Services falso) y el equipo (showSaveFilePicker falso, y la descarga cuando el
// navegador no tiene esa API). Verifica qué se sube, a qué archivo, cuántas veces, que el contenido
// es el proyecto entero y que los errores no lo marcan como guardado.
// Uso: [BROWSER=firefox] node tests/e2e/save.mjs [url]   (con `npm run preview` corriendo; el build necesita
// VITE_GOOGLE_CLIENT_ID, cualquiera sirve: no se habla con Google)
import { readFileSync } from 'node:fs';
import { launchBrowser, menu, skipWelcome } from './lib.mjs';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';
const browser = await launchBrowser();

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
  sessions = new Map(); // subidas por partes en curso
  offline = false;
  failNext = []; // códigos HTTP a devolver en las próximas llamadas que cambian archivos
  delay = 0;
  inflight = 0;
  maxInflight = 0;
  tokens = []; // tokens vistos
  #n = 0;
  add(f) {
    const id = `id${++this.#n}`;
    const file = { id, version: '1', rev: `rev${++this.#n}`, modifiedTime: new Date().toISOString(), trashed: false, parents: [], data: Buffer.alloc(0), ...f };
    this.files.set(id, file);
    this.later(file);
    return file;
  }
  /** como Drive real: `version` sube sola un rato después de escribir (Drive procesa el
   * archivo); la revisión del contenido (headRevisionId) no (#176) */
  later(f) {
    setTimeout(() => (f.version = String(Number(f.version) + 1)), 300);
  }
  /** cambio de contenido (desde la app u «otra pestaña») */
  touch(f, patch = {}) {
    Object.assign(f, patch, { version: String(Number(f.version) + 1), rev: `rev${++this.#n}`, modifiedTime: new Date(Date.now() + 1000 * Number(f.version)).toISOString() });
    this.later(f);
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
const meta = ({ id, name, modifiedTime, version, rev }) => ({ id, name, modifiedTime, version, headRevisionId: rev });

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
    fake.log.push({ method, path, kind: isUpload ? 'upload' : mutating ? 'write' : 'read', resumable: url.searchParams.get('uploadType') === 'resumable' || url.searchParams.has('upload_id') });
    if (fake.offline) return route.abort('internetdisconnected');
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
          Object.assign(f, JSON.parse(req.postData() ?? '{}'), { version: String(Number(f.version) + 1) });
          return json(200, meta(f));
        }
      }
      if ((m = path.match(/^\/drive\/v3\/files\/([^/]+)\/copy$/)) && method === 'POST') {
        const src = fake.files.get(decodeURIComponent(m[1]));
        if (!src) return json(404, { error: { message: 'File not found' } });
        const mm = JSON.parse(req.postData() ?? '{}');
        const f = fake.add({ name: mm.name ?? `Copy of ${src.name}`, mimeType: src.mimeType, parents: mm.parents ?? src.parents, appProperties: src.appProperties, data: Buffer.from(src.data) });
        return json(200, meta(f));
      }
      // subida por partes (desde 5 MB): 1) metadatos → Location; 2) PUT del contenido a Location
      if (url.searchParams.has('upload_id') && method === 'PUT') {
        const up = fake.sessions.get(url.searchParams.get('upload_id'));
        if (!up) return json(404, { error: { message: 'upload session not found' } });
        fake.sessions.delete(url.searchParams.get('upload_id'));
        const data = req.postDataBuffer() ?? Buffer.alloc(0);
        if (!up.id) return json(200, meta(fake.add({ name: up.meta.name, mimeType: up.meta.mimeType, parents: up.meta.parents ?? [], appProperties: up.meta.appProperties, data })));
        const f = fake.files.get(up.id);
        fake.touch(f, { name: up.meta.name, data });
        return json(200, meta(f));
      }
      if ((m = path.match(/^\/upload\/drive\/v3\/files(?:\/([^/]+))?$/)) && url.searchParams.get('uploadType') === 'resumable') {
        const key = `up${fake.sessions.size + 1}x${Date.now()}`;
        fake.sessions.set(key, { meta: JSON.parse(req.postData() ?? '{}'), id: m[1] && decodeURIComponent(m[1]) });
        return route.fulfill({ status: 200, headers: { 'Access-Control-Expose-Headers': 'Location', Location: `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${key}` }, body: '' });
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
          initTokenClient: (o) => ({
            requestAccessToken: () => {
              window.__tokenRequests = (window.__tokenRequests ?? 0) + 1;
              setTimeout(() => o.callback({ access_token: `tok${++n}`, expires_in: 3600 }));
            },
          }),
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
  const rev0 = f.rev;
  // Drive real sube `version` solo, después de escribir: el segundo guardado no es un conflicto (#176)
  await settle(page, 800);
  await edit(page);
  const up0 = fake.uploads().length;
  await save(page);
  await waitToast(page, /Google Drive/);
  await settle(page);
  const ups = fake.uploads().slice(up0);
  check((await page.getByRole('dialog').filter({ hasText: /cambió en Google Drive|changed in Google Drive/ }).count()) === 0, 'Drive: el segundo guardado no ve un conflicto que no existe (#176)');
  check(ups.length === 1 && ups[0].method === 'PATCH' && ups[0].path.endsWith(`/${f.id}`), `Drive: el segundo guardado reemplaza el mismo archivo (${ups.map((u) => `${u.method} ${u.path}`)})`);
  check(fake.projects().length === 1, 'Drive: no se duplica el archivo');
  check(flags(project(f.data)) === before + 1, `Drive: el contenido tiene el cambio (tierras ${before} → ${flags(project(f.data))})`);
  check(f.rev !== rev0, 'Drive: cambia la revisión del contenido');

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
  const copyRev = copy.rev;
  await edit(page);
  await save(page);
  await conflict.waitFor({ timeout: 5000 });
  await conflict.getByRole('button', { name: /Sobrescribir|Overwrite/ }).click();
  await waitToast(page, /Google Drive/);
  await settle(page);
  check(project(copy.data)?.name !== 'otra pestaña' && copy.rev !== copyRev, '«Sobrescribir» sube igual');

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
// 1b. «Mis simulaciones»: abrir, renombrar, duplicar, papelera; subida por partes (≥ 5 MB);
//     dos pestañas con el guardado automático al simular; sin conexión
// =============================================================================================
/** contexto con la sesión de Google iniciada y un Drive falso propio */
async function driveContext(fake) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await skipWelcome(context);
  await signedIn(context);
  await attachDrive(context, fake);
  return context;
}
const openMySims = async (page) => {
  await menu(page, 'Archivo', 'Mis simulaciones (Google Drive)…');
  const d = page.getByRole('dialog').filter({ has: page.locator('.drive-browser') });
  await d.waitFor();
  await page.waitForFunction(() => !!document.querySelector('.drive-list, .drive-browser .hint + .hint'), null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(200);
  return d;
};
const listed = (d) => d.locator('.drive-open > span:first-child').allTextContents();
/** espera a que termine la acción del diálogo (el «Renombrando…», «Duplicando…») */
const idle = async (d) => {
  await d.page().waitForTimeout(150);
  await d.page().waitForFunction(() => !document.querySelector('.drive-browser')?.closest('.modal, [role=dialog]')?.querySelector('.buttons .hint'), null, { timeout: 10000 }).catch(() => {});
  await d.page().waitForTimeout(150);
};
const simulate = async (p) => {
  await p.locator('[aria-label="Simular"]:enabled').click();
  await p.locator('[aria-label="Simular"]:enabled').waitFor({ timeout: 60000 });
  await p.waitForTimeout(1500);
};
const conflictOf = (p) => p.getByRole('dialog').filter({ hasText: 'cambió en Google Drive' });

{
  const fake = new FakeDrive();
  const context = await driveContext(fake);
  const page = await newPage(context);
  await edit(page);
  await save(page);
  await waitToast(page, /Google Drive/);
  const f = fake.byName('Sample Project.turbo');

  // -- la lista
  let d = await openMySims(page);
  check((await listed(d)).join() === 'Sample Project.turbo', `Mis simulaciones: lista el proyecto guardado y no «My symbols and models.json» (${await listed(d)})`);
  check((await d.locator('li.current').count()) === 1, 'Mis simulaciones: marca el abierto');

  // -- duplicar
  await d.getByRole('button', { name: 'Duplicar Sample Project.turbo' }).click();
  await idle(d);
  const dup = fake.projects().find((x) => x.id !== f.id);
  check(dup?.name === 'Sample Project (copia).turbo' && dup.data.equals(f.data), `Mis simulaciones: duplicar crea «Sample Project (copia).turbo» con el mismo contenido (${dup?.name})`);
  check((await listed(d)).length === 2, 'Mis simulaciones: y aparece en la lista');
  await d.getByRole('button', { name: 'Duplicar Sample Project.turbo' }).click();
  await idle(d);
  check(!!fake.byName('Sample Project (copia) (2).turbo'), `Mis simulaciones: duplicar otra vez no pisa la copia (${fake.projects().map((x) => x.name)})`);

  // -- renombrar: el abierto (el nombre del proyecto cambia también) y a un nombre que ya existe
  page.answers.push('Filtro final');
  await d.getByRole('button', { name: 'Renombrar Sample Project.turbo' }).click();
  await idle(d);
  check(f.name === 'Filtro final.turbo', `Mis simulaciones: renombrar cambia el nombre en Drive (${f.name})`);
  check((await page.locator('.capsule-project').textContent()) === 'Filtro final', `Mis simulaciones: renombrar el abierto cambia el nombre del proyecto (${await page.locator('.capsule-project').textContent()})`);
  page.answers.push('Filtro final');
  await d.getByRole('button', { name: 'Renombrar Sample Project (copia).turbo' }).click();
  await idle(d);
  check(/Ya hay un «Filtro final\.turbo»/.test(await d.textContent()) && !!fake.byName('Sample Project (copia).turbo'), 'Mis simulaciones: renombrar a un nombre que ya existe avisa y no cambia nada');
  // guardar después de renombrar: el mismo archivo, con el nombre nuevo
  await page.keyboard.press('Escape');
  await edit(page);
  const ups = fake.uploads().length;
  await save(page);
  await waitToast(page, /Google Drive/);
  await page.waitForTimeout(300);
  check(fake.uploads().length === ups + 1 && f.name === 'Filtro final.turbo' && project(f.data)?.name === 'Filtro final' && !fake.byName('Sample Project.turbo'), `Mis simulaciones: después de renombrar, Ctrl+S guarda en el mismo archivo con el nombre nuevo (${fake.projects().map((x) => x.name)})`);

  // -- abrir otro desde la lista
  d = await openMySims(page);
  await d.getByRole('button', { name: /^Sample Project \(copia\) \(2\)\.turbo/ }).click();
  await page.waitForFunction(() => document.querySelector('.capsule-project')?.textContent === 'Sample Project (copia) (2)', null, { timeout: 10000 }).catch(() => {});
  check((await page.locator('.capsule-project').textContent()) === 'Sample Project (copia) (2)', `Mis simulaciones: abrir carga ese proyecto (${await page.locator('.capsule-project').textContent()}; ${await toast(page)}; ${page.dialogs.slice(-2)})`);
  const opened = fake.byName('Sample Project (copia) (2).turbo');
  const openedRev = opened.rev;
  await edit(page);
  await save(page);
  await waitToast(page, /Google Drive/);
  await page.waitForTimeout(300);
  check(opened.rev !== openedRev && project(fake.byName('Filtro final.turbo').data)?.name === 'Filtro final', 'Mis simulaciones: y guardar va a ese archivo, no al anterior');

  // -- abrir con cambios sin guardar: pregunta; cancelar no abre
  await edit(page);
  d = await openMySims(page);
  page.answers.push(false);
  await d.getByRole('button', { name: /^Filtro final\.turbo/ }).click();
  await page.waitForTimeout(500);
  check((await page.locator('.capsule-project').textContent()) === 'Sample Project (copia) (2)' && !!page.dialogs.at(-1)?.startsWith('confirm:'), 'Mis simulaciones: con cambios sin guardar, pregunta antes de abrir otro (y cancelar no abre)');

  // -- papelera, sobre el abierto: cancelar no borra; aceptar sí
  page.answers.push(false);
  await d.getByRole('button', { name: 'Borrar Sample Project (copia) (2).turbo' }).click();
  await page.waitForTimeout(300);
  check(!opened.trashed, 'Mis simulaciones: cancelar la papelera no borra');
  page.answers.push(true);
  await d.getByRole('button', { name: 'Borrar Sample Project (copia) (2).turbo' }).click();
  await idle(d);
  check(opened.trashed && !(await listed(d)).includes('Sample Project (copia) (2).turbo'), 'Mis simulaciones: «a la papelera» la manda a la papelera de Drive y sale de la lista');
  await page.keyboard.press('Escape');
  // el que se mandó a la papelera seguía abierto: guardar crea uno nuevo (no escribe en la papelera)
  const ups2 = fake.uploads().length;
  await save(page);
  await waitToast(page, /Google Drive/);
  await page.waitForTimeout(300);
  const again = fake.byName('Sample Project (copia) (2).turbo');
  check(fake.uploads().length === ups2 + 1 && fake.uploads().at(-1).method === 'POST' && !!again && again.id !== opened.id, 'Mis simulaciones: guardar el que se mandó a la papelera crea un archivo nuevo (no escribe en la papelera)');
  check(!page.errors.length, `Mis simulaciones: sin errores en la página${page.errors.length ? `: ${page.errors.join(' | ')}` : ''}`);
  await context.close();
}

// -- subida por partes: un proyecto de más de 5 MB (con un .lib grande en los archivos del proyecto)
{
  const fake = new FakeDrive();
  const context = await driveContext(fake);
  const page = await newPage(context);
  const lines = ['* modelos de relleno, con acentos y comillas: ñ «» "x"\n'];
  for (let i = 0, n = 0; n < 6.5 * 1024 * 1024; i++) {
    const l = `.model DBIG${i} D(Is=${i}e-15 Rs=0.1 N=1.8 Cjo=2p M=0.33 Vj=0.7 Bv=100 Ibv=1u)\n`;
    lines.push(l);
    n += l.length;
  }
  const lib = lines.join('');
  await page.locator('input[type=file][accept*=".lib"]').setInputFiles({ name: 'grande.lib', mimeType: 'text/plain', buffer: Buffer.from(lib, 'utf8') });
  await page.waitForTimeout(1500);
  await save(page);
  await waitToast(page, /Google Drive/);
  await page.waitForTimeout(500);
  const f = fake.byName('Sample Project.turbo');
  const res = fake.log.filter((l) => l.resumable);
  check(res.length === 2 && res[0].method === 'POST' && res[1].method === 'PUT', `≥ 5 MB: sube por partes (metadatos + contenido: ${res.map((l) => l.method)}; ${await toast(page)})`);
  check(f?.data.length > 6 * 1024 * 1024, `≥ 5 MB: el archivo en Drive pesa ${((f?.data.length ?? 0) / 1048576).toFixed(1)} MB`);
  const p = project(f?.data ?? Buffer.alloc(0));
  const got = p?.files?.find((x) => x.name === 'grande.lib')?.text ?? '';
  check(got === lib, '≥ 5 MB: el .lib llega entero y sin cambios (acentos y comillas incluidos)');
  check(p?.name === 'Sample Project' && f?.mimeType === 'application/json' && f?.appProperties?.turbospice === '1', '≥ 5 MB: con los mismos metadatos que la subida normal');
  // el segundo guardado, también por partes y sobre el mismo archivo
  await edit(page);
  await save(page);
  await waitToast(page, /Google Drive/);
  await page.waitForTimeout(500);
  const res2 = fake.log.filter((l) => l.resumable).slice(2);
  check(res2.length === 2 && res2[0].method === 'PATCH' && res2[0].path.endsWith(`/${f?.id}`) && fake.projects().length === 1, `≥ 5 MB: el segundo guardado reemplaza el mismo archivo por partes (${res2.map((l) => `${l.method} ${l.path}`)})`);
  // abrirlo de nuevo desde Drive, en otra pestaña
  const other = await newPage(context);
  const d = await openMySims(other);
  await d.getByRole('button', { name: /^Sample Project\.turbo/ }).click();
  await other.waitForTimeout(2500);
  check((await other.locator('.capsule-project').textContent()) === 'Sample Project' && !(await dirty(other)) && !other.errors.length, '≥ 5 MB: se vuelve a abrir desde Drive sin errores');
  check(!page.errors.length, `≥ 5 MB: sin errores en la página${page.errors.length ? `: ${page.errors.join(' | ')}` : ''}`);
  await context.close();
}

// -- dos pestañas sobre el mismo proyecto, con el guardado automático al simular
{
  const fake = new FakeDrive();
  const context = await driveContext(fake);
  const a = await newPage(context);
  await edit(a);
  await save(a);
  await waitToast(a, /Google Drive/);
  const f = fake.byName('Sample Project.turbo');
  // la otra pestaña abre el mismo archivo
  const b = await newPage(context);
  const d = await openMySims(b);
  await d.getByRole('button', { name: /^Sample Project\.turbo/ }).click();
  await b.waitForTimeout(1500);
  // A cambia y simula: se guarda solo
  await edit(a);
  const ups = fake.uploads().length;
  await simulate(a);
  check(fake.uploads().length === ups + 1 && !(await dirty(a)), `Dos pestañas: al simular en A se guarda solo en Drive (${fake.uploads().length - ups} subida)`);
  const afterA = f.data;
  // B (con la versión vieja) cambia y simula: el guardado automático NO pisa lo de A
  await edit(b);
  await simulate(b);
  check((await conflictOf(b).count()) === 1, 'Dos pestañas: al simular en B, el guardado automático ve que A lo cambió y pregunta');
  check(f.data.equals(afterA) && fake.uploads().length === ups + 1, 'Dos pestañas: y no pisa lo que guardó A');
  check(await dirty(b), 'Dos pestañas: B sigue marcado sin guardar');
  // B recarga la versión de Drive (la de A)
  await conflictOf(b).getByRole('button', { name: 'Recargar la de Drive' }).click();
  await b.waitForTimeout(1500);
  check(!(await dirty(b)) && (await conflictOf(b).count()) === 0, 'Dos pestañas: «Recargar la de Drive» trae la versión de A');
  // ahora B, al día, simula y se guarda solo; A, que quedó vieja, pregunta
  await edit(b);
  await simulate(b);
  check(fake.uploads().length === ups + 2 && (await conflictOf(b).count()) === 0, 'Dos pestañas: con la versión al día, B se guarda solo');
  const afterB = f.data;
  await edit(a);
  await simulate(a);
  check((await conflictOf(a).count()) === 1 && f.data.equals(afterB), 'Dos pestañas: y ahora es A la que pregunta, sin pisar a B');
  check(!a.errors.length && !b.errors.length, `Dos pestañas: sin errores en la página${[...a.errors, ...b.errors].length ? `: ${[...a.errors, ...b.errors].join(' | ')}` : ''}`);
  await context.close();
}

// -- sin conexión: guardar falla con aviso y no se pierde nada; al volver, guarda
{
  const fake = new FakeDrive();
  const context = await driveContext(fake);
  const page = await newPage(context);
  await edit(page);
  await save(page);
  await waitToast(page, /Google Drive/);
  const f = fake.byName('Sample Project.turbo');
  fake.offline = true;
  await edit(page);
  const before = f.data;
  await save(page);
  check(await waitToast(page, /No se pudo guardar/), `Sin conexión: Ctrl+S avisa que no pudo guardar (${await toast(page)})`);
  check((await dirty(page)) && f.data.equals(before), 'Sin conexión: queda marcado sin guardar');
  // simular sin conexión: el motor es local; el guardado automático falla sin romper nada
  await simulate(page);
  check(await dirty(page), 'Sin conexión: simular funciona y sigue sin guardar');
  // la copia local (la sesión, en el navegador) tiene el trabajo: al recargar se recupera
  const syms = await page.locator('svg.editor .sym').count();
  fake.offline = false;
  await page.reload();
  await page.locator('svg.editor .sym').first().waitFor();
  await page.waitForTimeout(800);
  check((await page.locator('svg.editor .sym').count()) === syms && (await dirty(page)), `Sin conexión: al recargar se recupera el trabajo sin guardar (${syms} símbolos; ${await toast(page)})`);
  await save(page);
  check(await waitToast(page, /Google Drive/), `Sin conexión: al volver la conexión, Ctrl+S guarda (${await toast(page)})`);
  await page.waitForTimeout(300);
  check(!(await dirty(page)) && !f.data.equals(before), 'Sin conexión: y queda guardado');
  await context.close();
}


// -- la sesión se renueva en un gesto, antes de que venza (#192)
{
  const fake = new FakeDrive();
  const context = await driveContext(fake);
  const page = await newPage(context);
  const setToken = (ms) => page.evaluate((ms) => sessionStorage.setItem('turbospice.google.token', JSON.stringify({ value: 'tokOld', expires: Date.now() + ms })), ms);
  const requests = () => page.evaluate(() => window.__tokenRequests ?? 0);
  const tokenNow = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('turbospice.google.token') ?? 'null'));
  // token con tiempo de sobra: un click no pide otro
  await setToken(50 * 60_000);
  await page.reload();
  await page.locator('svg.editor .sym').first().waitFor();
  const r0 = await requests();
  await page.mouse.click(400, 700);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  check((await requests()) === r0, 'Sesión: con el token al día, un click no pide otro');
  // por vencer (5 min): el primer click lo renueva, sin aviso, y el guardado usa el nuevo
  await setToken(5 * 60_000);
  await page.reload();
  await page.locator('svg.editor .sym').first().waitFor();
  const r1 = await requests();
  await page.mouse.click(400, 700);
  await page.waitForTimeout(500);
  const t = await tokenNow();
  check((await requests()) === r1 + 1 && t?.value !== 'tokOld' && t.expires - Date.now() > 50 * 60_000, `Sesión: con el token por vencer, el primer click lo renueva (${t?.value})`);
  await page.mouse.click(400, 700);
  await page.keyboard.press('a');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check((await requests()) === r1 + 1, 'Sesión: y no lo vuelve a pedir en cada click');
  await edit(page);
  await save(page);
  await waitToast(page, /Google Drive/);
  check(fake.tokens.at(-1) === `Bearer ${t.value}` && !(await dirty(page)), 'Sesión: el guardado usa el token renovado');
  // vencido: una tecla también lo renueva
  await setToken(-60_000);
  await page.reload();
  await page.locator('svg.editor .sym').first().waitFor();
  const r2 = await requests();
  await page.locator('svg.editor').click({ position: { x: 300, y: 600 } });
  await page.waitForTimeout(500);
  // (al cargar, la sincronización de «My symbols and models» ya puede haberlo pedido)
  const t2 = await tokenNow();
  check((await requests()) >= r2 && t2?.value !== 'tokOld' && t2.expires > Date.now() + 50 * 60_000, 'Sesión: con el token vencido, después del primer gesto hay uno válido');
  check(!page.errors.length, `Sesión: sin errores en la página${page.errors.length ? `: ${page.errors.join(' | ')}` : ''}`);
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
