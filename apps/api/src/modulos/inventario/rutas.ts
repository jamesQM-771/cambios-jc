import type { FastifyInstance } from 'fastify';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import { respuestaSolicitud, type ServicioAprobaciones } from '../aprobaciones/servicio.js';

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

export function rutasInventario(
  app: FastifyInstance,
  servicio: ServicioInventario,
  aprobaciones?: ServicioAprobaciones,
): void {
  const rutas = app.withTypeProvider<ProveedorZod>();
  aprobaciones?.registrarEjecutor('ajuste_inventario', (moneda, datos, actor, contexto) =>
    servicio.ajustar(
      esquemaMoneda.parse({ moneda }).moneda,
      esquemaAjustarInventario.parse(datos),
      actor,
      contexto,
    ),
  );

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
        response: { 200: respuestaInventario, 202: respuestaSolicitud },
      },
    },
    async (request, respuesta) => {
      if (!request.usuario) throw errores.noAutenticado();
      const contexto = { ip: request.ip, agenteUsuario: request.headers['user-agent'] ?? null };
      const solicitud = await aprobaciones?.interceptar(
        'ajuste_inventario',
        request.params.moneda,
        { ...request.body },
        `Ajuste de inventario (${request.body.sentido}) de ${request.body.cantidad} ${request.params.moneda}: ${request.body.motivo}`,
        { id: request.usuario.id },
        contexto,
      );
      if (solicitud) return respuesta.status(202).send({ solicitud });
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
