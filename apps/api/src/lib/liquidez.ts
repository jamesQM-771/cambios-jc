import {
  comparar,
  inicioDelDia,
  montoATexto,
  multiplicar,
  restar,
  sumar,
  type Decimal,
  type Moneda,
  type ValorDecimal,
} from '@cambios-jc/shared';

import { fechaEnZona } from '../modulos/turnos/servicio.js';

import { saldoDeCuenta } from './libro.js';
import type { PrismaClient } from './prisma.js';

/**
 * Liquidez de una moneda destino (§5.10, §7.4, D160):
 * - disponible: lo que hay en las cuentas activas de esa moneda, según el libro;
 * - comprometido: bolívares de las remesas en cola o tomadas sin completar;
 * - libre = disponible − comprometido.
 * También el uso del límite diario de cada cuenta (salidas de hoy frente a su límite).
 */
export async function liquidezDe(prisma: PrismaClient, moneda: Moneda) {
  const empresa = await prisma.empresa.findUnique({ where: { unica: true } });
  const zona = empresa?.zonaHoraria ?? 'America/Bogota';
  const inicioHoy = inicioDelDia(fechaEnZona(new Date(), zona), zona);
  const cuentas = await prisma.cuentaDinero.findMany({
    where: { moneda, activa: true },
    orderBy: { nombre: 'asc' },
    select: { id: true, nombre: true, limiteDiario: true },
  });
  let disponible: Decimal = sumar('0', '0');
  const porCuenta = [];
  for (const cuenta of cuentas) {
    const saldo = await saldoDeCuenta(prisma, cuenta.id);
    disponible = sumar(disponible, saldo);
    const salidas = await prisma.movimientoCuenta.aggregate({
      where: { cuentaId: cuenta.id, sentido: 'salida', creadoEn: { gte: inicioHoy } },
      _sum: { monto: true },
    });
    const usadoHoy = salidas._sum.monto?.toString() ?? '0';
    porCuenta.push({
      id: cuenta.id,
      nombre: cuenta.nombre,
      saldo: montoATexto(saldo, moneda),
      limiteDiario: cuenta.limiteDiario
        ? montoATexto(cuenta.limiteDiario.toString(), moneda)
        : null,
      usadoHoy: montoATexto(usadoHoy, moneda),
      restanteHoy: cuenta.limiteDiario
        ? montoATexto(restar(cuenta.limiteDiario.toString(), usadoHoy), moneda)
        : null,
    });
  }
  const enCola = await prisma.operacion.aggregate({
    where: { estado: { in: ['en_cola', 'tomada'] }, lineaNegocio: { monedaDestino: moneda } },
    _sum: { montoBolivares: true },
  });
  const comprometido = enCola._sum.montoBolivares?.toString() ?? '0';
  return {
    moneda,
    disponible: montoATexto(disponible, moneda),
    comprometido: montoATexto(comprometido, moneda),
    libre: montoATexto(restar(disponible, comprometido), moneda),
    cuentas: porCuenta,
  };
}

/** ¿Alcanza lo libre para una remesa más? (§5.3 paso 8: avisa, no bloquea). */
export function alcanzaPara(libre: ValorDecimal, monto: ValorDecimal): boolean {
  return comparar(libre, monto) >= 0;
}

/** Una cuenta está cerca de su límite diario si ya usó al menos ese porcentaje. */
export function cercaDelLimite(
  usadoHoy: ValorDecimal,
  limiteDiario: ValorDecimal,
  porcentaje: number,
): boolean {
  return comparar(multiplicar(usadoHoy, '100'), multiplicar(limiteDiario, String(porcentaje))) >= 0;
}
