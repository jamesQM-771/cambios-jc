import { TIPOS_CONTRAPARTE, type TipoContraparte } from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { CampoAreaTexto } from '../../componentes/CampoAreaTexto.js';
import { CampoSelector } from '../../componentes/CampoSelector.js';
import { erroresPorCampo, mensajeDe } from '../../lib/api.js';
import { crearContraparte, editarContraparte } from '../../modulos/contrapartes/api.js';
import { CLAVE_CONTRAPARTES } from '../../modulos/contrapartes/consultas.js';
import { ETIQUETAS_TIPO_CONTRAPARTE, type Contraparte } from '../../modulos/contrapartes/tipos.js';

interface Propiedades {
  /** Si viene, se edita; si no, se crea. */
  contraparte?: Contraparte;
  alGuardar: (contraparte: Contraparte) => void;
  alCancelar: () => void;
}

/** Datos de una persona o negocio con quien se lleva una cuenta corriente (§5.8). */
export function FormularioContraparte({ contraparte, alGuardar, alCancelar }: Propiedades) {
  const consultas = useQueryClient();
  const [nombre, setNombre] = useState(contraparte?.nombre ?? '');
  const [tipo, setTipo] = useState<TipoContraparte>(contraparte?.tipo ?? 'proveedor');
  const [documento, setDocumento] = useState(contraparte?.documento ?? '');
  const [telefono, setTelefono] = useState(contraparte?.telefono ?? '');
  const [notas, setNotas] = useState(contraparte?.notas ?? '');

  const guardar = useMutation({
    mutationFn: () => {
      const datos = {
        nombre: nombre.trim(),
        tipo,
        documento: documento.trim() || null,
        telefono: telefono.trim() || null,
        notas: notas.trim() || null,
      };
      return contraparte ? editarContraparte(contraparte.id, datos) : crearContraparte(datos);
    },
    onSuccess: async (respuesta) => {
      await consultas.invalidateQueries({ queryKey: CLAVE_CONTRAPARTES });
      alGuardar(respuesta.contraparte);
    },
  });
  const delServidor = erroresPorCampo(guardar.error);

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    guardar.mutate();
  };

  return (
    <form className="formulario-ancho" onSubmit={enviar} noValidate>
      <Campo
        etiqueta="Nombre"
        autoComplete="off"
        maxLength={80}
        value={nombre}
        onChange={(evento) => setNombre(evento.target.value)}
        error={delServidor.nombre}
      />
      <CampoSelector
        etiqueta="Tipo"
        value={tipo}
        onChange={(evento) => setTipo(evento.target.value as TipoContraparte)}
      >
        {TIPOS_CONTRAPARTE.map((valor) => (
          <option key={valor} value={valor}>
            {ETIQUETAS_TIPO_CONTRAPARTE[valor]}
          </option>
        ))}
      </CampoSelector>
      <Campo
        etiqueta="Documento (opcional)"
        autoComplete="off"
        maxLength={30}
        value={documento}
        onChange={(evento) => setDocumento(evento.target.value)}
      />
      <Campo
        etiqueta="Teléfono (opcional)"
        autoComplete="off"
        maxLength={30}
        value={telefono}
        onChange={(evento) => setTelefono(evento.target.value)}
      />
      <CampoAreaTexto
        etiqueta="Notas (opcional)"
        rows={2}
        maxLength={500}
        value={notas}
        onChange={(evento) => setNotas(evento.target.value)}
      />
      {guardar.isError && !delServidor.nombre && (
        <Aviso tipo="error">{mensajeDe(guardar.error)}</Aviso>
      )}
      <div className="acciones acciones--derecha">
        <Boton variante="secundario" onClick={alCancelar} disabled={guardar.isPending}>
          Cancelar
        </Boton>
        <Boton type="submit" cargando={guardar.isPending} disabled={nombre.trim().length < 2}>
          {contraparte ? 'Guardar cambios' : 'Crear contraparte'}
        </Boton>
      </div>
    </form>
  );
}
