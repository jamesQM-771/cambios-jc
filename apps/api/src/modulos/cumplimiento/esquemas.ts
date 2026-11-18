import { esFechaValida } from '@cambios-jc/shared';
import { z } from 'zod';

export const esquemaId = z.object({ id: z.uuid() });

const dia = z.string().refine(esFechaValida, 'Usa el formato AAAA-MM-DD con una fecha que exista.');
const montoOpcional = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, 'Escribe un monto con hasta 2 decimales.')
  .nullable();
const textoOpcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo)
    .transform((valor) => (valor === '' ? null : valor))
    .nullable()
    .optional();

export const esquemaParametros = z
  .object({
    umbralFichaMensual: montoOpcional,
    fraccionamientoCantidad: z.number().int().positive().max(1000).nullable(),
    fraccionamientoMontoMaximo: montoOpcional,
    concentracionRemitentes: z.number().int().positive().max(1000).nullable(),
  })
  .strict()
  .refine((d) => (d.fraccionamientoCantidad === null) === (d.fraccionamientoMontoMaximo === null), {
    message: 'El fraccionamiento necesita la cantidad y el monto máximo, o ninguno de los dos.',
    path: ['fraccionamientoMontoMaximo'],
  });

export const respuestaParametros = z.object({
  parametros: z.object({
    umbralFichaMensual: z.string().nullable(),
    fraccionamientoCantidad: z.number().int().nullable(),
    fraccionamientoMontoMaximo: z.string().nullable(),
    concentracionRemitentes: z.number().int().nullable(),
  }),
});

export const esquemaCrearEntrada = z
  .object({
    fuente: z.enum(['onu', 'ofac', 'propia']),
    nombre: z.string().trim().min(3, 'Escribe el nombre como aparece en la lista.').max(150),
    numeroDocumento: textoOpcional(20),
    nota: textoOpcional(300),
  })
  .strict();

export const esquemaEditarEntrada = z.object({ activa: z.boolean() }).strict();

const esquemaEntrada = z.object({
  id: z.string(),
  fuente: z.enum(['onu', 'ofac', 'propia']),
  nombre: z.string(),
  numeroDocumento: z.string().nullable(),
  nota: z.string().nullable(),
  activa: z.boolean(),
  creadoEn: z.date(),
});

export const respuestaEntrada = z.object({ entrada: esquemaEntrada });
export const respuestaLista = z.object({ entradas: z.array(esquemaEntrada) });

export const esquemaListarAlertas = z.object({
  estado: z.enum(['abierta', 'descartada', 'escalada']).optional(),
});

export const esquemaResolverAlerta = z
  .object({ justificacion: z.string().trim().min(5, 'Justifica la decisión.').max(500) })
  .strict();

const esquemaAlerta = z.object({
  id: z.string(),
  tipo: z.enum(['lista_restrictiva', 'fraccionamiento', 'concentracion', 'ficha_requerida']),
  estado: z.enum(['abierta', 'descartada', 'escalada']),
  cliente: z.object({
    id: z.string(),
    nombre: z.string(),
    tipoDocumento: z.string(),
    numeroDocumento: z.string(),
  }),
  operacion: z.object({ id: z.string(), numeroComprobante: z.number() }).nullable(),
  detalle: z.record(z.string(), z.unknown()),
  justificacion: z.string().nullable(),
  resueltaPor: z.object({ id: z.string(), nombre: z.string() }).nullable(),
  resueltaEn: z.date().nullable(),
  creadoEn: z.date(),
});

export const respuestaAlerta = z.object({ alerta: esquemaAlerta });
export const respuestaAlertas = z.object({ alertas: z.array(esquemaAlerta) });

export const esquemaFicha = z
  .object({
    actividadEconomica: textoOpcional(150),
    origenFondos: textoOpcional(150),
    direccion: textoOpcional(200),
    pep: z.boolean().optional(),
  })
  .strict();

export const esquemaNivel = z
  .object({
    nivel: z.enum(['bajo', 'medio', 'alto']),
    motivo: z.string().trim().min(5, 'Explica por qué cambia el nivel de riesgo.').max(300),
  })
  .strict();

const porPeriodo = z.object({ dia: z.string(), mes: z.string(), anio: z.string() });

export const respuestaCumplimientoCliente = z.object({
  cliente: z.object({
    id: z.string(),
    nombre: z.string(),
    tipoDocumento: z.string(),
    numeroDocumento: z.string(),
  }),
  perfil: z
    .object({
      actividadEconomica: z.string().nullable(),
      origenFondos: z.string().nullable(),
      direccion: z.string().nullable(),
      pep: z.boolean(),
      nivel: z.enum(['bajo', 'medio', 'alto']),
      motivoNivel: z.string().nullable(),
      actualizadoEn: z.date(),
    })
    .nullable(),
  acumulados: z.object({ comoRemitente: porPeriodo, comoBeneficiario: porPeriodo }),
  /** Solo para quien gestiona alertas; si no, lista vacía. */
  alertas: z.array(esquemaAlerta),
});

export const esquemaExporte = z.object({ desde: dia, hasta: dia });
