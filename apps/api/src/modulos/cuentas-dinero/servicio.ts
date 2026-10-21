import { fijarMonto, montoATexto, type Moneda } from '@cambios-jc/shared';

import type { Prisma } from '../../generated/prisma/client.js';
import { ErrorApp, errores } from '../../lib/errores.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria, type DatosAuditoria } from '../../lib/registrar-auditoria.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import type { CuentaDineroPublica } from './esquemas.js';

const SELECCION_PUBLICA = {
  id: true,
  nombre: true,
  tipo: true,
  moneda: true,
  bancoId: true,
  banco: { select: { nombre: true } },
  ultimos4Digitos: true,
  sucursalId: true,
  sucursal: { select: { nombre: true } },
  cajaId: true,
  caja: { select: { nombre: true } },
  titular: true,
  responsableId: true,
  responsable: { select: { nombre: true } },
  activa: true,
  limiteDiario: true,
  comisionPorDefecto: true,
  creadoEn: true,
} satisfies Prisma.CuentaDineroSelect;

type FilaCuenta = Prisma.CuentaDineroGetPayload<{ select: typeof SELECCION_PUBLICA }>;

function aPublica(fila: FilaCuenta): CuentaDineroPublica {
  const moneda = fila.moneda as Moneda;
  return {
    id: fila.id,
    nombre: fila.nombre,
    tipo: fila.tipo,
    moneda: fila.moneda,
    bancoId: fila.bancoId,
    bancoNombre: fila.banco?.nombre ?? null,
    ultimos4Digitos: fila.ultimos4Digitos,
    sucursalId: fila.sucursalId,
    sucursalNombre: fila.sucursal.nombre,
    cajaId: fila.cajaId,
    cajaNombre: fila.caja?.nombre ?? null,
    titular: fila.titular,
    responsableId: fila.responsableId,
    responsableNombre: fila.responsable?.nombre ?? null,
    activa: fila.activa,
    limiteDiario: fila.limiteDiario ? montoATexto(fila.limiteDiario.toString(), moneda) : null,
    comisionPorDefecto: fila.comisionPorDefecto
      ? montoATexto(fila.comisionPorDefecto.toString(), moneda)
      : null,
    creadoEn: fila.creadoEn,
  };
}

export interface FiltroCuentasDinero {
  moneda?: Moneda | undefined;
  sucursalId?: string | undefined;
  tipo?: 'caja' | 'banco' | 'billetera' | undefined;
  activa?: boolean | undefined;
}

export type DatosNuevaCuentaDinero =
  | {
      tipo: 'banco';
      bancoId: string;
      ultimos4Digitos: string;
      nombre: string;
      moneda: Moneda;
      sucursalId: string;
      titular?: string | null;
      responsableId?: string | null;
      limiteDiario?: string | null;
      comisionPorDefecto?: string | null;
    }
  | {
      tipo: 'caja' | 'billetera';
      /** Solo para tipo caja: el puesto al que pertenece; sin él es la bóveda. */
      cajaId?: string | null;
      nombre: string;
      moneda: Moneda;
      sucursalId: string;
      titular?: string | null;
      responsableId?: string | null;
      limiteDiario?: string | null;
      comisionPorDefecto?: string | null;
    };

export interface CambiosCuentaDinero {
  nombre?: string | undefined;
  ultimos4Digitos?: string | undefined;
  cajaId?: string | null | undefined;
  titular?: string | null | undefined;
  responsableId?: string | null | undefined;
  limiteDiario?: string | null | undefined;
  comisionPorDefecto?: string | null | undefined;
}

export interface Actor {
  id: string;
}

export type ServicioCuentasDinero = ReturnType<typeof crearServicioCuentasDinero>;

export function crearServicioCuentasDinero({ prisma }: { prisma: PrismaClient }) {
  const auditar = (
    actor: Actor,
    contexto: ContextoPeticion,
    datos: Omit<DatosAuditoria, 'usuarioId' | 'ip' | 'agenteUsuario' | 'entidad'>,
  ) =>
    registrarAuditoria(prisma, {
      ...datos,
      usuarioId: actor.id,
      entidad: 'cuenta_dinero',
      ip: contexto.ip,
      agenteUsuario: contexto.agenteUsuario,
    });

  function errorValidacion(campo: string, mensaje: string): ErrorApp {
    return new ErrorApp(400, 'VALIDACION_FALLIDA', 'Los datos enviados no son válidos.', [
      { campo, mensaje },
    ]);
  }

  async function exigirSucursalActiva(sucursalId: string): Promise<void> {
    const sucursal = await prisma.sucursal.findFirst({ where: { id: sucursalId, activa: true } });
    if (!sucursal) throw errorValidacion('sucursalId', 'La sucursal no existe o está inactiva.');
  }

  /**
   * Una cuenta de efectivo pertenece a un puesto de su misma sucursal, y un puesto tiene una sola
   * cuenta activa por moneda (así el conteo del turno es inequívoco). Sin puesto es la bóveda.
   */
  async function exigirCajaValida(
    cajaId: string,
    sucursalId: string,
    moneda: string,
    cuentaActualId?: string,
  ): Promise<void> {
    const caja = await prisma.caja.findFirst({ where: { id: cajaId, activa: true } });
    if (!caja) throw errorValidacion('cajaId', 'La caja no existe o está inactiva.');
    if (caja.sucursalId !== sucursalId) {
      throw errorValidacion('cajaId', 'La caja es de otra sucursal.');
    }
    const repetida = await prisma.cuentaDinero.findFirst({
      where: {
        cajaId,
        moneda,
        activa: true,
        tipo: 'caja',
        ...(cuentaActualId ? { id: { not: cuentaActualId } } : {}),
      },
    });
    if (repetida) {
      throw errorValidacion('cajaId', `Esa caja ya tiene una cuenta de efectivo en ${moneda}.`);
    }
  }

  async function exigirBancoActivo(bancoId: string): Promise<void> {
    const banco = await prisma.banco.findFirst({ where: { id: bancoId, activo: true } });
    if (!banco) throw errorValidacion('bancoId', 'El banco no existe o está inactivo.');
  }

  async function exigirUsuarioExiste(responsableId: string): Promise<void> {
    const usuario = await prisma.usuario.findUnique({ where: { id: responsableId } });
    if (!usuario) throw errorValidacion('responsableId', 'El usuario responsable no existe.');
  }

  async function cargar(id: string): Promise<FilaCuenta> {
    const cuenta = await prisma.cuentaDinero.findUnique({
      where: { id },
      select: SELECCION_PUBLICA,
    });
    if (!cuenta) throw errores.noEncontrado('La cuenta no existe.');
    return cuenta;
  }

  return {
    async listar(filtro: FiltroCuentasDinero): Promise<CuentaDineroPublica[]> {
      const filas = await prisma.cuentaDinero.findMany({
        where: {
          ...(filtro.moneda === undefined ? {} : { moneda: filtro.moneda }),
          ...(filtro.sucursalId === undefined ? {} : { sucursalId: filtro.sucursalId }),
          ...(filtro.tipo === undefined ? {} : { tipo: filtro.tipo }),
          ...(filtro.activa === undefined ? {} : { activa: filtro.activa }),
        },
        orderBy: { nombre: 'asc' },
        select: SELECCION_PUBLICA,
      });
      return filas.map(aPublica);
    },

    async crear(
      datos: DatosNuevaCuentaDinero,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<CuentaDineroPublica> {
      await exigirSucursalActiva(datos.sucursalId);
      if (datos.tipo === 'banco') await exigirBancoActivo(datos.bancoId);
      if (datos.responsableId) await exigirUsuarioExiste(datos.responsableId);
      if (datos.tipo === 'caja' && datos.cajaId) {
        await exigirCajaValida(datos.cajaId, datos.sucursalId, datos.moneda);
      }

      const data: Prisma.CuentaDineroUncheckedCreateInput = {
        nombre: datos.nombre,
        tipo: datos.tipo,
        moneda: datos.moneda,
        sucursalId: datos.sucursalId,
        titular: datos.titular ?? null,
        responsableId: datos.responsableId ?? null,
        limiteDiario:
          datos.limiteDiario !== null && datos.limiteDiario !== undefined
            ? fijarMonto(datos.limiteDiario, datos.moneda).toString()
            : null,
        comisionPorDefecto:
          datos.comisionPorDefecto !== null && datos.comisionPorDefecto !== undefined
            ? fijarMonto(datos.comisionPorDefecto, datos.moneda).toString()
            : null,
        ...(datos.tipo === 'banco'
          ? { bancoId: datos.bancoId, ultimos4Digitos: datos.ultimos4Digitos }
          : {}),
        ...(datos.tipo === 'caja' ? { cajaId: datos.cajaId ?? null } : {}),
      };

      const creada = aPublica(
        await prisma.cuentaDinero.create({ data, select: SELECCION_PUBLICA }),
      );
      await auditar(actor, contexto, {
        accion: 'cuenta_dinero.crear',
        entidadId: creada.id,
        despues: creada,
      });
      return creada;
    },

    async editar(
      id: string,
      cambios: CambiosCuentaDinero,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<CuentaDineroPublica> {
      const filaAntes = await cargar(id);
      const antes = aPublica(filaAntes);
      const moneda = filaAntes.moneda as Moneda;

      if (cambios.ultimos4Digitos !== undefined && filaAntes.tipo !== 'banco') {
        throw errorValidacion(
          'ultimos4Digitos',
          'Solo una cuenta de tipo "banco" tiene últimos 4 dígitos.',
        );
      }
      if (cambios.responsableId) await exigirUsuarioExiste(cambios.responsableId);
      if (cambios.cajaId !== undefined) {
        if (filaAntes.tipo !== 'caja') {
          throw errorValidacion('cajaId', 'Solo una cuenta de tipo "caja" pertenece a una caja.');
        }
        if (cambios.cajaId !== null) {
          await exigirCajaValida(cambios.cajaId, filaAntes.sucursalId, filaAntes.moneda, id);
        }
        // Mover el efectivo de un puesto a otro con un turno abierto falsearía su arqueo.
        const abierto = await prisma.turno.findFirst({
          where: {
            estado: 'abierto',
            cajaId: {
              in: [filaAntes.cajaId, cambios.cajaId].filter((c): c is string => c !== null),
            },
          },
        });
        if (abierto) {
          throw errorValidacion(
            'cajaId',
            'Hay un turno abierto en esa caja: ciérralo antes de mover la cuenta.',
          );
        }
      }

      const data: Prisma.CuentaDineroUncheckedUpdateInput = {
        ...(cambios.cajaId !== undefined ? { cajaId: cambios.cajaId } : {}),
        ...(cambios.nombre !== undefined ? { nombre: cambios.nombre } : {}),
        ...(cambios.ultimos4Digitos !== undefined
          ? { ultimos4Digitos: cambios.ultimos4Digitos }
          : {}),
        ...(cambios.titular !== undefined ? { titular: cambios.titular } : {}),
        ...(cambios.responsableId !== undefined ? { responsableId: cambios.responsableId } : {}),
        ...(cambios.limiteDiario !== undefined
          ? {
              limiteDiario:
                cambios.limiteDiario === null
                  ? null
                  : fijarMonto(cambios.limiteDiario, moneda).toString(),
            }
          : {}),
        ...(cambios.comisionPorDefecto !== undefined
          ? {
              comisionPorDefecto:
                cambios.comisionPorDefecto === null
                  ? null
                  : fijarMonto(cambios.comisionPorDefecto, moneda).toString(),
            }
          : {}),
      };

      const editada = aPublica(
        await prisma.cuentaDinero.update({ where: { id }, data, select: SELECCION_PUBLICA }),
      );
      await auditar(actor, contexto, {
        accion: 'cuenta_dinero.editar',
        entidadId: id,
        antes,
        despues: editada,
      });
      return editada;
    },

    async desactivar(
      id: string,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<CuentaDineroPublica> {
      const antes = aPublica(await cargar(id));
      if (!antes.activa) return antes;
      const editada = aPublica(
        await prisma.cuentaDinero.update({
          where: { id },
          data: { activa: false },
          select: SELECCION_PUBLICA,
        }),
      );
      await auditar(actor, contexto, { accion: 'cuenta_dinero.desactivar', entidadId: id });
      return editada;
    },

    async reactivar(
      id: string,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<CuentaDineroPublica> {
      const antes = aPublica(await cargar(id));
      if (antes.activa) return antes;
      const editada = aPublica(
        await prisma.cuentaDinero.update({
          where: { id },
          data: { activa: true },
          select: SELECCION_PUBLICA,
        }),
      );
      await auditar(actor, contexto, { accion: 'cuenta_dinero.reactivar', entidadId: id });
      return editada;
    },
  };
}
