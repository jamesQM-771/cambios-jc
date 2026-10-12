import { tasaDesdeMargenPorcentaje } from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../../componentes/Aviso.js';
import { Boton } from '../../../componentes/Boton.js';
import { Campo } from '../../../componentes/Campo.js';
import { erroresPorCampo, mensajeDe } from '../../../lib/api.js';
import { avisoDecimalAmbiguo, formatearTasa, normalizarDecimal } from '../../../lib/formato.js';
import type { LineaNegocio } from '../../../modulos/lineas-negocio/tipos.js';
import { publicarTasa } from '../../../modulos/tasas/api.js';
import { CLAVE_TASAS } from '../../../modulos/tasas/consultas.js';

interface PropiedadesFormulario {
  linea: LineaNegocio;
  alPublicar: () => void;
}

/** Vista previa de la venta calculada en modo "porcentaje" (D64). Solo informativa: el servidor
 * recalcula y es la fuente de verdad. */
function ventaCalculada(referencia: string, margenVenta: string | null): string | null {
  if (referencia.trim() === '' || margenVenta === null) return null;
  try {
    return tasaDesdeMargenPorcentaje(normalizarDecimal(referencia), margenVenta).toFixed(2);
  } catch {
    return null;
  }
}

export function FormularioPublicarTasa({ linea, alPublicar }: PropiedadesFormulario) {
  const cliente = useQueryClient();
  const [tasaReferencia, setTasaReferencia] = useState('');
  const [tasaCompra, setTasaCompra] = useState('');
  const [tasaVenta, setTasaVenta] = useState('');
  const [motivo, setMotivo] = useState('');

  const publicar = useMutation({
    mutationFn: () =>
      linea.modoTasa === 'porcentaje'
        ? publicarTasa({
            modoTasa: 'porcentaje',
            lineaNegocioId: linea.id,
            tasaReferencia: normalizarDecimal(tasaReferencia),
            ...(motivo.trim() === '' ? {} : { motivo }),
          })
        : publicarTasa({
            modoTasa: 'directo',
            lineaNegocioId: linea.id,
            tasaVenta: normalizarDecimal(tasaVenta),
            ...(tasaCompra.trim() === '' ? {} : { tasaCompra: normalizarDecimal(tasaCompra) }),
            ...(motivo.trim() === '' ? {} : { motivo }),
          }),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: CLAVE_TASAS });
      setTasaReferencia('');
      setTasaCompra('');
      setTasaVenta('');
      setMotivo('');
      alPublicar();
    },
  });

  const delServidor = erroresPorCampo(publicar.error);

  // Un valor como "3.200" no se envía: no se sabe si es 3200 o 3,2 (ver `avisoDecimalAmbiguo`).
  const ambiguos = {
    tasaReferencia: avisoDecimalAmbiguo(tasaReferencia),
    tasaCompra: avisoDecimalAmbiguo(tasaCompra),
    tasaVenta: avisoDecimalAmbiguo(tasaVenta),
  };
  const hayAmbiguo =
    linea.modoTasa === 'porcentaje'
      ? ambiguos.tasaReferencia !== null
      : ambiguos.tasaCompra !== null || ambiguos.tasaVenta !== null;

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    if (!hayAmbiguo) publicar.mutate();
  };

  const modoPorcentaje = linea.modoTasa === 'porcentaje';
  const sinMargen = modoPorcentaje && linea.margenVenta === null;
  const previa =
    modoPorcentaje && ambiguos.tasaReferencia === null
      ? ventaCalculada(tasaReferencia, linea.margenVenta)
      : null;

  return (
    <form onSubmit={enviar} noValidate className="formulario-tasa">
      {publicar.isError && <Aviso tipo="error">{mensajeDe(publicar.error)}</Aviso>}
      {sinMargen && (
        <Aviso tipo="advertencia">
          Esta línea no tiene margen de venta configurado. Ve a Líneas de negocio para configurarlo
          antes de publicar.
        </Aviso>
      )}
      {modoPorcentaje ? (
        <>
          <Campo
            etiqueta="Tasa del proveedor"
            autoComplete="off"
            inputMode="decimal"
            ayuda={`El sistema suma el margen configurado: ${linea.margenVenta === null ? '—' : formatearTasa(linea.margenVenta, 0)} %.`}
            required
            disabled={sinMargen}
            value={tasaReferencia}
            onChange={(evento) => setTasaReferencia(evento.target.value)}
            error={ambiguos.tasaReferencia ?? delServidor.tasaReferencia}
          />
          {previa && (
            <p className="formulario-tasa__previa" role="status">
              Tasa de venta calculada <strong>{formatearTasa(previa)}</strong>
            </p>
          )}
        </>
      ) : (
        <>
          <Campo
            etiqueta="Tasa de compra"
            autoComplete="off"
            inputMode="decimal"
            ayuda="Opcional. Puedes escribirla con coma o con punto."
            value={tasaCompra}
            onChange={(evento) => setTasaCompra(evento.target.value)}
            error={ambiguos.tasaCompra ?? delServidor.tasaCompra}
          />
          <Campo
            etiqueta="Tasa de venta"
            autoComplete="off"
            inputMode="decimal"
            required
            value={tasaVenta}
            onChange={(evento) => setTasaVenta(evento.target.value)}
            error={ambiguos.tasaVenta ?? delServidor.tasaVenta}
          />
        </>
      )}
      <Campo
        etiqueta="Motivo"
        autoComplete="off"
        ayuda="Opcional: por ejemplo, un cambio manual del día."
        value={motivo}
        onChange={(evento) => setMotivo(evento.target.value)}
        error={delServidor.motivo}
      />
      <div className="acciones acciones--derecha">
        <Boton
          type="submit"
          cargando={publicar.isPending}
          disabled={
            sinMargen ||
            hayAmbiguo ||
            (modoPorcentaje ? tasaReferencia.trim() === '' : tasaVenta.trim() === '')
          }
        >
          Publicar tasa
        </Boton>
      </div>
    </form>
  );
}
