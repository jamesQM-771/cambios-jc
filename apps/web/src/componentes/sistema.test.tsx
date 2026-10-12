import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CampoDigitos, CampoTelefono, ResumenErrores } from './CamposEspeciales.js';
import { MenuAcciones } from './MenuAcciones.js';
import {
  DURACION_NOTIFICACION_MS,
  ProveedorNotificaciones,
  useNotificar,
} from './Notificaciones.js';
import { BarraHerramientas, EncabezadoPagina, EstadoVacio, Esqueleto } from './Pagina.js';

function BotonQueNotifica({ texto }: { texto: string }) {
  const notificar = useNotificar();
  return (
    <button
      type="button"
      onClick={() => {
        notificar(texto);
      }}
    >
      Guardar
    </button>
  );
}

describe('Notificaciones', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('muestra el aviso en una región que se anuncia sin mover el foco', async () => {
    const usuario = userEvent.setup();
    render(
      <ProveedorNotificaciones>
        <BotonQueNotifica texto="Se guardaron los cambios." />
      </ProveedorNotificaciones>,
    );

    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(within(screen.getByRole('status')).getByText('Se guardaron los cambios.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveFocus();
  });

  it('se cierra sola al pasar el tiempo', () => {
    vi.useFakeTimers();
    render(
      <ProveedorNotificaciones>
        <BotonQueNotifica texto="Se publicó la tasa." />
      </ProveedorNotificaciones>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByText('Se publicó la tasa.')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(DURACION_NOTIFICACION_MS);
    });

    expect(screen.queryByText('Se publicó la tasa.')).not.toBeInTheDocument();
  });

  it('se puede cerrar a mano', async () => {
    const usuario = userEvent.setup();
    render(
      <ProveedorNotificaciones>
        <BotonQueNotifica texto="Se creó el banco." />
      </ProveedorNotificaciones>,
    );

    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));
    await usuario.click(screen.getByRole('button', { name: 'Cerrar aviso' }));

    expect(screen.queryByText('Se creó el banco.')).not.toBeInTheDocument();
  });

  it('fuera del proveedor no falla', async () => {
    const usuario = userEvent.setup();
    render(<BotonQueNotifica texto="Nada" />);

    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.queryByText('Nada')).not.toBeInTheDocument();
  });
});

describe('MenuAcciones', () => {
  const dibujar = () => {
    const editar = vi.fn();
    const desactivar = vi.fn();
    render(
      <MenuAcciones
        etiqueta="Más acciones de Banesco"
        acciones={[
          { etiqueta: 'Editar', alElegir: editar },
          { etiqueta: 'Reactivar', alElegir: vi.fn(), deshabilitada: true },
          { etiqueta: 'Desactivar', alElegir: desactivar, peligro: true },
        ]}
      />,
    );
    return { editar, desactivar, usuario: userEvent.setup() };
  };

  it('cerrado no muestra las opciones y lo dice con aria-expanded', () => {
    dibujar();

    expect(screen.getByRole('button', { name: 'Más acciones de Banesco' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('al abrir pone el foco en la primera opción y al elegir ejecuta y se cierra', async () => {
    const { editar, usuario } = dibujar();

    await usuario.click(screen.getByRole('button', { name: 'Más acciones de Banesco' }));
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toHaveFocus();

    await usuario.click(screen.getByRole('menuitem', { name: 'Editar' }));

    expect(editar).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Más acciones de Banesco' })).toHaveFocus();
  });

  it('se recorre con las flechas saltando las opciones deshabilitadas', async () => {
    const { desactivar, usuario } = dibujar();

    await usuario.click(screen.getByRole('button', { name: 'Más acciones de Banesco' }));
    await usuario.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Desactivar' })).toHaveFocus();

    await usuario.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toHaveFocus();

    await usuario.keyboard('{End}{Enter}');
    expect(desactivar).toHaveBeenCalledOnce();
  });

  it('Escape lo cierra y devuelve el foco al botón', async () => {
    const { editar, usuario } = dibujar();

    await usuario.click(screen.getByRole('button', { name: 'Más acciones de Banesco' }));
    await usuario.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Más acciones de Banesco' })).toHaveFocus();
    expect(editar).not.toHaveBeenCalled();
  });

  it('un clic fuera lo cierra', async () => {
    const { usuario } = dibujar();

    await usuario.click(screen.getByRole('button', { name: 'Más acciones de Banesco' }));
    await usuario.click(document.body);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('CampoDigitos', () => {
  function Nit() {
    const [valor, setValor] = useState('');
    return <CampoDigitos etiqueta="NIT" valor={valor} alCambiar={setValor} maxLength={10} />;
  }

  it('descarta todo lo que no sea un número, también al pegar', async () => {
    const usuario = userEvent.setup();
    render(<Nit />);
    const campo = screen.getByLabelText('NIT');

    await usuario.type(campo, '90a0.1-');
    expect(campo).toHaveValue('9001');

    await usuario.clear(campo);
    await usuario.click(campo);
    await usuario.paste('NIT 900.123.456-7 extra 99');
    expect(campo).toHaveValue('9001234567');
  });

  it('abre el teclado numérico y conserva los ceros a la izquierda', async () => {
    const usuario = userEvent.setup();
    render(<Nit />);
    const campo = screen.getByLabelText('NIT');

    await usuario.type(campo, '0102');

    expect(campo).toHaveAttribute('inputmode', 'numeric');
    expect(campo).toHaveValue('0102');
  });
});

describe('CampoTelefono', () => {
  function Telefono({ inicial = '' }: { inicial?: string }) {
    const [valor, setValor] = useState(inicial);
    const [prefijo, setPrefijo] = useState('57');
    return (
      <>
        <CampoTelefono
          etiqueta="WhatsApp"
          valor={valor}
          alCambiar={setValor}
          prefijo={prefijo}
          alCambiarPrefijo={setPrefijo}
        />
        <output data-testid="guardado">{valor}</output>
      </>
    );
  }

  it('une el país y el número en formato internacional sin espacios', async () => {
    const usuario = userEvent.setup();
    render(<Telefono />);

    await usuario.type(screen.getByLabelText('WhatsApp'), '300 123-4567x');

    expect(screen.getByLabelText('WhatsApp')).toHaveValue('3001234567');
    expect(screen.getByTestId('guardado')).toHaveTextContent('+573001234567');
  });

  it('cambiar el país conserva el número', async () => {
    const usuario = userEvent.setup();
    render(<Telefono inicial="+573001234567" />);

    await usuario.selectOptions(screen.getByLabelText('País de WhatsApp'), 'Venezuela (+58)');

    expect(screen.getByTestId('guardado')).toHaveTextContent('+583001234567');
  });

  it('sin número no se guarda ni el prefijo', async () => {
    const usuario = userEvent.setup();
    render(<Telefono inicial="+573001234567" />);

    await usuario.clear(screen.getByLabelText('WhatsApp'));

    expect(screen.getByTestId('guardado')).toBeEmptyDOMElement();
  });
});

describe('ResumenErrores', () => {
  it('sin errores no dibuja nada', () => {
    const { container } = render(<ResumenErrores errores={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('lista los errores, los anuncia y recibe el foco', () => {
    render(<ResumenErrores errores={['Escribe el nombre.', 'El NIT solo lleva números.']} />);

    const resumen = screen.getByRole('alert');
    expect(resumen).toHaveFocus();
    expect(resumen).toHaveTextContent('Hay 2 datos por corregir:');
    expect(within(resumen).getAllByRole('listitem')).toHaveLength(2);
  });
});

describe('piezas de página', () => {
  it('EncabezadoPagina usa el nivel de título pedido y muestra la acción', () => {
    render(
      <EncabezadoPagina
        titulo="Bancos"
        nivel={2}
        descripcion="Catálogo de bancos."
        acciones={<button type="button">Nuevo banco</button>}
      />,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Bancos' })).toBeInTheDocument();
    expect(screen.getByText('Catálogo de bancos.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuevo banco' })).toBeInTheDocument();
  });

  it('BarraHerramientas entrega lo que se busca y anuncia el conteo', async () => {
    const alCambiar = vi.fn();
    const usuario = userEvent.setup();
    render(
      <BarraHerramientas
        busqueda={{ etiqueta: 'Buscar banco', valor: '', alCambiar }}
        resumen="3 de 27 bancos"
      />,
    );

    await usuario.type(screen.getByRole('searchbox', { name: 'Buscar banco' }), 'b');

    expect(alCambiar).toHaveBeenCalledWith('b');
    expect(screen.getByRole('status')).toHaveTextContent('3 de 27 bancos');
  });

  it('EstadoVacio explica qué pasa y ofrece el siguiente paso', () => {
    render(
      <EstadoVacio
        titulo="Sin resultados"
        descripcion="Ningún banco coincide con la búsqueda."
        accion={<button type="button">Limpiar búsqueda</button>}
      />,
    );

    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Limpiar búsqueda' })).toBeInTheDocument();
  });

  it('Esqueleto anuncia que está cargando', () => {
    render(<Esqueleto texto="Cargando los bancos…" filas={3} />);

    expect(screen.getByRole('status')).toHaveTextContent('Cargando los bancos…');
  });
});
