import { tienePermiso } from '@cambios-jc/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import {
  esquemaId,
  esquemaListarRemesas,
  esquemaRegistrarRemesa,
  respuestaListaRemesas,
  respuestaRemesa,
} from './esquemas.js';
import type { ServicioRemesas } from './servicio.js';

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

const PERMISO = { permiso: 'remesa.registrar' } as const;

export function rutasRemesas(app: FastifyInstance, servicio: ServicioRemesas): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  rutas.post(
    '/remesas',
    {
      config: PERMISO,
      schema: {
        body: esquemaRegistrarRemesa,
        response: { 200: respuestaRemesa, 201: respuestaRemesa },
      },
    },
    async (request, respuesta) => {
      const { usuario } = request;
      if (!usuario) throw errores.noAutenticado();
      const resultado = await servicio.registrar(
        request.body,
        { id: usuario.id },
        tienePermiso(usuario.rol, 'tasa.cambiar_en_operacion'),
        contextoDe(request),
      );
      // 201 al crear; 200 si era un reintento de una remesa que ya existía.
      return respuesta.status(resultado.repetida ? 200 : 201).send({ remesa: resultado.remesa });
    },
  );

  rutas.get(
    '/remesas',
    {
      config: PERMISO,
      schema: { querystring: esquemaListarRemesas, response: { 200: respuestaListaRemesas } },
    },
    async (request) => ({ remesas: await servicio.listar(request.query) }),
  );

  rutas.get(
    '/remesas/:id',
    { config: PERMISO, schema: { params: esquemaId, response: { 200: respuestaRemesa } } },
    async (request) => ({ remesa: await servicio.obtener(request.params.id) }),
  );
}
