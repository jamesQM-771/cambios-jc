import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Aviso } from './Aviso.js';
import { Boton } from './Boton.js';
import { Campo } from './Campo.js';
import { Cargando } from './Cargando.js';

describe('Campo', () => {
  it('asocia la etiqueta con el campo', () => {
    render(<Campo etiqueta="Usuario" />);

    expect(screen.getByLabelText('Usuario')).toBeInTheDocument();
  });

  it('describe el campo con su ayuda y su error, y lo marca como inválido', () => {
    render(<Campo etiqueta="NIT" ayuda="Con puntos y guion." error="NIT inválido" />);

    const campo = screen.getByLabelText('NIT');
    expect(campo).toBeInvalid();
    expect(campo).toHaveAccessibleDescription('Con puntos y guion. NIT inválido');
  });

  it('sin error no se marca como inválido', () => {
    render(<Campo etiqueta="NIT" ayuda="Con puntos y guion." />);

    expect(screen.getByLabelText('NIT')).toBeValid();
  });

  it('dos campos tienen identificadores distintos', () => {
    render(
      <>
        <Campo etiqueta="Uno" />
        <Campo etiqueta="Dos" />
      </>,
    );

    expect(screen.getByLabelText('Uno').id).not.toBe(screen.getByLabelText('Dos').id);
  });
});

describe('Boton', () => {
  it('por defecto es de tipo "button" (no envía formularios sin querer)', () => {
    render(<Boton>Guardar</Boton>);

    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveAttribute('type', 'button');
  });

  it('mientras está en proceso se deshabilita y no responde a clics', async () => {
    const alClic = vi.fn();
    render(
      <Boton cargando onClick={alClic}>
        Guardar
      </Boton>,
    );

    const boton = screen.getByRole('button', { name: 'Guardar' });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(boton);
    expect(alClic).not.toHaveBeenCalled();
  });

  it('aplica la variante y el tamaño pedidos', () => {
    render(
      <Boton variante="peligro" chico>
        Borrar
      </Boton>,
    );

    expect(screen.getByRole('button', { name: 'Borrar' })).toHaveClass(
      'boton--peligro',
      'boton--chico',
    );
  });
});

describe('Aviso y Cargando', () => {
  it('los errores y advertencias se anuncian como alerta; los demás como estado', () => {
    render(
      <>
        <Aviso tipo="error">Falló</Aviso>
        <Aviso tipo="advertencia">Cuidado</Aviso>
        <Aviso tipo="info">Dato</Aviso>
        <Aviso tipo="exito">Listo</Aviso>
      </>,
    );

    expect(screen.getAllByRole('alert').map((aviso) => aviso.textContent)).toEqual([
      'Falló',
      'Cuidado',
    ]);
    expect(screen.getAllByRole('status').map((aviso) => aviso.textContent)).toEqual([
      'Dato',
      'Listo',
    ]);
  });

  it('Cargando avisa a los lectores de pantalla', () => {
    render(<Cargando texto="Cargando usuarios…" />);

    expect(screen.getByRole('status')).toHaveTextContent('Cargando usuarios…');
  });
});
