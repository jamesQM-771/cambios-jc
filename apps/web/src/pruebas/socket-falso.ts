type Manejador = (...datos: never[]) => void;

/** Un socket de Socket.IO simulado: guarda quién escucha y deja disparar avisos "desde el servidor". */
export interface SocketFalso {
  opciones: unknown;
  desconectado: boolean;
  on: (evento: string, manejador: Manejador) => SocketFalso;
  disconnect: () => SocketFalso;
  io: { on: (evento: string, manejador: Manejador) => void };
  /** Dispara un evento como si lo enviara el servidor. */
  desdeElServidor: (evento: string, ...datos: unknown[]) => void;
  /** Dispara un evento del administrador de conexión (por ejemplo `reconnect`). */
  desdeLaConexion: (evento: string) => void;
}

/** Todos los sockets creados en la prueba, en orden. Se vacía solo antes de cada prueba. */
export const socketsFalsos: SocketFalso[] = [];

export function crearSocketFalso(opciones?: unknown): SocketFalso {
  const escuchas = new Map<string, Manejador[]>();
  const escuchasConexion = new Map<string, Manejador[]>();
  const agregar = (mapa: Map<string, Manejador[]>, evento: string, manejador: Manejador) => {
    mapa.set(evento, [...(mapa.get(evento) ?? []), manejador]);
  };
  const socket: SocketFalso = {
    opciones,
    desconectado: false,
    on(evento, manejador) {
      agregar(escuchas, evento, manejador);
      return socket;
    },
    disconnect() {
      socket.desconectado = true;
      return socket;
    },
    io: {
      on(evento, manejador) {
        agregar(escuchasConexion, evento, manejador);
      },
    },
    desdeElServidor(evento, ...datos) {
      for (const manejador of escuchas.get(evento) ?? []) {
        (manejador as (...argumentos: unknown[]) => void)(...datos);
      }
    },
    desdeLaConexion(evento) {
      for (const manejador of escuchasConexion.get(evento) ?? []) manejador();
    },
  };
  socketsFalsos.push(socket);
  return socket;
}
