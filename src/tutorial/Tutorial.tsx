// Tutorial interactivo («Academia»): un mapa de misiones y, al jugar una, una tarjeta flotante
// con el paso actual que se cumple solo al hacer lo que pide. XP, niveles, estrellas por misión
// (menos con pistas o pasos salteados), racha y confeti. El progreso queda en este navegador y,
// con sesión de Google, en Drive (progress.ts).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { chapters, CHAPTER_XP, CLEAN_XP, levelOf, levels, practiceCircuit, starsFor, STEP_XP, type Chapter, type Mem, type Practice, type Probe } from './lessons.ts';
import { loadProgress, PROGRESS_EVENT, storeProgress, type Progress } from './progress.ts';
import { t } from '../i18n/i18n.ts';
import { Icon } from '../ui/icons.tsx';

// ── sonido (WebAudio, sin archivos) ──────────────────────────────────────
let audio: AudioContext | null = null;
function chime(notes: number[], gap = 0.09) {
  try {
    audio ??= new AudioContext();
    const t0 = audio.currentTime;
    notes.forEach((f, i) => {
      const o = audio!.createOscillator();
      const g = audio!.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      const at = t0 + i * gap;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.12, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
      o.connect(g).connect(audio!.destination);
      o.start(at);
      o.stop(at + 0.4);
    });
  } catch {
    // sin audio
  }
}
const SOUND = {
  step: [784, 1175],
  chapter: [523, 659, 784, 1047, 1319],
  level: [392, 523, 659, 784, 1047, 1319, 1568],
};

/** **negrita**, `código` y [[Tecla]] */
export function rich(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\[[^\]]+\]\])/).map((part, i) => {
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith('[[')) return <kbd key={i}>{part.slice(2, -2)}</kbd>;
    return part;
  });
}

function Stars({ n, of = 3, animate }: { n: number; of?: number; animate?: boolean }) {
  return (
    <span className={`tut-stars${animate ? ' animate' : ''}`} aria-label={t('{n} of {of} stars', { n, of })}>
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={i < n ? 'on' : ''} style={{ animationDelay: `${0.25 + i * 0.25}s` }}>
          ★
        </span>
      ))}
    </span>
  );
}

function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        dur: 1.8 + Math.random() * 1.6,
        color: ['#2f9e44', '#1c7ed6', '#e03131', '#f59f00', '#ae3ec9', '#0c8599'][i % 6],
        drift: (Math.random() - 0.5) * 240,
        spin: (Math.random() - 0.5) * 1080,
        w: 6 + Math.random() * 6,
      })),
    [],
  );
  return createPortal(
    <div className="tut-confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <span
          key={i}
          style={{ left: `${b.left}%`, background: b.color, width: b.w, height: b.w * 0.45, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, '--drift': `${b.drift}px`, '--spin': `${b.spin}deg` } as React.CSSProperties}
        />
      ))}
    </div>,
    document.body,
  );
}

/** Lo que el oscurecido no debe tapar: menús desplegados, diálogos y menús contextuales */
const OVERLAYS = '.menu-list, .modal-backdrop:not(.picking), .ctx-menu, .tree-menu, .quick-open-backdrop';

/** Anillo que late alrededor del elemento que hay que usar; el resto de la pantalla se oscurece */
function Spotlight({ find }: { find: () => Element | null }) {
  const [r, setR] = useState<{ box: DOMRect; dim: boolean } | null>(null);
  useEffect(() => {
    let raf = 0;
    let last = '';
    const tick = () => {
      const b = find()?.getBoundingClientRect() ?? null;
      const dim = !!b && !document.querySelector(OVERLAYS);
      const k = b ? `${b.left},${b.top},${b.width},${b.height},${dim}` : '';
      if (k !== last) {
        last = k;
        setR(b && { box: b, dim });
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [find]);
  if (!r) return null;
  const pad = 5;
  const { box } = r;
  return createPortal(
    <div className={`tut-spot${r.dim ? ' dim' : ''}`} aria-hidden="true" style={{ left: box.left - pad, top: box.top - pad, width: box.width + 2 * pad, height: box.height + 2 * pad }} />,
    document.body,
  );
}

type View = { kind: 'hub' } | { kind: 'intro'; ch: number } | { kind: 'play'; ch: number; step: number } | { kind: 'done'; ch: number; stars: number; xp: number; levelUp: string | null; first: boolean };

export function Tutorial({ probe, onPractice, onClose }: {
  /** foto del estado de la app */
  probe(): Probe;
  /** abre un proyecto de práctica (el actual queda en Recientes) */
  onPractice(name: string, asc: string | null): void;
  onClose(): void;
}) {
  const list = useMemo(chapters, []);
  const [prog, setProg] = useState(loadProgress);
  // (los pasos terminan en un setTimeout: leen y escriben el progreso por acá, no por el render)
  const progRef = useRef(prog);
  const save = (f: (p: Progress) => Progress) => {
    const n = f(progRef.current);
    progRef.current = n;
    storeProgress(n);
    setProg(n);
  };
  // llegó el progreso de Drive (ya unido con el de acá)
  useEffect(() => {
    const reload = () => {
      const n = loadProgress();
      progRef.current = n;
      setProg(n);
    };
    window.addEventListener(PROGRESS_EVENT, reload);
    return () => window.removeEventListener(PROGRESS_EVENT, reload);
  }, []);
  const [view, setView] = useState<View>({ kind: 'hub' });
  const [min, setMin] = useState(false);
  // lo de esta partida: pistas pedidas y pasos salteados (para las estrellas), XP ganado, racha
  const run = useRef({ hints: new Set<string>(), skipped: new Set<string>(), xp: 0, startXp: 0 });
  const [streak, setStreak] = useState(0);
  const [hint, setHint] = useState(false);
  const [success, setSuccess] = useState<{ xp: number } | null>(null);
  const mem = useRef<Mem>({});
  // (para volver a dibujar la tarjeta cuando start() deja su foto: puede volverlo manual)
  const [, setMemTick] = useState(0);

  const chapter = view.kind === 'hub' ? null : list[view.ch];
  const step = view.kind === 'play' ? chapter!.steps[view.step] : null;
  const sound = (notes: number[]) => progRef.current.sound && chime(notes);

  const begin = (ch: number, practice: Practice) => {
    const pc = practiceCircuit(practice);
    onPractice(pc.name, pc.asc);
    run.current = { hints: new Set(), skipped: new Set(), xp: 0, startXp: progRef.current.xp };
    setStreak(0);
    goStep(ch, 0);
  };
  const goStep = (ch: number, i: number) => {
    setHint(false);
    setSuccess(null);
    setMin(false);
    // la foto se toma un poco después: el proyecto de práctica recién pedido ya está cargado
    mem.current = {};
    const s = list[ch].steps[i];
    if (s.start)
      setTimeout(() => {
        mem.current = s.start!(probe());
        setMemTick((n) => n + 1);
      }, 0);
    setView({ kind: 'play', ch, step: i });
  };

  const finishChapter = (ch: number) => {
    const c = list[ch];
    const stars = starsFor(run.current.hints.size, run.current.skipped.size);
    const first = !progRef.current.ch[c.id]?.stars;
    const bonus = first ? CHAPTER_XP : 0;
    save((p) => ({ ...p, xp: p.xp + bonus, ch: { ...p.ch, [c.id]: { done: p.ch[c.id]?.done ?? [], stars: Math.max(stars, p.ch[c.id]?.stars ?? 0) } } }));
    run.current.xp += bonus;
    // (cuenta también el XP de los pasos: un nivel ganado en el medio se festeja al final)
    const after = levelOf(progRef.current.xp);
    const levelUp = levelOf(run.current.startXp).index < after.index ? after.name : null;
    sound(levelUp ? SOUND.level : SOUND.chapter);
    setView({ kind: 'done', ch, stars, xp: run.current.xp, levelUp, first });
  };

  const advance = (ch: number, i: number) => (i + 1 < list[ch].steps.length ? goStep(ch, i + 1) : finishChapter(ch));

  /** el paso se cumplió (`manual`: con «Siguiente») */
  const complete = (manual = false) => {
    if (view.kind !== 'play' || success) return;
    const c = list[view.ch];
    const s = c.steps[view.step];
    const clean = !run.current.hints.has(s.id);
    const seen = progRef.current.ch[c.id]?.done.includes(s.id);
    const xp = seen ? 0 : STEP_XP + (clean && !manual ? CLEAN_XP : 0);
    save((p) => ({ ...p, xp: p.xp + xp, ch: { ...p.ch, [c.id]: { ...p.ch[c.id], done: [...new Set([...(p.ch[c.id]?.done ?? []), s.id])] } } }));
    run.current.xp += xp;
    if (!manual) setStreak((n) => (clean ? n + 1 : 0));
    sound(SOUND.step);
    setSuccess({ xp });
    const at = view;
    setTimeout(() => advance(at.ch, at.step), manual ? 450 : 1100);
  };
  const completeRef = useRef(complete);
  completeRef.current = complete;

  // chequeo automático del paso
  useEffect(() => {
    if (!step || success) return;
    let off = false;
    const tick = () => {
      if (off) return;
      try {
        if (step.check?.(probe(), mem.current)) completeRef.current();
      } catch {
        // un estado a medio armar: se vuelve a mirar en el próximo
      }
    };
    const id = step.check ? setInterval(tick, 250) : undefined;
    const unwatch = step.watch?.(() => !off && completeRef.current());
    return () => {
      off = true;
      clearInterval(id);
      unwatch?.();
    };
  }, [step, success]); // eslint-disable-line react-hooks/exhaustive-deps

  // avance parcial del paso (se refresca con el chequeo)
  const [progressText, setProgressText] = useState<string>();
  useEffect(() => {
    if (!step?.progress) return setProgressText(undefined);
    const id = setInterval(() => {
      try {
        setProgressText(step.progress!(probe(), mem.current));
      } catch {
        /* ídem */
      }
    }, 300);
    return () => clearInterval(id);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── tarjeta arrastrable ──
  const card = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(prog.pos);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const clamp = (x: number, y: number) => {
    const el = card.current;
    const w = el?.offsetWidth ?? 340;
    const h = el?.offsetHeight ?? 200;
    return { x: Math.max(8, Math.min(window.innerWidth - w - 8, x)), y: Math.max(8, Math.min(window.innerHeight - h - 8, y)) };
  };
  const dragProps = {
    onPointerDown: (e: React.PointerEvent) => {
      if ((e.target as Element).closest('button')) return;
      const r = card.current!.getBoundingClientRect();
      drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => drag.current && setPos(clamp(e.clientX - drag.current.dx, e.clientY - drag.current.dy)),
    onPointerUp: () => {
      if (!drag.current) return;
      drag.current = null;
      save((p) => ({ ...p, pos }));
    },
  };
  useEffect(() => {
    const fix = () => setPos((p) => (p ? clamp(p.x, p.y) : p));
    window.addEventListener('resize', fix);
    return () => window.removeEventListener('resize', fix);
  }, []);
  const placed = pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined;

  const lvl = levelOf(prog.xp);
  const doneIn = (c: Chapter) => prog.ch[c.id]?.done.filter((id) => c.steps.some((s) => s.id === id)).length ?? 0;
  const nextUp = list.findIndex((c) => !prog.ch[c.id]?.stars);

  const levelBar = (
    <div className="tut-level" title={lvl.to ? t('{xp} of {to} XP for the next level', { xp: prog.xp, to: lvl.to }) : t('Top level!')}>
      <span className="tut-level-n">{lvl.index + 1}</span>
      <div className="tut-level-info">
        <span className="tut-level-name">{lvl.name}</span>
        <span className="tut-bar">
          <span style={{ width: `${Math.round(lvl.progress * 100)}%` }} />
        </span>
      </div>
      <span className="tut-xp">{prog.xp} XP</span>
    </div>
  );

  // ── mapa de misiones ──
  if (view.kind === 'hub')
    return createPortal(
      <div className="tut-hub-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className="tut-hub" role="dialog" aria-label={t('TurboSpice Academy')}>
          <header className="tut-hub-head">
            <div>
              <h2>
                <Icon name="school" /> {t('TurboSpice Academy')}
              </h2>
              <p className="tut-sub">{t('Missions to learn TurboSpice by doing. Each one takes a few minutes.')}</p>
            </div>
            <button className="icon-btn" onClick={onClose} aria-label={t('Close')} title={t('Close')}>
              <Icon name="close" />
            </button>
          </header>
          {levelBar}
          <ol className="tut-map">
            {list.map((c, i) => {
              const d = doneIn(c);
              const st = prog.ch[c.id]?.stars ?? 0;
              return (
                <li key={c.id}>
                  <button className={`tut-mission${st ? ' complete' : ''}${i === nextUp ? ' next' : ''}`} onClick={() => setView({ kind: 'intro', ch: i })}>
                    <span className="tut-mission-icon">{c.icon}</span>
                    <span className="tut-mission-text">
                      <span className="tut-mission-title">
                        {t('Mission {n}', { n: i + 1 })} · {c.title}
                      </span>
                      <span className="tut-mission-blurb">{c.blurb}</span>
                      <span className="tut-mission-meta">
                        <Stars n={st} />
                        <span className="tut-count">
                          {d}/{c.steps.length}
                        </span>
                        {st > 0 && <span className="tut-badge-chip">🏅 {c.badge}</span>}
                        {i === nextUp && <span className="tut-next-chip">{t('Next')}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <footer className="tut-hub-foot">
            <label className="tut-check">
              <input type="checkbox" checked={prog.sound} onChange={(e) => save((p) => ({ ...p, sound: e.target.checked }))} /> {t('Sounds')}
            </label>
            <span className="tut-ranks" title={levels().map((l, i) => `${i + 1}. ${l.name} (${l.xp} XP)`).join('\n')}>
              {t('Ranks')}: {levels().map((l) => l.name).join(' → ')}
            </span>
            <button
              className="link"
              onClick={() => window.confirm(t('Erase all your progress in the Academy?')) && save((p) => ({ xp: 0, ch: {}, sound: p.sound, epoch: (p.epoch ?? 0) + 1, pos: p.pos }))}
            >
              {t('Reset progress')}
            </button>
          </footer>
        </div>
      </div>,
      document.body,
    );

  const c = chapter!;
  const practiceName = practiceCircuit(c.practice).name;

  let body: ReactNode;
  if (view.kind === 'intro')
    body = (
      <>
        <div className="tut-intro-head">
          <span className="tut-big-icon">{c.icon}</span>
          <div>
            <div className="tut-kicker">{t('Mission {n}', { n: view.ch + 1 })}</div>
            <h3>{c.title}</h3>
          </div>
        </div>
        <p>{c.blurb}</p>
        <ol className="tut-checklist">
          {c.steps.map((s) => (
            <li key={s.id} className={prog.ch[c.id]?.done.includes(s.id) ? 'done' : ''}>
              {s.title}
            </li>
          ))}
        </ol>
        <p className="tut-reward">
          {t('Reward: up to {xp} XP and the «{badge}» badge', { xp: c.steps.length * (STEP_XP + CLEAN_XP) + CHAPTER_XP, badge: c.badge })}
        </p>
        <p className="tut-note">{t('It starts from scratch, in a new project: «{name}». Your current project stays in the menu, Recent.', { name: practiceName })}</p>
        <div className="tut-actions">
          <button onClick={() => setView({ kind: 'hub' })}>{t('Back')}</button>
          <button className="primary tut-go" onClick={() => begin(view.ch, c.practice)}>
            {t('Start!')}
          </button>
        </div>
      </>
    );
  else if (view.kind === 'done') {
    const next = view.ch + 1 < list.length ? view.ch + 1 : -1;
    body = (
      <div className="tut-done">
        <div className="tut-medal">{c.icon}</div>
        <h3>{t('Mission complete!')}</h3>
        <Stars n={view.stars} animate />
        <p className="tut-earned">+{view.xp} XP</p>
        {view.first && <p className="tut-badge-won">{t('New badge: 🏅 {badge}', { badge: c.badge })}</p>}
        {view.levelUp && <p className="tut-levelup">{t('Level up! You are now: {name}', { name: view.levelUp })}</p>}
        {view.stars < 3 && <p className="tut-sub">{t('Without hints or skipped steps you get 3 stars: play it again whenever you want.')}</p>}
        {levelBar}
        <div className="tut-actions">
          <button onClick={() => setView({ kind: 'hub' })}>{t('Missions')}</button>
          {next >= 0 ? (
            <button className="primary tut-go" onClick={() => setView({ kind: 'intro', ch: next })}>
              {t('Next mission')} →
            </button>
          ) : (
            <button className="primary tut-go" onClick={onClose}>
              {t('Finish')}
            </button>
          )}
        </div>
      </div>
    );
  } else {
    const s = step!;
    const i = (view as Extract<View, { kind: 'play' }>).step;
    // se cumple solo; si lo que pide ya estaba hecho al llegar, se pasa con «Siguiente»
    const auto = !!(s.check || s.watch) && !s.manual?.(mem.current);
    body = (
      <>
        <ol className="tut-dots" aria-hidden="true">
          {c.steps.map((x, k) => (
            <li key={x.id} className={k < i || (k === i && success) ? 'done' : k === i ? 'now' : ''} />
          ))}
        </ol>
        <h3 className={success ? 'tut-ok' : ''}>
          {success ? <span className="tut-check-pop">✓</span> : null}
          {s.title}
          {s.optional && <span className="tut-optional">{t('optional')}</span>}
        </h3>
        <p className="tut-body">{rich(s.body)}</p>
        {progressText && !success && <p className="tut-progress">{progressText}</p>}
        {hint && s.hint && <p className="tut-hint">💡 {rich(s.hint)}</p>}
        {success && success.xp > 0 && <span className="tut-float">+{success.xp} XP</span>}
        <div className="tut-actions">
          {s.hint && !hint && !success && (
            <button
              onClick={() => {
                run.current.hints.add(s.id);
                setStreak(0);
                setHint(true);
              }}
              title={t('A hint costs a star in this mission')}
            >
              💡 {t('Hint')}
            </button>
          )}
          {auto && !success && (
            <button
              className="link"
              onClick={() => {
                if (!s.optional) run.current.skipped.add(s.id);
                setStreak(0);
                advance(view.ch, i);
              }}
              title={s.optional ? t('Optional step: skipping it costs nothing') : t('Skipping a step costs a star in this mission')}
            >
              {t('Skip')}
            </button>
          )}
          <span className="tut-spacer" />
          {!auto && !success && (
            <button className="primary tut-go" onClick={() => complete(true)}>
              {s.next ?? t('Next')}
            </button>
          )}
          {auto && !success && <span className="tut-waiting">{t('Waiting for you…')}</span>}
        </div>
      </>
    );
  }

  const stepNo = view.kind === 'play' ? view.step + 1 : 0;
  return (
    <>
      {view.kind === 'play' && step?.target && !success && !min && <Spotlight find={step.target} />}
      {view.kind === 'done' && <Confetti />}
      {createPortal(
        <div ref={card} className={`tut-card${min ? ' min' : ''}${view.kind === 'done' ? ' celebrate' : ''}`} style={placed} role="dialog" aria-label={t('Tutorial')}>
          <header className="tut-card-head" {...dragProps}>
            <span className="tut-card-icon">{c.icon}</span>
            <span className="tut-card-title">
              {c.title}
              {stepNo > 0 && (
                <span className="tut-step-n">
                  {' '}
                  · {stepNo}/{c.steps.length}
                </span>
              )}
            </span>
            {streak >= 2 && view.kind === 'play' && (
              <span className="tut-streak" title={t('Steps in a row without hints')}>
                🔥 ×{streak}
              </span>
            )}
            <span className="tut-xp-chip">{prog.xp} XP</span>
            <button className="icon-btn" onClick={() => setMin(!min)} aria-label={min ? t('Expand') : t('Minimize')} title={min ? t('Expand') : t('Minimize')}>
              <Icon name={min ? 'caret' : 'minus'} size={14} />
            </button>
            <button className="icon-btn" onClick={() => setView({ kind: 'hub' })} aria-label={t('Missions')} title={t('Back to the missions')}>
              <Icon name="close" size={14} />
            </button>
          </header>
          {!min && <div className="tut-card-body">{body}</div>}
        </div>,
        document.body,
      )}
    </>
  );
}
