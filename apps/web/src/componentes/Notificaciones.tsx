import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Icono } from './Icono.js';

type TipoNotificacion = 'exito' | 'info';

interface Notificacion {
  id: number;
  tipo: TipoNotificacion;
  texto: string;
}

type Notificar = (texto: string, tipo?: TipoNotificacion) => void;

/** Tiempo que una notificación queda a la vista antes de cerrarse sola. */
export const DURACION_NOTIFICACION_MS = 4000;
const MAXIMO_A_LA_VEZ = 3;

const ContextoNotificaciones = createContext<Notificar>(() => undefined);

/**
 * Avisos breves de que algo salió bien ("Se guardaron los cambios."). Aparecen en una esquina, se
 * anuncian a los lectores de pantalla sin mover el foco y se cierran solos. Los errores no van
 * aquí: se quedan junto a lo que falló (`Aviso` o el error del campo) hasta que se corrijan.
 */
export function ProveedorNotificaciones({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Notificacion[]>([]);
  const siguienteId = useRef(1);
  const temporizadores = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const cerrar = useCallback((id: number) => {
    const temporizador = temporizadores.current.get(id);
    if (temporizador !== undefined) clearTimeout(temporizador);
    temporizadores.current.delete(id);
    setLista((actual) => actual.filter((notificacion) => notificacion.id !== id));
  }, []);

  const notificar = useCallback<Notificar>(
    (texto, tipo = 'exito') => {
      const id = siguienteId.current;
      siguienteId.current += 1;
      setLista((actual) => [...actual.slice(1 - MAXIMO_A_LA_VEZ), { id, tipo, texto }]);
      temporizadores.current.set(
        id,
        setTimeout(() => {
          cerrar(id);
        }, DURACION_NOTIFICACION_MS),
      );
    },
    [cerrar],
  );

  useEffect(() => {
    const pendientes = temporizadores.current;
    return () => {
      for (const temporizador of pendientes.values()) clearTimeout(temporizador);
      pendientes.clear();
    };
  }, []);

  return (
    <ContextoNotificaciones value={notificar}>
      {children}
      <div className="notificaciones" role="status" aria-live="polite">
        {lista.map((notificacion) => (
          <div key={notificacion.id} className={`notificacion notificacion--${notificacion.tipo}`}>
            <Icono nombre={notificacion.tipo} grande />
            <span className="notificacion__texto">{notificacion.texto}</span>
            <button
              type="button"
              className="notificacion__cerrar"
              aria-label="Cerrar aviso"
              onClick={() => {
                cerrar(notificacion.id);
              }}
            >
              <Icono nombre="cerrar" />
            </button>
            {/* Línea que se agota: muestra cuánto falta para que el aviso se cierre solo. */}
            <span
              className="notificacion__tiempo"
              aria-hidden="true"
              style={{ animationDuration: `${String(DURACION_NOTIFICACION_MS)}ms` }}
            />
          </div>
        ))}
      </div>
    </ContextoNotificaciones>
  );
}

/** Devuelve la función para mostrar una notificación. Fuera del proveedor no hace nada. */
export function useNotificar(): Notificar {
  return useContext(ContextoNotificaciones);
}
