import { useNavigate } from 'react-router';

import { ErrorApi } from '../../lib/api.js';

/**
 * Para los pasos del acceso: si la sesión parcial venció (pasaron más de unos minutos sin avanzar),
 * se vuelve a la primera pantalla con un aviso. Devuelve `true` si ya manejó el error.
 * No se borra el paso recordado: la guarda de cada paso redirigiría sin mensaje y taparía el aviso;
 * el siguiente inicio de sesión lo reemplaza de todos modos.
 */
export function useVolverAlAcceso(): (error: unknown) => boolean {
  const navegar = useNavigate();
  return (error) => {
    if (!(error instanceof ErrorApi) || error.codigo !== 'NO_AUTENTICADO') return false;
    void navegar('/acceso', {
      replace: true,
      state: { mensaje: 'Tu acceso venció por inactividad. Inicia sesión de nuevo.' },
    });
    return true;
  };
}
