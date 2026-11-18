import { montoATexto, type Moneda } from '@cambios-jc/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { alcanzaPara, cercaDelLimite, liquidezDe } from '../../lib/liquidez.js';
import { errores } from '../../lib/errores.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria } from '../../lib/registrar-auditoria.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';

const esquemaLiquidez = z.object({
  moneda: z.string(),
  disponible: z.string(),
  comprometido: z.string(),
  libre: z.string(),
  cuentas: z.array(
    z.object({
      id: z.string(),
      nombre: z.string(),
      saldo: z.string(),
      limiteDiario: z.string().nullable(),
      usadoHoy: z.string(),
      restanteHoy: z.string().nullable(),
    }),
  ),
});

const esquemaParametros = z.object({
  umbralLibre: z.string().nullable(),
  porcentajeLimite: z.number().int().nullable(),
});

const respuestaTablero = z.object({
  monedas: z.array(esquemaLiquidez),
  /** Anticipos dados a proveedores que aún no entregan la divisa (saldo "me debe" en pesos). */
  comprasEnTransito: z.array(z.object({ id: z.string(), nombre: z.string(), saldo: z.string() })),
  alertas: z.array(
    z.object({ tipo: z.enum(['libre_bajo', 'limite_cuenta', 'cola_rapida']), mensaje: z.string() }),
  ),
  parametros: esquemaParametros,
});

/**
 * Tablero de liquidez (§5.10, D160 a D162). El administrador ve todo; quien registra remesas solo
 * puede preguntar si alcanza (sí o no), sin ver saldos del negocio.
 */
export function rutasLiquidez(app: FastifyInstance, prisma: PrismaClient): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  async function parametros() {
    const fila = await prisma.parametrosLiquidez.upsert({
      where: { unica: true },
      update: {},
      create: {},
    });
    return {
      umbralLibre: fila.umbralLibre?.toFixed(3) ?? null,
      porcentajeLimite: fila.porcentajeLimite,
    };
  }

  async function monedasDestino(): Promise<Moneda[]> {
    const lineas = await prisma.lineaNegocio.findMany({
      where: { clase: 'remesa', activa: true },
      distinct: ['monedaDestino'],
      select: { monedaDestino: true },
    });
    return lineas.map((l) => l.monedaDestino as Moneda);
  }

  rutas.get(
    '/liquidez',
    { config: { permiso: 'liquidez.ver' }, schema: { response: { 200: respuestaTablero } } },
    async () => {
      const params = await parametros();
      const monedas = await Promise.all((await monedasDestino()).map((m) => liquidezDe(prisma, m)));
      const alertas: { tipo: 'libre_bajo' | 'limite_cuenta' | 'cola_rapida'; mensaje: string }[] =
        [];
      for (const m of monedas) {
        if (params.umbralLibre && !alcanzaPara(m.libre, params.umbralLibre)) {
          alertas.push({
            tipo: 'libre_bajo',
            mensaje: `Quedan ${m.libre} ${m.moneda} libres, por debajo del umbral de ${params.umbralLibre}.`,
          });
        }
        if (params.porcentajeLimite) {
          for (const c of m.cuentas) {
            if (
              c.limiteDiario &&
              cercaDelLimite(c.usadoHoy, c.limiteDiario, params.porcentajeLimite)
            ) {
              alertas.push({
                tipo: 'limite_cuenta',
                mensaje: `${c.nombre} ya usó ${c.usadoHoy} de su límite diario de ${c.limiteDiario} ${m.moneda}.`,
              });
            }
          }
        }
        // La cola crece más rápido que el fondeo: lo que entró a la cola en las últimas 2 horas supera
        // lo que se compró en ese tiempo y ya no alcanza lo libre para otro tanto (D161).
        const desde = new Date(Date.now() - 2 * 3_600_000);
        const [nuevas, fondeo] = await Promise.all([
          prisma.operacion.aggregate({
            where: {
              creadoEn: { gte: desde },
              lineaNegocio: { monedaDestino: m.moneda },
              estado: { notIn: ['anulada', 'devuelta'] },
            },
            _sum: { montoBolivares: true },
          }),
          prisma.compraDivisa.aggregate({
            where: { creadoEn: { gte: desde }, moneda: m.moneda, anuladoEn: null },
            _sum: { cantidad: true },
          }),
        ]);
        const ritmoCola = nuevas._sum.montoBolivares?.toString() ?? '0';
        const ritmoFondeo = fondeo._sum.cantidad?.toString() ?? '0';
        if (!alcanzaPara(ritmoFondeo, ritmoCola) && !alcanzaPara(m.libre, ritmoCola)) {
          alertas.push({
            tipo: 'cola_rapida',
            mensaje: `En las últimas 2 horas entraron ${ritmoCola} ${m.moneda} a la cola y se compraron ${ritmoFondeo}: a este ritmo lo libre no alcanza.`,
          });
        }
      }
      const contrapartes = await prisma.contraparte.findMany({
        where: { tipo: 'proveedor', activa: true },
        select: { id: true, nombre: true },
      });
      const saldos = await prisma.$queryRaw<
        { contraparte_id: string; saldo: { toString(): string } }[]
      >`
        SELECT contraparte_id::text AS contraparte_id, SUM(monto * signo) AS saldo
        FROM movimiento_contraparte WHERE moneda = 'COP' GROUP BY contraparte_id`;
      const comprasEnTransito = contrapartes.flatMap((c) => {
        const saldo = saldos.find((s) => s.contraparte_id === c.id)?.saldo.toString() ?? '0';
        return alcanzaPara('0', saldo)
          ? []
          : [{ id: c.id, nombre: c.nombre, saldo: montoATexto(saldo, 'COP') }];
      });
      return { monedas, comprasEnTransito, alertas, parametros: params };
    },
  );

  rutas.get(
    '/liquidez/alcanza',
    {
      config: { permiso: 'remesa.registrar' },
      schema: {
        querystring: z.object({
          lineaNegocioId: z.uuid(),
          bolivares: z.string().regex(/^\d+(\.\d{1,3})?$/),
        }),
        response: { 200: z.object({ alcanza: z.boolean() }) },
      },
    },
    async (request) => {
      const linea = await prisma.lineaNegocio.findUnique({
        where: { id: request.query.lineaNegocioId },
      });
      if (!linea) throw errores.noEncontrado('La línea no existe.');
      const liquidez = await liquidezDe(prisma, linea.monedaDestino as Moneda);
      return { alcanza: alcanzaPara(liquidez.libre, request.query.bolivares) };
    },
  );

  rutas.put(
    '/liquidez/parametros',
    {
      config: { permiso: 'liquidez.ver' },
      schema: {
        body: z
          .object({
            umbralLibre: z
              .string()
              .regex(/^\d+(\.\d{1,3})?$/)
              .nullable(),
            porcentajeLimite: z.number().int().min(1).max(100).nullable(),
          })
          .strict(),
        response: { 200: z.object({ parametros: esquemaParametros }) },
      },
    },
    async (request) => {
      if (!request.usuario) throw errores.noAutenticado();
      const antes = await parametros();
      await prisma.parametrosLiquidez.update({
        where: { unica: true },
        data: { ...request.body, actualizadoEn: new Date() },
      });
      const despues = await parametros();
      await registrarAuditoria(prisma, {
        usuarioId: request.usuario.id,
        accion: 'liquidez.parametros',
        entidad: 'liquidez',
        entidadId: 'parametros',
        ip: request.ip,
        agenteUsuario: request.headers['user-agent'] ?? null,
        antes,
        despues,
      });
      return { parametros: despues };
    },
  );
}
