import type { Moneda } from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../../componentes/Aviso.js';
import { Boton } from '../../../componentes/Boton.js';
import { Campo } from '../../../componentes/Campo.js';
import { CampoSelector } from '../../../componentes/CampoSelector.js';
import { erroresPorCampo, mensajeDe } from '../../../lib/api.js';
import { ETIQUETAS_MONEDA, MONEDAS_SOPORTADAS } from '../../../lib/formato.js';
import { crearDenominacion, editarDenominacion } from '../../../modulos/denominaciones/api.js';
import { CLAVE_DENOMINACIONES } from '../../../modulos/denominaciones/consultas.js';
import type { Denominacion } from '../../../modulos/denominaciones/tipos.js';

interface PropiedadesFormulario {
  /** Con `denominacion` se edita (solo el valor); sin ella se crea una nueva. */
  denominacion?: Denominacion;
  alGuardar: () => void;
  alCancelar: () => void;
}

export function FormularioDenominacion({
  denominacion,
  alGuardar,
  alCancelar,
}: PropiedadesFormulario) {
  const cliente = useQueryClient();
  const [moneda, setMoneda] = useState<Moneda>(denominacion?.moneda ?? 'COP');
  const [valor, setValor] = useState(denominacion?.valor ?? '');

  const guardar = useMutation({
    mutationFn: () =>
      denominacion
        ? editarDenominacion(denominacion.id, { valor })
        : crearDenominacion({ moneda, valor }),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: CLAVE_DENOMINACIONES });
      alGuardar();
    },
  });

  const delServidor = erroresPorCampo(guardar.error);

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    guardar.mutate();
  };

  return (
    <form onSubmit={enviar} noValidate>
      {guardar.isError && <Aviso tipo="error">{mensajeDe(guardar.error)}</Aviso>}
      {!denominacion && (
        <CampoSelector
          etiqueta="Moneda"
          value={moneda}
          onChange={(evento) => setMoneda(evento.target.value as Moneda)}
          error={delServidor.moneda}
        >
          {MONEDAS_SOPORTADAS.map((opcion) => (
            <option key={opcion} value={opcion}>
              {ETIQUETAS_MONEDA[opcion]}
            </option>
          ))}
        </CampoSelector>
      )}
      <Campo
        etiqueta="Valor"
        autoComplete="off"
        inputMode="decimal"
        ayuda="Sin separador de miles (ejemplo: 50000)."
        required
        value={valor}
        onChange={(evento) => setValor(evento.target.value)}
        error={delServidor.valor}
      />
      <div className="acciones acciones--derecha">
        <Boton variante="secundario" onClick={alCancelar} disabled={guardar.isPending}>
          Cancelar
        </Boton>
        <Boton type="submit" cargando={guardar.isPending} disabled={valor.trim() === ''}>
          {denominacion ? 'Guardar cambios' : 'Crear denominación'}
        </Boton>
      </div>
    </form>
  );
}
