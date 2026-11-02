import { useSyncExternalStore } from 'react';

/**
 * Tres anchos para la estructura (D172): en celular el menú es un cajón, en tableta un riel de iconos
 * que se despliega encima del contenido, y en escritorio un panel que la persona despliega o pliega.
 * Los cortes coinciden con los de componentes.css.
 */
export type ModoPantalla = 'celular' | 'tableta' | 'escritorio';

export const CONSULTA_CELULAR = '(max-width: 800px)';
export const CONSULTA_TABLETA = '(max-width: 1100px)';

function coincide(consulta: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(consulta).matches;
}

export function modoPantallaActual(): ModoPantalla {
  if (coincide(CONSULTA_CELULAR)) return 'celular';
  if (coincide(CONSULTA_TABLETA)) return 'tableta';
  return 'escritorio';
}

function suscribir(avisar: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const listas = [CONSULTA_CELULAR, CONSULTA_TABLETA].map((consulta) =>
    window.matchMedia(consulta),
  );
  for (const lista of listas) lista.addEventListener('change', avisar);
  return () => {
    for (const lista of listas) lista.removeEventListener('change', avisar);
  };
}

/** Ancho actual de la pantalla; se actualiza al girar el dispositivo o cambiar el tamaño de la ventana. */
export function useModoPantalla(): ModoPantalla {
  return useSyncExternalStore(suscribir, modoPantallaActual, () => 'escritorio');
}
