import { describe, expect, it, vi } from 'vitest';

import { alternarTema, iniciarTema, temaActual } from './tema.js';

const modoOscuroDelSistema = (oscuro: boolean) =>
  vi
    .spyOn(window, 'matchMedia')
    .mockImplementation((consulta) => ({ matches: oscuro, media: consulta }) as MediaQueryList);

describe('tema', () => {
  it('sin elección previa sigue al sistema', () => {
    modoOscuroDelSistema(true);
    expect(temaActual()).toBe('oscuro');

    modoOscuroDelSistema(false);
    expect(temaActual()).toBe('claro');
  });

  it('alternar cambia el tema, lo aplica a la página y lo recuerda', () => {
    modoOscuroDelSistema(false);

    expect(alternarTema()).toBe('oscuro');
    expect(document.documentElement.dataset.tema).toBe('oscuro');
    expect(window.localStorage.getItem('cambios-jc:tema')).toBe('oscuro');

    expect(alternarTema()).toBe('claro');
    expect(document.documentElement.dataset.tema).toBe('claro');
  });

  it('al arrancar aplica el tema guardado', () => {
    window.localStorage.setItem('cambios-jc:tema', 'oscuro');

    iniciarTema();

    expect(document.documentElement.dataset.tema).toBe('oscuro');
  });

  it('ignora un valor guardado que no es un tema', () => {
    window.localStorage.setItem('cambios-jc:tema', 'fucsia');

    iniciarTema();

    expect(document.documentElement.dataset.tema).toBeUndefined();
  });

  it('funciona aunque el navegador no deje usar el almacenamiento', () => {
    modoOscuroDelSistema(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });

    expect(() => iniciarTema()).not.toThrow();
    expect(alternarTema()).toBe('oscuro');
    expect(document.documentElement.dataset.tema).toBe('oscuro');
  });
});
