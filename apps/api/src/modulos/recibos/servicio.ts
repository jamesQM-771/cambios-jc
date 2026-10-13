import { formatearMoneda } from '@cambios-jc/shared';

import { errores } from '../../lib/errores.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria } from '../../lib/registrar-auditoria.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import type { Recibo } from './esquemas.js';

export type ServicioRecibos = ReturnType<typeof crearServicioRecibos>;

interface Actor {
  id: string;
}

/** "13/10/2026 14:05" en la zona horaria de la empresa (nunca la del equipo). */
export function fechaEnZona(fecha: Date, zona: string): string {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: zona,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? '';
  return `${valor('day')}/${valor('month')}/${valor('year')} ${valor('hour')}:${valor('minute')}`;
}

export function crearServicioRecibos({
  prisma,
  origenWeb,
}: {
  prisma: PrismaClient;
  /** Dirección pública de la web, para armar el enlace de seguimiento. */
  origenWeb: string;
}) {
  return {
    /**
     * Emite el recibo de una remesa y deja constancia de cada impresión. La primera es el original;
     * las siguientes salen marcadas COPIA (§5.3). La fila de la remesa se bloquea mientras se cuenta,
     * así dos impresiones a la vez no pueden salir las dos como "original".
     */
    async emitir(id: string, actor: Actor, contexto: ContextoPeticion): Promise<Recibo> {
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "operacion" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const operacion = await tx.operacion.findUnique({
          where: { id },
          select: {
            numeroComprobante: true,
            codigoSeguimiento: true,
            estado: true,
            montoPesos: true,
            montoBolivares: true,
            creadoEn: true,
            lineaNegocio: { select: { monedaOrigen: true, monedaDestino: true } },
            remitente: { select: { nombre: true, tipoDocumento: true, numeroDocumento: true } },
            creadoPor: { select: { nombre: true } },
            transferencia: {
              select: {
                medioPago: {
                  select: {
                    tipo: true,
                    banco: { select: { codigo: true, nombre: true } },
                    numeroCuenta: true,
                    telefonoPagoMovil: true,
                    titular: true,
                    tipoDocumentoTitular: true,
                    numeroDocumentoTitular: true,
                  },
                },
              },
            },
          },
        });
        if (!operacion?.transferencia) throw errores.noEncontrado('La remesa no existe.');
        if (operacion.estado === 'anulada' || operacion.estado === 'devuelta') {
          throw errores.estadoInvalido('Una remesa anulada o devuelta no tiene recibo.');
        }

        const empresa = await tx.empresa.findUnique({ where: { unica: true } });
        if (!empresa) throw new Error('Falta la configuración de la empresa.');

        const anteriores = await tx.impresionRecibo.count({ where: { operacionId: id } });
        await tx.impresionRecibo.create({
          data: { operacionId: id, usuarioId: actor.id, esCopia: anteriores > 0 },
        });
        await registrarAuditoria(tx, {
          usuarioId: actor.id,
          accion: 'remesa.imprimir_recibo',
          entidad: 'operacion',
          entidadId: id,
          ip: contexto.ip,
          agenteUsuario: contexto.agenteUsuario,
          despues: { numeroComprobante: operacion.numeroComprobante, copia: anteriores },
        });

        const medio = operacion.transferencia.medioPago;
        const fechaTexto = fechaEnZona(operacion.creadoEn, empresa.zonaHoraria);
        const montoPesosTexto = formatearMoneda(
          operacion.montoPesos.toFixed(2),
          operacion.lineaNegocio.monedaOrigen as 'COP',
        );
        const montoBolivaresTexto = formatearMoneda(
          operacion.montoBolivares.toFixed(3),
          operacion.lineaNegocio.monedaDestino as 'VES',
        );
        const esCopia = anteriores > 0;
        const urlSeguimiento = `${origenWeb.replace(/\/+$/, '')}/seguimiento/${operacion.codigoSeguimiento}`;

        const lineas = [
          empresa.nombre,
          empresa.nit ? `NIT ${empresa.nit}` : null,
          empresa.whatsapp ? `WhatsApp ${empresa.whatsapp}` : null,
          empresa.telefono && empresa.telefono !== empresa.whatsapp
            ? `Tel. ${empresa.telefono}`
            : null,
          '',
          `Comprobante N° ${String(operacion.numeroComprobante)}${esCopia ? ' - COPIA' : ''}`,
          `Fecha: ${fechaTexto}`,
          `Remitente: ${operacion.remitente.nombre} (${operacion.remitente.tipoDocumento} ${operacion.remitente.numeroDocumento})`,
          `Titular: ${medio.titular} (${medio.tipoDocumentoTitular} ${medio.numeroDocumentoTitular})`,
          `Banco: ${medio.banco.codigo} ${medio.banco.nombre}`,
          medio.tipo === 'cuenta_bancaria'
            ? `Cuenta: ${medio.numeroCuenta ?? ''}`
            : `Pago móvil: ${medio.telefonoPagoMovil ?? ''}`,
          `Recibido: ${montoPesosTexto}`,
          `Envío: ${montoBolivaresTexto}`,
          `Atendió: ${operacion.creadoPor.nombre}`,
          `Seguimiento: ${urlSeguimiento}`,
          empresa.textoPieRecibo ? `\n${empresa.textoPieRecibo}` : null,
        ];

        return {
          esCopia,
          numeroCopia: anteriores,
          numeroComprobante: operacion.numeroComprobante,
          codigoSeguimiento: operacion.codigoSeguimiento,
          urlSeguimiento,
          fecha: operacion.creadoEn,
          fechaTexto,
          empresa: {
            nombre: empresa.nombre,
            nit: empresa.nit,
            telefono: empresa.telefono,
            whatsapp: empresa.whatsapp,
            direccion: empresa.direccion,
            tieneLogo: empresa.logoUrl !== null,
            textoPie: empresa.textoPieRecibo,
            zonaHoraria: empresa.zonaHoraria,
          },
          remitente: operacion.remitente,
          beneficiario: {
            titular: medio.titular,
            tipoDocumento: medio.tipoDocumentoTitular,
            numeroDocumento: medio.numeroDocumentoTitular,
            tipoPago: medio.tipo,
            banco: medio.banco,
            numeroCuenta: medio.numeroCuenta,
            telefonoPagoMovil: medio.telefonoPagoMovil,
          },
          montoPesosTexto,
          montoBolivaresTexto,
          vendedor: operacion.creadoPor.nombre,
          texto: lineas.filter((linea): linea is string => linea !== null).join('\n'),
        };
      });
    },
  };
}
