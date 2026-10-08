import { fijarMonto, montoATexto, type Moneda } from '@cambios-jc/shared';

import type { Prisma } from '../../generated/prisma/client.js';
import { errores } from '../../lib/errores.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria, type DatosAuditoria } from '../../lib/registrar-auditoria.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import type { DenominacionPublica } from './esquemas.js';

const SELECCION_PUBLICA = {
  id: true,
  moneda: true,
  valor: true,
  activa: true,
  creadoEn: true,
} satisfies Prisma.DenominacionSelect;

type FilaPublica = Prisma.DenominacionGetPayload<{ select: typeof SELECCION_PUBLICA }>;

function aPublica(fila: FilaPublica): DenominacionPublica {
  const moneda = fila.moneda as Moneda;
  return { ...fila, moneda, valor: montoATexto(fila.valor.toString(), moneda) };
}

export interface FiltroDenominaciones {
  moneda?: Moneda | undefined;
  activa?: boolean | undefined;
}

export interface DatosNuevaDenominacion {
  moneda: Moneda;
  valor: string;
}

export interface CambiosDenominacion {
  valor: string;
}

export interface Actor {
  id: string;
}

export type ServicioDenominaciones = ReturnType<typeof crearServicioDenominaciones>;

export function crearServicioDenominaciones({ prisma }: { prisma: PrismaClient }) {
  const auditar = (
    actor: Actor,
    contexto: ContextoPeticion,
    datos: Omit<DatosAuditoria, 'usuarioId' | 'ip' | 'agenteUsuario' | 'entidad'>,
  ) =>
    registrarAuditoria(prisma, {
      ...datos,
      usuarioId: actor.id,
      entidad: 'denominacion',
      ip: contexto.ip,
      agenteUsuario: contexto.agenteUsuario,
    });

  async function cargar(id: string): Promise<FilaPublica> {
    const fila = await prisma.denominacion.findUnique({
      where: { id },
      select: SELECCION_PUBLICA,
    });
    if (!fila) throw errores.noEncontrado('La denominación no existe.');
    return fila;
  }

  /** No puede haber dos denominaciones activas con el mismo valor en la misma moneda. */
  async function exigirValorLibre(
    moneda: Moneda,
    valor: ReturnType<typeof fijarMonto>,
    idAExcluir?: string,
  ): Promise<void> {
    const repetida = await prisma.denominacion.findFirst({
      where: {
        moneda,
        valor: valor.toString(),
        activa: true,
        ...(idAExcluir ? { id: { not: idAExcluir } } : {}),
      },
    });
    if (repetida) {
      throw errores.valorEnUso(
        'valor',
        `Ya existe una denominación activa de ${moneda} ${montoATexto(valor, moneda)}.`,
      );
    }
  }

  return {
    async listar(filtro: FiltroDenominaciones): Promise<DenominacionPublica[]> {
      const filas = await prisma.denominacion.findMany({
        where: {
          ...(filtro.moneda === undefined ? {} : { moneda: filtro.moneda }),
          ...(filtro.activa === undefined ? {} : { activa: filtro.activa }),
        },
        orderBy: [{ moneda: 'asc' }, { valor: 'desc' }],
        select: SELECCION_PUBLICA,
      });
      return filas.map(aPublica);
    },

    async crear(
      datos: DatosNuevaDenominacion,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<DenominacionPublica> {
      const valor = fijarMonto(datos.valor, datos.moneda);
      await exigirValorLibre(datos.moneda, valor);
      const creada = await prisma.denominacion.create({
        data: { moneda: datos.moneda, valor: valor.toString() },
        select: SELECCION_PUBLICA,
      });
      const publica = aPublica(creada);
      await auditar(actor, contexto, {
        accion: 'denominacion.crear',
        entidadId: publica.id,
        despues: publica,
      });
      return publica;
    },

    async editar(
      id: string,
      cambios: CambiosDenominacion,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<DenominacionPublica> {
      const antes = aPublica(await cargar(id));
      const moneda = antes.moneda as Moneda;
      const valor = fijarMonto(cambios.valor, moneda);
      await exigirValorLibre(moneda, valor, id);

      const editada = await prisma.denominacion.update({
        where: { id },
        data: { valor: valor.toString() },
        select: SELECCION_PUBLICA,
      });
      const publica = aPublica(editada);
      await auditar(actor, contexto, {
        accion: 'denominacion.editar',
        entidadId: id,
        antes,
        despues: publica,
      });
      return publica;
    },

    async desactivar(
      id: string,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<DenominacionPublica> {
      const antes = aPublica(await cargar(id));
      if (!antes.activa) return antes;
      const editada = await prisma.denominacion.update({
        where: { id },
        data: { activa: false },
        select: SELECCION_PUBLICA,
      });
      await auditar(actor, contexto, { accion: 'denominacion.desactivar', entidadId: id });
      return aPublica(editada);
    },

    async reactivar(
      id: string,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<DenominacionPublica> {
      const antes = aPublica(await cargar(id));
      if (antes.activa) return antes;
      const moneda = antes.moneda as Moneda;
      // Puede que, mientras estaba inactiva, se haya creado otra con el mismo valor.
      await exigirValorLibre(moneda, fijarMonto(antes.valor, moneda), id);
      const editada = await prisma.denominacion.update({
        where: { id },
        data: { activa: true },
        select: SELECCION_PUBLICA,
      });
      await auditar(actor, contexto, { accion: 'denominacion.reactivar', entidadId: id });
      return aPublica(editada);
    },
  };
}
