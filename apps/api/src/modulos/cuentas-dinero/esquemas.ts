import { MONEDAS, type Moneda } from '@cambios-jc/shared';
import { z } from 'zod';

export const esquemaId = z.object({ id: z.uuid() });

const MONEDAS_SOPORTADAS = Object.keys(MONEDAS) as [Moneda, ...Moneda[]];
const esquemaMoneda = z.enum(MONEDAS_SOPORTADAS);
const esquemaTipo = z.enum(['caja', 'banco', 'billetera']);

const esquemaNombre = z.string().trim().min(2, 'Escribe el nombre de la cuenta.').max(100);
const esquemaUltimos4 = z
  .string()
  .trim()
  .regex(/^\d{4}$/, 'Escribe los últimos 4 dígitos.');
const esquemaTitular = z
  .string()
  .trim()
  .max(100)
  .nullable()
  .optional()
  .transform((valor) => (valor === '' ? null : (valor ?? null)));
// Dinero en texto, sin separador de miles (D3); null permitido para "sin límite"/"sin comisión".
const esquemaMontoOpcional = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/, 'Escribe un número positivo, sin separador de miles.')
  .nullable()
  .optional()
  .transform((valor) => (valor === '' ? null : (valor ?? null)));

const camposComunes = {
  nombre: esquemaNombre,
  moneda: esquemaMoneda,
  sucursalId: z.uuid(),
  titular: esquemaTitular,
  /** Contraparte a cuyo nombre está la cuenta (§5.9, D137). */
  contraparteTitularId: z.uuid().nullable().optional(),
  responsableId: z.uuid().nullable().optional(),
  limiteDiario: esquemaMontoOpcional,
  comisionPorDefecto: esquemaMontoOpcional,
};

// bancoId y últimos 4 dígitos solo tienen sentido para una cuenta bancaria.
// .strict() en cada variante: sin esto, Zod descarta en silencio un campo que no esperaba (ej.
// bancoId en una cuenta tipo "caja") en vez de rechazar la petición.
export const esquemaCrearCuentaDinero = z.discriminatedUnion('tipo', [
  z
    .object({
      tipo: z.literal('banco'),
      bancoId: z.uuid(),
      ultimos4Digitos: esquemaUltimos4,
      ...camposComunes,
    })
    .strict(),
  // `cajaId` es el puesto al que pertenece el efectivo; sin él es la bóveda de la sucursal (D116).
  z
    .object({ tipo: z.literal('caja'), cajaId: z.uuid().nullable().optional(), ...camposComunes })
    .strict(),
  z.object({ tipo: z.literal('billetera'), ...camposComunes }).strict(),
]);

// El tipo, la moneda, la sucursal y el banco son estructurales: no se editan (se desactiva y se crea
// otra cuenta si hace falta cambiarlos). Lo demás sí cambia con el tiempo (ej. la comisión del banco).
export const esquemaEditarCuentaDinero = z
  .object({
    nombre: esquemaNombre.optional(),
    ultimos4Digitos: esquemaUltimos4.optional(),
    cajaId: z.uuid().nullable().optional(),
    titular: esquemaTitular,
    contraparteTitularId: z.uuid().nullable().optional(),
    responsableId: z.uuid().nullable().optional(),
    limiteDiario: esquemaMontoOpcional,
    comisionPorDefecto: esquemaMontoOpcional,
  })
  .refine((datos) => Object.keys(datos).length > 0, 'Indica al menos un dato para cambiar.');

export const esquemaListarCuentasDinero = z.object({
  moneda: esquemaMoneda.optional(),
  sucursalId: z.uuid().optional(),
  tipo: esquemaTipo.optional(),
  activa: z
    .enum(['true', 'false'])
    .transform((valor) => valor === 'true')
    .optional(),
});

export const esquemaCuentaDineroPublica = z.object({
  id: z.string(),
  nombre: z.string(),
  tipo: esquemaTipo,
  moneda: z.string(),
  bancoId: z.string().nullable(),
  bancoNombre: z.string().nullable(),
  ultimos4Digitos: z.string().nullable(),
  sucursalId: z.string(),
  sucursalNombre: z.string(),
  cajaId: z.string().nullable(),
  cajaNombre: z.string().nullable(),
  titular: z.string().nullable(),
  contraparteTitularId: z.string().nullable(),
  contraparteTitularNombre: z.string().nullable(),
  responsableId: z.string().nullable(),
  responsableNombre: z.string().nullable(),
  activa: z.boolean(),
  limiteDiario: z.string().nullable(),
  comisionPorDefecto: z.string().nullable(),
  creadoEn: z.date(),
});

export type CuentaDineroPublica = z.infer<typeof esquemaCuentaDineroPublica>;

export const respuestaCuentaDinero = z.object({ cuenta: esquemaCuentaDineroPublica });

export const respuestaListaCuentasDinero = z.object({
  cuentas: z.array(esquemaCuentaDineroPublica),
});
