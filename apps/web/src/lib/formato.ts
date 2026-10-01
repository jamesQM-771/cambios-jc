import type { Rol } from '@cambios-jc/shared';

export const ETIQUETAS_ROL: Record<Rol, string> = {
  administrador: 'Administrador',
  vendedor: 'Vendedor',
  digitador: 'Digitador',
};

/** Fecha y hora para mostrar, en la zona horaria de la empresa (CLAUDE.md §6: se guarda en UTC). */
export function formatearFechaHora(iso: string, zonaHoraria: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: zonaHoraria,
  }).format(new Date(iso));
}
