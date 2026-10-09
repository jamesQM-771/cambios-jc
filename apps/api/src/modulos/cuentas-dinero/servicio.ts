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

      const data: Prisma.CuentaDineroUncheckedUpdateInput = {
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
