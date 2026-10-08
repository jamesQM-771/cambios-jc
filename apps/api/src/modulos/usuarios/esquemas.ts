import { ROLES } from '@cambios-jc/shared';
import { z } from 'zod';

export const esquemaId = z.object({ id: z.uuid() });

const esquemaRol = z.enum(ROLES);

/** Usuario en minúsculas: 3 a 40 caracteres entre letras, números, punto, guion y guion bajo. */
export const esquemaLoginNuevo = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9._-]{3,40}$/,
    'Usa de 3 a 40 caracteres: letras sin tildes, números, punto, guion o guion bajo.',
  );

const esquemaNombre = z.string().trim().min(2, 'Escribe el nombre.').max(100);

export const esquemaCrearUsuario = z.object({
  nombre: esquemaNombre,
  login: esquemaLoginNuevo,
  rol: esquemaRol,
  sucursalId: z.uuid().nullable().optional(),
});

export const esquemaEditarUsuario = z
  .object({
    nombre: esquemaNombre.optional(),
    rol: esquemaRol.optional(),
    sucursalId: z.uuid().nullable().optional(),
  })
  .refine((datos) => Object.keys(datos).length > 0, 'Indica al menos un dato para cambiar.');

export const esquemaListarUsuarios = z.object({
  rol: esquemaRol.optional(),
  activo: z
    .enum(['true', 'false'])
    .transform((valor) => valor === 'true')
    .optional(),
  busqueda: z.string().trim().max(60).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
});

/** Lo único que se sabe de un usuario hacia afuera: nunca hash, secreto 2FA ni intentos. */
export const esquemaUsuarioPublico = z.object({
  id: z.string(),
  nombre: z.string(),
  login: z.string(),
  rol: esquemaRol,
  sucursalId: z.string().nullable(),
  sucursalNombre: z.string().nullable(),
  activo: z.boolean(),
  tiene2fa: z.boolean(),
  debeCambiarContrasena: z.boolean(),
  bloqueadoHasta: z.date().nullable(),
  ultimoAcceso: z.date().nullable(),
  creadoEn: z.date(),
});

export type UsuarioPublico = z.infer<typeof esquemaUsuarioPublico>;

export const respuestaUsuario = z.object({ usuario: esquemaUsuarioPublico });

export const respuestaListaUsuarios = z.object({
  usuarios: z.array(esquemaUsuarioPublico),
  total: z.number().int(),
  pagina: z.number().int(),
  porPagina: z.number().int(),
});

/** La contraseña temporal solo se muestra en esta respuesta; no se guarda en ningún lado. */
export const respuestaConContrasenaTemporal = z.object({
  usuario: esquemaUsuarioPublico,
  contrasenaTemporal: z.string(),
});

export const respuestaOk = z.object({ ok: z.literal(true) });

export const respuestaSesionesCerradas = z.object({ sesionesCerradas: z.number().int() });
