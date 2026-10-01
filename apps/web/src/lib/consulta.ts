import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { ErrorApi } from './api.js';
import { CLAVE_SESION, esFaltaDeSesion } from '../modulos/auth/sesion.js';

/**
 * Cliente de consultas de la aplicación. Si cualquier petición responde que ya no hay sesión (venció,
 * se cerró desde otro lado), se borra la sesión de la caché: las rutas protegidas lo notan y llevan
 * al acceso con un mensaje.
 */
export function crearClienteConsultas(): QueryClient {
  const alFallar = (error: unknown) => {
    if (esFaltaDeSesion(error)) cliente.setQueryData(CLAVE_SESION, null);
  };

  const cliente: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: alFallar }),
    mutationCache: new MutationCache({ onError: alFallar }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Los errores 4xx (permiso, datos, sesión) no mejoran reintentando.
        retry: (intentos, error) =>
          !(error instanceof ErrorApi && error.estado >= 400 && error.estado < 500) && intentos < 2,
      },
      mutations: { retry: false },
    },
  });
  return cliente;
}
