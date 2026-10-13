import { formatearMoneda } from '@cambios-jc/shared';

import type { EstadoOperacion } from '../../generated/prisma/client.js';
import { normalizarCodigoSeguimiento } from '../../lib/codigo-seguimiento.js';
import { errores } from '../../lib/errores.js';
import type { PrismaClient } from '../../lib/prisma.js';

import type { Seguimiento } from './esquemas.js';

export type ServicioSeguimiento = ReturnType<typeof crearServicioSeguimiento>;

type EstadoCliente = Seguimiento['estado'];

/** Estado interno → lo que entiende quien envió el dinero (sin detalles de la operación). */
const PARA_EL_CLIENTE: Record<EstadoOperacion, { estado: EstadoCliente; mensaje: string }> = {
  registrada: {
    estado: 'recibida',
    mensaje: 'Recibimos tu solicitud y estamos confirmando tu pago.',
  },
  pago_verificado: { estado: 'en_proceso', mensaje: 'Tu envío está en proceso.' },
  en_cola: { estado: 'en_proceso', mensaje: 'Tu envío está en proceso.' },
  tomada: { estado: 'en_proceso', mensaje: 'Tu envío está en proceso.' },
  completada: { estado: 'enviada', mensaje: 'Tu envío fue realizado.' },
  con_incidencia: {
    estado: 'en_revision',
    mensaje: 'Estamos revisando tu envío. Te contactaremos si necesitamos algo de ti.',
  },
  anulada: { estado: 'anulada', mensaje: 'Esta operación fue anulada.' },
  devuelta: { estado: 'devuelta', mensaje: 'El dinero de esta operación fue devuelto.' },
};

export function crearServicioSeguimiento({ prisma }: { prisma: PrismaClient }) {
  return {
    /**
     * Consulta pública por código. Un código mal escrito y uno que no existe responden exactamente
     * igual: así la ruta no sirve para averiguar qué códigos son válidos.
     */
    async consultar(codigoEscrito: string): Promise<Seguimiento> {
      const codigo = normalizarCodigoSeguimiento(codigoEscrito);
      const operacion = codigo
        ? await prisma.operacion.findUnique({
            where: { codigoSeguimiento: codigo },
            select: {
              numeroComprobante: true,
              estado: true,
              montoBolivares: true,
              creadoEn: true,
              lineaNegocio: { select: { monedaDestino: true } },
              eventos: { orderBy: { creadoEn: 'desc' }, take: 1, select: { creadoEn: true } },
            },
          })
        : null;
      if (!operacion) throw errores.noEncontrado('No encontramos una operación con ese código.');

      const empresa = await prisma.empresa.findUnique({
        where: { unica: true },
        select: { nombre: true, zonaHoraria: true },
      });
      const { estado, mensaje } = PARA_EL_CLIENTE[operacion.estado];
      return {
        numeroComprobante: operacion.numeroComprobante,
        estado,
        mensaje,
        montoBolivaresTexto: formatearMoneda(
          operacion.montoBolivares.toFixed(3),
          operacion.lineaNegocio.monedaDestino as 'VES',
        ),
        fecha: operacion.creadoEn,
        actualizadaEn: operacion.eventos[0]?.creadoEn ?? operacion.creadoEn,
        empresa: {
          nombre: empresa?.nombre ?? '',
          zonaHoraria: empresa?.zonaHoraria ?? 'America/Bogota',
        },
      };
    },
  };
}
