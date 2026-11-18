import { comparar } from '@cambios-jc/shared';

import { errores } from '../../lib/errores.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria } from '../../lib/registrar-auditoria.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import { leerSaldos } from './migracion.js';

interface Actor {
  id: string;
}

/** JSON con BigInt (ids de la bitácora) como texto y Decimal con todos sus decimales. */
const aJson = (valor: unknown) =>
  JSON.stringify(
    valor,
    (_clave, contenido: unknown) =>
      typeof contenido === 'bigint' ? contenido.toString() : contenido,
    2,
  );

export type ServicioDatos = ReturnType<typeof crearServicioDatos>;

export function crearServicioDatos({ prisma }: { prisma: PrismaClient }) {
  return {
    /**
     * Exportación completa de los datos del negocio (§9.8, D156), sin depender del desarrollador:
     * clientes, cuentas, operaciones, contrapartes, caja y cumplimiento. No incluye contraseñas, secretos
     * de 2FA, sesiones ni las imágenes de los comprobantes (esas viven en la carpeta de subidas).
     */
    async exportar(actor: Actor, contexto: ContextoPeticion): Promise<string> {
      const [
        empresa,
        sucursales,
        cajas,
        cuentas,
        usuarios,
        clientes,
        mediosPago,
        operaciones,
        transferencias,
        operacionesDivisa,
        contrapartes,
        movimientosContraparte,
        compras,
        inventario,
        movimientosInventario,
        gastos,
        traslados,
        movimientosCuenta,
        turnos,
        jornadas,
        perfiles,
        alertas,
      ] = await Promise.all([
        prisma.empresa.findUnique({ where: { unica: true } }),
        prisma.sucursal.findMany(),
        prisma.caja.findMany(),
        prisma.cuentaDinero.findMany(),
        prisma.usuario.findMany({
          select: { id: true, nombre: true, login: true, rol: true, activo: true, creadoEn: true },
        }),
        prisma.cliente.findMany(),
        prisma.medioPago.findMany(),
        prisma.operacion.findMany(),
        prisma.transferencia.findMany(),
        prisma.operacionDivisa.findMany({ include: { denominaciones: true } }),
        prisma.contraparte.findMany(),
        prisma.movimientoContraparte.findMany(),
        prisma.compraDivisa.findMany(),
        prisma.inventarioDivisa.findMany(),
        prisma.movimientoInventario.findMany(),
        prisma.gasto.findMany(),
        prisma.traslado.findMany(),
        prisma.movimientoCuenta.findMany(),
        prisma.turno.findMany({ include: { conteos: true, saldos: true } }),
        prisma.jornada.findMany({ include: { saldosCuenta: true, eventos: true } }),
        prisma.perfilRiesgo.findMany(),
        prisma.alertaCumplimiento.findMany(),
      ]);
      await registrarAuditoria(prisma, {
        usuarioId: actor.id,
        accion: 'datos.exportar',
        entidad: 'empresa',
        entidadId: empresa?.id ?? 'empresa',
        ip: contexto.ip,
        agenteUsuario: contexto.agenteUsuario,
        despues: { clientes: clientes.length, operaciones: operaciones.length },
      });
      return aJson({
        generadoEn: new Date().toISOString(),
        version: 1,
        empresa,
        sucursales,
        cajas,
        cuentas,
        usuarios,
        clientes,
        mediosPago,
        operaciones,
        transferencias,
        operacionesDivisa,
        contrapartes,
        movimientosContraparte,
        compras,
        inventario,
        movimientosInventario,
        gastos,
        traslados,
        movimientosCuenta,
        turnos,
        jornadas,
        perfilesRiesgo: perfiles,
        alertasCumplimiento: alertas,
      });
    },

    /**
     * Saldos iniciales de contrapartes desde el CSV del Excel (§11.2, D157). Sin `aplicar` solo muestra
     * qué haría. Al aplicar: crea las contrapartes que falten (tipo "otro", para revisar luego) y anota un
     * ajuste por moneda con el signo invertido. Cada contraparte recibe un solo saldo inicial por moneda:
     * repetir la carga no duplica (clave de idempotencia fija).
     */
    async migrarSaldos(csv: string, aplicar: boolean, actor: Actor, contexto: ContextoPeticion) {
      const { filas, errores: problemas } = leerSaldos(csv);
      const existentes = await prisma.contraparte.findMany({ select: { id: true, nombre: true } });
      const buscar = (nombre: string) =>
        existentes.find((c) => c.nombre.trim().toLowerCase() === nombre.toLowerCase());
      const vista = filas.map((f) => ({
        ...f,
        contraparteExiste: Boolean(buscar(f.nombre)),
        etiqueta: comparar(f.saldoSistema, '0') > 0 ? ('me_debe' as const) : ('le_debo' as const),
      }));
      if (!aplicar) return { filas: vista, errores: problemas, aplicadas: 0, yaCargadas: 0 };
      if (problemas.length > 0) {
        throw errores.estadoInvalido('Corrige las líneas con error antes de aplicar la carga.');
      }

      let aplicadas = 0;
      let yaCargadas = 0;
      await prisma.$transaction(async (tx) => {
        for (const fila of filas) {
          const contraparte =
            (await tx.contraparte.findFirst({
              where: { nombre: { equals: fila.nombre, mode: 'insensitive' } },
              select: { id: true },
            })) ??
            (await tx.contraparte.create({
              data: {
                nombre: fila.nombre,
                tipo: 'otro',
                notas: 'Creada por la carga de saldos del Excel: revisa su tipo y datos.',
                creadoPorId: actor.id,
              },
              select: { id: true },
            }));
          const clave = `migracion-saldo:${contraparte.id}:${fila.moneda}`;
          const previo = await tx.movimientoContraparte.findUnique({
            where: { claveIdempotencia: clave },
          });
          if (previo) {
            yaCargadas += 1;
            continue;
          }
          const positivo = comparar(fila.saldoSistema, '0') > 0;
          await tx.movimientoContraparte.create({
            data: {
              contraparteId: contraparte.id,
              tipo: 'ajuste',
              moneda: fila.moneda,
              monto: fila.saldoSistema.replace('-', ''),
              signo: positivo ? 1 : -1,
              nota: `Saldo inicial migrado del Excel (en el Excel: ${fila.saldoExcel})`,
              claveIdempotencia: clave,
              usuarioId: actor.id,
            },
          });
          aplicadas += 1;
        }
        await registrarAuditoria(tx, {
          usuarioId: actor.id,
          accion: 'migracion.saldos_contrapartes',
          entidad: 'contraparte',
          entidadId: 'migracion',
          ip: contexto.ip,
          agenteUsuario: contexto.agenteUsuario,
          despues: { filas: filas.length, aplicadas, yaCargadas },
        });
      });
      return { filas: vista, errores: problemas, aplicadas, yaCargadas };
    },
  };
}
