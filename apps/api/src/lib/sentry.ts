import * as Sentry from '@sentry/node';
import type { ErrorEvent, NodeOptions } from '@sentry/node';

import { enmascararTexto } from './enmascarar-logs.js';

/**
 * Deja en el evento solo lo necesario para diagnosticar: la traza y el tipo de error. Se quitan
 * cuerpo, cookies, cabeceras, parámetros de la consulta, usuario e IP (CLAUDE.md §7), y se
 * enmascara cualquier cuenta bancaria escrita en los mensajes.
 */
export function limpiarEvento(evento: ErrorEvent): ErrorEvent {
  if (evento.request) {
    evento.request = { method: evento.request.method, url: evento.request.url?.split('?')[0] };
  }
  delete evento.user;
  delete evento.extra;
  for (const excepcion of evento.exception?.values ?? []) {
    for (const marco of excepcion.stacktrace?.frames ?? []) {
      delete marco.vars;
      delete marco.pre_context;
      delete marco.context_line;
      delete marco.post_context;
    }
  }
  delete evento.server_name;
  if (evento.message) evento.message = enmascararTexto(evento.message);
  for (const excepcion of evento.exception?.values ?? []) {
    if (excepcion.value) excepcion.value = enmascararTexto(excepcion.value);
  }
  for (const migaja of evento.breadcrumbs ?? []) {
    delete migaja.data;
    if (migaja.message) migaja.message = enmascararTexto(migaja.message);
  }
  return evento;
}

/** Integraciones que copian a Sentry valores del programa (variables locales, código, consola). */
const INTEGRACIONES_PROHIBIDAS = new Set([
  'LocalVariables',
  'LocalVariablesAsync',
  'ContextLines',
  'Console',
]);

/** Opciones de Sentry (separadas para poder probarlas con un transporte falso). */
export function opcionesSentry(dsn: string, entorno: string): NodeOptions {
  return {
    dsn,
    environment: entorno,
    tracesSampleRate: 0,
    // Esta versión recoge todo por defecto: aquí se cierra explícitamente (además de limpiarEvento).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    integrations: (porDefecto) =>
      porDefecto.filter((integracion) => !INTEGRACIONES_PROHIBIDAS.has(integracion.name)),
    beforeSend: limpiarEvento,
  };
}

/** Activa Sentry solo si hay DSN. Sin DSN no se carga nada ni se envía nada. Devuelve si quedó activo. */
export function iniciarSentry(dsn: string | undefined, entorno: string): boolean {
  if (!dsn) return false;
  Sentry.init(opcionesSentry(dsn, entorno));
  return true;
}

/** No hace nada si Sentry no está activo, así que se puede llamar siempre. */
export function capturarError(error: unknown): void {
  Sentry.captureException(error);
}
