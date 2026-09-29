import type { FastifyInstance, FastifyTypeProvider } from 'fastify';
import { z, type ZodType } from 'zod';

// Mensajes de validación de Zod en español.
z.config(z.locales.es());

/**
 * Proveedor de tipos: el tipo de `request.body`, `request.query`, etc. y lo que puede devolver
 * un manejador salen de los esquemas de Zod de la ruta. Se usa con `app.withTypeProvider<ProveedorZod>()`.
 */
export interface ProveedorZod extends FastifyTypeProvider {
  validator: this['schema'] extends ZodType ? z.output<this['schema']> : unknown;
  serializer: this['schema'] extends ZodType ? z.input<this['schema']> : unknown;
}

export interface ProblemaValidacion {
  campo: string;
  mensaje: string;
}

/** Error de validación de entrada; el plugin de errores lo convierte en 400 con detalles. */
export class ErrorValidacion extends Error {
  readonly problemas: readonly ProblemaValidacion[];

  constructor(error: z.ZodError) {
    super('Los datos enviados no son válidos.');
    this.name = 'ErrorValidacion';
    this.problemas = error.issues.map((problema) => ({
      campo: problema.path.map(String).join('.'),
      mensaje: problema.message,
    }));
  }
}

function esquemaZod(schema: unknown): ZodType {
  if (!(schema instanceof z.ZodType)) {
    throw new Error('El esquema de la ruta debe ser de Zod (CLAUDE.md §6).');
  }
  return schema;
}

/**
 * Valida con Zod la entrada (body, query, params, headers) y la salida de cada ruta.
 * La salida se parsea con el esquema de respuesta: los campos que el esquema no declara
 * se eliminan antes de enviar. Así el backend garantiza qué datos salen (p. ej. el digitador
 * nunca recibe pesos ni tasa), sin depender de que la pantalla los oculte.
 */
export function instalarValidacionZod(app: FastifyInstance): void {
  app.setValidatorCompiler(({ schema }) => {
    const esquema = esquemaZod(schema);
    return (datos) => {
      const resultado = esquema.safeParse(datos);
      return resultado.success
        ? { value: resultado.data }
        : { error: new ErrorValidacion(resultado.error) };
    };
  });

  app.setSerializerCompiler(({ schema }) => {
    const esquema = esquemaZod(schema);
    return (datos) => JSON.stringify(esquema.parse(datos));
  });
}
