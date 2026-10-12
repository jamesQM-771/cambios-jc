import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TablaCatalogo } from './TablaCatalogo.js';

interface Banco {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
}

const BANCOS: Banco[] = [
  { id: '1', codigo: '0102', nombre: 'Banco de Venezuela', activo: true },
  { id: '2', codigo: '0134', nombre: 'Banesco', activo: true },
  { id: '3', codigo: '0191', nombre: 'Banco Nacional de Crédito', activo: false },
];

function dibujar(items: Banco[] = BANCOS, alConfigurar = vi.fn()) {
  render(
    <TablaCatalogo
      tituloLista="Bancos"
      nombrePlural="bancos"
      items={items}
      columnas={[
        { encabezado: 'Código', render: (banco: Banco) => banco.codigo, numerica: true },
        { encabezado: 'Nombre', render: (banco: Banco) => banco.nombre },
      ]}
      idDe={(banco) => banco.id}
      nombreDe={(banco) => banco.nombre}
      activaDe={(banco) => banco.activo}
      buscarEn={(banco) => `${banco.codigo} ${banco.nombre}`}
      filtros={<label>Mostrar desactivados</label>}
      accionesExtra={(banco) =>
        banco.id === '2' ? [{ etiqueta: 'Modo y margen', alElegir: alConfigurar }] : []
      }
      alEditar={vi.fn()}
      alDesactivar={vi.fn()}
      alReactivar={vi.fn()}
    />,
  );
  return { usuario: userEvent.setup(), alConfigurar };
}

const filas = () => screen.getAllByRole('row').slice(1);

describe('TablaCatalogo: búsqueda, conteo y acciones extra', () => {
  it('sin buscar muestra todo y cuenta los registros', () => {
    dibujar();

    expect(filas()).toHaveLength(3);
    expect(screen.getByText('3 bancos')).toBeInTheDocument();
    expect(screen.getByText('Mostrar desactivados')).toBeInTheDocument();
  });

  it('filtra por cualquier parte del texto, sin importar tildes ni mayúsculas', async () => {
    const { usuario } = dibujar();

    await usuario.type(screen.getByRole('searchbox', { name: 'Buscar en bancos' }), 'CREDITO');

    expect(filas()).toHaveLength(1);
    expect(screen.getByText('Banco Nacional de Crédito')).toBeInTheDocument();
    expect(screen.getByText('1 de 3 bancos')).toBeInTheDocument();
  });

  it('también encuentra por código', async () => {
    const { usuario } = dibujar();

    await usuario.type(screen.getByRole('searchbox', { name: 'Buscar en bancos' }), '0134');

    expect(filas()).toHaveLength(1);
    expect(screen.getByText('Banesco')).toBeInTheDocument();
  });

  it('sin resultados lo explica y deja limpiar la búsqueda', async () => {
    const { usuario } = dibujar();

    await usuario.type(screen.getByRole('searchbox', { name: 'Buscar en bancos' }), 'zzz');

    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
    expect(screen.queryByText('No hay registros todavía.')).not.toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));

    expect(filas()).toHaveLength(3);
    expect(screen.getByRole('searchbox', { name: 'Buscar en bancos' })).toHaveValue('');
  });

  it('sin registros no ofrece limpiar una búsqueda que no existe', () => {
    dibujar([]);

    expect(screen.getByText('No hay registros todavía.')).toBeInTheDocument();
    expect(screen.queryByText('Sin resultados')).not.toBeInTheDocument();
    expect(screen.getByText('0 bancos')).toBeInTheDocument();
  });

  it('las acciones extra van en un menú, solo en las filas que las tienen', async () => {
    const { usuario, alConfigurar } = dibujar();

    expect(screen.queryByRole('button', { name: 'Más acciones de Banco de Venezuela' })).toBeNull();
    await usuario.click(screen.getByRole('button', { name: 'Más acciones de Banesco' }));
    await usuario.click(screen.getByRole('menuitem', { name: 'Modo y margen' }));

    expect(alConfigurar).toHaveBeenCalledOnce();
  });

  it('Editar y Desactivar siguen a la vista, sin abrir ningún menú', () => {
    dibujar();

    expect(screen.getByRole('button', { name: 'Editar Banesco' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Desactivar Banesco' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Reactivar Banco Nacional de Crédito' }),
    ).toBeVisible();
  });
});
