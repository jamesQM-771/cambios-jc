import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useRetraso } from '../lib/useRetraso.js';

import { Dialogo } from './Dialogo.js';
import { DialogoConfirmacion } from './DialogoConfirmacion.js';
import { Paginacion } from './Paginacion.js';

describe('Dialogo', () => {
  it('cerrado no pone nada en pantalla; abierto muestra el título y el contenido', () => {
    const { rerender } = render(
      <Dialogo abierto={false} alCerrar={() => undefined} titulo="Mi diálogo">
        <p>Contenido</p>
      </Dialogo>,
    );
    expect(screen.queryByText('Contenido')).not.toBeInTheDocument();

    rerender(
      <Dialogo abierto alCerrar={() => undefined} titulo="Mi diálogo">
        <p>Contenido</p>
      </Dialogo>,
    );

    expect(screen.getByRole('dialog', { name: 'Mi diálogo' })).toBeInTheDocument();
    expect(screen.getByText('Contenido')).toBeInTheDocument();
  });

  it('un clic en el fondo lo cierra; un clic en el contenido no', async () => {
    const alCerrar = vi.fn();
    render(
      <Dialogo abierto alCerrar={alCerrar} titulo="Mi diálogo">
        <p>Contenido</p>
      </Dialogo>,
    );

    await userEvent.click(screen.getByText('Contenido'));
    expect(alCerrar).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('dialog'));

    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it('cuando el contenido se cierra por código, el diálogo se cierra', () => {
    const { rerender } = render(
      <Dialogo abierto alCerrar={() => undefined} titulo="Mi diálogo">
        <p>Contenido</p>
      </Dialogo>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    rerender(
      <Dialogo abierto={false} alCerrar={() => undefined} titulo="Mi diálogo">
        <p>Contenido</p>
      </Dialogo>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('el contenido empieza limpio cada vez que se abre', async () => {
    function Prueba() {
      const [abierto, setAbierto] = useState(true);
      return (
        <>
          <button onClick={() => setAbierto(true)}>Abrir</button>
          <Dialogo abierto={abierto} alCerrar={() => setAbierto(false)} titulo="Formulario">
            <Escribible />
            <button onClick={() => setAbierto(false)}>Cerrar</button>
          </Dialogo>
        </>
      );
    }
    function Escribible() {
      const [texto, setTexto] = useState('');
      return (
        <input
          aria-label="Texto"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
        />
      );
    }
    render(<Prueba />);
    await userEvent.type(screen.getByLabelText('Texto'), 'borrador');
    expect(screen.getByLabelText('Texto')).toHaveValue('borrador');

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));

    expect(screen.getByLabelText('Texto')).toHaveValue('');
  });
});

describe('DialogoConfirmacion', () => {
  const dibujar = (propiedades: Partial<Parameters<typeof DialogoConfirmacion>[0]> = {}) => {
    const alConfirmar = vi.fn();
    const alCancelar = vi.fn();
    render(
      <DialogoConfirmacion
        abierto
        titulo="¿Seguro?"
        textoConfirmar="Sí, hacerlo"
        alConfirmar={alConfirmar}
        alCancelar={alCancelar}
        {...propiedades}
      >
        <p>Esto cambia cosas.</p>
      </DialogoConfirmacion>,
    );
    return { alConfirmar, alCancelar };
  };

  it('Confirmar y Cancelar llaman a sus funciones', async () => {
    const { alConfirmar, alCancelar } = dibujar();

    await userEvent.click(screen.getByRole('button', { name: 'Sí, hacerlo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(alConfirmar).toHaveBeenCalledTimes(1);
    expect(alCancelar).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Esto cambia cosas.')).toBeInTheDocument();
  });

  it('mientras actúa deshabilita los dos botones', () => {
    dibujar({ cargando: true });

    expect(screen.getByRole('button', { name: 'Sí, hacerlo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  });

  it('muestra el error de la acción como alerta', () => {
    dibujar({ error: 'No se pudo hacer.' });

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo hacer.');
  });
});

describe('Paginacion', () => {
  it('muestra el rango y deshabilita Anterior en la primera página y Siguiente en la última', () => {
    const { rerender } = render(
      <Paginacion pagina={1} porPagina={20} total={45} alCambiar={() => undefined} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Mostrando 1–20 de 45');
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled();

    rerender(<Paginacion pagina={3} porPagina={20} total={45} alCambiar={() => undefined} />);
    expect(screen.getByRole('status')).toHaveTextContent('Mostrando 41–45 de 45');
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeEnabled();
  });

  it('sin resultados lo dice y no deja avanzar ni retroceder', () => {
    render(<Paginacion pagina={1} porPagina={20} total={0} alCambiar={() => undefined} />);

    expect(screen.getByRole('status')).toHaveTextContent('Sin resultados');
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('los botones piden la página anterior o la siguiente', async () => {
    const alCambiar = vi.fn();
    render(<Paginacion pagina={2} porPagina={20} total={100} alCambiar={alCambiar} />);

    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(alCambiar.mock.calls).toEqual([[1], [3]]);
  });

  it('un total justo en el límite no ofrece una página vacía', () => {
    render(<Paginacion pagina={2} porPagina={20} total={40} alCambiar={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });
});

describe('useRetraso', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('solo cambia cuando el valor deja de cambiar durante el tiempo indicado', async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ valor }) => useRetraso(valor, 300), {
      initialProps: { valor: 'a' },
    });
    expect(result.current).toBe('a');

    rerender({ valor: 'ab' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    rerender({ valor: 'abc' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(result.current).toBe('a');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current).toBe('abc');
  });
});
