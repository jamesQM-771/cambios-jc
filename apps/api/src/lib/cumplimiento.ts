import { comparar, inicioDelDia, montoATexto, sumar } from '@cambios-jc/shared';

import type { Prisma } from '../generated/prisma/client.js';
import { fechaEnZona } from '../modulos/turnos/servicio.js';

import { errores } from './errores.js';
import type { PrismaClient } from './prisma.js';

/**
 * Reglas de cumplimiento al registrar una remesa (§5.13, §7.7, D150 a D152). Los umbrales viven en
 * `parametros_cumplimiento` y están apagados (null) hasta que el contador los defina (§13, 9):
 * mientras tanto solo actúa la lista restrictiva, que no depende de un umbral.
 */

type Cliente = Pick<PrismaClient | Prisma.TransactionClient, keyof Prisma.TransactionClient>;

/** Documento comparable: solo letras y dígitos, en mayúsculas ("V-12.345.678" → "V12345678"). */
export function normalizarDocumento(texto: string): string {
  return texto.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** Nombre comparable: minúsculas, sin tildes ni espacios repetidos. */
export function normalizarNombre(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

interface Persona {
  id: string;
  nombre: string;
  tipoDocumento?: string;
  numeroDocumento: string;
}

/** Coincidencia de una persona en la lista restrictiva activa (por documento o por nombre exacto). */
export async function coincidenciaEnLista(cliente: Cliente, persona: Persona) {
  // En la lista el documento puede venir con su tipo ("V-12345678") o sin él ("12345678").
  const documentos = new Set([
    normalizarDocumento(persona.numeroDocumento),
    normalizarDocumento(`${persona.tipoDocumento ?? ''}${persona.numeroDocumento}`),
  ]);
  const nombre = normalizarNombre(persona.nombre);
  const candidatas = await cliente.entradaListaRestrictiva.findMany({
    where: { activa: true },
    select: { id: true, fuente: true, nombre: true, numeroDocumento: true },
  });
  return (
    candidatas.find(
      (e) =>
        (e.numeroDocumento !== null && documentos.has(normalizarDocumento(e.numeroDocumento))) ||
        normalizarNombre(e.nombre) === nombre,
    ) ?? null
  );
}

async function zona(cliente: Cliente): Promise<string> {
  const empresa = await cliente.empresa.findUnique({ where: { unica: true } });
  return empresa?.zonaHoraria ?? 'America/Bogota';
}

/** Pesos que un remitente ha enviado desde un instante (sin anuladas ni devueltas). */
async function enviadoDesde(cliente: Cliente, remitenteId: string, desde: Date) {
  const total = await cliente.operacion.aggregate({
    where: {
      remitenteId,
      creadoEn: { gte: desde },
      estado: { notIn: ['anulada', 'devuelta'] },
    },
    _sum: { montoPesos: true },
  });
  return total._sum.montoPesos?.toString() ?? '0';
}

/** Acumulados de un cliente como remitente (pesos) y como beneficiario (bolívares), §5.13. */
export async function acumuladosDe(cliente: Cliente, clienteId: string) {
  const z = await zona(cliente);
  const hoy = fechaEnZona(new Date(), z);
  const desde = {
    dia: inicioDelDia(hoy, z),
    mes: inicioDelDia(`${hoy.slice(0, 7)}-01`, z),
    anio: inicioDelDia(`${hoy.slice(0, 4)}-01-01`, z),
  };
  const recibido = async (inicio: Date) => {
    const total = await cliente.operacion.aggregate({
      where: {
        transferencia: { medioPago: { clienteId } },
        creadoEn: { gte: inicio },
        estado: { notIn: ['anulada', 'devuelta'] },
      },
      _sum: { montoBolivares: true },
    });
    return montoATexto(total._sum.montoBolivares?.toString() ?? '0', 'VES');
  };
  const enviado = async (inicio: Date) =>
    montoATexto(await enviadoDesde(cliente, clienteId, inicio), 'COP');
  return {
    comoRemitente: {
      dia: await enviado(desde.dia),
      mes: await enviado(desde.mes),
      anio: await enviado(desde.anio),
    },
    comoBeneficiario: {
      dia: await recibido(desde.dia),
      mes: await recibido(desde.mes),
      anio: await recibido(desde.anio),
    },
  };
}

/**
 * Antes de registrar: una coincidencia en la lista restrictiva **bloquea** la operación y deja una
 * alerta escalada (§7.7); si el acumulado del mes del remitente supera el umbral configurado y su
 * ficha ampliada está incompleta, se exige la ficha antes de seguir.
 */
export async function verificarAntesDeRegistrar(
  prisma: PrismaClient,
  datos: { remitente: Persona; beneficiario: Persona; montoPesos: string },
): Promise<void> {
  for (const [rol, persona] of [
    ['remitente', datos.remitente],
    ['beneficiario', datos.beneficiario],
  ] as const) {
    const coincidencia = await coincidenciaEnLista(prisma, persona);
    if (coincidencia) {
      await prisma.alertaCumplimiento.create({
        data: {
          tipo: 'lista_restrictiva',
          estado: 'escalada',
          clienteId: persona.id,
          detalle: {
            rol,
            fuente: coincidencia.fuente,
            entradaId: coincidencia.id,
            nombreEnLista: coincidencia.nombre,
            montoPesos: datos.montoPesos,
          },
        },
      });
      throw errores.estadoInvalido(
        `Operación bloqueada: el ${rol} coincide con una lista restrictiva. Quedó escalada para revisión del administrador.`,
      );
    }
  }

  const parametros = await prisma.parametrosCumplimiento.findUnique({ where: { unica: true } });
  if (parametros?.umbralFichaMensual) {
    const z = await zona(prisma);
    const inicioMes = inicioDelDia(`${fechaEnZona(new Date(), z).slice(0, 7)}-01`, z);
    const acumulado = sumar(
      await enviadoDesde(prisma, datos.remitente.id, inicioMes),
      datos.montoPesos,
    );
    if (comparar(acumulado, parametros.umbralFichaMensual.toString()) > 0) {
      const perfil = await prisma.perfilRiesgo.findUnique({
        where: { clienteId: datos.remitente.id },
      });
      if (!perfil?.actividadEconomica || !perfil.origenFondos) {
        throw errores.estadoInvalido(
          'El remitente supera el monto mensual que exige la ficha ampliada: completa su actividad económica y el origen de los fondos antes de registrar.',
        );
      }
    }
  }
}

/**
 * Después de registrar (en la misma transacción): alertas de fraccionamiento y de concentración, que
 * no bloquean (§7.7). Solo actúan si sus parámetros están configurados.
 */
export async function alertasDespuesDeRegistrar(
  tx: Prisma.TransactionClient,
  datos: { operacionId: string; remitenteId: string; beneficiarioId: string },
): Promise<void> {
  const parametros = await tx.parametrosCumplimiento.findUnique({ where: { unica: true } });
  if (!parametros) return;
  const ahora = Date.now();

  if (parametros.fraccionamientoCantidad && parametros.fraccionamientoMontoMaximo) {
    const recientes = await tx.operacion.findMany({
      where: {
        remitenteId: datos.remitenteId,
        creadoEn: { gte: new Date(ahora - 24 * 3_600_000) },
        estado: { notIn: ['anulada', 'devuelta'] },
      },
      select: { id: true, montoPesos: true },
    });
    const pequenas = recientes.filter(
      (o) =>
        comparar(
          o.montoPesos.toString(),
          parametros.fraccionamientoMontoMaximo?.toString() ?? '0',
        ) < 0,
    );
    if (
      pequenas.length === recientes.length &&
      recientes.length > parametros.fraccionamientoCantidad
    ) {
      await tx.alertaCumplimiento.create({
        data: {
          tipo: 'fraccionamiento',
          clienteId: datos.remitenteId,
          operacionId: datos.operacionId,
          detalle: {
            operaciones24h: recientes.length,
            limite: parametros.fraccionamientoCantidad,
            montoMaximo: parametros.fraccionamientoMontoMaximo.toFixed(2),
          },
        },
      });
    }
  }

  if (parametros.concentracionRemitentes) {
    const remitentes = await tx.operacion.findMany({
      where: {
        transferencia: { medioPago: { clienteId: datos.beneficiarioId } },
        creadoEn: { gte: new Date(ahora - 30 * 24 * 3_600_000) },
        estado: { notIn: ['anulada', 'devuelta'] },
      },
      distinct: ['remitenteId'],
      select: { remitenteId: true },
    });
    // La remesa recién creada aún no tiene su transferencia en esta consulta si se crea después:
    const distintos = new Set([...remitentes.map((r) => r.remitenteId), datos.remitenteId]);
    if (distintos.size > parametros.concentracionRemitentes) {
      await tx.alertaCumplimiento.create({
        data: {
          tipo: 'concentracion',
          clienteId: datos.beneficiarioId,
          operacionId: datos.operacionId,
          detalle: {
            remitentes30d: distintos.size,
            limite: parametros.concentracionRemitentes,
          },
        },
      });
    }
  }
}
