import type { FastifyInstance } from 'fastify';

import type { ProveedorZod } from '../../plugins/validacion-zod.js';

import { esquemaListarMovimientos, respuestaMovimientos, respuestaSaldos } from './esquemas.js';
import type { ServicioLibro } from './servicio.js';

/** El libro lo consulta quien cierra la jornada (el administrador): ve el dinero de todas las cuentas. */
const PERMISO = { permiso: 'jornada.cerrar' } as const;

export function rutasLibro(app: FastifyInstance, servicio: ServicioLibro): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  rutas.get(
    '/libro/saldos',
    { config: PERMISO, schema: { response: { 200: respuestaSaldos } } },
    async () => ({ saldos: await servicio.saldos() }),
  );

  rutas.get(
    '/libro/movimientos',
    {
      config: PERMISO,
      schema: { querystring: esquemaListarMovimientos, response: { 200: respuestaMovimientos } },
    },
    async (request) => ({ movimientos: await servicio.movimientos(request.query) }),
  );
}
