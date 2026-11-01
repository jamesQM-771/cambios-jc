import type { Server as ServidorHttp } from 'node:http';

import { EVENTOS_TIEMPO_REAL, type CambioRemesa, type Rol } from '@cambios-jc/shared';
import { Server } from 'socket.io';

import type { SesionActual } from '../plugins/permisos.js';
import { tienePermiso } from './permisos.js';

const SALA_COLA = 'cola';
const SALA_VENDEDORES = 'vendedores';

/** Cada cuánto se vuelve a comprobar que las sesiones de los sockets siguen vigentes. */
const REVISION_SESIONES_MS = 60_000;

/** Quien publica los cambios de las remesas. Los servicios lo usan sin saber cómo se entregan. */
export interface Notificador {
  remesaCambio(cambio: CambioRemesa): void;
}

/** Para pruebas y para cuando no hay servidor de tiempo real: no hace nada. */
export const notificadorNulo: Notificador = {
  remesaCambio() {
    // sin destinatarios
  },
};

export interface TiempoReal {
  notificador: Notificador;
  cerrar(): Promise<void>;
}

interface OpcionesTiempoReal {
  servidor: ServidorHttp;
  /** Origen de la web, para el CORS del handshake (en desarrollo todo pasa por el mismo origen). */
  origenWeb: string;
  nombreCookieSesion: string;
  resolverSesion: (token: string | undefined) => Promise<SesionActual | null>;
}

/** Valor de una cookie dentro de la cabecera `Cookie`. */
export function leerCookie(cabecera: string | undefined, nombre: string): string | undefined {
  for (const par of (cabecera ?? '').split(';')) {
    const indice = par.indexOf('=');
    if (indice > 0 && par.slice(0, indice).trim() === nombre) {
      try {
        return decodeURIComponent(par.slice(indice + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/**
 * Servidor de Socket.IO montado sobre el mismo servidor HTTP de la API. Entra solo quien tiene una
 * sesión completa (la misma cookie de siempre) y queda en las salas que su rol permite.
 */
export function crearTiempoReal({
  servidor,
  origenWeb,
  nombreCookieSesion,
  resolverSesion,
}: OpcionesTiempoReal): TiempoReal {
  const io = new Server(servidor, {
    cors: { origin: origenWeb, credentials: true },
    // Un socket nuevo por pestaña; el cliente reconecta solo y la pantalla además consulta por su cuenta.
    serveClient: false,
  });

  io.use((socket, siguiente) => {
    const token = leerCookie(socket.handshake.headers.cookie, nombreCookieSesion);
    void resolverSesion(token).then(
      (sesion) => {
        if (!sesion?.completa) {
          siguiente(new Error('NO_AUTENTICADO'));
          return;
        }
        const datos = socket.data as { token?: string; rol?: Rol };
        datos.token = token;
        datos.rol = sesion.usuario.rol;
        siguiente();
      },
      () => {
        siguiente(new Error('ERROR_INTERNO'));
      },
    );
  });

  io.on('connection', (socket) => {
    const { rol } = socket.data as { rol?: Rol };
    if (!rol) return;
    if (tienePermiso(rol, 'remesa.tomar_completar')) void socket.join(SALA_COLA);
    if (tienePermiso(rol, 'remesa.registrar')) void socket.join(SALA_VENDEDORES);
  });

  // Una sesión cerrada o vencida no debe seguir recibiendo avisos por un socket que quedó abierto.
  const revision = setInterval(() => {
    void (async () => {
      for (const socket of await io.fetchSockets()) {
        const { token } = socket.data as { token?: string };
        const sesion = await resolverSesion(token).catch(() => null);
        if (!sesion?.completa) socket.disconnect(true);
      }
    })();
  }, REVISION_SESIONES_MS);
  revision.unref();

  return {
    notificador: {
      remesaCambio(cambio) {
        io.to(SALA_VENDEDORES).emit(EVENTOS_TIEMPO_REAL.remesaCambio, cambio);
        // A quien paga solo se le avisa que la cola cambió: sin datos de la remesa.
        io.to(SALA_COLA).emit(EVENTOS_TIEMPO_REAL.colaCambio);
      },
    },
    cerrar() {
      clearInterval(revision);
      io.disconnectSockets(true);
      // Se cierra el motor, no el servidor HTTP: ese lo cierra Fastify.
      io.engine.close();
      return Promise.resolve();
    },
  };
}
