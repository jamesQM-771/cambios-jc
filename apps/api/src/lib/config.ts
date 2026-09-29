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
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_VENTANA_SEGUNDOS: z.coerce.number().int().positive().default(60),
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
