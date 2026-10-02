import { resolve } from 'node:path';

import { z } from 'zod';

const esquemaConfig = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PUERTO_API: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST_API: z.string().min(1).default('127.0.0.1'),
  ORIGEN_WEB: z.url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  /** Detrás de un proxy inverso (producción) la IP real viene en X-Forwarded-For. */
  CONFIAR_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((valor) => valor === 'true'),
  /** Clave de 32 bytes en base64 para cifrar los secretos 2FA en la base de datos. */
  CLAVE_CIFRADO_2FA: z
    .string()
    .refine(
      (valor) => Buffer.from(valor, 'base64').length === 32,
      'debe ser una clave de 32 bytes en base64 (ver .env.example para generarla)',
    ),
  SESION_INACTIVIDAD_MINUTOS: z.coerce.number().int().positive().default(30),
  SESION_MAXIMA_HORAS: z.coerce.number().int().positive().default(12),
  /** Tiempo para completar el 2FA después de la contraseña; se renueva en cada paso. */
  SESION_PARCIAL_MINUTOS: z.coerce.number().int().positive().default(10),
  LOGIN_INTENTOS_MAXIMOS: z.coerce.number().int().positive().default(5),
  LOGIN_BLOQUEO_MINUTOS: z.coerce.number().int().positive().default(15),
  /** Carpeta local para el logo de la empresa; una ruta relativa se calcula desde donde se arranca la API. */
  CARPETA_SUBIDAS: z
    .string()
    .min(1)
    .default('./uploads')
    .transform((ruta) => resolve(ruta)),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_VENTANA_SEGUNDOS: z.coerce.number().int().positive().default(60),
  /** Opcional: si no se define, Sentry queda desactivado (un valor vacío del .env cuenta como no definido). */
  SENTRY_DSN: z.preprocess((v) => (v === '' ? undefined : v), z.url().optional()),
  LOG_NIVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Config = z.infer<typeof esquemaConfig>;

/** Lee y valida las variables de entorno. Si algo falta o está mal, lanza un error claro en español. */
export function leerConfig(entorno: NodeJS.ProcessEnv = process.env): Config {
  const resultado = esquemaConfig.safeParse(entorno);
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((problema) => `  - ${problema.path.join('.')}: ${problema.message}`)
      .join('\n');
    throw new Error(`Configuración inválida en las variables de entorno:\n${problemas}`);
  }
  return resultado.data;
}
