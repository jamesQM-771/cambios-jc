import type { Permiso } from '@cambios-jc/shared';
import type { ReactNode } from 'react';

import { useSesionActual } from '../modulos/auth/ContextoSesion.js';
import { tienePermiso } from '../modulos/auth/sesion.js';

import { Aviso } from './Aviso.js';

/**
 * Muestra su contenido solo a quien tiene el permiso. Es una ayuda para no mostrar pantallas inútiles:
 * quien manda siempre es el servidor, que rechaza lo que no se puede hacer.
 */
export function RutaConPermiso({ permiso, children }: { permiso: Permiso; children: ReactNode }) {
  const sesion = useSesionActual();
  if (!tienePermiso(sesion, permiso)) {
    return (
      <>
        <h1>Sin acceso</h1>
        <Aviso tipo="advertencia">No tienes permiso para ver esta pantalla.</Aviso>
      </>
    );
  }
  return <>{children}</>;
}
