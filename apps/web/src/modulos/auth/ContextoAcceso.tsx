import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';

import type { PasoSiguiente } from './tipos.js';

export const RUTA_DE_PASO: Record<PasoSiguiente, string> = {
  cambiar_contrasena: '/acceso/contrasena',
  configurar_2fa: '/acceso/2fa/configurar',
  verificar_2fa: '/acceso/2fa/verificar',
};

interface EstadoAcceso {
  /** Paso pendiente del acceso, o `null` si aún no se ha puesto la contraseña. */
  paso: PasoSiguiente | null;
  nombre: string | null;
}

type Accion =
  | { tipo: 'iniciado'; paso: PasoSiguiente; nombre: string }
  | { tipo: 'avanzo'; paso: PasoSiguiente };

function reducir(estado: EstadoAcceso, accion: Accion): EstadoAcceso {
  switch (accion.tipo) {
    case 'iniciado':
      return { paso: accion.paso, nombre: accion.nombre };
    case 'avanzo':
      return { ...estado, paso: accion.paso };
  }
}

interface ValorAcceso extends EstadoAcceso {
  alIniciar: (paso: PasoSiguiente, nombre: string) => void;
  alAvanzar: (paso: PasoSiguiente) => void;
}

const ContextoAcceso = createContext<ValorAcceso | null>(null);

/**
 * Recuerda en qué paso del acceso va la persona. Vive solo en memoria: si recarga la página a mitad
 * del acceso, empieza de nuevo (el servidor no tiene una consulta para saber en qué paso iba).
 */
export function ProveedorAcceso({ children }: { children: ReactNode }) {
  const [estado, despachar] = useReducer(reducir, { paso: null, nombre: null });
  const valor = useMemo<ValorAcceso>(
    () => ({
      ...estado,
      alIniciar: (paso, nombre) => despachar({ tipo: 'iniciado', paso, nombre }),
      alAvanzar: (paso) => despachar({ tipo: 'avanzo', paso }),
    }),
    [estado],
  );
  return <ContextoAcceso.Provider value={valor}>{children}</ContextoAcceso.Provider>;
}

export function useAcceso(): ValorAcceso {
  const valor = useContext(ContextoAcceso);
  if (!valor) throw new Error('useAcceso solo se puede usar dentro de ProveedorAcceso.');
  return valor;
}
