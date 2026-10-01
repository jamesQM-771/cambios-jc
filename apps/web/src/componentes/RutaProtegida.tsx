import { useCallback, useRef } from 'react';
import { Navigate, Outlet } from 'react-router';

import { ContextoSalida } from '../modulos/auth/ContextoSalida.js';
import { ContextoSesion } from '../modulos/auth/ContextoSesion.js';
import { useSesion } from '../modulos/auth/sesion.js';
import type { Sesion } from '../modulos/auth/tipos.js';

import { Aviso } from './Aviso.js';
import { Cargando } from './Cargando.js';

/**
 * Deja pasar solo a quien tiene una sesión completa. Sin sesión, lleva al acceso; si la persona sí
 * tenía una y se perdió (venció o la cerraron), el acceso le avisa por qué.
 */
export function RutaProtegida() {
  const consulta = useSesion();
  const habiaSesion = useRef(false);
  const ultimaSesion = useRef<Sesion | null>(null);
  const salioAProposito = useRef(false);
  const marcarSalida = useCallback(() => {
    salioAProposito.current = true;
  }, []);

  if (consulta.data) {
    habiaSesion.current = true;
    ultimaSesion.current = consulta.data;
  }

  if (consulta.isError) {
    return (
      <div className="acceso">
        <div className="acceso__tarjeta">
          <Aviso tipo="error">
            No se pudo comprobar tu sesión. Revisa tu conexión y recarga la página.
          </Aviso>
        </div>
      </div>
    );
  }
  if (consulta.data === null) {
    const expiro = habiaSesion.current && !salioAProposito.current;
    const mensaje = expiro ? 'Tu sesión expiró. Inicia sesión de nuevo.' : undefined;
    return <Navigate to="/acceso" replace state={mensaje ? { mensaje } : undefined} />;
  }
  // Mientras llega la primera respuesta no hay nada que mostrar; después se conserva la última
  // sesión válida hasta que esta ruta se desmonta, para no dibujar pantallas a medias.
  const sesion = consulta.data ?? ultimaSesion.current;
  if (!sesion) return <Cargando texto="Comprobando tu sesión…" />;

  return (
    <ContextoSalida.Provider value={marcarSalida}>
      <ContextoSesion.Provider value={sesion}>
        <Outlet />
      </ContextoSesion.Provider>
    </ContextoSalida.Provider>
  );
}
