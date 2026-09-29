import { z } from 'zod';

export type CodigoError =
  | 'NO_AUTENTICADO'
  | 'SIN_PERMISO'
  | 'VALIDACION_FALLIDA'
  | 'SOLICITUD_INVALIDA'
  | 'NO_ENCONTRADO'
  | 'DEMASIADAS_PETICIONES'
  | 'ERROR_INTERNO';

/** Error esperado de la API: se traduce tal cual a `{ error: { codigo, mensaje, detalles? } }`. */
export class ErrorApp extends Error {
  readonly estado: number;
  readonly codigo: CodigoError;
  readonly detalles: unknown;

  constructor(estado: number, codigo: CodigoError, mensaje: string, detalles?: unknown) {
    super(mensaje);
    this.name = 'ErrorApp';
    this.estado = estado;
    this.codigo = codigo;
    this.detalles = detalles;
  }

  /** Fastify y sus plugins leen `statusCode`. */
  get statusCode(): number {
    return this.estado;
  }
}

export const errores = {
  noAutenticado: () => new ErrorApp(401, 'NO_AUTENTICADO', 'Debes iniciar sesión para continuar.'),
  sinPermiso: () =>
    new ErrorApp(403, 'SIN_PERMISO', 'No tienes permiso para realizar esta acción.'),
  noEncontrado: (mensaje = 'El recurso solicitado no existe.') =>
    new ErrorApp(404, 'NO_ENCONTRADO', mensaje),
  demasiadasPeticiones: () =>
    new ErrorApp(
      429,
      'DEMASIADAS_PETICIONES',
      'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
    ),
};

/** Forma de todo error que devuelve la API (para declararla en el esquema de respuesta de una ruta). */
export const esquemaError = z.object({
  error: z.object({
    codigo: z.string(),
    mensaje: z.string(),
    detalles: z.unknown().optional(),
  }),
});

export type CuerpoError = z.infer<typeof esquemaError>;
