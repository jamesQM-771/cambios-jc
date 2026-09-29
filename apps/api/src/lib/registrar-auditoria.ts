import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

/** Campos que nunca deben llegar a la bitácora, sin importar dónde estén dentro de `antes` o `despues`. */
const CAMPOS_SECRETOS = new Set([
  'contrasena',
  'contrasenaactual',
  'contrasenanueva',
  'hashcontrasena',
  'secreto2fa',
  'codigo2fa',
  'codigo',
  'token',
]);

export const VALOR_OCULTO = '[OCULTO]';

/**
 * Convierte a JSON seguro: BigInt y Decimal como texto, fechas ISO, y los campos secretos ocultos.
 * Devuelve `undefined` si no hay nada que guardar.
 */
export function sanearParaAuditoria(valor: unknown): Prisma.InputJsonValue | undefined {
  if (valor === undefined || valor === null) return undefined;
  const texto = JSON.stringify(valor, (clave, contenido: unknown) => {
    if (CAMPOS_SECRETOS.has(clave.toLowerCase())) return VALOR_OCULTO;
    return typeof contenido === 'bigint' ? contenido.toString() : contenido;
  });
  return JSON.parse(texto) as Prisma.InputJsonValue;
}

export interface DatosAuditoria {
  usuarioId?: string | null;
  /** Ejemplo: `usuario.crear`, `auth.login_fallido`. */
  accion: string;
  entidad: string;
  entidadId?: string | null;
  antes?: unknown;
  despues?: unknown;
  ip?: string | null;
  agenteUsuario?: string | null;
}

/** Cliente de Prisma o transacción: `registrarAuditoria` acepta ambos. */
export type ClienteAuditoria = Pick<PrismaClient | Prisma.TransactionClient, 'auditoria'>;

/**
 * Agrega un registro a la bitácora (tabla de solo inserción). Los servicios la llaman dentro de la
 * misma transacción que la mutación, para que ambos se confirmen o se deshagan juntos.
 */
export async function registrarAuditoria(
  cliente: ClienteAuditoria,
  datos: DatosAuditoria,
): Promise<void> {
  await cliente.auditoria.create({
    data: {
      usuarioId: datos.usuarioId ?? null,
      accion: datos.accion,
      entidad: datos.entidad,
      entidadId: datos.entidadId ?? null,
      antes: sanearParaAuditoria(datos.antes),
      despues: sanearParaAuditoria(datos.despues),
      ip: datos.ip ?? null,
      agenteUsuario: datos.agenteUsuario ?? null,
    },
  });
}
