import { esFechaValida } from '@cambios-jc/shared';
import { z } from 'zod';

export const esquemaId = z.object({ id: z.uuid() });

const dia = z.string().refine(esFechaValida, 'Usa el formato AAAA-MM-DD con una fecha que exista.');

// El dinero viaja como texto, sin separador de miles (CLAUDE.md §6). Hasta 3 decimales: el servicio
// rechaza los que la moneda de las cuentas no admita (COP y USD, 2; VES, 3).
export const esquemaRegistrarTraslado = z
  .object({
    /** La genera la pantalla al abrir el formulario; un reintento la repite y no duplica el traslado. */
    claveIdempotencia: z.uuid(),
    origenId: z.uuid(),
    destinoId: z.uuid(),
    monto: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,3})?$/, 'Escribe el monto como un número con hasta 3 decimales.')
      .refine((valor) => /[1-9]/.test(valor), 'El monto debe ser mayor que cero.'),
    nota: z.string().trim().max(200).optional(),
  })
  .strict()
  .refine((datos) => datos.origenId !== datos.destinoId, {
    message: 'El origen y el destino deben ser cuentas distintas.',
    path: ['destinoId'],
  });

export type DatosRegistrarTraslado = z.infer<typeof esquemaRegistrarTraslado>;

export const esquemaAnularTraslado = z
  .object({ motivo: z.string().trim().min(3, 'Explica por qué se anula.').max(300) })
  .strict();

export const esquemaListarTraslados = z.object({
  cuentaId: z.uuid().optional(),
  /** Día en la zona horaria de la empresa, incluido. */
  desde: dia.optional(),
  /** Día en la zona horaria de la empresa, incluido. */
  hasta: dia.optional(),
});

const cuentaResumen = z.object({ id: z.string(), nombre: z.string(), moneda: z.string() });

export const esquemaTrasladoPublico = z.object({
  id: z.string(),
  origen: cuentaResumen,
  destino: cuentaResumen,
  monto: z.string(),
  nota: z.string().nullable(),
  turno: z
    .object({ id: z.string(), caja: z.object({ id: z.string(), nombre: z.string() }) })
    .nullable(),
  creadoPor: z.object({ id: z.string(), nombre: z.string() }),
  creadoEn: z.date(),
  anulado: z
    .object({
      por: z.object({ id: z.string(), nombre: z.string() }),
      en: z.date(),
      motivo: z.string(),
    })
    .nullable(),
});

export type TrasladoPublico = z.infer<typeof esquemaTrasladoPublico>;

export const respuestaTraslado = z.object({ traslado: esquemaTrasladoPublico });
export const respuestaListaTraslados = z.object({ traslados: z.array(esquemaTrasladoPublico) });

/** Lo que necesita el formulario: las cuentas activas y el turno de quien traslada. */
export const esquemaOpcionesTraslado = z.object({
  cuentas: z.array(
    z.object({
      id: z.string(),
      nombre: z.string(),
      tipo: z.enum(['caja', 'banco', 'billetera']),
      moneda: z.string(),
      /** Caja a la que pertenece una cuenta de efectivo; `null` en bancos, billeteras y la bóveda. */
      cajaId: z.string().nullable(),
    }),
  ),
  miTurno: z
    .object({ id: z.string(), caja: z.object({ id: z.string(), nombre: z.string() }) })
    .nullable(),
  /** `true` si puede mover dinero entre cualesquiera cuentas (administrador). */
  puedeCualquierCuenta: z.boolean(),
});
