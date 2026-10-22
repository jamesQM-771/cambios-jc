/**
 * Catálogo de permisos, con el formato `recurso.accion` (CLAUDE.md §6).
 * Salen de la tabla §6.2 de PROYECTO.md y de las tareas de la fase 0. Incluye desde ya
 * los permisos de fases futuras, aunque sus pantallas todavía no existan.
 */
export const PERMISOS = [
  // Fase 0
  'usuario.gestionar',
  'auditoria.ver',
  'empresa.configurar',
  'margen.configurar',
  'permiso.configurar',
  // Caja
  'turno.gestionar_propio',
  'caja.reabrir',
  'jornada.cerrar',
  'gasto.registrar',
  'gasto.gestionar',
  'traslado.registrar',
  'traslado.gestionar',
  // Clientes y remesas
  'cliente.registrar',
  'remesa.registrar',
  'remesa.verificar_pago',
  'remesa.anular',
  'remesa.liberar',
  'remesa.devolver',
  'remesa.tomar_completar',
  // Tasas
  'tasa.publicar',
  'tasa.cambiar_en_operacion',
  // Divisas y contrapartes
  'divisa_caja.operar',
  'compra_contraparte.registrar',
  'contraparte.registrar_movimiento',
  // Control
  'aprobacion.aprobar',
  'cumplimiento.gestionar_alertas',
] as const;

export type Permiso = (typeof PERMISOS)[number];

export function esPermiso(valor: unknown): valor is Permiso {
  return typeof valor === 'string' && (PERMISOS as readonly string[]).includes(valor);
}
