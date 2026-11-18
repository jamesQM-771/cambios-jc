import type { FastifyInstance } from 'fastify';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';

import {
  esquemaAjustarInventario,
  esquemaMoneda,
  respuestaInventario,
  respuestaInventarios,
  respuestaMovimientosInventario,
} from './esquemas.js';
import type { ServicioInventario } from './servicio.js';

/** El inventario y su costo son información del dueño, como las compras (§6.2). */
const INVENTARIO = { permiso: 'compra_contraparte.registrar' } as const;

export function rutasInventario(app: FastifyInstance, servicio: ServicioInventario): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  rutas.get(
    '/inventario',
    { config: INVENTARIO, schema: { response: { 200: respuestaInventarios } } },
    async () => ({ inventarios: await servicio.listar() }),
  );

  rutas.get(
    '/inventario/:moneda/movimientos',
    {
      config: INVENTARIO,
      schema: { params: esquemaMoneda, response: { 200: respuestaMovimientosInventario } },
    },
    async (request) => ({ movimientos: await servicio.movimientos(request.params.moneda) }),
  );

  rutas.post(
    '/inventario/:moneda/ajustes',
    {
      config: INVENTARIO,
      schema: {
        params: esquemaMoneda,
        body: esquemaAjustarInventario,
        response: { 200: respuestaInventario },
      },
    },
    async (request) => {
      if (!request.usuario) throw errores.noAutenticado();
      return {
        inventario: await servicio.ajustar(
          request.params.moneda,
          request.body,
          { id: request.usuario.id },
          { ip: request.ip, agenteUsuario: request.headers['user-agent'] ?? null },
        ),
      };
    },
  );
}
