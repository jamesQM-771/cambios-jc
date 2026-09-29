import { enmascararCuenta } from '@cambios-jc/shared';
import type { LoggerOptions } from 'pino';

/** Campos que nunca se escriben en los logs (CLAUDE.md §7). */
const CLAVES_SENSIBLES = [
  'contrasena',
  'contrasenaActual',
  'contrasenaNueva',
  'hashContrasena',
  'secreto2fa',
  'codigo2fa',
  'token',
  'cedula',
  'numeroCuenta',
  'cuenta',
];

const RUTAS_OCULTAS = [
  ...CLAVES_SENSIBLES,
  ...CLAVES_SENSIBLES.map((clave) => `*.${clave}`),
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

// Cuenta bancaria venezolana escrita en cualquier parte de un texto: 20 dígitos, con o sin espacios/guiones.
const PATRON_CUENTA = /(?<!\d)\d{4}(?:[ -]?\d{4}){4}(?!\d)/g;

/** Enmascara cualquier cuenta de 20 dígitos que aparezca dentro de un texto. */
export function enmascararTexto(texto: string): string {
  return texto.replace(PATRON_CUENTA, (coincidencia) =>
    enmascararCuenta(coincidencia.replace(/\D/g, '')),
  );
}

const PROFUNDIDAD_MAXIMA = 6;

function esObjetoSimple(valor: object): boolean {
  const prototipo: unknown = Object.getPrototypeOf(valor);
  return prototipo === Object.prototype || prototipo === null;
}

/**
 * Aplica `enmascararTexto` a todos los textos de un valor (objetos simples y listas incluidos).
 * Las instancias de clases (peticiones, errores, fechas) se dejan tal cual: sus serializadores
 * se encargan de ellas.
 */
export function enmascararValor(valor: unknown, profundidad = 0): unknown {
  if (typeof valor === 'string') return enmascararTexto(valor);
  if (profundidad >= PROFUNDIDAD_MAXIMA || valor === null || typeof valor !== 'object')
    return valor;
  if (Array.isArray(valor)) {
    return valor.map((elemento) => enmascararValor(elemento, profundidad + 1));
  }
  if (!esObjetoSimple(valor)) return valor;
  return Object.fromEntries(
    Object.entries(valor).map(([clave, elemento]) => [
      clave,
      enmascararValor(elemento, profundidad + 1),
    ]),
  );
}

interface PeticionParaLog {
  method: string;
  url: string;
  host?: string;
  ip?: string;
  socket?: { remotePort?: number };
}

/** Opciones del logger de Fastify (pino) con los datos sensibles ocultos. */
export function opcionesLogger(nivel: string): LoggerOptions {
  return {
    level: nivel,
    redact: { paths: RUTAS_OCULTAS, censor: '[OCULTO]' },
    formatters: {
      log: (objeto) => enmascararValor(objeto) as Record<string, unknown>,
    },
    serializers: {
      // La URL puede traer datos en la query (?cuenta=...): se enmascara antes de escribirla.
      req: (peticion: PeticionParaLog) => ({
        method: peticion.method,
        url: enmascararTexto(peticion.url),
        host: peticion.host,
        remoteAddress: peticion.ip,
        remotePort: peticion.socket?.remotePort,
      }),
      err: (error: Error) => ({
        type: error.name,
        message: enmascararTexto(error.message),
        stack: enmascararTexto(error.stack ?? ''),
      }),
    },
    hooks: {
      logMethod(argumentos, metodo) {
        // pino recibe (objeto?, mensaje?, ...): se enmascaran los textos de mensaje.
        const enmascarados = argumentos.map((argumento) =>
          typeof argumento === 'string' ? enmascararTexto(argumento) : argumento,
        ) as typeof argumentos;
        metodo.apply(this, enmascarados);
      },
    },
  };
}
