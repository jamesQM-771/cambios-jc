import { esFechaValida } from '@cambios-jc/shared';
import { z } from 'zod';

export const esquemaId = z.object({ id: z.uuid() });

const dia = z.string().refine(esFechaValida, 'Usa el formato AAAA-MM-DD con una fecha que exista.');

export const TIPOS_GASTO = ['operativo', 'retiro_dueno'] as const;

// El dinero viaja como texto, sin separador de miles (CLAUDE.md §6). El servicio rechaza los
// decimales que la moneda de la cuenta no admita (COP y USD, 2; VES, 3).
export const esquemaRegistrarGasto = z
  .object({
    /** La genera la pantalla al abrir el formulario; un reintento la repite y no duplica el gasto. */
    claveIdempotencia: z.uuid(),
    tipo: z.enum(TIPOS_GASTO).default('operativo'),
    /** Obligatoria en un gasto operativo; un retiro del dueño puede no llevarla. */
    categoriaId: z.uuid().optional(),
    descripcion: z.string().trim().min(3, 'Describe en qué se gastó.').max(200),
    cuentaId: z.uuid(),
    monto: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,3})?$/, 'Escribe el monto como un número con hasta 3 decimales.')
      .refine((valor) => /[1-9]/.test(valor), 'El monto debe ser mayor que cero.'),
  })
  .strict()
  .refine((datos) => datos.tipo === 'retiro_dueno' || datos.categoriaId !== undefined, {
    message: 'Elige la categoría del gasto.',
    path: ['categoriaId'],
  });

export type DatosRegistrarGasto = z.infer<typeof esquemaRegistrarGasto>;

export const esquemaAnularGasto = z
  .object({ motivo: z.string().trim().min(3, 'Explica por qué se anula.').max(300) })
  .strict();

export const esquemaListarGastos = z.object({
  tipo: z.enum(TIPOS_GASTO).optional(),
  cuentaId: z.uuid().optional(),
  categoriaId: z.uuid().optional(),
  /** Día en la zona horaria de la empresa, incluido. */
  desde: dia.optional(),
  /** Día en la zona horaria de la empresa, incluido. */
  hasta: dia.optional(),
});

export const esquemaGastoPublico = z.object({
  id: z.string(),
  tipo: z.enum(TIPOS_GASTO),
  categoria: z.object({ id: z.string(), nombre: z.string() }).nullable(),
  descripcion: z.string(),
  cuenta: z.object({
    id: z.string(),
    nombre: z.string(),
    moneda: z.string(),
    sucursal: z.object({ id: z.string(), nombre: z.string() }),
  }),
  monto: z.string(),
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

export type GastoPublico = z.infer<typeof esquemaGastoPublico>;

export const respuestaGasto = z.object({ gasto: esquemaGastoPublico });
export const respuestaListaGastos = z.object({ gastos: z.array(esquemaGastoPublico) });

/** Lo que necesita el formulario: categorías, cuentas y el turno de quien registra. */
export const esquemaOpcionesGasto = z.object({
  categorias: z.array(z.object({ id: z.string(), nombre: z.string() })),
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
  /** `true` si puede pagar desde cualquier cuenta y registrar retiros del dueño (administrador). */
  puedeGestionar: z.boolean(),
});
