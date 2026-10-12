import { ROLES, type Rol } from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { CampoSelector } from '../../componentes/CampoSelector.js';
import { erroresPorCampo, mensajeDe } from '../../lib/api.js';
import { ETIQUETAS_ROL, formatearFechaHora } from '../../lib/formato.js';
import { useSesionActual } from '../../modulos/auth/ContextoSesion.js';
import { crearUsuario, editarUsuario } from '../../modulos/usuarios/api.js';
import { CLAVE_USUARIOS, useSucursales } from '../../modulos/usuarios/consultas.js';
import type {
  CambiosUsuario,
  UsuarioConContrasenaTemporal,
  UsuarioLista,
} from '../../modulos/usuarios/tipos.js';

/** Qué puede hacer cada rol, en una frase (D28 a D30). Los permisos finos no se editan por persona. */
const AYUDA_ROL: Record<Rol, string> = {
  administrador:
    'Administra usuarios, empresa, configuración y tasas, y ve la actividad. No toma ni paga transferencias.',
  vendedor: 'Atiende el mostrador: clientes, remesas, divisas, gastos y su turno de caja.',
  digitador:
    'Solo toma y completa las transferencias que le llegan. No ve pesos, tasas ni remitentes.',
};

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
  const { usuario: yo, empresa } = useSesionActual();
  const zonaHoraria = empresa?.zonaHoraria ?? 'America/Bogota';
  const esElMismo = usuario?.id === yo.id;
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
      {usuario && <h3>Identidad</h3>}
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
      {usuario && (
        <p className="campo__ayuda formulario-usuario__login">
          Usuario para entrar: <code>{usuario.login}</code>. No se puede cambiar.
        </p>
      )}
      {usuario && <h3>Rol y sucursal</h3>}
      <CampoSelector
        etiqueta="Rol"
        ayuda={AYUDA_ROL[rol]}
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
      {usuario && esElMismo && rol !== usuario.rol && (
        <Aviso tipo="advertencia">
          Estás cambiando tu propio rol. Si dejas de ser administrador perderás el acceso a esta
          pantalla.
        </Aviso>
      )}
      {usuario && (
        <>
          <h3>Estado del acceso</h3>
          <dl className="datos-registro">
            <dt>Cuenta</dt>
            <dd>{usuario.activo ? 'Activa' : 'Desactivada'}</dd>
            <dt>Verificación en dos pasos</dt>
            <dd>{usuario.tiene2fa ? 'Configurada' : 'Sin configurar'}</dd>
            <dt>Contraseña</dt>
            <dd>{usuario.debeCambiarContrasena ? 'Temporal, pendiente de cambio' : 'Definida'}</dd>
            <dt>Último acceso</dt>
            <dd>
              {usuario.ultimoAcceso
                ? formatearFechaHora(usuario.ultimoAcceso, zonaHoraria)
                : 'Nunca ha entrado'}
            </dd>
            <dt>Creado</dt>
            <dd>{formatearFechaHora(usuario.creadoEn, zonaHoraria)}</dd>
          </dl>
          <p className="campo__ayuda">
            Para desactivar la cuenta, restablecer la contraseña, reiniciar la verificación o cerrar
            sus sesiones, usa el menú de tres puntos de su fila.
          </p>
        </>
      )}
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
