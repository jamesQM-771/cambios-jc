import { EVENTOS_TIEMPO_REAL, RUTA_TIEMPO_REAL, type CambioRemesa } from '@cambios-jc/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io } from 'socket.io-client';

import { CLAVE_COLA } from '../modulos/cola/consultas.js';
import { CLAVE_REMESAS } from '../modulos/remesas/consultas.js';
import { ETIQUETAS_ESTADO, type EstadoRemesa } from '../modulos/remesas/tipos.js';

import { useNotificar } from './Notificaciones.js';

/**
 * Mantiene la pantalla al día sin recargar (D109). Los avisos solo dicen "algo cambió": la pantalla
 * vuelve a pedir lo suyo por la API normal. Si la conexión en vivo falla, las consultas siguen
 * funcionando por su cuenta (la cola se refresca sola cada pocos segundos).
 *
 * Solo se muestra un aviso cuando algo termina o necesita atención; el resto se refleja en silencio.
 */
export function AvisosEnVivo() {
  const consultas = useQueryClient();
  const notificar = useNotificar();

  useEffect(() => {
    const socket = io({
      path: RUTA_TIEMPO_REAL,
      withCredentials: true,
      // La reconexión es automática; si el servidor no está, no molesta con errores en pantalla.
      reconnectionDelayMax: 15_000,
    });

    socket.on(EVENTOS_TIEMPO_REAL.colaCambio, () => {
      void consultas.invalidateQueries({ queryKey: CLAVE_COLA });
    });
    socket.on(EVENTOS_TIEMPO_REAL.remesaCambio, (cambio: CambioRemesa) => {
      void consultas.invalidateQueries({ queryKey: CLAVE_REMESAS });
      if (cambio.estado === 'completada' || cambio.estado === 'con_incidencia') {
        notificar(`Una remesa pasó a: ${ETIQUETAS_ESTADO[cambio.estado as EstadoRemesa]}.`, 'info');
      }
    });
    // Al recuperar la conexión puede haberse perdido algún aviso: se pone todo al día.
    socket.io.on('reconnect', () => {
      void consultas.invalidateQueries({ queryKey: CLAVE_COLA });
      void consultas.invalidateQueries({ queryKey: CLAVE_REMESAS });
    });

    return () => {
      socket.disconnect();
    };
  }, [consultas, notificar]);

  return null;
}
