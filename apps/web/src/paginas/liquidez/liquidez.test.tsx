import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { sesionFalsa, simularApi } from '../../pruebas/api-falsa.js';
import { renderizarApp } from '../../pruebas/renderizar.js';
import { bolivaresDeLaRemesa } from '../remesas/FormularioRemesa.js';

describe('bolivaresDeLaRemesa', () => {
  it('pesos a bolívares con la conversión compartida; bolívares tal cual', () => {
    expect(bolivaresDeLaRemesa('pesos', '50000', '3.76')).toBe('13297.872');
    expect(bolivaresDeLaRemesa('bolivares', '1500.5', '3.76')).toBe('1500.500');
    expect(bolivaresDeLaRemesa('pesos', '', '3.76')).toBeNull();
    expect(bolivaresDeLaRemesa('pesos', '100', null)).toBeNull();
  });
});

describe('pantalla de liquidez', () => {
  it('muestra disponible, comprometido, libre, cuentas y alertas, y guarda umbrales', async () => {
    const api = simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
      'GET /liquidez': {
        cuerpo: {
          monedas: [
            {
              moneda: 'VES',
              disponible: '500000.000',
              comprometido: '120000.500',
              libre: '379999.500',
              cuentas: [
                {
                  id: 'cu-1',
                  nombre: 'VZLA Proveedor B',
                  saldo: '500000.000',
                  limiteDiario: '1000000.000',
                  usadoHoy: '850000.000',
                  restanteHoy: '150000.000',
                },
              ],
            },
          ],
          comprasEnTransito: [{ id: 'cp-1', nombre: 'Proveedor A', saldo: '50000.00' }],
          alertas: [
            { tipo: 'limite_cuenta', mensaje: 'VZLA Proveedor B ya usó 850000.000 de su límite.' },
          ],
          parametros: { umbralLibre: null, porcentajeLimite: 80 },
        },
      },
      'PUT /liquidez/parametros': {
        cuerpo: { parametros: { umbralLibre: '100000', porcentajeLimite: 80 } },
      },
    });
    const { usuario } = renderizarApp('/liquidez');
    const tarjeta = await screen.findByLabelText('Liquidez en VES');
    expect(within(tarjeta).getByText('VES 379.999,500')).toBeInTheDocument();
    expect(screen.getByText(/ya usó 850000.000/)).toBeInTheDocument();
    expect(screen.getByLabelText('Compras en tránsito')).toHaveTextContent('Proveedor A');
    expect(screen.getByRole('table', { name: 'Cuentas en VES' })).toHaveTextContent(
      'VES 150.000,000',
    );

    await usuario.type(screen.getByLabelText('Avisar si los bolívares libres bajan de'), '100000');
    await usuario.click(screen.getByRole('button', { name: 'Guardar umbrales' }));
    await waitFor(() => expect(api.de('PUT', '/liquidez/parametros')).toHaveLength(1));
    expect(api.de('PUT', '/liquidez/parametros')[0]?.cuerpo).toEqual({
      umbralLibre: '100000',
      porcentajeLimite: 80,
    });
  });

  it('el vendedor no entra', async () => {
    simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') } });
    renderizarApp('/liquidez');
    expect(
      await screen.findByText('No tienes permiso para ver esta pantalla.'),
    ).toBeInTheDocument();
  });
});
