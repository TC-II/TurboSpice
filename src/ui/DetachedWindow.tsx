// Una ventana del navegador aparte (p. ej. los resultados en el segundo monitor). No es otra app:
// se dibuja con un portal desde ésta, así comparte todo el estado sin sincronizar nada. Copia los
// estilos y el tema, y reenvía a la ventana principal lo que sólo se escucha ahí (los atajos de
// teclado y el soltar del arrastre de uPlot, que escucha en el `document` donde se cargó).
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { HostWindow } from './hostWindow.ts';
import { useEvent } from './useEvent.ts';
import { setPixelRatioOf } from './pixelRatio.ts';

/** Abre (o trae al frente) la ventana; tiene que llamarse desde un clic (bloqueador de popups) */
export function openDetached(name: string, w = 1100, h = 720): Window | null {
  return window.open('', name, `popup,width=${w},height=${h}`);
}

// (sin instanceof: los elementos de la otra ventana son de otro `window`)
const isTyping = (e: Event) => {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || !!el.isContentEditable);
};

export function DetachedWindow({
  win,
  title,
  className,
  onKey,
  onClose,
  children,
}: {
  win: Window;
  title: string;
  /** clases del contenedor (que el CSS de la ventana principal valga igual) */
  className?: string;
  /** keydown/keyup que no atendió la ventana aparte (para los atajos de la principal) */
  onKey?(e: KeyboardEvent): void;
  /** la cerraron (o se recargó) */
  onClose(): void;
  children: ReactNode;
}) {
  const [box, setBox] = useState<HTMLElement | null>(null);
  const closed = useEvent(onClose);
  const key = useEvent((e: KeyboardEvent) => {
    if (onKey && !e.defaultPrevented && !isTyping(e)) onKey(e);
  });

  useEffect(() => {
    const d = win.document;
    const copy = (n: Node) => {
      if (!(n instanceof HTMLStyleElement || (n instanceof HTMLLinkElement && n.rel === 'stylesheet'))) return;
      const c = n.cloneNode(true) as HTMLElement;
      if (n instanceof HTMLLinkElement) (c as HTMLLinkElement).href = n.href;
      d.head.appendChild(c);
    };
    d.head.replaceChildren();
    const meta = d.createElement('meta');
    meta.setAttribute('charset', 'utf-8');
    d.head.appendChild(meta);
    document.head.childNodes.forEach(copy);
    // los estilos que agrega después la app (chunks perezosos, recarga de Vite)
    const heads = new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach(copy)));
    heads.observe(document.head, { childList: true });
    // el tema y el idioma
    const sync = () => {
      for (const a of ['data-theme', 'lang']) {
        const v = document.documentElement.getAttribute(a);
        if (v === null) d.documentElement.removeAttribute(a);
        else d.documentElement.setAttribute(a, v);
      }
    };
    sync();
    const attrs = new MutationObserver(sync);
    attrs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'lang'] });

    const root = d.createElement('div');
    root.id = 'root';
    d.body.replaceChildren(root);
    setBox(root);

    // uPlot termina el arrastre con el mouseup de su `document` y recalcula posiciones con el
    // resize/scroll de su `window`, que son los de la principal
    const fwdMouse = (e: MouseEvent) => document.dispatchEvent(new MouseEvent(e.type, e));
    const fwdWin = (e: Event) => window.dispatchEvent(new Event(e.type));
    win.addEventListener('mouseup', fwdMouse);
    win.addEventListener('resize', fwdWin);
    win.addEventListener('scroll', fwdWin, true);
    // los gráficos, con la escala de píxeles de esta ventana (puede estar en otro monitor); al
    // pasarla de monitor cambia
    let res: MediaQueryList | null = null;
    const ratio = () => {
      setPixelRatioOf(win);
      res?.removeEventListener('change', ratio);
      res = win.matchMedia(`(resolution: ${win.devicePixelRatio}dppx)`);
      res.addEventListener('change', ratio);
    };
    ratio();
    win.addEventListener('pagehide', closed);
    // los atajos (sin el foco en un campo) los atiende la principal
    win.addEventListener('keydown', key);
    win.addEventListener('keyup', key);
    // si se cierra o recarga la principal, ésta no tiene sentido sola
    const closeWin = () => win.close();
    window.addEventListener('pagehide', closeWin);
    return () => {
      heads.disconnect();
      attrs.disconnect();
      win.removeEventListener('mouseup', fwdMouse);
      win.removeEventListener('resize', fwdWin);
      win.removeEventListener('scroll', fwdWin, true);
      win.removeEventListener('pagehide', closed);
      res?.removeEventListener('change', ratio);
      setPixelRatioOf(null);
      win.removeEventListener('keydown', key);
      win.removeEventListener('keyup', key);
      window.removeEventListener('pagehide', closeWin);
      setBox(null);
    };
  }, [win, closed, key]);

  useEffect(() => {
    win.document.title = title;
  }, [win, title]);

  if (!box) return null;
  return createPortal(
    <HostWindow.Provider value={win}>
      <div className={className}>{children}</div>
    </HostWindow.Provider>,
    box,
  );
}
