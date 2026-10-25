/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** OAuth Client ID (aplicación web) de Google; sin él no aparece el inicio de sesión */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** 'dev' en la versión de la rama dev (publicada en /TurboSpice/dev/) */
  readonly VITE_CHANNEL?: string;
}
