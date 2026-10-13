import { Prisma } from '../../generated/prisma/client.js';
import { errores } from '../../lib/errores.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria } from '../../lib/registrar-auditoria.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import type {
  ClienteConMedios,
  ClientePublico,
  DatosNuevoCliente,
  DatosNuevoMedioPago,
  MedioPagoPublico,
} from './esquemas.js';

const SELECCION_CLIENTE = {
  id: true,
  tipoDocumento: true,
  numeroDocumento: true,
  nombre: true,
  telefono: true,
  activo: true,
  creadoEn: true,
} satisfies Prisma.ClienteSelect;

const SELECCION_MEDIO = {
  id: true,
  tipo: true,
  banco: { select: { id: true, codigo: true, nombre: true } },
  numeroCuenta: true,
  telefonoPagoMovil: true,
  titular: true,
  tipoDocumentoTitular: true,
  numeroDocumentoTitular: true,
  activo: true,
  creadoEn: true,
} satisfies Prisma.MedioPagoSelect;

const MAXIMO_RESULTADOS = 25;

export interface FiltroClientes {
  busqueda?: string | undefined;
  activo?: boolean | undefined;
}

export interface CambiosCliente {
  nombre?: string | undefined;
  telefono?: string | null | undefined;
}

interface Actor {
  id: string;
}

export type ServicioClientes = ReturnType<typeof crearServicioClientes>;

/** Deja solo los últimos dígitos: la bitácora no guarda documentos ni cuentas completos (CLAUDE.md §7). */
const enmascarar = (texto: string | null | undefined): string | null =>
  texto ? `****${texto.slice(-3)}` : null;

export function crearServicioClientes({ prisma }: { prisma: PrismaClient }) {
  const huella = (c: ContextoPeticion) => ({ ip: c.ip, agenteUsuario: c.agenteUsuario });

  async function cargarConMedios(id: string): Promise<ClienteConMedios> {
    const cliente = await prisma.cliente.findUnique({
      where: { id },
      select: {
        ...SELECCION_CLIENTE,
        mediosPago: { select: SELECCION_MEDIO, orderBy: { creadoEn: 'asc' } },
      },
    });
    if (!cliente) throw errores.noEncontrado('El cliente no existe.');
    return cliente;
  }

  return {
    async buscar(filtro: FiltroClientes): Promise<ClientePublico[]> {
      const documento = (filtro.busqueda ?? '').replace(/[\s.-]/g, '').toUpperCase();
      return prisma.cliente.findMany({
        where: {
          ...(filtro.activo === undefined ? {} : { activo: filtro.activo }),
          ...(filtro.busqueda
            ? {
                OR: [
                  { numeroDocumento: { startsWith: documento } },
                  { nombre: { contains: filtro.busqueda, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: [{ nombre: 'asc' }],
        take: MAXIMO_RESULTADOS,
        select: SELECCION_CLIENTE,
      });
    },

    obtener: cargarConMedios,

    /** Bancos activos: quien registra clientes no puede abrir la configuración de bancos. */
    bancosDisponibles() {
      return prisma.banco.findMany({
        where: { activo: true },
        orderBy: { codigo: 'asc' },
        select: { id: true, codigo: true, nombre: true },
      });
    },

    async crear(
      datos: DatosNuevoCliente,
      actor: Actor,
      ctx: ContextoPeticion,
    ): Promise<ClienteConMedios> {
      try {
        const creado = await prisma.$transaction(async (tx) => {
          const cliente = await tx.cliente.create({
            data: {
              tipoDocumento: datos.tipoDocumento,
              numeroDocumento: datos.numeroDocumento,
              nombre: datos.nombre,
              telefono: datos.telefono ?? null,
              creadoPorId: actor.id,
            },
            select: SELECCION_CLIENTE,
          });
          await registrarAuditoria(tx, {
            ...huella(ctx),
            usuarioId: actor.id,
            accion: 'cliente.crear',
            entidad: 'cliente',
            entidadId: cliente.id,
            despues: {
              tipoDocumento: cliente.tipoDocumento,
              numeroDocumento: enmascarar(cliente.numeroDocumento),
              nombre: cliente.nombre,
            },
          });
          return cliente;
        });
        return { ...creado, mediosPago: [] };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw errores.valorEnUso(
            'numeroDocumento',
            'Ya existe un cliente con ese tipo y número de documento.',
          );
        }
        throw error;
      }
    },

    async editar(
      id: string,
      cambios: CambiosCliente,
      actor: Actor,
      ctx: ContextoPeticion,
    ): Promise<ClienteConMedios> {
      const antes = await cargarConMedios(id);
      const data: Prisma.ClienteUpdateInput = {};
      if (cambios.nombre !== undefined) data.nombre = cambios.nombre;
      if (cambios.telefono !== undefined) data.telefono = cambios.telefono;
      await prisma.$transaction(async (tx) => {
        await tx.cliente.update({ where: { id }, data });
        await registrarAuditoria(tx, {
          ...huella(ctx),
          usuarioId: actor.id,
          accion: 'cliente.editar',
          entidad: 'cliente',
          entidadId: id,
          antes: { nombre: antes.nombre, telefono: enmascarar(antes.telefono) },
          despues: {
            nombre: cambios.nombre ?? antes.nombre,
            telefono: enmascarar(
              cambios.telefono === undefined ? antes.telefono : cambios.telefono,
            ),
          },
        });
      });
      return cargarConMedios(id);
    },

    async cambiarEstado(
      id: string,
      activo: boolean,
      actor: Actor,
      ctx: ContextoPeticion,
    ): Promise<ClienteConMedios> {
      const antes = await cargarConMedios(id);
      if (antes.activo === activo) return antes;
      await prisma.$transaction(async (tx) => {
        await tx.cliente.update({ where: { id }, data: { activo } });
        await registrarAuditoria(tx, {
          ...huella(ctx),
          usuarioId: actor.id,
          accion: activo ? 'cliente.reactivar' : 'cliente.desactivar',
          entidad: 'cliente',
          entidadId: id,
        });
      });
      return cargarConMedios(id);
    },

    async agregarMedioPago(
      clienteId: string,
      datos: DatosNuevoMedioPago,
      actor: Actor,
      ctx: ContextoPeticion,
    ): Promise<MedioPagoPublico> {
      const cliente = await cargarConMedios(clienteId);
      if (!cliente.activo) {
        throw errores.estadoInvalido(
          'El cliente está desactivado: reactívalo para agregarle datos de pago.',
        );
      }
      const banco = await prisma.banco.findUnique({ where: { id: datos.bancoId } });
      if (!banco?.activo) {
        throw errores.valorEnUso('bancoId', 'El banco no existe o está desactivado.');
      }
      if (datos.tipo === 'cuenta_bancaria' && !datos.numeroCuenta.startsWith(banco.codigo)) {
        throw errores.valorEnUso(
          'numeroCuenta',
          `La cuenta no corresponde a ${banco.nombre}: debe empezar por ${banco.codigo}.`,
        );
      }
      return prisma.$transaction(async (tx) => {
        const creado = await tx.medioPago.create({
          data: {
            clienteId,
            tipo: datos.tipo,
            bancoId: datos.bancoId,
            numeroCuenta: datos.tipo === 'cuenta_bancaria' ? datos.numeroCuenta : null,
            telefonoPagoMovil: datos.tipo === 'pago_movil' ? datos.telefonoPagoMovil : null,
            titular: datos.titular,
            tipoDocumentoTitular: datos.tipoDocumentoTitular,
            numeroDocumentoTitular: datos.numeroDocumentoTitular,
          },
          select: SELECCION_MEDIO,
        });
        await registrarAuditoria(tx, {
          ...huella(ctx),
          usuarioId: actor.id,
          accion: 'medio_pago.crear',
          entidad: 'medio_pago',
          entidadId: creado.id,
          despues: {
            clienteId,
            tipo: creado.tipo,
            banco: creado.banco.nombre,
            destino: enmascarar(creado.numeroCuenta ?? creado.telefonoPagoMovil),
            titular: creado.titular,
          },
        });
        return creado;
      });
    },

    async cambiarEstadoMedioPago(
      clienteId: string,
      medioId: string,
      activo: boolean,
      actor: Actor,
      ctx: ContextoPeticion,
    ): Promise<MedioPagoPublico> {
      const medio = await prisma.medioPago.findFirst({
        where: { id: medioId, clienteId },
        select: SELECCION_MEDIO,
      });
      if (!medio) throw errores.noEncontrado('El medio de pago no existe.');
      if (medio.activo === activo) return medio;
      return prisma.$transaction(async (tx) => {
        const editado = await tx.medioPago.update({
          where: { id: medioId },
          data: { activo },
          select: SELECCION_MEDIO,
        });
        await registrarAuditoria(tx, {
          ...huella(ctx),
          usuarioId: actor.id,
          accion: activo ? 'medio_pago.reactivar' : 'medio_pago.desactivar',
          entidad: 'medio_pago',
          entidadId: medioId,
        });
        return editado;
      });
    },
  };
}
