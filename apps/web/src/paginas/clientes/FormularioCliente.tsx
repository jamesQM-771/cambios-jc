import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { CampoTelefono } from '../../componentes/CamposEspeciales.js';
import { CampoSelector } from '../../componentes/CampoSelector.js';
import { erroresPorCampo, mensajeDe } from '../../lib/api.js';
import { PREFIJO_POR_DEFECTO, separarTelefono } from '../../lib/telefono.js';
import { crearCliente, editarCliente } from '../../modulos/clientes/api.js';
import { CLAVE_CLIENTES } from '../../modulos/clientes/consultas.js';
import {
  TIPOS_DOCUMENTO,
  type Cliente,
  type ClienteConMedios,
  type TipoDocumento,
} from '../../modulos/clientes/tipos.js';

interface PropiedadesFormularioCliente {
  /** Con `cliente` se editan nombre y teléfono; el documento no cambia (D97). */
  cliente?: Cliente;
  alGuardar: (cliente: ClienteConMedios) => void;
  alCancelar: () => void;
}

export function FormularioCliente({
  cliente,
  alGuardar,
  alCancelar,
}: PropiedadesFormularioCliente) {
  const consultas = useQueryClient();
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>(cliente?.tipoDocumento ?? 'V');
  const [numeroDocumento, setNumeroDocumento] = useState(cliente?.numeroDocumento ?? '');
  const [nombre, setNombre] = useState(cliente?.nombre ?? '');
  const [telefono, setTelefono] = useState(cliente?.telefono ?? '');
  const [prefijo, setPrefijo] = useState(
    separarTelefono(cliente?.telefono).prefijo || PREFIJO_POR_DEFECTO,
  );

  const guardar = useMutation({
    mutationFn: async () => {
      const tel = telefono.trim();
      if (cliente) {
        return editarCliente(cliente.id, {
          ...(nombre.trim() !== cliente.nombre ? { nombre: nombre.trim() } : {}),
          ...(tel !== (cliente.telefono ?? '') ? { telefono: tel === '' ? null : tel } : {}),
        });
      }
      return crearCliente({
        tipoDocumento,
        numeroDocumento: numeroDocumento.trim(),
        nombre: nombre.trim(),
        ...(tel === '' ? {} : { telefono: tel }),
      });
    },
    onSuccess: async ({ cliente: guardado }) => {
      await consultas.invalidateQueries({ queryKey: CLAVE_CLIENTES });
      alGuardar(guardado);
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
      {!cliente && (
        <div className="campos-en-fila">
          <CampoSelector
            etiqueta="Tipo de documento"
            value={tipoDocumento}
            onChange={(evento) => setTipoDocumento(evento.target.value as TipoDocumento)}
          >
            {TIPOS_DOCUMENTO.map((tipo) => (
              <option key={tipo} value={tipo}>
                {tipo}
              </option>
            ))}
          </CampoSelector>
          <Campo
            etiqueta="Número de documento"
            autoComplete="off"
            required
            value={numeroDocumento}
            onChange={(evento) => setNumeroDocumento(evento.target.value)}
            error={delServidor.numeroDocumento}
            ayuda="Sin puntos ni guiones."
          />
        </div>
      )}
      <Campo
        etiqueta="Nombre completo"
        autoComplete="off"
        required
        value={nombre}
        onChange={(evento) => setNombre(evento.target.value)}
        error={delServidor.nombre}
      />
      <CampoTelefono
        etiqueta="Teléfono (opcional)"
        valor={telefono}
        alCambiar={setTelefono}
        prefijo={prefijo}
        alCambiarPrefijo={setPrefijo}
        error={delServidor.telefono}
      />
      <div className="acciones acciones--derecha">
        <Boton variante="secundario" onClick={alCancelar} disabled={guardar.isPending}>
          Cancelar
        </Boton>
        <Boton
          type="submit"
          cargando={guardar.isPending}
          disabled={nombre.trim().length < 2 || (!cliente && numeroDocumento.trim().length < 4)}
        >
          {cliente ? 'Guardar cambios' : 'Registrar cliente'}
        </Boton>
      </div>
    </form>
  );
}
