import '@testing-library/jest-dom/vitest';

import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// El tiempo real nunca abre una conexión de verdad en las pruebas (usa un socket simulado).
vi.mock('socket.io-client', async () => {
  const { crearSocketFalso } = await import('./socket-falso.js');
  return { io: crearSocketFalso };
});

// Margen para cuando el equipo está cargado (todo el monorepo corre en paralelo).
configure({ asyncUtilTimeout: 8000 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-tema');
});

// jsdom no implementa <dialog>: se simula lo mínimo (abrir y cerrar).
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

// jsdom tampoco trae matchMedia (lo usa el cambio de tema).
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (consulta: string): MediaQueryList =>
    ({
      matches: false,
      media: consulta,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// Node trae su propio URL.createObjectURL, que no entiende los archivos de jsdom: se reemplaza siempre.
URL.createObjectURL = () => 'blob:prueba';
URL.revokeObjectURL = () => undefined;
