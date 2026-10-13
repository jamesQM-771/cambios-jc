import { formatearMoneda } from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { BotonCopiar } from '../../componentes/BotonCopiar.js';
import { Campo } from '../../componentes/Campo.js';
import { CampoSelector } from '../../componentes/CampoSelector.js';
import { Dialogo } from '../../componentes/Dialogo.js';
import { erroresPorCampo, mensajeDe } from '../../lib/api.js';
import { comprimirImagen } from '../../lib/comprimir-imagen.js';
import { avisoDecimalAmbiguo, normalizarDecimal } from '../../lib/formato.js';
import {
  completarTransferencia,
  devolverALaCola,
  reportarIncidencia,
  tomarTransferencia,
} from '../../modulos/cola/api.js';
import { CLAVE_COLA } from '../../modulos/cola/consultas.js';
import type { CuentaOrigen, ItemCola } from '../../modulos/cola/tipos.js';
import { formatearCuenta } from '../../modulos/clientes/tipos.js';

interface PropiedadesTarjeta {
  item: ItemCola;
  cuentas: readonly CuentaOrigen[];
  cuentaSugeridaId: string | null;
}

/** "hace 5 min": desde cuándo espera, para atender primero a quien lleva más tiempo. */
function haceCuanto(iso: string, ahora = Date.now()): string {
  const minutos = Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60_000));
  if (minutos < 1) return 'ahora mismo';
  if (minutos < 60) return `hace ${String(minutos)} min`;
  const horas = Math.floor(minutos / 60);
  return `hace ${String(horas)} h`;
}

/** Monto para pegar en la app del banco: coma decimal y sin separador de miles. */
const montoParaBanco = (monto: string): string => monto.replace('.', ',');

export function TarjetaTransferencia({ item, cuentas, cuentaSugeridaId }: PropiedadesTarjeta) {
  const consultas = useQueryClient();
  const refrescar = () => consultas.invalidateQueries({ queryKey: CLAVE_COLA });

  const tomar = useMutation({
    mutationFn: () => tomarTransferencia(item.id),
    onSuccess: refrescar,
  });
  const devolver = useMutation({
    mutationFn: () => devolverALaCola(item.id),
    onSuccess: refrescar,
  });

  const { pago } = item;
  const monto = formatearMoneda(item.montoBolivares, 'VES');

  if (!item.tomadaPorMi) {
    return (
      <li className="transferencia">
        <div className="transferencia__cabecera">
          <strong className="transferencia__monto mono">{monto}</strong>
          <span className="transferencia__espera">{haceCuanto(item.enviadaEn)}</span>
        </div>
        <p className="transferencia__banco">
          {pago.banco.nombre} · {pago.tipo === 'cuenta_bancaria' ? 'Cuenta' : 'Pago móvil'}
        </p>
        {tomar.isError && <Aviso tipo="error">{mensajeDe(tomar.error)}</Aviso>}
        <Boton ancho cargando={tomar.isPending} onClick={() => tomar.mutate()}>
          Tomar
        </Boton>
      </li>
    );
  }

  return (
    <li className="transferencia transferencia--mia">
      <div className="transferencia__cabecera">
        <strong className="transferencia__monto mono">{monto}</strong>
        <BotonCopiar texto={montoParaBanco(item.montoBolivares)} etiqueta="Copiar monto" />
      </div>
      <dl className="transferencia__datos">
        <div>
          <dt>Banco</dt>
          <dd>
            {pago.banco.codigo} · {pago.banco.nombre}
          </dd>
        </div>
        <div>
          <dt>{pago.tipo === 'cuenta_bancaria' ? 'Número de cuenta' : 'Teléfono'}</dt>
          <dd className="mono">
            {pago.tipo === 'cuenta_bancaria'
              ? formatearCuenta(pago.numeroCuenta ?? '')
              : (pago.telefonoPagoMovil ?? '')}
          </dd>
          <BotonCopiar
            texto={
              pago.tipo === 'cuenta_bancaria'
                ? (pago.numeroCuenta ?? '')
                : (pago.telefonoPagoMovil ?? '')
            }
            etiqueta={pago.tipo === 'cuenta_bancaria' ? 'Copiar cuenta' : 'Copiar teléfono'}
          />
        </div>
        <div>
          <dt>Titular</dt>
          <dd>{pago.titular}</dd>
        </div>
        <div>
          <dt>Cédula del titular</dt>
          <dd className="mono">
            {pago.tipoDocumentoTitular} {pago.numeroDocumentoTitular}
          </dd>
          <BotonCopiar texto={pago.numeroDocumentoTitular ?? ''} etiqueta="Copiar cédula" />
        </div>
      </dl>

      {devolver.isError && <Aviso tipo="error">{mensajeDe(devolver.error)}</Aviso>}
      <FormularioCierre
        item={item}
        cuentas={cuentas}
        cuentaSugeridaId={cuentaSugeridaId}
        alTerminar={refrescar}
      />
      <Boton
        variante="fantasma"
        chico
        cargando={devolver.isPending}
        onClick={() => devolver.mutate()}
      >
        Devolver a la cola
      </Boton>
    </li>
  );
}

interface PropiedadesFormularioCierre {
  item: ItemCola;
  cuentas: readonly CuentaOrigen[];
  cuentaSugeridaId: string | null;
  alTerminar: () => Promise<void>;
}

/** Cuenta desde la que pagó, referencia, costo y la captura del comprobante; o una incidencia. */
function FormularioCierre({
  item,
  cuentas,
  cuentaSugeridaId,
  alTerminar,
}: PropiedadesFormularioCierre) {
  const [cuentaElegida, setCuentaElegida] = useState(cuentaSugeridaId ?? '');
  const [referencia, setReferencia] = useState('');
  const [costo, setCosto] = useState('');
  const [captura, setCaptura] = useState<File | null>(null);
  const [incidencia, setIncidencia] = useState(false);
  const [motivo, setMotivo] = useState('');

  const cuentaId = cuentas.some((c) => c.id === cuentaElegida)
    ? cuentaElegida
    : (cuentas[0]?.id ?? '');
  const cuenta = cuentas.find((c) => c.id === cuentaId);
  const avisoCosto = avisoDecimalAmbiguo(costo);

  const completar = useMutation({
    mutationFn: async () => {
      if (!captura) throw new Error('Falta la captura del comprobante.');
      const reducida = await comprimirImagen(captura);
      return completarTransferencia(item.id, {
        cuentaOrigenId: cuentaId,
        ...(referencia.trim() === '' ? {} : { referenciaBancaria: referencia.trim() }),
        ...(costo.trim() === '' ? {} : { costoBancario: normalizarDecimal(costo) }),
        captura: reducida,
      });
    },
    onSuccess: alTerminar,
  });
  const reportar = useMutation({
    mutationFn: () => reportarIncidencia(item.id, motivo.trim()),
    onSuccess: async () => {
      setIncidencia(false);
      await alTerminar();
    },
  });

  const delServidor = erroresPorCampo(completar.error);

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    completar.mutate();
  };

  return (
    <>
      <form onSubmit={enviar} noValidate className="transferencia__cierre">
        {completar.isError && <Aviso tipo="error">{mensajeDe(completar.error)}</Aviso>}
        <CampoSelector
          etiqueta="Cuenta desde la que pagaste"
          value={cuentaId}
          onChange={(evento) => setCuentaElegida(evento.target.value)}
          error={delServidor.cuentaOrigenId}
        >
          {cuentas.length === 0 && <option value="">No hay cuentas disponibles</option>}
          {cuentas.map((opcion) => (
            <option key={opcion.id} value={opcion.id}>
              {opcion.nombre}
            </option>
          ))}
        </CampoSelector>
        <Campo
          etiqueta="Referencia del banco (opcional)"
          autoComplete="off"
          value={referencia}
          onChange={(evento) => setReferencia(evento.target.value)}
          error={delServidor.referenciaBancaria}
        />
        <Campo
          etiqueta="Costo bancario (opcional)"
          inputMode="decimal"
          autoComplete="off"
          placeholder={cuenta?.comisionPorDefecto ?? ''}
          value={costo}
          onChange={(evento) => setCosto(evento.target.value)}
          error={avisoCosto ?? delServidor.costoBancario}
        />
        <div className="campo">
          <label className="campo__etiqueta" htmlFor={`captura-${item.id}`}>
            Captura del comprobante
          </label>
          <input
            id={`captura-${item.id}`}
            type="file"
            accept="image/png,image/jpeg"
            className="campo__entrada"
            onChange={(evento) => setCaptura(evento.target.files?.[0] ?? null)}
          />
        </div>
        <Boton
          type="submit"
          ancho
          cargando={completar.isPending}
          disabled={!captura || cuentaId === '' || avisoCosto !== null}
        >
          Completar transferencia
        </Boton>
        <Boton variante="peligro" chico onClick={() => setIncidencia(true)}>
          No pude pagarla
        </Boton>
      </form>

      <Dialogo
        abierto={incidencia}
        alCerrar={() => setIncidencia(false)}
        titulo="Reportar incidencia"
      >
        <p>Cuenta qué pasó para que quien vende pueda corregir los datos.</p>
        {reportar.isError && <Aviso tipo="error">{mensajeDe(reportar.error)}</Aviso>}
        <div className="campo">
          <label className="campo__etiqueta" htmlFor={`motivo-${item.id}`}>
            Qué pasó
          </label>
          <textarea
            id={`motivo-${item.id}`}
            className="campo__entrada"
            rows={3}
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
          />
        </div>
        <div className="acciones acciones--derecha">
          <Boton
            variante="secundario"
            onClick={() => setIncidencia(false)}
            disabled={reportar.isPending}
          >
            Volver
          </Boton>
          <Boton
            variante="peligro"
            cargando={reportar.isPending}
            disabled={motivo.trim().length < 3}
            onClick={() => reportar.mutate()}
          >
            Reportar incidencia
          </Boton>
        </div>
      </Dialogo>
    </>
  );
}
