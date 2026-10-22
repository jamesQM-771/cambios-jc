import { z } from 'zod';

export const esquemaId = z.object({ id: z.uuid() });

const esquemaNombre = z.string().trim().min(2, 'Escribe el nombre de la categoría.').max(60);

export const esquemaCrearCategoriaGasto = z.object({ nombre: esquemaNombre });

export const esquemaEditarCategoriaGasto = z.object({ nombre: esquemaNombre });

export const esquemaListarCategoriasGasto = z.object({
  activa: z
    .enum(['true', 'false'])
    .transform((valor) => valor === 'true')
    .optional(),
});

export const esquemaCategoriaGastoPublica = z.object({
  id: z.string(),
  nombre: z.string(),
  activa: z.boolean(),
  creadoEn: z.date(),
});

export type CategoriaGastoPublica = z.infer<typeof esquemaCategoriaGastoPublica>;

export const respuestaCategoriaGasto = z.object({ categoria: esquemaCategoriaGastoPublica });
export const respuestaListaCategoriasGasto = z.object({
  categorias: z.array(esquemaCategoriaGastoPublica),
});
