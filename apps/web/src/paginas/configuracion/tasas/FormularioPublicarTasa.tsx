import { tasaDesdeMargenPorcentaje } from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../../componentes/Aviso.js';
import { Boton } from '../../../componentes/Boton.js';
import { Campo } from '../../../componentes/Campo.js';
import { erroresPorCampo, mensajeDe } from '../../../lib/api.js';
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
    return tasaDesdeMargenPorcentaje(referencia, margenVenta).toFixed(2);
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
            tasaReferencia,
            ...(motivo.trim() === '' ? {} : { motivo }),
          })
        : publicarTasa({
            modoTasa: 'directo',
            lineaNegocioId: linea.id,
            tasaVenta,
            ...(tasaCompra.trim() === '' ? {} : { tasaCompra }),
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

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    publicar.mutate();
  };

  const modoPorcentaje = linea.modoTasa === 'porcentaje';
  const sinMargen = modoPorcentaje && linea.margenVenta === null;
  const previa = modoPorcentaje ? ventaCalculada(tasaReferencia, linea.margenVenta) : null;

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
            ayuda={`Margen configurado: ${linea.margenVenta ?? '—'}%.`}
            required
            disabled={sinMargen}
            value={tasaReferencia}
            onChange={(evento) => setTasaReferencia(evento.target.value)}
            error={delServidor.tasaReferencia}
          />
          {previa && (
            <p className="formulario-tasa__previa">
              Tasa de venta calculada: <strong>{previa}</strong>
            </p>
          )}
        </>
      ) : (
        <>
          <Campo
            etiqueta="Tasa de compra"
            autoComplete="off"
            inputMode="decimal"
            ayuda="Opcional."
            value={tasaCompra}
            onChange={(evento) => setTasaCompra(evento.target.value)}
            error={delServidor.tasaCompra}
          />
          <Campo
            etiqueta="Tasa de venta"
            autoComplete="off"
            inputMode="decimal"
            required
            value={tasaVenta}
            onChange={(evento) => setTasaVenta(evento.target.value)}
            error={delServidor.tasaVenta}
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
            sinMargen || (modoPorcentaje ? tasaReferencia.trim() === '' : tasaVenta.trim() === '')
          }
        >
          Publicar tasa
        </Boton>
      </div>
    </form>
  );
}
