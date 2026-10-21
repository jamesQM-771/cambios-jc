import { fechaEnZona } from '../src/modulos/turnos/servicio.js';
import type { PrismaClient } from '../src/lib/prisma.js';

/**
 * Abre un turno de caja para una persona, directo en la base (sin conteo de apertura): desde la
 * tarea 3.3 nadie registra una remesa sin turno. Si la cuenta de efectivo todavía no pertenece a
 * una caja, crea una en su sucursal y se la asigna. Devuelve el turno y la caja.
 */
export async function abrirTurnoDePrueba(
  prisma: PrismaClient,
  { usuarioId, cuentaCajaId }: { usuarioId: string; cuentaCajaId: string },
): Promise<{ turnoId: string; cajaId: string }> {
  const cuenta = await prisma.cuentaDinero.findUniqueOrThrow({ where: { id: cuentaCajaId } });
  let cajaId = cuenta.cajaId;
  if (!cajaId) {
    const caja = await prisma.caja.create({
      data: { nombre: `Caja de ${cuenta.nombre}`, sucursalId: cuenta.sucursalId },
    });
    await prisma.cuentaDinero.update({ where: { id: cuenta.id }, data: { cajaId: caja.id } });
    cajaId = caja.id;
  }
  const fecha = new Date(`${fechaEnZona(new Date(), 'America/Bogota')}T00:00:00Z`);
  await prisma.jornada.createMany({
    data: [{ sucursalId: cuenta.sucursalId, fecha }],
    skipDuplicates: true,
  });
  const jornada = await prisma.jornada.findUniqueOrThrow({
    where: { sucursalId_fecha: { sucursalId: cuenta.sucursalId, fecha } },
  });
  const turno = await prisma.turno.create({
    data: { cajaId, usuarioId, jornadaId: jornada.id, cajaEnUso: cajaId, usuarioEnUso: usuarioId },
  });
  return { turnoId: turno.id, cajaId };
}
