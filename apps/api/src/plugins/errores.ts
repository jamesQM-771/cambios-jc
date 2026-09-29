import type { FastifyInstance } from 'fastify';

import { ErrorApp, type CodigoError, type CuerpoError } from '../lib/errores.js';

import { ErrorValidacion } from './validacion-zod.js';

interface Traduccion {
  estado: number;
  cuerpo: CuerpoError;
}

const MENSAJE_INTERNO = 'Ocurrió un error inesperado. Inténtalo de nuevo.';

function estadoDe(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return undefined;
  return typeof error.statusCode === 'number' ? error.statusCode : undefined;
}

/**
 * Convierte cualquier error al formato uniforme de la API. Solo los errores propios (ErrorApp) y
 * los de validación muestran su mensaje; el resto se reduce a un texto genérico para no exponer
 * trazas, SQL ni detalles internos.
 */
export function traducirError(error: unknown): Traduccion {
  if (error instanceof ErrorApp) {
    return {
      estado: error.estado,
      cuerpo: {
        error: {
          codigo: error.codigo,
          mensaje: error.message,
          ...(error.detalles === undefined ? {} : { detalles: error.detalles }),
        },
      },
    };
  }

  if (error instanceof ErrorValidacion) {
    return {
      estado: 400,
      cuerpo: {
        error: {
          codigo: 'VALIDACION_FALLIDA',
          mensaje: error.message,
          detalles: error.problemas,
        },
      },
    };
  }

  const estado = estadoDe(error);
  if (estado !== undefined && estado >= 400 && estado < 500) {
    // Errores de Fastify o de sus plugins (JSON mal formado, tipo de contenido, cuerpo muy grande…).
    const codigo: CodigoError = estado === 404 ? 'NO_ENCONTRADO' : 'SOLICITUD_INVALIDA';
    const mensaje = estado === 404 ? 'La ruta solicitada no existe.' : 'La solicitud no es válida.';
    return { estado, cuerpo: { error: { codigo, mensaje } } };
  }

  return {
    estado: 500,
    cuerpo: { error: { codigo: 'ERROR_INTERNO', mensaje: MENSAJE_INTERNO } },
  };
}

export function instalarErrores(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const { estado, cuerpo } = traducirError(error);
    if (estado >= 500) request.log.error({ err: error }, 'Error interno');
    return reply.status(estado).send(cuerpo);
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({
      error: { codigo: 'NO_ENCONTRADO', mensaje: 'La ruta solicitada no existe.' },
    } satisfies CuerpoError),
  );
}
