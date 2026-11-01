import {
  efectoDeMovimiento,
  TIPOS_MOVIMIENTO_CONTRAPARTE,
  type TipoMovimientoContraparte,
} from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { quedoPendiente } from '../../lib/aprobacion.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { CampoSelector } from '../../componentes/CampoSelector.js';
import { erroresPorCampo, mensajeDe } from '../../lib/api.js';
import { avisoDecimalAmbiguo, normalizarDecimal } from '../../lib/formato.js';
import { registrarMovimiento } from '../../modulos/contrapartes/api.js';
import { CLAVE_CONTRAPARTES } from '../../modulos/contrapartes/consultas.js';
import {
  ETIQUETAS_MOVIMIENTO,
  type OpcionesContraparte,
} from '../../modulos/contrapartes/tipos.js';

/** Los que se registran a mano: la compra a crédito la crea el módulo de compras. */
const TIPOS_MANUALES = TIPOS_MOVIMIENTO_CONTRAPARTE.filter(
  (tipo) => !efectoDeMovimiento(tipo).soloSistema,
);

const MONEDAS = ['COP', 'VES', 'USD'] as const;

interface Propiedades {
  contraparteId: string;
  opciones: OpcionesContraparte;
  alRegistrar: (pendiente: boolean) => void;
  alCancelar: () => void;
}

/** Préstamos, abonos, anticipos y ajustes de la cuenta corriente (§5.8). */
export function FormularioMovimiento({
  contraparteId,
  opciones,
  alRegistrar,
  alCancelar,
}: Propiedades) {
  const consultas = useQueryClient();
  const clave = useRef(crypto.randomUUID());
  const [tipo, setTipo] = useState<TipoMovimientoContraparte>('prestamo_otorgado');
  const [moneda, setMoneda] = useState<string>('COP');
  const [monto, setMonto] = useState('');
  const [cuentaId, setCuentaId] = useState('');
  const [signo, setSigno] = useState<'' | '1' | '-1'>('');
  const [nota, setNota] = useState('');

  const efecto = efectoDeMovimiento(tipo);
  const cuentas = opciones.cuentas.filter((cuenta) => cuenta.moneda === moneda);
  const ambiguo = avisoDecimalAmbiguo(monto);
  const exigeNota = tipo === 'ajuste' || tipo === 'otro';
  const faltaCuenta = efecto.exigeCuenta && cuentaId === '';
  const faltaSigno = efecto.signo === null && signo === '';

  const registrar = useMutation({
    mutationFn: () =>
      registrarMovimiento(contraparteId, {
        claveIdempotencia: clave.current,
        tipo,
        moneda,
        monto: normalizarDecimal(monto),
        ...(efecto.signo === null && signo !== '' ? { signo: signo === '1' ? 1 : -1 } : {}),
        ...(efecto.admiteCuenta && cuentaId !== '' ? { cuentaId } : {}),
        ...(nota.trim() === '' ? {} : { nota: nota.trim() }),
      }),
    onSuccess: async (respuesta) => {
      await consultas.invalidateQueries({ queryKey: CLAVE_CONTRAPARTES });
      alRegistrar(quedoPendiente(respuesta));
    },
  });
  const delServidor = erroresPorCampo(registrar.error);

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    if (ambiguo) return;
    registrar.mutate();
  };

  return (
    <form className="formulario-ancho" onSubmit={enviar} noValidate>
      <CampoSelector
        etiqueta="Tipo de movimiento"
        value={tipo}
        onChange={(evento) => {
          setTipo(evento.target.value as TipoMovimientoContraparte);
          setCuentaId('');
          setSigno('');
        }}
      >
        {TIPOS_MANUALES.map((valor) => (
          <option key={valor} value={valor}>
            {ETIQUETAS_MOVIMIENTO[valor]}
          </option>
        ))}
      </CampoSelector>

      {efecto.signo === null && (
        <CampoSelector
          etiqueta="Efecto en la cuenta corriente"
          value={signo}
          onChange={(evento) => setSigno(evento.target.value as '' | '1' | '-1')}
        >
          <option value="">Elige…</option>
          <option value="1">Me debe más (o le debo menos)</option>
          <option value="-1">Le debo más (o me debe menos)</option>
        </CampoSelector>
      )}

      <CampoSelector
        etiqueta="Moneda"
        value={moneda}
        onChange={(evento) => {
          setMoneda(evento.target.value);
          setCuentaId('');
        }}
      >
        {MONEDAS.map((valor) => (
          <option key={valor} value={valor}>
            {valor}
          </option>
        ))}
      </CampoSelector>

      <Campo
        etiqueta={`Monto (${moneda})`}
        inputMode="decimal"
        autoComplete="off"
        value={monto}
        onChange={(evento) => setMonto(evento.target.value)}
        error={delServidor.monto ?? ambiguo ?? undefined}
      />

      {efecto.admiteCuenta && (
        <CampoSelector
          etiqueta={efecto.exigeCuenta ? 'Cuenta' : 'Cuenta (si movió dinero)'}
          ayuda="Sin cuenta, el movimiento es solo un reconocimiento de deuda: no mueve dinero."
          value={cuentaId}
          onChange={(evento) => setCuentaId(evento.target.value)}
        >
          <option value="">{efecto.exigeCuenta ? 'Elige…' : 'Sin mover dinero'}</option>
          {cuentas.map((cuenta) => (
            <option key={cuenta.id} value={cuenta.id}>
              {cuenta.nombre}
            </option>
          ))}
        </CampoSelector>
      )}

      <Campo
        etiqueta={exigeNota ? 'Nota (obligatoria)' : 'Nota (opcional)'}
        maxLength={300}
        autoComplete="off"
        value={nota}
        onChange={(evento) => setNota(evento.target.value)}
      />

      {registrar.isError && !delServidor.monto && (
        <Aviso tipo="error">{mensajeDe(registrar.error)}</Aviso>
      )}

      <div className="acciones acciones--derecha">
        <Boton variante="secundario" onClick={alCancelar} disabled={registrar.isPending}>
          Cancelar
        </Boton>
        <Boton
          type="submit"
          cargando={registrar.isPending}
          disabled={
            monto.trim() === '' ||
            ambiguo !== null ||
            faltaCuenta ||
            faltaSigno ||
            (exigeNota && nota.trim() === '')
          }
        >
          Registrar movimiento
        </Boton>
      </div>
    </form>
  );
}
