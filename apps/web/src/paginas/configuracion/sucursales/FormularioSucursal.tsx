import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../../componentes/Aviso.js';
import { Boton } from '../../../componentes/Boton.js';
import { Campo } from '../../../componentes/Campo.js';
import { erroresPorCampo, mensajeDe } from '../../../lib/api.js';
import { crearSucursal, editarSucursal } from '../../../modulos/sucursales/api.js';
import { CLAVE_SUCURSALES } from '../../../modulos/sucursales/consultas.js';
import type { CambiosSucursal, Sucursal } from '../../../modulos/sucursales/tipos.js';

interface PropiedadesFormulario {
  /** Con `sucursal` se edita; sin ella se crea una nueva. */
  sucursal?: Sucursal;
  alGuardar: () => void;
  alCancelar: () => void;
}

export function FormularioSucursal({ sucursal, alGuardar, alCancelar }: PropiedadesFormulario) {
  const cliente = useQueryClient();
  const [nombre, setNombre] = useState(sucursal?.nombre ?? '');
  const [ciudad, setCiudad] = useState(sucursal?.ciudad ?? '');

  const guardar = useMutation({
    mutationFn: async () => {
      if (!sucursal) return crearSucursal({ nombre, ciudad });
      const cambios: CambiosSucursal = {};
      if (nombre.trim() !== sucursal.nombre) cambios.nombre = nombre;
      if (ciudad.trim() !== sucursal.ciudad) cambios.ciudad = ciudad;
      return editarSucursal(sucursal.id, cambios);
    },
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: CLAVE_SUCURSALES });
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
      <Campo
        etiqueta="Ciudad"
        autoComplete="off"
        required
        value={ciudad}
        onChange={(evento) => setCiudad(evento.target.value)}
        error={delServidor.ciudad}
      />
      <div className="acciones acciones--derecha">
        <Boton variante="secundario" onClick={alCancelar} disabled={guardar.isPending}>
          Cancelar
        </Boton>
        <Boton
          type="submit"
          cargando={guardar.isPending}
          disabled={nombre.trim().length < 2 || ciudad.trim().length < 2}
        >
          {sucursal ? 'Guardar cambios' : 'Crear sucursal'}
        </Boton>
      </div>
    </form>
  );
}
