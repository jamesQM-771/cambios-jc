import { createContext, useContext } from 'react';

import type { Sesion } from './tipos.js';

/** La sesión completa del usuario, disponible en todo lo que está dentro de `RutaProtegida`. */
export const ContextoSesion = createContext<Sesion | null>(null);

export function useSesionActual(): Sesion {
  const sesion = useContext(ContextoSesion);
  if (!sesion) throw new Error('useSesionActual solo se puede usar dentro de una ruta protegida.');
  return sesion;
}
