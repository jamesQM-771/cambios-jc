import type { Moneda } from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../../componentes/Aviso.js';
import { Boton } from '../../../componentes/Boton.js';
import { Campo } from '../../../componentes/Campo.js';
import { CampoSelector } from '../../../componentes/CampoSelector.js';
import { erroresPorCampo, mensajeDe } from '../../../lib/api.js';
import { ETIQUETAS_MONEDA, MONEDAS_SOPORTADAS } from '../../../lib/formato.js';
import { crearLineaNegocio, editarLineaNegocio } from '../../../modulos/lineas-negocio/api.js';
import { CLAVE_LINEAS_NEGOCIO } from '../../../modulos/lineas-negocio/consultas.js';
import type { ClaseLinea, LineaNegocio } from '../../../modulos/lineas-negocio/tipos.js';

const ETIQUETAS_CLASE: Record<ClaseLinea, string> = {
  remesa: 'Remesa (envío a otro país)',
  divisa_caja: 'Divisa en caja (compra/venta en efectivo)',
};

interface PropiedadesFormulario {
  /** Con `linea` se edita (solo el nombre); sin ella se crea una nueva. */
  linea?: LineaNegocio;
  alGuardar: () => void;
  alCancelar: () => void;
}

export function FormularioLineaNegocio({ linea, alGuardar, alCancelar }: PropiedadesFormulario) {
  const cliente = useQueryClient();
  const [nombre, setNombre] = useState(linea?.nombre ?? '');
  const [clase, setClase] = useState<ClaseLinea>(linea?.clase ?? 'remesa');
  const [monedaOrigen, setMonedaOrigen] = useState<Moneda>('COP');
  const [monedaDestino, setMonedaDestino] = useState<Moneda>('VES');

  const guardar = useMutation({
    mutationFn: () =>
      linea
        ? editarLineaNegocio(linea.id, { nombre })
        : crearLineaNegocio({ nombre, clase, monedaOrigen, monedaDestino }),
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

  return (
    <form onSubmit={enviar} noValidate>
      {guardar.isError && <Aviso tipo="error">{mensajeDe(guardar.error)}</Aviso>}
      <Campo
        etiqueta="Nombre"
        autoComplete="off"
        required
        value={nombre}
        onChange={(evento) => setNombre(evento.target.value)}
        error={delServidor.nombre}
      />
      {!linea && (
        <>
          <CampoSelector
            etiqueta="Clase"
            value={clase}
            onChange={(evento) => setClase(evento.target.value as ClaseLinea)}
            error={delServidor.clase}
          >
            {(Object.keys(ETIQUETAS_CLASE) as ClaseLinea[]).map((opcion) => (
              <option key={opcion} value={opcion}>
                {ETIQUETAS_CLASE[opcion]}
              </option>
            ))}
          </CampoSelector>
          <CampoSelector
            etiqueta="Moneda origen"
            value={monedaOrigen}
            onChange={(evento) => setMonedaOrigen(evento.target.value as Moneda)}
            error={delServidor.monedaOrigen}
          >
            {MONEDAS_SOPORTADAS.map((opcion) => (
              <option key={opcion} value={opcion}>
                {ETIQUETAS_MONEDA[opcion]}
              </option>
            ))}
          </CampoSelector>
          <CampoSelector
            etiqueta="Moneda destino"
            value={monedaDestino}
            onChange={(evento) => setMonedaDestino(evento.target.value as Moneda)}
            error={delServidor.monedaDestino}
          >
            {MONEDAS_SOPORTADAS.map((opcion) => (
              <option key={opcion} value={opcion}>
                {ETIQUETAS_MONEDA[opcion]}
              </option>
            ))}
          </CampoSelector>
          <p className="campo__ayuda">
            La clase y las monedas no se pueden cambiar después: si hace falta otra combinación, se
            crea una línea nueva y se desactiva esta.
          </p>
        </>
      )}
      <div className="acciones acciones--derecha">
        <Boton variante="secundario" onClick={alCancelar} disabled={guardar.isPending}>
          Cancelar
        </Boton>
        <Boton type="submit" cargando={guardar.isPending} disabled={nombre.trim().length < 2}>
          {linea ? 'Guardar cambios' : 'Crear línea'}
        </Boton>
      </div>
    </form>
  );
}
