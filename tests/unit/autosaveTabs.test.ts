// Autoguardado con una sesión por pestaña: qué sesión restaura una pestaña que se abre
import { describe, expect, it } from 'vitest';
import { claimSession } from '../../src/schematic/autosave.ts';

const s = (time: number, dirty = false) => ({ time, dirty });

describe('claimSession', () => {
  it('al recargar, la pestaña restaura la suya aunque haya otras', () => {
    const c = claimSession(
      'project:a',
      new Map([
        ['project:a', s(1)],
        ['project:b', s(5, true)],
      ]),
      new Set(),
    );
    expect(c).toEqual({ take: 'project:a', toRecent: [], drop: [], elsewhere: false });
  });

  it('una pestaña nueva no toma la sesión de otra pestaña abierta', () => {
    const c = claimSession('project:new', new Map([['project:b', s(5, true)]]), new Set(['b']));
    expect(c).toEqual({ take: undefined, toRecent: [], drop: [], elsewhere: true });
  });

  it('una pestaña nueva toma la más reciente de las cerradas; las otras sin guardar van a recientes', () => {
    const sessions = new Map([
      ['project:old', s(1, true)],
      ['project:clean', s(2)],
      ['project:last', s(3, true)],
      ['project:live', s(9, true)],
    ]);
    const c = claimSession('project:new', sessions, new Set(['live']));
    expect(c.take).toBe('project:last');
    expect(c.toRecent).toEqual(['project:old']);
    expect(c.drop.sort()).toEqual(['project:clean', 'project:last', 'project:old']);
    expect(c.elsewhere).toBe(false);
  });

  it('la sesión única de versiones anteriores se restaura (migración)', () => {
    const c = claimSession('project:new', new Map([['project', s(4, true)]]), new Set());
    expect(c.take).toBe('project');
    expect(c.drop).toEqual(['project']);
  });

  it('sin Web Locks (no se sabe qué pestañas viven) se comporta como antes: la más reciente', () => {
    const c = claimSession(
      'project:new',
      new Map([
        ['project:a', s(1)],
        ['project:b', s(2)],
      ]),
      null,
    );
    expect(c.take).toBe('project:b');
  });

  it('sin nada guardado, un proyecto nuevo sin aviso', () => {
    expect(claimSession('project:new', new Map(), new Set())).toEqual({ take: undefined, toRecent: [], drop: [], elsewhere: false });
  });
});
