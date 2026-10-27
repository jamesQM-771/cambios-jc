import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { CampoSelector } from '../../componentes/CampoSelector.js';
import { erroresPorCampo, mensajeDe } from '../../lib/api.js';
import { avisoDecimalAmbiguo, normalizarDecimal } from '../../lib/formato.js';
import { registrarTraslado } from '../../modulos/traslados/api.js';
import { CLAVE_TRASLADOS } from '../../modulos/traslados/consultas.js';
import type {
  CuentaParaTraslado,
  OpcionesTraslado,
  Traslado,
} from '../../modulos/traslados/tipos.js';

interface PropiedadesFormularioTraslado {
  opciones: OpcionesTraslado;
  alRegistrar: (traslado: Traslado) => void;
  alCancelar: () => void;
}

const TIPOS: Record<CuentaParaTraslado['tipo'], string> = {
  caja: 'efectivo',
  banco: 'banco',
  billetera: 'billetera',
};

const etiquetaDe = (cuenta: CuentaParaTraslado) =>
  `${cuenta.nombre} · ${TIPOS[cuenta.tipo]} (${cuenta.moneda})`;

/**
 * Qué cuentas se pueden elegir como destino. El servidor es quien decide (D124); aquí solo se
 * ofrece lo que no va a rechazar: la misma moneda, otra cuenta y, si no es administrador, que una
 * de las dos sea la caja del propio turno.
 */
export function destinosPosibles(
  cuentas: readonly CuentaParaTraslado[],
  origen: CuentaParaTraslado | undefined,
  cajaPropiaId: string | null,
  puedeCualquierCuenta: boolean,
): CuentaParaTraslado[] {
  if (!origen) return [];
  const esDeMiCaja = (cuenta: CuentaParaTraslado) =>
    cuenta.tipo === 'caja' && cajaPropiaId !== null && cuenta.cajaId === cajaPropiaId;
  return cuentas.filter(
    (cuenta) =>
      cuenta.id !== origen.id &&
      cuenta.moneda === origen.moneda &&
      (puedeCualquierCuenta || esDeMiCaja(origen) || esDeMiCaja(cuenta)),
  );
}

/** Pasar dinero de una cuenta a otra de la misma moneda: caja, bóveda y bancos (§5.17). */
export function FormularioTraslado({
  opciones,
  alRegistrar,
  alCancelar,
}: PropiedadesFormularioTraslado) {
  const consultas = useQueryClient();
  // Una clave por formulario abierto: un reintento por mala conexión no duplica el traslado.
  const clave = useRef(crypto.randomUUID());
  const [origenElegido, setOrigenElegido] = useState('');
  const [destinoElegido, setDestinoElegido] = useState('');
  const [monto, setMonto] = useState('');
  const [nota, setNota] = useState('');

  const { cuentas, miTurno, puedeCualquierCuenta } = opciones;
  const origen = cuentas.find((c) => c.id === origenElegido) ?? cuentas[0];
  const destinos = destinosPosibles(
    cuentas,
    origen,
    miTurno?.caja.id ?? null,
    puedeCualquierCuenta,
  );
  const destino = destinos.find((c) => c.id === destinoElegido) ?? destinos[0];
  const ambiguo = avisoDecimalAmbiguo(monto);

  const registrar = useMutation({
    mutationFn: () => {
      if (!origen || !destino) throw new Error('Elige las dos cuentas.');
      const texto = nota.trim();
      return registrarTraslado({
        claveIdempotencia: clave.current,
        origenId: origen.id,
        destinoId: destino.id,
        monto: normalizarDecimal(monto),
        ...(texto === '' ? {} : { nota: texto }),
      });
    },
    onSuccess: async ({ traslado }) => {
      await consultas.invalidateQueries({ queryKey: CLAVE_TRASLADOS });
      alRegistrar(traslado);
    },
  });

  const delServidor = erroresPorCampo(registrar.error);

  if (!puedeCualquierCuenta && !miTurno) {
    return (
      <>
        <Aviso tipo="advertencia">
          Abre tu turno de caja antes de hacer un traslado: solo puedes mover el dinero de tu caja.
        </Aviso>
        <div className="acciones acciones--derecha">
          <Boton variante="secundario" onClick={alCancelar}>
            Cerrar
          </Boton>
        </div>
      </>
    );
  }
  if (cuentas.length < 2) {
    return (
      <Aviso tipo="advertencia">Hacen falta al menos dos cuentas activas para trasladar.</Aviso>
    );
  }

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    if (ambiguo) return;
    registrar.mutate();
  };

  return (
    <form className="formulario-ancho" onSubmit={enviar} noValidate>
      <CampoSelector
        etiqueta="Sale de"
        value={origen?.id ?? ''}
        onChange={(evento) => {
          setOrigenElegido(evento.target.value);
          setDestinoElegido('');
        }}
      >
        {cuentas.map((cuenta) => (
          <option key={cuenta.id} value={cuenta.id}>
            {etiquetaDe(cuenta)}
          </option>
        ))}
      </CampoSelector>

      <CampoSelector
        etiqueta="Entra a"
        ayuda={
          puedeCualquierCuenta
            ? 'Solo aparecen cuentas de la misma moneda.'
            : 'Solo aparecen cuentas de la misma moneda, y una de las dos tiene que ser la caja de tu turno.'
        }
        value={destino?.id ?? ''}
        onChange={(evento) => setDestinoElegido(evento.target.value)}
        error={delServidor.destinoId}
      >
        {destinos.map((cuenta) => (
          <option key={cuenta.id} value={cuenta.id}>
            {etiquetaDe(cuenta)}
          </option>
        ))}
      </CampoSelector>

      {destinos.length === 0 && (
        <Aviso tipo="advertencia">
          Desde esa cuenta no hay a dónde trasladar. Elige otra de origen.
        </Aviso>
      )}

      <Campo
        etiqueta={`Monto${origen ? ` (${origen.moneda})` : ''}`}
        inputMode="decimal"
        autoComplete="off"
        value={monto}
        onChange={(evento) => setMonto(evento.target.value)}
        error={delServidor.monto ?? ambiguo ?? undefined}
      />

      <Campo
        etiqueta="Nota (opcional)"
        maxLength={200}
        autoComplete="off"
        value={nota}
        onChange={(evento) => setNota(evento.target.value)}
        error={delServidor.nota}
      />

      {registrar.isError && !delServidor.monto && !delServidor.destinoId && !delServidor.nota && (
        <Aviso tipo="error">{mensajeDe(registrar.error)}</Aviso>
      )}

      <div className="acciones acciones--derecha">
        <Boton variante="secundario" onClick={alCancelar} disabled={registrar.isPending}>
          Cancelar
        </Boton>
        <Boton
          type="submit"
          cargando={registrar.isPending}
          disabled={!destino || monto.trim() === '' || ambiguo !== null}
        >
          Trasladar
        </Boton>
      </div>
    </form>
  );
}
