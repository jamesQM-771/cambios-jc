import { createContext, useContext } from 'react';

/**
 * Permite al botón "Salir" avisar a la ruta protegida de que la persona salió a propósito, para que
 * el acceso no le diga "tu sesión expiró". Fuera de una ruta protegida no hace nada.
 */
export const ContextoSalida = createContext<() => void>(() => undefined);

export const useMarcarSalidaVoluntaria = (): (() => void) => useContext(ContextoSalida);
