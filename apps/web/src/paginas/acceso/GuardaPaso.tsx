import type { ReactNode } from 'react';
import { Navigate } from 'react-router';

import { RUTA_DE_PASO, useAcceso } from '../../modulos/auth/ContextoAcceso.js';
import type { PasoSiguiente } from '../../modulos/auth/tipos.js';

/**
 * Cada paso del acceso solo se abre cuando toca. Si se llega sin haber puesto la contraseña (por
 * ejemplo, tras recargar la página), se vuelve al principio; si se llega a otro paso, al que toca.
 */
export function GuardaPaso({ paso, children }: { paso: PasoSiguiente; children: ReactNode }) {
  const acceso = useAcceso();
  if (acceso.paso === null) return <Navigate to="/acceso" replace />;
  if (acceso.paso !== paso) return <Navigate to={RUTA_DE_PASO[acceso.paso]} replace />;
  return <>{children}</>;
}
