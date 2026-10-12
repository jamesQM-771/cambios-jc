import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../../componentes/Aviso.js';
import { Boton } from '../../../componentes/Boton.js';
import { Campo } from '../../../componentes/Campo.js';
import { CampoSelector } from '../../../componentes/CampoSelector.js';
import { erroresPorCampo, mensajeDe } from '../../../lib/api.js';
import { formatearTasa, normalizarDecimal } from '../../../lib/formato.js';
import { configurarTasaLinea } from '../../../modulos/lineas-negocio/api.js';
import { CLAVE_LINEAS_NEGOCIO } from '../../../modulos/lineas-negocio/consultas.js';
import type { LineaNegocio, ModoTasa } from '../../../modulos/lineas-negocio/tipos.js';

interface PropiedadesFormulario {
  linea: LineaNegocio;
  alGuardar: () => void;
  alCancelar: () => void;
}

/** Margen guardado ("11.000000") como se escribe en el campo ("11"). */
const paraEditar = (margen: string | null): string =>
  margen === null ? '' : formatearTasa(margen, 0);

/**
 * Cómo se publica la tasa de una línea (D64, D68): directo (se escriben compra y venta) o
 * porcentaje (se escribe la del proveedor y el sistema suma el margen). Es una acción aparte de
 * publicar la tasa del día y pide su propio permiso (`margen.configurar`).
 */
export function FormularioConfiguracionTasa({
  linea,
  alGuardar,
  alCancelar,
}: PropiedadesFormulario) {
  const cliente = useQueryClient();
  const [modoTasa, setModoTasa] = useState<ModoTasa>(linea.modoTasa);
  const [margenVenta, setMargenVenta] = useState(paraEditar(linea.margenVenta));
  const [margenCompra, setMargenCompra] = useState(paraEditar(linea.margenCompra));

  const guardar = useMutation({
    mutationFn: () =>
      modoTasa === 'directo'
        ? configurarTasaLinea(linea.id, { modoTasa: 'directo' })
        : configurarTasaLinea(linea.id, {
            modoTasa: 'porcentaje',
            margenVenta: normalizarDecimal(margenVenta),
            ...(margenCompra.trim() === ''
              ? {}
              : { margenCompra: normalizarDecimal(margenCompra) }),
          }),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: CLAVE_LINEAS_NEGOCIO });
      alGuardar();
    },
  });
  const delServidor = erroresPorCampo(guardar.error);

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    guardar.mutate();
  };

  const pierdeMargen = modoTasa === 'directo' && linea.modoTasa === 'porcentaje';

  return (
    <form onSubmit={enviar} noValidate>
      {guardar.isError && <Aviso tipo="error">{mensajeDe(guardar.error)}</Aviso>}
      <CampoSelector
        etiqueta="Cómo se publica la tasa"
        value={modoTasa}
        onChange={(evento) => {
          setModoTasa(evento.target.value as ModoTasa);
        }}
      >
        <option value="directo">Directo: se escriben la compra y la venta</option>
        <option value="porcentaje">Porcentaje: tasa del proveedor más un margen</option>
      </CampoSelector>
      {modoTasa === 'porcentaje' ? (
        <>
          <Campo
            etiqueta="Margen de venta (%)"
            inputMode="decimal"
            autoComplete="off"
            required
            ayuda="Lo que se suma a la tasa del proveedor. Ejemplo: 11 convierte 4,68 en 5,19."
            value={margenVenta}
            onChange={(evento) => {
              setMargenVenta(evento.target.value);
            }}
            error={delServidor.margenVenta}
          />
          <Campo
            etiqueta="Margen de compra (%)"
            inputMode="decimal"
            autoComplete="off"
            ayuda="Opcional. Solo si la línea también compra."
            value={margenCompra}
            onChange={(evento) => {
              setMargenCompra(evento.target.value);
            }}
            error={delServidor.margenCompra}
          />
          <Aviso tipo="info">
            El cambio vale para las tasas que se publiquen de ahora en adelante. Las ya publicadas
            conservan el margen con el que se calcularon.
          </Aviso>
        </>
      ) : (
        pierdeMargen && (
          <Aviso tipo="advertencia">
            Al pasar a modo directo se quita el margen guardado de esta línea. Las tasas ya
            publicadas no cambian.
          </Aviso>
        )
      )}
      <div className="acciones acciones--derecha">
        <Boton variante="secundario" onClick={alCancelar}>
          Cancelar
        </Boton>
        <Boton
          type="submit"
          cargando={guardar.isPending}
          disabled={modoTasa === 'porcentaje' && margenVenta.trim() === ''}
        >
          Guardar
        </Boton>
      </div>
    </form>
  );
}
