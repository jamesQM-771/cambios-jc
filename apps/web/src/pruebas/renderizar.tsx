import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import { App } from '../App.js';
import { crearClienteConsultas } from '../lib/consulta.js';

/** Dibuja la aplicación completa en la ruta indicada, con una caché de consultas nueva. */
export function renderizarApp(ruta = '/') {
  const cliente = crearClienteConsultas();
  // Los reintentos de errores de red o del servidor no esperan en las pruebas.
  cliente.setDefaultOptions({
    ...cliente.getDefaultOptions(),
    queries: { ...cliente.getDefaultOptions().queries, retryDelay: 0 },
  });
  const usuario = userEvent.setup();
  const resultado = render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={[ruta]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { usuario, cliente, ...resultado };
}
