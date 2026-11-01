import { formatearMoneda, pesosDesdeDivisa, type Moneda } from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { CampoSelector } from '../../componentes/CampoSelector.js';
import { erroresPorCampo, mensajeDe } from '../../lib/api.js';
import { avisoDecimalAmbiguo, normalizarDecimal } from '../../lib/formato.js';
import { registrarCompra } from '../../modulos/compras/api.js';
import { CLAVE_COMPRAS } from '../../modulos/compras/consultas.js';
import type { OpcionesCompra } from '../../modulos/compras/tipos.js';
import { CLAVE_CONTRAPARTES } from '../../modulos/contrapartes/consultas.js';
import { etiquetaSaldo } from '../../modulos/contrapartes/saldo.js';
import { CLAVE_INVENTARIO } from '../../modulos/inventario/consultas.js';

/**
 * Pesos que vale la compra, solo como vista previa: el servidor vuelve a calcularlo con la misma
 * función compartida y es el que decide. `null` si lo escrito todavía no es un número válido.
 */
export function pesosDeLaCompra(cantidad: string, tasa: string): string | null {
  try {
    const valor = pesosDesdeDivisa(normalizarDecimal(cantidad), normalizarDecimal(tasa));
    return valor.gt(0) ? valor.toFixed(2) : null;
  } catch {
    return null;
  }
}

interface Propiedades {
  opciones: OpcionesCompra;
  alRegistrar: () => void;
  alCancelar: () => void;
}

/** Compra de bolívares (u otra divisa) a una contraparte, de contado o a crédito (§5.6). */
export function FormularioCompra({ opciones, alRegistrar, alCancelar }: Propiedades) {
  const consultas = useQueryClient();
  const clave = useRef(crypto.randomUUID());
  const [contraparteId, setContraparteId] = useState(opciones.contrapartes[0]?.id ?? '');
  const [destinoId, setDestinoId] = useState(opciones.cuentasDestino[0]?.id ?? '');
  const [cantidad, setCantidad] = useState('');
  const [tasa, setTasa] = useState('');
  const [formaPago, setFormaPago] = useState<'contado' | 'credito'>('contado');
  const [pagoId, setPagoId] = useState(opciones.cuentasPago[0]?.id ?? '');
  const [nota, setNota] = useState('');

  const contraparte = opciones.contrapartes.find((c) => c.id === contraparteId);
  const destino = opciones.cuentasDestino.find((c) => c.id === destinoId);
  const ambiguoCantidad = avisoDecimalAmbiguo(cantidad);
  const ambiguoTasa = avisoDecimalAmbiguo(tasa);
  const pesos = pesosDeLaCompra(cantidad, tasa);
  const local = opciones.monedaLocal as Moneda;

  const registrar = useMutation({
    mutationFn: () =>
      registrarCompra({
        claveIdempotencia: clave.current,
        contraparteId,
        cuentaDestinoId: destinoId,
        cantidad: normalizarDecimal(cantidad),
        tasa: normalizarDecimal(tasa),
        formaPago,
        ...(formaPago === 'contado' ? { cuentaPagoId: pagoId } : {}),
        ...(nota.trim() === '' ? {} : { nota: nota.trim() }),
      }),
    onSuccess: async () => {
      await Promise.all([
        consultas.invalidateQueries({ queryKey: CLAVE_COMPRAS }),
        consultas.invalidateQueries({ queryKey: CLAVE_CONTRAPARTES }),
        consultas.invalidateQueries({ queryKey: CLAVE_INVENTARIO }),
      ]);
      alRegistrar();
    },
  });
  const delServidor = erroresPorCampo(registrar.error);

  if (opciones.contrapartes.length === 0 || opciones.cuentasDestino.length === 0) {
    return (
      <Aviso tipo="advertencia">
        Para comprar hace falta al menos una contraparte activa y una cuenta en la divisa (por
        ejemplo, una cuenta en VES).
      </Aviso>
    );
  }

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    if (ambiguoCantidad || ambiguoTasa) return;
    registrar.mutate();
  };

  return (
    <form className="formulario-ancho" onSubmit={enviar} noValidate>
      <CampoSelector
        etiqueta="Contraparte"
        value={contraparteId}
        onChange={(evento) => setContraparteId(evento.target.value)}
        ayuda={
          contraparte && contraparte.saldoLocal.replace(/[-0.]/g, '') !== ''
            ? `Saldo en ${local}: ${etiquetaSaldo(local, contraparte.saldoLocal)}`
            : undefined
        }
      >
        {opciones.contrapartes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </CampoSelector>

      <CampoSelector
        etiqueta="Entran a"
        value={destinoId}
        onChange={(evento) => setDestinoId(evento.target.value)}
      >
        {opciones.cuentasDestino.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre} ({c.moneda})
          </option>
        ))}
      </CampoSelector>

      <Campo
        etiqueta={`Cantidad recibida${destino ? ` (${destino.moneda})` : ''}`}
        inputMode="decimal"
        autoComplete="off"
        value={cantidad}
        onChange={(evento) => setCantidad(evento.target.value)}
        error={delServidor.cantidad ?? ambiguoCantidad ?? undefined}
      />
      <Campo
        etiqueta={`Tasa de compra (${local} por unidad)`}
        inputMode="decimal"
        autoComplete="off"
        value={tasa}
        onChange={(evento) => setTasa(evento.target.value)}
        error={delServidor.tasa ?? ambiguoTasa ?? undefined}
      />
      <p className="campo__ayuda" role="status">
        Vale: <strong className="mono">{pesos ? formatearMoneda(pesos, local) : '—'}</strong>
      </p>

      <CampoSelector
        etiqueta="Forma de pago"
        value={formaPago}
        onChange={(evento) => setFormaPago(evento.target.value as 'contado' | 'credito')}
        ayuda={
          formaPago === 'credito'
            ? 'Queda como deuda con la contraparte; si le diste un anticipo, se descuenta de ahí.'
            : undefined
        }
      >
        <option value="contado">De contado</option>
        <option value="credito">A crédito o contra anticipo</option>
      </CampoSelector>

      {formaPago === 'contado' && (
        <CampoSelector
          etiqueta="Sale de"
          value={pagoId}
          onChange={(evento) => setPagoId(evento.target.value)}
          error={delServidor.cuentaPagoId}
        >
          {opciones.cuentasPago.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} ({c.moneda})
            </option>
          ))}
        </CampoSelector>
      )}

      <Campo
        etiqueta="Nota (opcional)"
        maxLength={300}
        autoComplete="off"
        value={nota}
        onChange={(evento) => setNota(evento.target.value)}
      />

      {registrar.isError && !delServidor.cantidad && !delServidor.tasa && (
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
            pesos === null ||
            ambiguoCantidad !== null ||
            ambiguoTasa !== null ||
            (formaPago === 'contado' && pagoId === '')
          }
        >
          Registrar compra
        </Boton>
      </div>
    </form>
  );
}
