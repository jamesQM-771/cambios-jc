import { permisosDeRol, PERMISOS } from '@cambios-jc/shared';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ETIQUETAS_PERMISO } from '../../lib/etiquetas-permisos.js';
import { sesionFalsa, simularApi } from '../../pruebas/api-falsa.js';
import { renderizarApp } from '../../pruebas/renderizar.js';

const VISTA = {
  catalogo: [...PERMISOS],
  roles: (['administrador', 'vendedor', 'digitador'] as const).map((rol) => ({
    rol,
    permisos: [...permisosDeRol(rol)],
    deFabrica: [...permisosDeRol(rol)],
    configurado: false,
  })),
  restricciones: {
    soloAdministrador: ['caja.reabrir'],
    incompatibles: [['remesa.registrar', 'remesa.tomar_completar']],
  },
};

describe('etiquetas de permisos', () => {
  it('todo permiso del catálogo tiene su descripción', () => {
    for (const permiso of PERMISOS) expect(ETIQUETAS_PERMISO[permiso], permiso).toBeTruthy();
  });
});

describe('pantalla de permisos', () => {
  it('le da al vendedor un permiso y guarda solo ese rol; lo solo del administrador no se ofrece', async () => {
    const api = simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
      'GET /permisos': { cuerpo: VISTA },
      'PUT /permisos/vendedor': { cuerpo: VISTA },
    });
    const { usuario } = renderizarApp('/permisos');
    const casilla = await screen.findByLabelText('Vendedor: Ver reportes, histórico y tablero');
    expect(casilla).not.toBeChecked();
    expect(screen.getByLabelText('Vendedor: Reabrir una jornada cerrada')).toBeDisabled();
    await usuario.click(casilla);
    const [guardarAdmin, guardarVendedor] = screen.getAllByRole('button', { name: 'Guardar' });
    expect(guardarAdmin).toBeDisabled();
    await usuario.click(guardarVendedor as HTMLElement);
    await waitFor(() => expect(api.de('PUT', '/permisos/vendedor')).toHaveLength(1));
    expect(
      (api.de('PUT', '/permisos/vendedor')[0]?.cuerpo as { permisos: string[] }).permisos,
    ).toContain('reporte.ver');
  });

  it('el vendedor no entra', async () => {
    simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') } });
    renderizarApp('/permisos');
    expect(
      await screen.findByText('No tienes permiso para ver esta pantalla.'),
    ).toBeInTheDocument();
  });
});
