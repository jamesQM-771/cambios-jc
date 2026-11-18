import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { ProveedorZod } from '../../plugins/validacion-zod.js';

import {
  esquemaBusqueda,
  esquemaNombreReporte,
  esquemaPeriodo,
  respuestaBusqueda,
  respuestaReporte,
  respuestaTablero,
} from './esquemas.js';
import { aCsv, type ServicioReportes } from './servicio.js';

/** Reportes, histórico y tablero: información del dueño (§5.17). */
const VER = { permiso: 'reporte.ver' } as const;

export function rutasReportes(app: FastifyInstance, servicio: ServicioReportes): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  rutas.get(
    '/reportes/tablero',
    { config: VER, schema: { response: { 200: respuestaTablero } } },
    async () => ({ tablero: await servicio.tablero() }),
  );

  rutas.get(
    '/reportes/buscar',
    { config: VER, schema: { querystring: esquemaBusqueda, response: { 200: respuestaBusqueda } } },
    async (request) => servicio.buscar(request.query),
  );

  rutas.get(
    '/reportes/:nombre',
    {
      config: VER,
      schema: {
        params: esquemaNombreReporte,
        querystring: esquemaPeriodo,
        response: { 200: z.union([respuestaReporte, z.string()]) },
      },
    },
    async (request, respuesta) => {
      const { desde, hasta, formato } = request.query;
      const reporte = await servicio.reporte(request.params.nombre, desde, hasta);
      if (formato === 'json') return { reporte };
      return respuesta
        .header('content-type', 'text/csv; charset=utf-8')
        .header(
          'content-disposition',
          `attachment; filename="${request.params.nombre}-${desde}-${hasta}.csv"`,
        )
        .send(aCsv(reporte));
    },
  );
}
