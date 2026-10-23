import { useQuery } from '@tanstack/react-query';

import { opcionesTurno } from './api.js';

/** Todo lo de turnos cuelga de esta clave: invalidarla refresca el turno propio y las cajas libres. */
export const CLAVE_TURNOS = ['turnos'] as const;

export function useOpcionesTurno() {
  return useQuery({ queryKey: [...CLAVE_TURNOS, 'opciones'], queryFn: opcionesTurno });
}
