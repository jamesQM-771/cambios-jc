import { MONEDAS, type Moneda } from '@cambios-jc/shared';
import { z } from 'zod';

export const esquemaId = z.object({ id: z.uuid() });

const MONEDAS_SOPORTADAS = Object.keys(MONEDAS) as [Moneda, ...Moneda[]];
const esquemaMoneda = z.enum(MONEDAS_SOPORTADAS);

const esquemaLinea = z.object({
  denominacionId: z.uuid(),
  /** Cuántos billetes o monedas de esa denominación se contaron. */
  cantidad: z.number().int('La cantidad es un número entero.').min(0).max(1_000_000),
});

/** Conteo de una moneda: una línea por denominación contada. */
const esquemaConteoMoneda = z.object({
  moneda: esquemaMoneda,
  lineas: z.array(esquemaLinea).max(100),
});

/**
 * Apertura de turno (§5.16): la persona elige su caja y cuenta el efectivo por denominación. El
 * servidor calcula los totales; nunca los recibe.
 */
export const esquemaAbrirTurno = z.object({
  cajaId: z.uuid(),
  conteos: z.array(esquemaConteoMoneda).min(1).max(5),
});

export type DatosAbrirTurno = z.infer<typeof esquemaAbrirTurno>;

/**
 * Cierre de turno (§5.16): se cuenta el efectivo por denominación y el servidor lo compara con lo
 * esperado. Si no cuadra, cada moneda con diferencia lleva su explicación (sin tolerancia, D127).
 * Quien cierra el turno de otra persona (turno olvidado) debe dar el motivo.
 */
export const esquemaCerrarTurno = z
  .object({
    conteos: z.array(esquemaConteoMoneda).min(1).max(5),
    explicaciones: z
      .array(
        z.object({
          moneda: esquemaMoneda,
          texto: z.string().trim().min(3, 'Explica a qué se debe la diferencia.').max(300),
        }),
      )
      .max(5)
      .default([]),
    motivo: z.string().trim().min(3, 'Explica por qué cierras este turno.').max(300).optional(),
  })
  .strict();

export type DatosCerrarTurno = z.infer<typeof esquemaCerrarTurno>;

export const esquemaListarTurnos = z.object({
  estado: z.enum(['abierto', 'cerrado']).optional(),
  cajaId: z.uuid().optional(),
});

const esquemaSaldo = z.object({
  momento: z.enum(['apertura', 'cierre']),
  moneda: z.string(),
  /** Lo que debía haber; `null` en el primer turno de la caja (no hay contra qué comparar). */
  esperado: z.string().nullable(),
  contado: z.string(),
  /** contado − esperado: positivo es sobrante, negativo es faltante. */
  diferencia: z.string().nullable(),
  explicacion: z.string().nullable(),
  /** Solo al cerrar: cuadrado, sobrante (contó de más) o faltante (contó de menos). */
  resultado: z.enum(['cuadrado', 'sobrante', 'faltante']).nullable(),
});

const esquemaConteo = z.object({
  momento: z.enum(['apertura', 'cierre']),
  moneda: z.string(),
  valor: z.string(),
  cantidad: z.number().int(),
});

export const esquemaTurnoPublico = z.object({
  id: z.string(),
  caja: z.object({ id: z.string(), nombre: z.string() }),
  usuario: z.object({ id: z.string(), nombre: z.string() }),
  estado: z.enum(['abierto', 'cerrado']),
  abiertoEn: z.date(),
  cerradoEn: z.date().nullable(),
  /** Quién lo cerró y, si no fue su dueño, por qué. */
  cerradoPor: z.object({ id: z.string(), nombre: z.string() }).nullable(),
  motivoCierre: z.string().nullable(),
  jornada: z.object({ id: z.string(), fecha: z.string() }),
  saldos: z.array(esquemaSaldo),
  conteos: z.array(esquemaConteo),
});

export type TurnoPublico = z.infer<typeof esquemaTurnoPublico>;

/**
 * Lo que necesita la pantalla para abrir un turno y que quien vende no podría pedir en
 * Configuración: las cajas con su efectivo (una cuenta por moneda) y las denominaciones activas.
 */
export const esquemaOpcionesTurno = z.object({
  cajas: z.array(
    z.object({
      id: z.string(),
      nombre: z.string(),
      sucursal: z.object({ id: z.string(), nombre: z.string() }),
      /** Nombre de quien tiene el turno abierto en esa caja, o `null` si está libre. */
      ocupadaPor: z.string().nullable(),
      monedas: z.array(
        z.object({
          moneda: z.string(),
          cuenta: z.object({ id: z.string(), nombre: z.string() }),
          denominaciones: z.array(z.object({ id: z.string(), valor: z.string() })),
        }),
      ),
    }),
  ),
  miTurno: esquemaTurnoPublico.nullable(),
});

export const respuestaTurno = z.object({ turno: esquemaTurnoPublico });
export const respuestaTurnoActual = z.object({ turno: esquemaTurnoPublico.nullable() });
export const respuestaListaTurnos = z.object({ turnos: z.array(esquemaTurnoPublico) });
