import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../../componentes/Aviso.js';
import { Boton } from '../../../componentes/Boton.js';
import { Campo } from '../../../componentes/Campo.js';
import { CampoSelector } from '../../../componentes/CampoSelector.js';
import { erroresPorCampo, mensajeDe } from '../../../lib/api.js';
import { crearCaja, editarCaja } from '../../../modulos/cajas/api.js';
import { CLAVE_CAJAS } from '../../../modulos/cajas/consultas.js';
import type { CambiosCaja, Caja } from '../../../modulos/cajas/tipos.js';
import { useSucursales } from '../../../modulos/usuarios/consultas.js';

interface PropiedadesFormulario {
  /** Con `caja` se edita; sin ella se crea una nueva. */
  caja?: Caja;
  alGuardar: () => void;
  alCancelar: () => void;
}

export function FormularioCaja({ caja, alGuardar, alCancelar }: PropiedadesFormulario) {
  const cliente = useQueryClient();
  const sucursales = useSucursales();
  const [nombre, setNombre] = useState(caja?.nombre ?? '');
  const [sucursalId, setSucursalId] = useState(caja?.sucursalId ?? '');

  const guardar = useMutation({
    mutationFn: async () => {
      if (!caja) return crearCaja({ nombre, sucursalId });
      const cambios: CambiosCaja = {};
      if (nombre.trim() !== caja.nombre) cambios.nombre = nombre;
      return editarCaja(caja.id, cambios);
    },
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: CLAVE_CAJAS });
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
      {!caja && (
        <CampoSelector
          etiqueta="Sucursal"
          required
          value={sucursalId}
          onChange={(evento) => setSucursalId(evento.target.value)}
          disabled={sucursales.isPending}
          error={delServidor.sucursalId}
          ayuda={sucursales.isError ? 'No se pudieron cargar las sucursales.' : undefined}
        >
          <option value="">Elige una sucursal…</option>
          {sucursales.data?.map((sucursal) => (
            <option key={sucursal.id} value={sucursal.id}>
              {sucursal.nombre} · {sucursal.ciudad}
            </option>
          ))}
        </CampoSelector>
      )}
      <div className="acciones acciones--derecha">
        <Boton variante="secundario" onClick={alCancelar} disabled={guardar.isPending}>
          Cancelar
        </Boton>
        <Boton
          type="submit"
          cargando={guardar.isPending}
          disabled={nombre.trim().length < 2 || (!caja && sucursalId === '')}
        >
          {caja ? 'Guardar cambios' : 'Crear caja'}
        </Boton>
      </div>
    </form>
  );
}
