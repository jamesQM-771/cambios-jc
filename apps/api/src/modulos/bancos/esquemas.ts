import { z } from 'zod';

export const esquemaId = z.object({ id: z.uuid() });

const esquemaCodigo = z
  .string()
  .trim()
  .regex(/^\d{4}$/, 'El código son 4 dígitos (los primeros 4 de una cuenta, ejemplo: 0102).');

const esquemaNombre = z.string().trim().min(2, 'Escribe el nombre del banco.').max(100);

export const esquemaCrearBanco = z.object({
  codigo: esquemaCodigo,
  nombre: esquemaNombre,
  pais: z.string().trim().length(2).toUpperCase().default('VE'),
});

export const esquemaEditarBanco = z
  .object({
    codigo: esquemaCodigo.optional(),
    nombre: esquemaNombre.optional(),
    pais: z.string().trim().length(2).toUpperCase().optional(),
  })
  .refine((datos) => Object.keys(datos).length > 0, 'Indica al menos un dato para cambiar.');

export const esquemaListarBancos = z.object({
  activo: z
    .enum(['true', 'false'])
    .transform((valor) => valor === 'true')
    .optional(),
  busqueda: z.string().trim().max(60).optional(),
});

export const esquemaBancoPublico = z.object({
  id: z.string(),
  codigo: z.string(),
  nombre: z.string(),
  pais: z.string(),
  activo: z.boolean(),
  creadoEn: z.date(),
});

export type BancoPublico = z.infer<typeof esquemaBancoPublico>;

export const respuestaBanco = z.object({ banco: esquemaBancoPublico });

export const respuestaListaBancos = z.object({ bancos: z.array(esquemaBancoPublico) });
