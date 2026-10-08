import { z } from 'zod';

export const esquemaId = z.object({ id: z.uuid() });

const esquemaNombre = z.string().trim().min(2, 'Escribe el nombre de la caja.').max(100);

export const esquemaCrearCaja = z.object({
  nombre: esquemaNombre,
  sucursalId: z.uuid(),
});

export const esquemaEditarCaja = z
  .object({
    nombre: esquemaNombre.optional(),
  })
  .refine((datos) => Object.keys(datos).length > 0, 'Indica al menos un dato para cambiar.');

export const esquemaListarCajas = z.object({
  sucursalId: z.uuid().optional(),
  activa: z
    .enum(['true', 'false'])
    .transform((valor) => valor === 'true')
    .optional(),
});

export const esquemaCajaPublica = z.object({
  id: z.string(),
  nombre: z.string(),
  sucursalId: z.string(),
  sucursalNombre: z.string(),
  activa: z.boolean(),
});

export type CajaPublica = z.infer<typeof esquemaCajaPublica>;

export const respuestaCaja = z.object({ caja: esquemaCajaPublica });

export const respuestaListaCajas = z.object({ cajas: z.array(esquemaCajaPublica) });
