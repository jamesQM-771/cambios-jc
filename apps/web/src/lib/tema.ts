export type Tema = 'claro' | 'oscuro';

const CLAVE_TEMA = 'cambios-jc:tema';

function leerGuardado(): Tema | null {
  try {
    const valor = window.localStorage.getItem(CLAVE_TEMA);
    return valor === 'claro' || valor === 'oscuro' ? valor : null;
  } catch {
    return null; // sin acceso al almacenamiento (modo privado, bloqueado): se usa el del sistema
  }
}

function guardar(tema: Tema): void {
  try {
    window.localStorage.setItem(CLAVE_TEMA, tema);
  } catch {
    // No se pudo recordar la elección; el cambio sigue valiendo para esta visita.
  }
}

/** Tema que se está viendo: el elegido, o el del sistema si nunca se eligió. */
export function temaActual(): Tema {
  const elegido = document.documentElement.dataset.tema;
  if (elegido === 'claro' || elegido === 'oscuro') return elegido;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
}

/** Aplica el tema guardado (si hay uno). Se llama al arrancar, antes de pintar. */
export function iniciarTema(): void {
  const guardado = leerGuardado();
  if (guardado) document.documentElement.dataset.tema = guardado;
}

/** Cambia entre claro y oscuro, lo recuerda y devuelve el nuevo. */
export function alternarTema(): Tema {
  const nuevo: Tema = temaActual() === 'oscuro' ? 'claro' : 'oscuro';
  document.documentElement.dataset.tema = nuevo;
  guardar(nuevo);
  return nuevo;
}
