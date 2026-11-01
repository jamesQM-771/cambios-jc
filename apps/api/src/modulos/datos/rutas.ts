import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import type { ServicioDatos } from './servicio.js';

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

const actorDe = (request: FastifyRequest) => {
  if (!request.usuario) throw errores.noAutenticado();
  return { id: request.usuario.id };
};

const esquemaMigracion = z
  .object({
    /** Contenido del CSV (nombre, moneda, saldo), hasta 1 MB. */
    csv: z.string().min(1).max(1_000_000),
    aplicar: z.boolean().default(false),
  })
  .strict();

const respuestaMigracion = z.object({
  filas: z.array(
    z.object({
      linea: z.number().int(),
      nombre: z.string(),
      moneda: z.string(),
      saldoExcel: z.string(),
      saldoSistema: z.string(),
      contraparteExiste: z.boolean(),
      etiqueta: z.enum(['me_debe', 'le_debo']),
    }),
  ),
  errores: z.array(z.object({ linea: z.number().int(), mensaje: z.string() })),
  aplicadas: z.number().int(),
  yaCargadas: z.number().int(),
});

export function rutasDatos(app: FastifyInstance, servicio: ServicioDatos): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  rutas.get(
    '/datos/exportacion',
    { config: { permiso: 'datos.exportar' }, schema: { response: { 200: z.string() } } },
    async (request, respuesta) => {
      const contenido = await servicio.exportar(actorDe(request), contextoDe(request));
      const fecha = new Date().toISOString().slice(0, 10);
      return respuesta
        .header('content-type', 'application/octet-stream')
        .header('content-disposition', `attachment; filename="cambios-jc-datos-${fecha}.json"`)
        .send(contenido);
    },
  );

  rutas.post(
    '/datos/migracion/saldos-contrapartes',
    {
      config: { permiso: 'migracion.cargar' },
      schema: { body: esquemaMigracion, response: { 200: respuestaMigracion } },
    },
    async (request) =>
      servicio.migrarSaldos(
        request.body.csv,
        request.body.aplicar,
        actorDe(request),
        contextoDe(request),
      ),
  );
}
