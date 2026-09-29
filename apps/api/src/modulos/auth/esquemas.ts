import { z } from 'zod';

import { esquemaContrasenaNueva, LONGITUD_MAXIMA_CONTRASENA } from '../../lib/contrasenas.js';

export const esquemaSiguientePaso = z.enum([
  'cambiar_contrasena',
  'configurar_2fa',
  'verificar_2fa',
]);

export const esquemaLogin = z.object({
  login: z.string().trim().min(1, 'Escribe tu usuario.').max(60),
  // Sin mínimo: al iniciar sesión no se revela la política, solo se verifica lo escrito.
  contrasena: z.string().min(1, 'Escribe tu contraseña.').max(LONGITUD_MAXIMA_CONTRASENA),
});

export const esquemaCambioContrasena = z.object({
  contrasenaActual: z.string().min(1).max(LONGITUD_MAXIMA_CONTRASENA),
  contrasenaNueva: esquemaContrasenaNueva,
});

export const esquemaCodigo = z.object({
  codigo: z.string().regex(/^\d{6}$/, 'El código debe tener 6 dígitos.'),
});

export const respuestaPaso = z.object({ siguientePaso: esquemaSiguientePaso });

export const respuestaLogin = z.object({
  siguientePaso: esquemaSiguientePaso,
  nombre: z.string(),
});

export const respuestaConfigurar2fa = z.object({
  secreto: z.string(),
  otpauthUrl: z.string(),
  qr: z.string(),
});

const usuarioPublico = z.object({
  id: z.string(),
  nombre: z.string(),
  login: z.string(),
  rol: z.enum(['administrador', 'vendedor', 'digitador']),
});

export const respuestaAcceso = z.object({ usuario: usuarioPublico });

export const respuestaYo = z.object({
  usuario: usuarioPublico,
  permisos: z.array(z.string()),
  empresa: z
    .object({
      nombre: z.string(),
      nit: z.string().nullable(),
      telefono: z.string().nullable(),
      whatsapp: z.string().nullable(),
      direccion: z.string().nullable(),
      logoUrl: z.string().nullable(),
      monedaLocal: z.string(),
      zonaHoraria: z.string(),
      textoPieRecibo: z.string().nullable(),
    })
    .nullable(),
});

export const respuestaOk = z.object({ ok: z.literal(true) });
