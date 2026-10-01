import { useEffect } from 'react';

const NOMBRE = 'Cambios JC';

/** Pone el título de la pestaña ("Usuarios · Cambios JC"), útil para lectores de pantalla y para el historial. */
export function useTitulo(titulo?: string): void {
  useEffect(() => {
    document.title = titulo ? `${titulo} · ${NOMBRE}` : NOMBRE;
  }, [titulo]);
}
