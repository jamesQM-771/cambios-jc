/**
 * Cliente de la API. Todas las peticiones van a `/api/...` (mismo origen que la web): la cookie de
 * sesión viaja sola y no hace falta CORS. En desarrollo Vite reenvía `/api` a la API; en producción
 * lo hace el servidor web.
 */

const PREFIJO_API = '/api';

/** Dirección completa de un recurso de la API (por ejemplo, la imagen del logo). */
export const urlApi = (ruta: string): string => `${PREFIJO_API}${ruta}`;

/** Error con el formato uniforme de la API: `{ error: { codigo, mensaje, detalles? } }`. */
export class ErrorApi extends Error {
  readonly estado: number;
  readonly codigo: string;
  readonly detalles: unknown;

  constructor(estado: number, codigo: string, mensaje: string, detalles?: unknown) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.estado = estado;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

const MENSAJE_GENERICO = 'Ocurrió un error inesperado. Inténtalo de nuevo.';

interface CuerpoError {
  error?: { codigo?: unknown; mensaje?: unknown; detalles?: unknown };
}

async function leerError(respuesta: Response): Promise<ErrorApi> {
  let cuerpo: unknown = null;
  try {
    cuerpo = await respuesta.json();
  } catch {
    // La respuesta no era JSON (por ejemplo, un error del proxy): se usa el mensaje genérico.
  }
  const error = (cuerpo as CuerpoError | null)?.error;
  return new ErrorApi(
    respuesta.status,
    typeof error?.codigo === 'string' ? error.codigo : 'ERROR_DESCONOCIDO',
    typeof error?.mensaje === 'string' ? error.mensaje : MENSAJE_GENERICO,
    error?.detalles,
  );
}

export type ValorConsulta = string | number | boolean | undefined;

function armarUrl(ruta: string, consulta?: Record<string, ValorConsulta>): string {
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries(consulta ?? {})) {
    if (valor !== undefined && valor !== '') parametros.set(clave, String(valor));
  }
  const texto = parametros.toString();
  return `${urlApi(ruta)}${texto ? `?${texto}` : ''}`;
}

interface OpcionesPeticion {
  cuerpo?: unknown;
  formulario?: FormData;
  consulta?: Record<string, ValorConsulta>;
}

async function pedir<T>(
  metodo: 'GET' | 'POST' | 'PATCH',
  ruta: string,
  { cuerpo, formulario, consulta }: OpcionesPeticion = {},
): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(armarUrl(ruta, consulta), {
      method: metodo,
      credentials: 'same-origin',
      ...(cuerpo === undefined ? {} : { headers: { 'content-type': 'application/json' } }),
      ...(formulario
        ? { body: formulario }
        : cuerpo === undefined
          ? {}
          : { body: JSON.stringify(cuerpo) }),
    });
  } catch {
    throw new ErrorApi(
      0,
      'SIN_CONEXION',
      'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
    );
  }
  if (!respuesta.ok) throw await leerError(respuesta);
  return (await respuesta.json()) as T;
}

export const api = {
  get: <T>(ruta: string, consulta?: Record<string, ValorConsulta>) =>
    pedir<T>('GET', ruta, consulta ? { consulta } : {}),
  post: <T>(ruta: string, cuerpo?: unknown) =>
    pedir<T>('POST', ruta, cuerpo === undefined ? {} : { cuerpo }),
  patch: <T>(ruta: string, cuerpo: unknown) => pedir<T>('PATCH', ruta, { cuerpo }),
  /** Envía un formulario con archivo (multipart); el navegador pone el tipo de contenido. */
  subir: <T>(ruta: string, formulario: FormData) => pedir<T>('POST', ruta, { formulario }),
};

/** Errores por campo (`detalles: [{ campo, mensaje }]`) como un mapa `campo → mensaje`. */
export function erroresPorCampo(error: unknown): Record<string, string> {
  if (!(error instanceof ErrorApi) || !Array.isArray(error.detalles)) return {};
  const resultado: Record<string, string> = {};
  for (const detalle of error.detalles as unknown[]) {
    if (
      typeof detalle === 'object' &&
      detalle !== null &&
      'campo' in detalle &&
      'mensaje' in detalle &&
      typeof detalle.campo === 'string' &&
      typeof detalle.mensaje === 'string'
    ) {
      resultado[detalle.campo] ??= detalle.mensaje;
    }
  }
  return resultado;
}

/** Mensaje para mostrar a una persona a partir de cualquier error. */
export function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : MENSAJE_GENERICO;
}
