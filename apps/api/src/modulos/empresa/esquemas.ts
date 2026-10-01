import { esZonaHoraria, MONEDAS, type Moneda } from '@cambios-jc/shared';
import { z } from 'zod';

const MONEDAS_SOPORTADAS = Object.keys(MONEDAS) as [Moneda, ...Moneda[]];

/** Texto opcional: se recorta y un texto vacío equivale a "sin dato" (`null`). */
const textoOpcional = (maximo: number, patron?: RegExp, mensajePatron?: string) => {
  const base = z.string().trim().max(maximo);
  return (patron ? base.regex(patron, mensajePatron) : base)
    .or(z.literal(''))
    .nullable()
    .transform((valor) => (valor === '' ? null : valor));
};

const nit = textoOpcional(
  20,
  /^[0-9.-]{5,20}$/,
  'El NIT solo lleva números, puntos y guion (ejemplo: 900.123.456-7).',
);
const telefono = textoOpcional(
  20,
  /^[+0-9][0-9\s()-]{5,19}$/,
  'Escribe un teléfono válido (ejemplo: +57 300 123 4567).',
);

export const esquemaEditarEmpresa = z
  .object({
    nombre: z.string().trim().min(2, 'Escribe el nombre de la empresa.').max(100),
    nit,
    telefono,
    whatsapp: telefono,
    direccion: textoOpcional(200),
    monedaLocal: z.enum(MONEDAS_SOPORTADAS),
    zonaHoraria: z
      .string()
      .trim()
      .refine(esZonaHoraria, 'La zona horaria no existe (ejemplo: America/Bogota).'),
    textoPieRecibo: textoOpcional(300),
  })
  .partial()
  .refine((datos) => Object.keys(datos).length > 0, 'Indica al menos un dato para cambiar.');

export type CambiosEmpresa = z.infer<typeof esquemaEditarEmpresa>;

export const esquemaEmpresa = z.object({
  nombre: z.string(),
  nit: z.string().nullable(),
  telefono: z.string().nullable(),
  whatsapp: z.string().nullable(),
  direccion: z.string().nullable(),
  /** Dirección de la API desde donde se descarga el logo, o `null` si no hay. */
  logoUrl: z.string().nullable(),
  monedaLocal: z.string(),
  zonaHoraria: z.string(),
  textoPieRecibo: z.string().nullable(),
  actualizadaEn: z.date(),
});

export type EmpresaPublica = z.infer<typeof esquemaEmpresa>;

export const respuestaEmpresa = z.object({ empresa: esquemaEmpresa });
