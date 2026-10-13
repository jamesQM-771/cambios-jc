import { z } from 'zod';

export const esquemaId = z.object({ id: z.uuid() });
export const esquemaIdMedio = z.object({ id: z.uuid(), medioId: z.uuid() });

export const TIPOS_DOCUMENTO = ['V', 'E', 'J', 'G', 'P', 'CC', 'CE', 'PPT', 'PAS', 'NIT'] as const;
export const esquemaTipoDocumento = z.enum(TIPOS_DOCUMENTO);

/** Documentos que pueden llevar letras (pasaportes y permisos): el resto son solo dígitos. */
const ALFANUMERICOS = new Set<string>(['P', 'PAS', 'PPT', 'CE']);

/** Quita espacios, puntos y guiones y pasa a mayúsculas: "V-12.345.678" → "12345678". */
export const normalizarNumeroDocumento = (texto: string): string =>
  texto.replace(/[\s.-]/g, '').toUpperCase();

/** Valida y normaliza el número de un documento según su tipo; devuelve un mensaje si no es válido. */
export function errorDeNumeroDocumento(tipo: string, numero: string): string | null {
  if (ALFANUMERICOS.has(tipo)) {
    return /^[A-Z0-9]{4,20}$/.test(numero)
      ? null
      : 'El documento debe tener entre 4 y 20 letras o números.';
  }
  return /^\d{5,12}$/.test(numero) ? null : 'El documento debe tener entre 5 y 12 dígitos.';
}

const esquemaNumeroDocumento = z.string().trim().min(1, 'Escribe el número de documento.').max(30);
const esquemaNombre = z.string().trim().min(2, 'Escribe el nombre completo.').max(120);
const esquemaTelefono = z
  .string()
  .trim()
  .regex(/^\+?\d{7,15}$/, 'El teléfono debe tener entre 7 y 15 dígitos (sin espacios ni guiones).');

export const esquemaCrearCliente = z
  .object({
    tipoDocumento: esquemaTipoDocumento,
    numeroDocumento: esquemaNumeroDocumento,
    nombre: esquemaNombre,
    telefono: esquemaTelefono.optional(),
  })
  .transform((datos, contexto) => {
    const numero = normalizarNumeroDocumento(datos.numeroDocumento);
    const error = errorDeNumeroDocumento(datos.tipoDocumento, numero);
    if (error) {
      contexto.addIssue({ code: 'custom', message: error, path: ['numeroDocumento'] });
      return z.NEVER;
    }
    return { ...datos, numeroDocumento: numero };
  });

/** El documento no se edita: identifica a la persona en todo lo que ya se registró. */
export const esquemaEditarCliente = z
  .object({ nombre: esquemaNombre.optional(), telefono: esquemaTelefono.nullable().optional() })
  .refine((datos) => Object.keys(datos).length > 0, 'Indica al menos un dato para cambiar.');

export const esquemaListarClientes = z.object({
  busqueda: z.string().trim().min(1).max(60).optional(),
  activo: z
    .enum(['true', 'false'])
    .transform((valor) => valor === 'true')
    .optional(),
});

const esquemaBancoDelMedio = z.object({ id: z.string(), codigo: z.string(), nombre: z.string() });

const camposTitular = {
  titular: z.string().trim().min(2, 'Escribe el nombre del titular.').max(120),
  tipoDocumentoTitular: esquemaTipoDocumento,
  numeroDocumentoTitular: esquemaNumeroDocumento,
};

export const esquemaCrearMedioPago = z
  .discriminatedUnion('tipo', [
    z.object({
      tipo: z.literal('cuenta_bancaria'),
      bancoId: z.uuid(),
      numeroCuenta: z
        .string()
        .trim()
        .transform((texto) => texto.replace(/[\s-]/g, ''))
        .pipe(z.string().regex(/^\d{20}$/, 'La cuenta debe tener 20 dígitos.')),
      ...camposTitular,
    }),
    z.object({
      tipo: z.literal('pago_movil'),
      bancoId: z.uuid(),
      telefonoPagoMovil: z
        .string()
        .trim()
        .transform((texto) => texto.replace(/[\s-]/g, ''))
        .pipe(z.string().regex(/^0\d{10}$/, 'El teléfono debe tener 11 dígitos y empezar por 0.')),
      ...camposTitular,
    }),
  ])
  .transform((datos, contexto) => {
    const numero = normalizarNumeroDocumento(datos.numeroDocumentoTitular);
    const error = errorDeNumeroDocumento(datos.tipoDocumentoTitular, numero);
    if (error) {
      contexto.addIssue({ code: 'custom', message: error, path: ['numeroDocumentoTitular'] });
      return z.NEVER;
    }
    return { ...datos, numeroDocumentoTitular: numero };
  });

export type DatosNuevoMedioPago = z.infer<typeof esquemaCrearMedioPago>;
export type DatosNuevoCliente = z.infer<typeof esquemaCrearCliente>;

export const esquemaMedioPagoPublico = z.object({
  id: z.string(),
  tipo: z.enum(['cuenta_bancaria', 'pago_movil']),
  banco: esquemaBancoDelMedio,
  numeroCuenta: z.string().nullable(),
  telefonoPagoMovil: z.string().nullable(),
  titular: z.string(),
  tipoDocumentoTitular: esquemaTipoDocumento,
  numeroDocumentoTitular: z.string(),
  activo: z.boolean(),
  creadoEn: z.date(),
});

export const esquemaClientePublico = z.object({
  id: z.string(),
  tipoDocumento: esquemaTipoDocumento,
  numeroDocumento: z.string(),
  nombre: z.string(),
  telefono: z.string().nullable(),
  activo: z.boolean(),
  creadoEn: z.date(),
});

export const esquemaClienteConMedios = esquemaClientePublico.extend({
  mediosPago: z.array(esquemaMedioPagoPublico),
});

export type ClientePublico = z.infer<typeof esquemaClientePublico>;
export type ClienteConMedios = z.infer<typeof esquemaClienteConMedios>;
export type MedioPagoPublico = z.infer<typeof esquemaMedioPagoPublico>;

export const respuestaBancosDisponibles = z.object({
  bancos: z.array(z.object({ id: z.string(), codigo: z.string(), nombre: z.string() })),
});

export const respuestaCliente = z.object({ cliente: esquemaClienteConMedios });
export const respuestaListaClientes = z.object({ clientes: z.array(esquemaClientePublico) });
export const respuestaMedioPago = z.object({ medioPago: esquemaMedioPagoPublico });
