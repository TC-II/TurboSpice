// Un error al dibujar una parte de la interfaz (un gráfico con datos raros, un visor que no se
// pudo bajar sin red) no debe dejar la página en blanco: se muestra el error en su lugar.
import { Component, type ReactNode } from 'react';
import { t } from '../i18n/i18n.ts';

interface Props {
  children: ReactNode;
  /** 'app': la página entera (con Recargar); 'panel': sólo esa parte (con Reintentar) */
  scope?: 'app' | 'panel';
  /** al cambiar alguno (otra simulación, otra pestaña) se vuelve a intentar */
  resetKeys?: unknown[];
}

interface State {
  error: Error | null;
  keys: unknown[];
}

const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, keys: this.props.resetKeys ?? [] };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    const keys = props.resetKeys ?? [];
    return same(keys, state.keys) ? null : { error: null, keys };
  }

  componentDidCatch(error: unknown): void {
    console.error(error);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.scope === 'app')
      return (
        <div className="crash crash-app" role="alert">
          <h2>{t('TurboSpice ran into an unexpected error')}</h2>
          <pre>{error.message}</pre>
          <p>{t('Your work is autosaved in this browser: reloading the page brings it back.')}</p>
          <button className="primary" onClick={() => location.reload()}>{t('Reload')}</button>
        </div>
      );
    return (
      <div className="crash" role="alert">
        <p>{t('This could not be shown: {message}', { message: error.message })}</p>
        <button onClick={() => this.setState({ error: null })}>{t('Retry')}</button>
      </div>
    );
  }
}
