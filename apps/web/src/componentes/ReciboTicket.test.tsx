import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Recibo } from '../modulos/recibos/tipos.js';

import { ReciboTicket } from './ReciboTicket.js';

const recibo = (cambios: Partial<Recibo> = {}): Recibo => ({
  esCopia: false,
  numeroCopia: 0,
  numeroComprobante: 128,
  codigoSeguimiento: '7K3M9XQ4TB2D',
  urlSeguimiento: 'http://localhost:5173/seguimiento/7K3M9XQ4TB2D',
  fecha: '2026-10-13T19:05:00.000Z',
  fechaTexto: '13/10/2026 14:05',
  empresa: {
    nombre: 'Cambios JC',
    nit: '900123456-7',
    telefono: '+573001112233',
    whatsapp: '+573001112233',
    direccion: 'Calle 10 # 5-23, Cúcuta',
    tieneLogo: false,
    textoPie: 'Gracias por confiar en nosotros',
    zonaHoraria: 'America/Bogota',
  },
  remitente: { nombre: 'Ana Gómez', tipoDocumento: 'CC', numeroDocumento: '1090123456' },
  beneficiario: {
    titular: 'Pedro Titular',
    tipoDocumento: 'V',
    numeroDocumento: '12345678',
    tipoPago: 'cuenta_bancaria',
    banco: { codigo: '0102', nombre: 'Banco de Venezuela' },
    numeroCuenta: '01020000000000000001',
    telefonoPagoMovil: null,
  },
  montoPesosTexto: 'COP 162.000',
  montoBolivaresTexto: 'VES 43.085,106',
  vendedor: 'Laura Pérez',
  texto: '',
  ...cambios,
});

describe('ReciboTicket', () => {
  it('muestra lo que lleva el ticket del local', () => {
    render(<ReciboTicket recibo={recibo()} ancho={80} />);

    const ticket = screen.getByRole('article', { name: 'Recibo 128' });
    expect(within(ticket).getByRole('heading', { name: 'Cambios JC' })).toBeInTheDocument();
    for (const texto of [
      'NIT 900123456-7',
      '128',
      '13/10/2026 14:05',
      'Ana Gómez (CC 1090123456)',
      'Pedro Titular (V 12345678)',
      '0102 Banco de Venezuela',
      '01020000000000000001',
      'COP 162.000',
      'VES 43.085,106',
      'Laura Pérez',
      '7K3M9XQ4TB2D',
      'Gracias por confiar en nosotros',
    ]) {
      expect(within(ticket).getByText(texto)).toBeInTheDocument();
    }
  });

  it('el original no dice COPIA y la reimpresión sí', () => {
    const { rerender } = render(<ReciboTicket recibo={recibo()} ancho={80} />);
    expect(screen.queryByText('COPIA')).not.toBeInTheDocument();

    rerender(<ReciboTicket recibo={recibo({ esCopia: true, numeroCopia: 1 })} ancho={80} />);

    expect(screen.getByText('COPIA')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Recibo 128 (copia)' })).toBeInTheDocument();
  });

  it('un pago móvil muestra el teléfono en lugar de la cuenta', () => {
    const base = recibo();
    render(
      <ReciboTicket
        ancho={58}
        recibo={recibo({
          beneficiario: {
            ...base.beneficiario,
            tipoPago: 'pago_movil',
            numeroCuenta: null,
            telefonoPagoMovil: '04141234567',
          },
        })}
      />,
    );

    expect(screen.getByText('Pago móvil')).toBeInTheDocument();
    expect(screen.getByText('04141234567')).toBeInTheDocument();
    expect(screen.queryByText('Cuenta')).not.toBeInTheDocument();
  });

  it('lleva la clase del ancho del papel', () => {
    const { rerender } = render(<ReciboTicket recibo={recibo()} ancho={58} />);
    expect(screen.getByRole('article')).toHaveClass('recibo--58');

    rerender(<ReciboTicket recibo={recibo()} ancho={80} />);

    expect(screen.getByRole('article')).toHaveClass('recibo--80');
  });

  it('el logo solo aparece si la empresa lo tiene, y el teléfono repetido no se duplica', () => {
    const base = recibo();
    const { container, rerender } = render(<ReciboTicket recibo={base} ancho={80} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByText(/^Tel\./)).not.toBeInTheDocument();

    rerender(
      <ReciboTicket
        ancho={80}
        recibo={{
          ...base,
          empresa: { ...base.empresa, tieneLogo: true, telefono: '+573009998877' },
        }}
      />,
    );

    expect(container.querySelector('img')).not.toBeNull();
    expect(screen.getByText('Tel. +573009998877')).toBeInTheDocument();
  });
});
