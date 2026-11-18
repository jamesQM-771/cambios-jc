import {
  formatearMoneda,
  pesosDesdeDivisa,
  totalDeDenominaciones,
  type Moneda,
} from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { CampoSelector } from '../../componentes/CampoSelector.js';
import { mensajeDe } from '../../lib/api.js';
import { avisoDecimalAmbiguo, formatearTasa, normalizarDecimal } from '../../lib/formato.js';
import { registrarDivisa } from '../../modulos/divisas/api.js';
import { CLAVE_DIVISAS } from '../../modulos/divisas/consultas.js';
import type { OpcionesDivisa, OperacionDivisa } from '../../modulos/divisas/tipos.js';

/**
 * Monto en divisa y pesos que vale, solo como vista previa: el servidor vuelve a sumar los billetes
 * y a convertir con las mismas funciones compartidas, y es el que decide.
 */
export function previaDivisa(
  billetes: readonly { valor: string; cantidad: number }[],
  tasa: string | null,
): { divisa: string; pesos: string | null } {
  const divisa = totalDeDenominaciones(billetes.filter((b) => b.cantidad > 0));
  if (!tasa || divisa.lte(0)) return { divisa: divisa.toFixed(2), pesos: null };
  try {
    return { divisa: divisa.toFixed(2), pesos: pesosDesdeDivisa(divisa, tasa).toFixed(2) };
  } catch {
    return { divisa: divisa.toFixed(2), pesos: null };
  }
}

interface Propiedades {
  opciones: OpcionesDivisa;
  alRegistrar: (operacion: OperacionDivisa) => void;
  alCancelar: () => void;
}

/** Compra o venta de divisa en efectivo, contando los billetes (§5.7). */
export function FormularioDivisa({ opciones, alRegistrar, alCancelar }: Propiedades) {
  const consultas = useQueryClient();
  const clave = useRef(crypto.randomUUID());
  const [tipo, setTipo] = useState<'compra' | 'venta'>('compra');
  const [lineaId, setLineaId] = useState(opciones.lineas[0]?.id ?? '');
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [cliente, setCliente] = useState('');
  const [documento, setDocumento] = useState('');
  const [cambiarTasa, setCambiarTasa] = useState(false);
  const [tasaManual, setTasaManual] = useState('');
  const [motivoTasa, setMotivoTasa] = useState('');

  const linea = opciones.lineas.find((l) => l.id === lineaId);
  const tasaPublicada = linea ? (tipo === 'compra' ? linea.tasaCompra : linea.tasaVenta) : null;
  const ambiguo = cambiarTasa ? avisoDecimalAmbiguo(tasaManual) : null;
  const tasa =
    cambiarTasa && tasaManual.trim() !== '' ? normalizarDecimal(tasaManual) : tasaPublicada;
  const billetes = (linea?.denominaciones ?? []).map((d) => ({
    denominacionId: d.id,
    valor: d.valor,
    cantidad: Number.parseInt(cantidades[d.id] ?? '', 10) || 0,
  }));
  const previa = previaDivisa(billetes, tasa);
  const moneda = (linea?.moneda ?? 'USD') as Moneda;
  const local = (linea?.monedaLocal ?? 'COP') as Moneda;

  const registrar = useMutation({
    mutationFn: () => {
      if (!linea) throw new Error('Elige la línea.');
      return registrarDivisa({
        claveIdempotencia: clave.current,
        tipo,
        lineaNegocioId: linea.id,
        montoDivisa: previa.divisa,
        billetes: billetes
          .filter((b) => b.cantidad > 0)
          .map(({ denominacionId, cantidad }) => ({ denominacionId, cantidad })),
        ...(cambiarTasa
          ? { tasaManual: { tasa: normalizarDecimal(tasaManual), motivo: motivoTasa.trim() } }
          : {}),
        ...(cliente.trim() === '' ? {} : { clienteNombre: cliente.trim() }),
        ...(documento.trim() === '' ? {} : { clienteDocumento: documento.trim() }),
      });
    },
    onSuccess: async ({ operacion }) => {
      await consultas.invalidateQueries({ queryKey: CLAVE_DIVISAS });
      alRegistrar(operacion);
    },
  });

  if (!opciones.miTurno) {
    return (
      <>
        <Aviso tipo="advertencia">
          Abre tu turno de caja antes de comprar o vender divisas: el efectivo entra y sale de tu
          caja.
        </Aviso>
        <div className="acciones acciones--derecha">
          <Boton variante="secundario" onClick={alCancelar}>
            Cerrar
          </Boton>
        </div>
      </>
    );
  }
  if (opciones.lineas.length === 0) {
    return <Aviso tipo="advertencia">No hay líneas de divisas activas.</Aviso>;
  }
  const faltaCuenta = linea && !opciones.miTurno.monedas.includes(linea.moneda);

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    if (ambiguo) return;
    registrar.mutate();
  };

  return (
    <form className="formulario-ancho" onSubmit={enviar} noValidate>
      <CampoSelector
        etiqueta="Operación"
        value={tipo}
        onChange={(evento) => setTipo(evento.target.value as 'compra' | 'venta')}
        ayuda={
          tipo === 'compra'
            ? 'El cliente te entrega la divisa y le pagas en pesos.'
            : 'Le entregas la divisa al cliente y te paga en pesos.'
        }
      >
        <option value="compra">Compra (el cliente vende)</option>
        <option value="venta">Venta (el cliente compra)</option>
      </CampoSelector>

      {opciones.lineas.length > 1 && (
        <CampoSelector
          etiqueta="Línea"
          value={lineaId}
          onChange={(evento) => {
            setLineaId(evento.target.value);
            setCantidades({});
          }}
        >
          {opciones.lineas.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nombre}
            </option>
          ))}
        </CampoSelector>
      )}

      {faltaCuenta && (
        <Aviso tipo="advertencia">
          La caja de tu turno no tiene una cuenta de efectivo en {linea.moneda}. Pídele al
          administrador que la cree en Configuración.
        </Aviso>
      )}

      <fieldset className="seccion-formulario">
        <legend className="seccion-formulario__titulo">
          Billetes que {tipo === 'compra' ? 'recibes' : 'entregas'} ({moneda})
        </legend>
        <div className="seccion-formulario__campos">
          {(linea?.denominaciones ?? []).map((d) => (
            <Campo
              key={d.id}
              etiqueta={`Cantidad de ${formatearMoneda(d.valor, moneda)}`}
              inputMode="numeric"
              autoComplete="off"
              value={cantidades[d.id] ?? ''}
              onChange={(evento) =>
                setCantidades((actual) => ({
                  ...actual,
                  [d.id]: evento.target.value.replace(/\D/g, ''),
                }))
              }
            />
          ))}
        </div>
      </fieldset>

      <p className="campo__ayuda" role="status">
        Total: <strong className="mono">{formatearMoneda(previa.divisa, moneda)}</strong> · Tasa:{' '}
        <strong className="mono">{tasa ? formatearTasa(tasa) : 'sin tasa publicada'}</strong> ·{' '}
        {tipo === 'compra' ? 'Pagas' : 'Recibes'}:{' '}
        <strong className="mono">
          {previa.pesos ? formatearMoneda(previa.pesos, local) : '—'}
        </strong>
      </p>

      {opciones.puedeCambiarTasa && (
        <label className="campo__casilla">
          <input
            type="checkbox"
            checked={cambiarTasa}
            onChange={(evento) => setCambiarTasa(evento.target.checked)}
          />
          Usar otra tasa en esta operación
        </label>
      )}
      {cambiarTasa && (
        <>
          <Campo
            etiqueta="Tasa de esta operación"
            inputMode="decimal"
            autoComplete="off"
            value={tasaManual}
            onChange={(evento) => setTasaManual(evento.target.value)}
            error={ambiguo ?? undefined}
          />
          <Campo
            etiqueta="Motivo del cambio de tasa"
            autoComplete="off"
            maxLength={200}
            value={motivoTasa}
            onChange={(evento) => setMotivoTasa(evento.target.value)}
          />
        </>
      )}

      <Campo
        etiqueta="Cliente (opcional)"
        autoComplete="off"
        maxLength={100}
        value={cliente}
        onChange={(evento) => setCliente(evento.target.value)}
      />
      <Campo
        etiqueta="Documento del cliente (opcional)"
        autoComplete="off"
        maxLength={30}
        value={documento}
        onChange={(evento) => setDocumento(evento.target.value)}
      />

      {registrar.isError && <Aviso tipo="error">{mensajeDe(registrar.error)}</Aviso>}

      <div className="acciones acciones--derecha">
        <Boton variante="secundario" onClick={alCancelar} disabled={registrar.isPending}>
          Cancelar
        </Boton>
        <Boton
          type="submit"
          cargando={registrar.isPending}
          disabled={
            previa.pesos === null ||
            Boolean(faltaCuenta) ||
            ambiguo !== null ||
            (cambiarTasa && (tasaManual.trim() === '' || motivoTasa.trim().length < 3))
          }
        >
          {tipo === 'compra' ? 'Registrar compra' : 'Registrar venta'}
        </Boton>
      </div>
    </form>
  );
}
