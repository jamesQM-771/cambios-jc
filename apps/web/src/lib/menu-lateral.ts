const CLAVE_MENU = 'cambios-jc:menu-contraido';

/** Si la persona dejó el menú lateral contraído (solo iconos) la última vez. Por defecto, no. */
export function menuContraidoGuardado(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_MENU) === 'si';
  } catch {
    return false; // sin acceso al almacenamiento: el menú empieza expandido
  }
}

/** Recuerda en este navegador si el menú queda contraído. */
export function guardarMenuContraido(contraido: boolean): void {
  try {
    window.localStorage.setItem(CLAVE_MENU, contraido ? 'si' : 'no');
  } catch {
    // No se pudo recordar la elección; el cambio sigue valiendo para esta visita.
  }
}
