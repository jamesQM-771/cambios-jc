import { EVENTOS_TIEMPO_REAL } from '@cambios-jc/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { socketsFalsos } from '../pruebas/socket-falso.js';

import { AvisosEnVivo } from './AvisosEnVivo.js';
import { ProveedorNotificaciones } from './Notificaciones.js';

function montar() {
  const cliente = new QueryClient();
  const invalidar = vi.spyOn(cliente, 'invalidateQueries');
  const resultado = render(
    <QueryClientProvider client={cliente}>
      <ProveedorNotificaciones>
        <AvisosEnVivo />
      </ProveedorNotificaciones>
    </QueryClientProvider>,
  );
  const socket = socketsFalsos.at(-1);
  if (!socket) throw new Error('El componente no abrió la conexión en vivo.');
  return { ...resultado, socket, invalidar };
}

describe('AvisosEnVivo', () => {
  beforeEach(() => {
    socketsFalsos.length = 0;
  });

  it('se conecta por la ruta del servidor, con la cookie de sesión', () => {
    const { socket } = montar();

    expect(socket.opciones).toMatchObject({ path: '/api/socket.io', withCredentials: true });
  });

  it('cuando la cola cambia, vuelve a pedirla', () => {
    const { socket, invalidar } = montar();

    act(() => {
      socket.desdeElServidor(EVENTOS_TIEMPO_REAL.colaCambio);
    });

    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['cola'] });
  });

  it('cuando una remesa cambia, refresca las remesas y avisa solo si terminó o tiene incidencia', () => {
    const { socket, invalidar } = montar();

    act(() => {
      socket.desdeElServidor(EVENTOS_TIEMPO_REAL.remesaCambio, { id: 'r-1', estado: 'en_cola' });
    });
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['remesas'] });
    expect(screen.queryByText(/pasó a/)).not.toBeInTheDocument();

    act(() => {
      socket.desdeElServidor(EVENTOS_TIEMPO_REAL.remesaCambio, { id: 'r-1', estado: 'completada' });
    });
    expect(screen.getByText('Una remesa pasó a: Completada.')).toBeInTheDocument();

    act(() => {
      socket.desdeElServidor(EVENTOS_TIEMPO_REAL.remesaCambio, {
        id: 'r-2',
        estado: 'con_incidencia',
      });
    });
    expect(screen.getByText('Una remesa pasó a: Con incidencia.')).toBeInTheDocument();
  });

  it('al reconectar pone todo al día, porque pudo perderse algún aviso', () => {
    const { socket, invalidar } = montar();
    invalidar.mockClear();

    act(() => {
      socket.desdeLaConexion('reconnect');
    });

    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['cola'] });
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['remesas'] });
  });

  it('al salir de la pantalla cierra la conexión', () => {
    const { socket, unmount } = montar();

    unmount();

    expect(socket.desconectado).toBe(true);
  });
});
