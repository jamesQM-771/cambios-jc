import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../../componentes/Aviso.js';
import { Boton } from '../../../componentes/Boton.js';
import { Campo } from '../../../componentes/Campo.js';
import { erroresPorCampo, mensajeDe } from '../../../lib/api.js';
import { crearBanco, editarBanco } from '../../../modulos/bancos/api.js';
import { CLAVE_BANCOS } from '../../../modulos/bancos/consultas.js';
import type { Banco, CambiosBanco } from '../../../modulos/bancos/tipos.js';

interface PropiedadesFormulario {
  /** Con `banco` se edita; sin él se crea uno nuevo. */
  banco?: Banco;
  alGuardar: () => void;
  alCancelar: () => void;
}

export function FormularioBanco({ banco, alGuardar, alCancelar }: PropiedadesFormulario) {
  const cliente = useQueryClient();
  const [codigo, setCodigo] = useState(banco?.codigo ?? '');
  const [nombre, setNombre] = useState(banco?.nombre ?? '');

  const guardar = useMutation({
    mutationFn: async () => {
      if (!banco) return crearBanco({ codigo, nombre });
      const cambios: CambiosBanco = {};
      if (codigo.trim() !== banco.codigo) cambios.codigo = codigo;
      if (nombre.trim() !== banco.nombre) cambios.nombre = nombre;
      return editarBanco(banco.id, cambios);
    },
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: CLAVE_BANCOS });
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
        etiqueta="Código"
        autoComplete="off"
        inputMode="numeric"
        maxLength={4}
        ayuda="Los primeros 4 dígitos de una cuenta (ejemplo: 0102)."
        required
        value={codigo}
        onChange={(evento) => setCodigo(evento.target.value)}
        error={delServidor.codigo}
      />
      <Campo
        etiqueta="Nombre"
        autoComplete="off"
        required
        value={nombre}
        onChange={(evento) => setNombre(evento.target.value)}
        error={delServidor.nombre}
      />
      <div className="acciones acciones--derecha">
        <Boton variante="secundario" onClick={alCancelar} disabled={guardar.isPending}>
          Cancelar
        </Boton>
        <Boton
          type="submit"
          cargando={guardar.isPending}
          disabled={codigo.trim().length !== 4 || nombre.trim().length < 2}
        >
          {banco ? 'Guardar cambios' : 'Crear banco'}
        </Boton>
      </div>
    </form>
  );
}
