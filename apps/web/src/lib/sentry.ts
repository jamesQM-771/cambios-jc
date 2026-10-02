import type { ErrorEvent } from '@sentry/react';

/** Solo la traza y el tipo de error: sin cuerpo, cookies, usuario ni parámetros de la dirección. */
export function limpiarEvento(evento: ErrorEvent): ErrorEvent {
  if (evento.request) {
    evento.request = { url: evento.request.url?.split(/[?#]/)[0] };
  }
  delete evento.user;
  delete evento.extra;
  // Las migas de pan (consola, clics, peticiones) pueden traer texto de la pantalla: no se envían.
  delete evento.breadcrumbs;
  return evento;
}

/**
 * Activa Sentry solo si hay `VITE_SENTRY_DSN`. La librería se descarga solo en ese caso, así que
 * sin DSN no pesa nada ni envía nada. Devuelve si se intentó activar.
 */
export function iniciarSentry(dsn: string | undefined, entorno: string): boolean {
  if (!dsn) return false;
  void import('@sentry/react').then((Sentry) => {
    Sentry.init({
      dsn,
      environment: entorno,
      // Esta versión recoge todo por defecto: aquí se cierra explícitamente (además de limpiarEvento).
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
      },
      tracesSampleRate: 0,
      integrations: (porDefecto) =>
        porDefecto.filter((integracion) => integracion.name !== 'Breadcrumbs'),
      beforeSend: limpiarEvento,
    });
  });
  return true;
}
