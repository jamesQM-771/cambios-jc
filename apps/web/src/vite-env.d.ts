/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Opcional: activa Sentry en la web. Sin valor, queda desactivado. */
  readonly VITE_SENTRY_DSN?: string;
}
