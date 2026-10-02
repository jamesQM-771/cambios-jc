import { ROLES, type Rol } from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { CampoSelector } from '../../componentes/CampoSelector.js';
import { erroresPorCampo, mensajeDe } from '../../lib/api.js';
import { ETIQUETAS_ROL } from '../../lib/formato.js';
import { crearUsuario, editarUsuario } from '../../modulos/usuarios/api.js';
import { CLAVE_USUARIOS, useSucursales } from '../../modulos/usuarios/consultas.js';
import type {
  CambiosUsuario,
  UsuarioConContrasenaTemporal,
  UsuarioLista,
} from '../../modulos/usuarios/tipos.js';

type ResultadoGuardado =
  | { tipo: 'creado'; datos: UsuarioConContrasenaTemporal }
  | { tipo: 'editado'; usuario: UsuarioLista }
  | { tipo: 'sinCambios' };

interface PropiedadesFormulario {
  /** Con `usuario` se edita; sin él se crea uno nuevo. */
  usuario?: UsuarioLista;
  alCreado: (resultado: UsuarioConContrasenaTemporal) => void;
  alEditado: (usuario: UsuarioLista) => void;
  alCancelar: () => void;
}

export function FormularioUsuario({
  usuario,
  alCreado,
  alEditado,
  alCancelar,
}: PropiedadesFormulario) {
  const cliente = useQueryClient();
  const sucursales = useSucursales();
  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [login, setLogin] = useState('');
  const [rol, setRol] = useState<Rol>(usuario?.rol ?? 'vendedor');
  const [sucursalId, setSucursalId] = useState(usuario?.sucursalId ?? '');
  const [sinCambios, setSinCambios] = useState(false);

  const guardar = useMutation({
    mutationFn: async (): Promise<ResultadoGuardado> => {
      const sucursal = sucursalId === '' ? null : sucursalId;
      if (!usuario) {
        return {
          tipo: 'creado',
          datos: await crearUsuario({ nombre, login, rol, sucursalId: sucursal }),
        };
      }
      const cambios: CambiosUsuario = {};
      if (nombre.trim() !== usuario.nombre) cambios.nombre = nombre;
      if (rol !== usuario.rol) cambios.rol = rol;
      if (sucursal !== usuario.sucursalId) cambios.sucursalId = sucursal;
      if (Object.keys(cambios).length === 0) return { tipo: 'sinCambios' };
      return { tipo: 'editado', usuario: (await editarUsuario(usuario.id, cambios)).usuario };
    },
    onSuccess: async (resultado) => {
      if (resultado.tipo === 'sinCambios') {
        setSinCambios(true);
        return;
      }
      await cliente.invalidateQueries({ queryKey: CLAVE_USUARIOS });
      if (resultado.tipo === 'creado') alCreado(resultado.datos);
      else alEditado(resultado.usuario);
    },
  });

  const delServidor = erroresPorCampo(guardar.error);

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    setSinCambios(false);
    guardar.mutate();
  };

  return (
    <form onSubmit={enviar} noValidate>
      {guardar.isError && <Aviso tipo="error">{mensajeDe(guardar.error)}</Aviso>}
      {sinCambios && <Aviso tipo="info">No hiciste ningún cambio.</Aviso>}
      <Campo
        etiqueta="Nombre completo"
        autoComplete="off"
        required
        value={nombre}
        onChange={(evento) => setNombre(evento.target.value)}
        error={delServidor.nombre}
      />
      {!usuario && (
        <Campo
          etiqueta="Usuario"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          ayuda="De 3 a 40 caracteres: letras sin tildes, números, punto, guion o guion bajo."
          required
          value={login}
          onChange={(evento) => setLogin(evento.target.value)}
          error={delServidor.login}
        />
      )}
      <CampoSelector
        etiqueta="Rol"
        value={rol}
        onChange={(evento) => setRol(evento.target.value as Rol)}
        error={delServidor.rol}
      >
        {ROLES.map((opcion) => (
          <option key={opcion} value={opcion}>
            {ETIQUETAS_ROL[opcion]}
          </option>
        ))}
      </CampoSelector>
      <CampoSelector
        etiqueta="Sucursal"
        value={sucursalId}
        onChange={(evento) => setSucursalId(evento.target.value)}
        disabled={sucursales.isPending}
        error={delServidor.sucursalId}
        ayuda={sucursales.isError ? 'No se pudieron cargar las sucursales.' : undefined}
      >
        <option value="">Sin sucursal</option>
        {sucursales.data?.map((sucursal) => (
          <option key={sucursal.id} value={sucursal.id}>
            {sucursal.nombre} · {sucursal.ciudad}
          </option>
        ))}
      </CampoSelector>
      {!usuario && (
        <p className="campo__ayuda">
          El sistema generará una contraseña temporal que verás una sola vez. La persona deberá
          cambiarla al entrar por primera vez.
        </p>
      )}
      <div className="acciones acciones--derecha">
        <Boton variante="secundario" onClick={alCancelar} disabled={guardar.isPending}>
          Cancelar
        </Boton>
        <Boton
          type="submit"
          cargando={guardar.isPending}
          disabled={nombre.trim().length < 2 || (!usuario && login.trim() === '')}
        >
          {usuario ? 'Guardar cambios' : 'Crear usuario'}
        </Boton>
      </div>
    </form>
  );
}
