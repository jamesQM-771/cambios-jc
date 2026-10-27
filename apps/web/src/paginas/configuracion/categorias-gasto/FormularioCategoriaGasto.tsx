import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../../componentes/Aviso.js';
import { Boton } from '../../../componentes/Boton.js';
import { Campo } from '../../../componentes/Campo.js';
import { erroresPorCampo, mensajeDe } from '../../../lib/api.js';
import {
  crearCategoriaGasto,
  editarCategoriaGasto,
} from '../../../modulos/categorias-gasto/api.js';
import { CLAVE_CATEGORIAS_GASTO } from '../../../modulos/categorias-gasto/consultas.js';
import type { CategoriaGasto } from '../../../modulos/categorias-gasto/tipos.js';

interface PropiedadesFormulario {
  /** Con `categoria` se edita; sin ella se crea una nueva. */
  categoria?: CategoriaGasto;
  alGuardar: () => void;
  alCancelar: () => void;
}

export function FormularioCategoriaGasto({
  categoria,
  alGuardar,
  alCancelar,
}: PropiedadesFormulario) {
  const cliente = useQueryClient();
  const [nombre, setNombre] = useState(categoria?.nombre ?? '');

  const guardar = useMutation({
    mutationFn: () =>
      categoria
        ? editarCategoriaGasto(categoria.id, nombre.trim())
        : crearCategoriaGasto(nombre.trim()),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: CLAVE_CATEGORIAS_GASTO });
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
      {guardar.isError && !delServidor.nombre && (
        <Aviso tipo="error">{mensajeDe(guardar.error)}</Aviso>
      )}
      <Campo
        etiqueta="Nombre"
        autoComplete="off"
        maxLength={60}
        ayuda="Por ejemplo: Transporte, Papelería, Servicios."
        required
        value={nombre}
        onChange={(evento) => setNombre(evento.target.value)}
        error={delServidor.nombre}
      />
      <div className="acciones acciones--derecha">
        <Boton variante="secundario" onClick={alCancelar} disabled={guardar.isPending}>
          Cancelar
        </Boton>
        <Boton type="submit" cargando={guardar.isPending} disabled={nombre.trim().length < 2}>
          {categoria ? 'Guardar cambios' : 'Crear categoría'}
        </Boton>
      </div>
    </form>
  );
}
