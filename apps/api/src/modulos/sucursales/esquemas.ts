import { z } from 'zod';

export const esquemaId = z.object({ id: z.uuid() });

const esquemaNombre = z.string().trim().min(2, 'Escribe el nombre de la sucursal.').max(100);
const esquemaCiudad = z.string().trim().min(2, 'Escribe la ciudad.').max(100);

export const esquemaCrearSucursal = z.object({
  nombre: esquemaNombre,
  ciudad: esquemaCiudad,
});

export const esquemaEditarSucursal = z
  .object({
    nombre: esquemaNombre.optional(),
    ciudad: esquemaCiudad.optional(),
  })
  .refine((datos) => Object.keys(datos).length > 0, 'Indica al menos un dato para cambiar.');

export const esquemaListarSucursales = z.object({
  activa: z
    .enum(['true', 'false'])
    .transform((valor) => valor === 'true')
    .optional(),
});

export const esquemaSucursalPublica = z.object({
  id: z.string(),
  nombre: z.string(),
  ciudad: z.string(),
  activa: z.boolean(),
});

export type SucursalPublica = z.infer<typeof esquemaSucursalPublica>;

export const respuestaSucursal = z.object({ sucursal: esquemaSucursalPublica });

export const respuestaListaSucursales = z.object({
  sucursales: z.array(esquemaSucursalPublica),
});
