import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decode } from '../../src/asc/encoding.ts';
import { badLines, parseAsc } from '../../src/asc/parse.ts';
import { serializeAsc } from '../../src/asc/serialize.ts';
import { EngineClient } from '../../src/engine/client.ts';

const FIX = join(__dirname, '..', 'fixtures', 'asc');

describe('parseAsc tolerante', () => {
  it('una línea dañada no impide abrir el resto: queda tal cual y se informa', () => {
    const text = ['Version 4', 'SHEET 1 880 680', 'WIRE 0 0 x 16', 'SYMBOL res 32 32 R45', 'SYMATTR InstName R1', 'SYMBOL cap 64 64 R0', 'SYMATTR InstName C1', 'LINE Normal 0 0 nan 3', 'TEXT 0 0 Left 2 !.tran 1m'].join('\n');
    const doc = parseAsc(text);
    expect(doc.symbols.map((s) => s.attrs.get('InstName'))).toEqual(['C1']);
    expect(doc.texts).toHaveLength(1);
    expect(badLines(doc)).toEqual(['WIRE 0 0 x 16', 'SYMBOL res 32 32 R45', 'LINE Normal 0 0 nan 3']);
    // lo que no se pudo leer vuelve al guardar (con los atributos del símbolo dañado)
    const out = serializeAsc(doc);
    for (const l of ['WIRE 0 0 x 16', 'SYMBOL res 32 32 R45', 'SYMATTR InstName R1', 'LINE Normal 0 0 nan 3']) expect(out).toContain(l);
  });
  it('un archivo sano no tiene líneas dañadas', () => {
    const f = readdirSync(FIX).find((x) => x.endsWith('.asc'))!;
    expect(badLines(parseAsc(decode(new Uint8Array(readFileSync(join(FIX, f)))).text))).toEqual([]);
  });
  it('no tira con archivos truncados o basura', () => {
    const text = decode(new Uint8Array(readFileSync(join(FIX, readdirSync(FIX).find((x) => x.endsWith('.asc'))!)))).text;
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 200; i++) {
      const cut = text.slice(0, Math.floor(rnd() * text.length));
      const noisy = cut.replace(/\d/g, (d) => (rnd() < 0.05 ? 'x' : d));
      expect(() => parseAsc(noisy)).not.toThrow();
    }
    expect(() => parseAsc('\u0000\u0001SYMBOL\nWINDOW\nSYMATTR\nPATH Normal 99 1 2')).not.toThrow();
  });
});

// Worker de mentira: responde como el del motor según `behavior`
type Behavior = 'ok' | 'fail-init';
let behavior: Behavior = 'ok';
const workers: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: { message: string }) => void) | null = null;
  terminated = false;
  hold = false;
  constructor() {
    workers.push(this);
  }
  postMessage(msg: { id: number; type: string }) {
    const reply = (data: unknown) => queueMicrotask(() => !this.terminated && this.onmessage?.({ data }));
    if (msg.type === 'init') return reply(behavior === 'fail-init' ? { id: msg.id, type: 'error', message: 'sin red' } : { id: msg.id, type: 'ready' });
    if (this.hold) return; // una simulación que no termina
    reply({ id: msg.id, type: 'result', ms: 1, result: { plots: [], log: [], errors: [], aborted: false } });
  }
  terminate() {
    this.terminated = true;
  }
}

describe('EngineClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    workers.length = 0;
    behavior = 'ok';
  });

  it('si la carga del motor falla, el próximo uso lo vuelve a intentar', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    behavior = 'fail-init';
    const e = new EngineClient();
    await expect(e.ready).rejects.toThrow('sin red');
    behavior = 'ok';
    await expect(e.simulate('* x')).resolves.toMatchObject({ ms: 1 });
    expect(workers).toHaveLength(2);
    expect(workers[0].terminated).toBe(true);
  });

  it('abortar rechaza todo lo pendiente del Worker viejo y levanta otro', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const e = new EngineClient();
    await e.ready;
    workers[0].hold = true;
    const a = e.simulate('* a');
    const b = e.simulate('* b');
    await new Promise((r) => setTimeout(r, 0));
    e.abort();
    await expect(a).rejects.toThrow('Simulación abortada');
    await expect(b).rejects.toThrow('Simulación abortada');
    await expect(e.simulate('* c')).resolves.toMatchObject({ ms: 1 });
  });
});
