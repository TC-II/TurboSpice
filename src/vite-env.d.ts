/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** OAuth Client ID (aplicación web) de Google; sin él no aparece el inicio de sesión */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_API_KEY?: string;
}
