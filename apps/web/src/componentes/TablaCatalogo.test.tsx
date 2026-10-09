import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TablaCatalogo } from './TablaCatalogo.js';

interface Fila {
  id: string;
  nombre: string;
  activa: boolean;
}

const FILAS: Fila[] = [
  { id: '1', nombre: 'Principal', activa: true },
  { id: '2', nombre: 'Secundaria', activa: false },
];

function dibujar(items: Fila[] = FILAS) {
  const alEditar = vi.fn();
  const alDesactivar = vi.fn();
  const alReactivar = vi.fn();
  render(
    <TablaCatalogo
      tituloLista="Sucursales"
      items={items}
      columnas={[{ encabezado: 'Nombre', render: (fila: Fila) => fila.nombre }]}
      idDe={(fila) => fila.id}
      nombreDe={(fila) => fila.nombre}
      activaDe={(fila) => fila.activa}
      alEditar={alEditar}
      alDesactivar={alDesactivar}
      alReactivar={alReactivar}
    />,
  );
  return { alEditar, alDesactivar, alReactivar };
}

describe('TablaCatalogo', () => {
  it('muestra las columnas propias y el estado de cada fila', () => {
    dibujar();

    const tabla = screen.getByRole('table');
    const filas = within(tabla).getAllByRole('row').slice(1);
    expect(filas).toHaveLength(2);
    expect(filas[0]).toHaveTextContent('Principal');
    expect(within(filas[0] as HTMLElement).getByText('Activo')).toBeInTheDocument();
    expect(within(filas[1] as HTMLElement).getByText('Inactivo')).toBeInTheDocument();
  });

  it('una fila activa muestra "Desactivar"; una inactiva, "Reactivar"', async () => {
    const { alDesactivar, alReactivar } = dibujar();
    const usuario = userEvent.setup();

    await usuario.click(screen.getByRole('button', { name: 'Desactivar Principal' }));
    await usuario.click(screen.getByRole('button', { name: 'Reactivar Secundaria' }));

    expect(alDesactivar).toHaveBeenCalledWith(FILAS[0]);
    expect(alReactivar).toHaveBeenCalledWith(FILAS[1]);
    expect(screen.queryByRole('button', { name: 'Reactivar Principal' })).not.toBeInTheDocument();
  });

  it('Editar llama con el registro completo', async () => {
    const { alEditar } = dibujar();
    const usuario = userEvent.setup();

    await usuario.click(screen.getByRole('button', { name: 'Editar Secundaria' }));

    expect(alEditar).toHaveBeenCalledWith(FILAS[1]);
  });

  it('sin registros lo dice', () => {
    dibujar([]);

    expect(screen.getByText('No hay registros todavía.')).toBeInTheDocument();
  });
});
