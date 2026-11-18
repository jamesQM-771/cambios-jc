/**
 * Con el doble control encendido (fase 10, D163), anular, devolver, reabrir o ajustar puede quedar
 * pendiente: el servidor responde 202 con `{ solicitud }` en lugar del registro cambiado.
 */
export function quedoPendiente(respuesta: unknown): boolean {
  return typeof respuesta === 'object' && respuesta !== null && 'solicitud' in respuesta;
}

export const MENSAJE_PENDIENTE =
  'Quedó pendiente de aprobación: otra persona debe aprobarla en Aprobaciones.';
