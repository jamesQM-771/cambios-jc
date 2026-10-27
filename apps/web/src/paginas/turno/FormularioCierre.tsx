import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { erroresPorCampo, mensajeDe } from '../../lib/api.js';
import { CLAVE_REMESAS } from '../../modulos/remesas/consultas.js';
import { cerrarTurno } from '../../modulos/turnos/api.js';
import { CLAVE_TURNOS } from '../../modulos/turnos/consultas.js';
import type { MonedaDeCaja, Turno } from '../../modulos/turnos/tipos.js';

import {
  ConteoPorDenominacion,
  conteosParaEnviar,
  type Cantidades,
} from './ConteoPorDenominacion.js';

interface Propiedades {
  turno: Pick<Turno, 'id' | 'caja'>;
  /** Se pide el motivo cuando se cierra el turno de otra persona (turno olvidado). */
  pedirMotivo?: boolean;
  monedas: readonly MonedaDeCaja[];
  alCancelar: () => void;
  alCerrar: (turno: Turno) => void;
}

/**
 * Cerrar el turno: se cuenta el efectivo y el servidor lo compara con lo esperado (§5.16). Si no
 * cuadra exige una explicación por moneda; por eso el campo está a la vista desde el principio.
 */
export function FormularioCierre({
  turno,
  pedirMotivo = false,
  monedas,
  alCancelar,
  alCerrar,
}: Propiedades) {
  const consultas = useQueryClient();
  const [cantidades, setCantidades] = useState<Cantidades>({});
  const [explicaciones, setExplicaciones] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState('');

  const cerrar = useMutation({
    mutationFn: () =>
      cerrarTurno(turno.id, {
        conteos: conteosParaEnviar(monedas, cantidades),
        explicaciones: monedas
          .map((moneda) => ({
            moneda: moneda.moneda,
            texto: (explicaciones[moneda.moneda] ?? '').trim(),
          }))
          .filter((explicacion) => explicacion.texto !== ''),
        ...(pedirMotivo ? { motivo: motivo.trim() } : {}),
      }),
    onSuccess: async ({ turno: cerrado }) => {
      await Promise.all([
        consultas.invalidateQueries({ queryKey: CLAVE_TURNOS }),
        consultas.invalidateQueries({ queryKey: CLAVE_REMESAS }),
      ]);
      alCerrar(cerrado);
    },
  });

  const delServidor = erroresPorCampo(cerrar.error);

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    cerrar.mutate();
  };

  return (
    <form onSubmit={enviar} noValidate>
      <p>
        Cuenta todo el efectivo de la caja <strong>{turno.caja.nombre}</strong>, billete por
        billete. No hay tolerancia: si la cuenta no cuadra con lo que el sistema espera, tendrás que
        explicar la diferencia, y quedará a tu nombre.
      </p>

      {pedirMotivo && (
        <Campo
          etiqueta="Motivo del cierre"
          ayuda="Estás cerrando el turno de otra persona. Explica por qué."
          maxLength={300}
          autoComplete="off"
          value={motivo}
          onChange={(evento) => setMotivo(evento.target.value)}
          error={delServidor.motivo}
        />
      )}

      {monedas.map((moneda) => (
        <div key={moneda.moneda}>
          <ConteoPorDenominacion
            moneda={moneda}
            cantidades={cantidades}
            alCambiar={(id, texto) => setCantidades((antes) => ({ ...antes, [id]: texto }))}
          />
          <Campo
            etiqueta={`Explicación de la diferencia en ${moneda.moneda}`}
            ayuda="Solo si el efectivo no cuadra. Si cuadra, déjala vacía."
            maxLength={300}
            autoComplete="off"
            value={explicaciones[moneda.moneda] ?? ''}
            onChange={(evento) =>
              setExplicaciones((antes) => ({ ...antes, [moneda.moneda]: evento.target.value }))
            }
          />
        </div>
      ))}

      {delServidor.explicaciones && <Aviso tipo="error">{delServidor.explicaciones}</Aviso>}
      {delServidor.conteos && <Aviso tipo="error">{delServidor.conteos}</Aviso>}
      {cerrar.isError &&
        !delServidor.explicaciones &&
        !delServidor.conteos &&
        !delServidor.motivo && <Aviso tipo="error">{mensajeDe(cerrar.error)}</Aviso>}

      <div className="acciones acciones--derecha">
        <Boton variante="secundario" onClick={alCancelar} disabled={cerrar.isPending}>
          Cancelar
        </Boton>
        <Boton
          type="submit"
          cargando={cerrar.isPending}
          disabled={pedirMotivo && motivo.trim().length < 3}
        >
          Cerrar turno
        </Boton>
      </div>
    </form>
  );
}
