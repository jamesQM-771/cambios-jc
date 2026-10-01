import { z } from 'zod';

export type CodigoError =
  | 'NO_AUTENTICADO'
  | 'SESION_INCOMPLETA'
  | 'CREDENCIALES_INVALIDAS'
  | 'CODIGO_INVALIDO'
  | 'CUENTA_BLOQUEADA'
  | 'ESTADO_INVALIDO'
  | 'LOGIN_EN_USO'
  | 'ARCHIVO_INVALIDO'
  | 'ARCHIVO_DEMASIADO_GRANDE'
  | 'ULTIMO_ADMINISTRADOR'
  | 'NO_PUEDES_DESACTIVARTE'
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
  sesionIncompleta: () =>
    new ErrorApp(401, 'SESION_INCOMPLETA', 'Debes completar la verificación en dos pasos.'),
  credencialesInvalidas: () =>
    new ErrorApp(401, 'CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos.'),
  codigoInvalido: () => new ErrorApp(401, 'CODIGO_INVALIDO', 'El código no es correcto.'),
  cuentaBloqueada: (minutosRestantes: number) =>
    new ErrorApp(
      403,
      'CUENTA_BLOQUEADA',
      `Cuenta bloqueada temporalmente. Inténtalo de nuevo en ${String(minutosRestantes)} minuto(s).`,
      { minutosRestantes },
    ),
  estadoInvalido: (mensaje: string) => new ErrorApp(409, 'ESTADO_INVALIDO', mensaje),
  loginEnUso: () =>
    new ErrorApp(409, 'LOGIN_EN_USO', 'Ya existe un usuario con ese nombre de usuario.', [
      { campo: 'login', mensaje: 'Ya está en uso.' },
    ]),
  ultimoAdministrador: () =>
    new ErrorApp(
      409,
      'ULTIMO_ADMINISTRADOR',
      'No se puede dejar el sistema sin administradores activos. Crea o activa otro administrador primero.',
    ),
  noPuedesDesactivarte: () =>
    new ErrorApp(409, 'NO_PUEDES_DESACTIVARTE', 'No puedes desactivar tu propio usuario.'),
  archivoInvalido: (mensaje: string) => new ErrorApp(400, 'ARCHIVO_INVALIDO', mensaje),
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
