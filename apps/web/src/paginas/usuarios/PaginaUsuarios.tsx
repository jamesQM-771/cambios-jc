import { ROLES, type Rol } from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { CampoSelector } from '../../componentes/CampoSelector.js';
import { Cargando } from '../../componentes/Cargando.js';
import { Dialogo } from '../../componentes/Dialogo.js';
import { DialogoConfirmacion } from '../../componentes/DialogoConfirmacion.js';
import { Paginacion } from '../../componentes/Paginacion.js';
import { mensajeDe } from '../../lib/api.js';
import { ETIQUETAS_ROL } from '../../lib/formato.js';
import { useRetraso } from '../../lib/useRetraso.js';
import { useTitulo } from '../../lib/titulo.js';
import { useSesionActual } from '../../modulos/auth/ContextoSesion.js';
import {
  cerrarSesiones,
  desactivarUsuario,
  reactivarUsuario,
  reiniciar2fa,
  restablecerContrasena,
} from '../../modulos/usuarios/api.js';
import { CLAVE_USUARIOS, useUsuarios } from '../../modulos/usuarios/consultas.js';
import type { FiltrosUsuarios, UsuarioLista } from '../../modulos/usuarios/tipos.js';

import {
  DialogoContrasenaTemporal,
  type ContrasenaTemporalMostrada,
} from './DialogoContrasenaTemporal.js';
import { FormularioUsuario } from './FormularioUsuario.js';
import { TablaUsuarios, type AccionUsuario } from './TablaUsuarios.js';

const POR_PAGINA = 20;

type DialogoActivo =
  | { tipo: 'crear' }
  | { tipo: 'editar'; usuario: UsuarioLista }
  | {
      tipo: 'desactivar' | 'restablecer' | 'reiniciar2fa' | 'cerrarSesiones';
      usuario: UsuarioLista;
    };

interface MensajePagina {
  tipo: 'exito' | 'error';
  texto: string;
}

export function PaginaUsuarios() {
  useTitulo('Usuarios');
  const { usuario: yo, empresa } = useSesionActual();
  const zonaHoraria = empresa?.zonaHoraria ?? 'America/Bogota';
  const cliente = useQueryClient();

  const [busqueda, setBusqueda] = useState('');
  const [rol, setRol] = useState<Rol | ''>('');
  const [activo, setActivo] = useState<'' | 'true' | 'false'>('');
  const [pagina, setPagina] = useState(1);
  const [dialogo, setDialogo] = useState<DialogoActivo | null>(null);
  const [temporal, setTemporal] = useState<ContrasenaTemporalMostrada | null>(null);
  const [mensaje, setMensaje] = useState<MensajePagina | null>(null);

  // La búsqueda espera a que se deje de escribir para no pedir una consulta por letra.
  const busquedaFinal = useRetraso(busqueda.trim());
  const filtros: FiltrosUsuarios = {
    busqueda: busquedaFinal,
    rol,
    activo,
    pagina,
    porPagina: POR_PAGINA,
  };
  const lista = useUsuarios(filtros);

  const cerrarDialogo = () => setDialogo(null);
  const alExito = (texto: string) => {
    setMensaje({ tipo: 'exito', texto });
    setDialogo(null);
    return cliente.invalidateQueries({ queryKey: CLAVE_USUARIOS });
  };

  const desactivar = useMutation({
    mutationFn: (usuario: UsuarioLista) => desactivarUsuario(usuario.id),
    onSuccess: (_resultado, usuario) => alExito(`${usuario.nombre} fue desactivado.`),
  });
  const reactivar = useMutation({
    mutationFn: (usuario: UsuarioLista) => reactivarUsuario(usuario.id),
    onSuccess: (_resultado, usuario) => alExito(`${usuario.nombre} fue reactivado.`),
    onError: (error) => setMensaje({ tipo: 'error', texto: mensajeDe(error) }),
  });
  const restablecer = useMutation({
    mutationFn: (usuario: UsuarioLista) => restablecerContrasena(usuario.id),
    onSuccess: async (resultado, usuario) => {
      setDialogo(null);
      setMensaje(null);
      setTemporal({
        nombre: usuario.nombre,
        login: usuario.login,
        contrasena: resultado.contrasenaTemporal,
        esNuevo: false,
      });
      await cliente.invalidateQueries({ queryKey: CLAVE_USUARIOS });
    },
  });
  const reiniciar = useMutation({
    mutationFn: (usuario: UsuarioLista) => reiniciar2fa(usuario.id),
    onSuccess: (_resultado, usuario) =>
      alExito(
        `Se reinició la verificación en dos pasos de ${usuario.nombre}. La configurará al entrar.`,
      ),
  });
  const cerrar = useMutation({
    mutationFn: (usuario: UsuarioLista) => cerrarSesiones(usuario.id),
    onSuccess: ({ sesionesCerradas }, usuario) =>
      alExito(
        sesionesCerradas === 0
          ? `${usuario.nombre} no tenía sesiones abiertas.`
          : `Se cerraron ${String(sesionesCerradas)} sesión(es) de ${usuario.nombre}.`,
      ),
  });

  const elegirAccion = (accion: AccionUsuario, usuario: UsuarioLista) => {
    setMensaje(null);
    desactivar.reset();
    restablecer.reset();
    reiniciar.reset();
    cerrar.reset();
    if (accion === 'reactivar') {
      reactivar.mutate(usuario);
      return;
    }
    setDialogo({ tipo: accion, usuario });
  };

  const hayFiltros = busqueda !== '' || rol !== '' || activo !== '';
  const limpiarFiltros = () => {
    setBusqueda('');
    setRol('');
    setActivo('');
    setPagina(1);
  };

  return (
    <>
      <div className="cabecera-pagina cabecera-pagina--acciones">
        <div>
          <h1>Usuarios</h1>
          <p>
            Crea usuarios, cambia sus roles y gestiona su acceso. Nada se borra: los usuarios se
            desactivan.
          </p>
        </div>
        <Boton
          onClick={() => {
            setMensaje(null);
            setDialogo({ tipo: 'crear' });
          }}
        >
          Nuevo usuario
        </Boton>
      </div>

      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}

      <form className="filtros" role="search" onSubmit={(evento) => evento.preventDefault()}>
        <Campo
          etiqueta="Buscar"
          type="search"
          placeholder="Nombre o usuario"
          value={busqueda}
          onChange={(evento) => {
            setBusqueda(evento.target.value);
            setPagina(1);
          }}
        />
        <CampoSelector
          etiqueta="Rol"
          value={rol}
          onChange={(evento) => {
            setRol(evento.target.value as Rol | '');
            setPagina(1);
          }}
        >
          <option value="">Todos</option>
          {ROLES.map((opcion) => (
            <option key={opcion} value={opcion}>
              {ETIQUETAS_ROL[opcion]}
            </option>
          ))}
        </CampoSelector>
        <CampoSelector
          etiqueta="Estado"
          value={activo}
          onChange={(evento) => {
            setActivo(evento.target.value as '' | 'true' | 'false');
            setPagina(1);
          }}
        >
          <option value="">Todos</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </CampoSelector>
        {hayFiltros && (
          <div className="filtros__acciones">
            <Boton variante="secundario" onClick={limpiarFiltros}>
              Limpiar filtros
            </Boton>
          </div>
        )}
      </form>

      {lista.isPending && <Cargando texto="Cargando usuarios…" />}
      {lista.isError && <Aviso tipo="error">{mensajeDe(lista.error)}</Aviso>}
      {lista.data &&
        (lista.data.usuarios.length === 0 ? (
          <p className="vacio">
            {hayFiltros ? 'No hay usuarios con esos filtros.' : 'Todavía no hay usuarios.'}
          </p>
        ) : (
          <>
            <TablaUsuarios
              usuarios={lista.data.usuarios}
              usuarioActualId={yo.id}
              zonaHoraria={zonaHoraria}
              alElegir={elegirAccion}
            />
            <Paginacion
              pagina={lista.data.pagina}
              porPagina={lista.data.porPagina}
              total={lista.data.total}
              alCambiar={setPagina}
            />
          </>
        ))}

      <Dialogo
        abierto={dialogo?.tipo === 'crear' || dialogo?.tipo === 'editar'}
        alCerrar={cerrarDialogo}
        titulo={dialogo?.tipo === 'editar' ? 'Editar usuario' : 'Nuevo usuario'}
      >
        <FormularioUsuario
          {...(dialogo?.tipo === 'editar' ? { usuario: dialogo.usuario } : {})}
          alCancelar={cerrarDialogo}
          alCreado={(resultado) => {
            setDialogo(null);
            setTemporal({
              nombre: resultado.usuario.nombre,
              login: resultado.usuario.login,
              contrasena: resultado.contrasenaTemporal,
              esNuevo: true,
            });
          }}
          alEditado={(editado) => void alExito(`Se guardaron los cambios de ${editado.nombre}.`)}
        />
      </Dialogo>

      <DialogoContrasenaTemporal datos={temporal} alCerrar={() => setTemporal(null)} />

      <DialogoConfirmacion
        abierto={dialogo?.tipo === 'desactivar'}
        titulo="Desactivar usuario"
        textoConfirmar="Desactivar"
        peligrosa
        cargando={desactivar.isPending}
        error={desactivar.isError ? mensajeDe(desactivar.error) : undefined}
        alCancelar={cerrarDialogo}
        alConfirmar={() => dialogo?.tipo === 'desactivar' && desactivar.mutate(dialogo.usuario)}
      >
        <p>
          ¿Desactivar a{' '}
          <strong>{dialogo && 'usuario' in dialogo ? dialogo.usuario.nombre : ''}</strong>? No podrá
          iniciar sesión y se cerrarán sus sesiones abiertas. No se borra nada: puedes reactivarlo
          cuando quieras.
        </p>
      </DialogoConfirmacion>

      <DialogoConfirmacion
        abierto={dialogo?.tipo === 'restablecer'}
        titulo="Restablecer contraseña"
        textoConfirmar="Restablecer"
        cargando={restablecer.isPending}
        error={restablecer.isError ? mensajeDe(restablecer.error) : undefined}
        alCancelar={cerrarDialogo}
        alConfirmar={() => dialogo?.tipo === 'restablecer' && restablecer.mutate(dialogo.usuario)}
      >
        <p>
          Se generará una contraseña temporal nueva para{' '}
          <strong>{dialogo && 'usuario' in dialogo ? dialogo.usuario.nombre : ''}</strong>. La
          actual dejará de servir, se cerrarán sus sesiones y tendrá que cambiarla al entrar. Su
          verificación en dos pasos se conserva.
        </p>
      </DialogoConfirmacion>

      <DialogoConfirmacion
        abierto={dialogo?.tipo === 'reiniciar2fa'}
        titulo="Reiniciar verificación en dos pasos"
        textoConfirmar="Reiniciar"
        peligrosa
        cargando={reiniciar.isPending}
        error={reiniciar.isError ? mensajeDe(reiniciar.error) : undefined}
        alCancelar={cerrarDialogo}
        alConfirmar={() => dialogo?.tipo === 'reiniciar2fa' && reiniciar.mutate(dialogo.usuario)}
      >
        <p>
          <strong>{dialogo && 'usuario' in dialogo ? dialogo.usuario.nombre : ''}</strong> tendrá
          que configurar de nuevo su aplicación autenticadora la próxima vez que entre. Se cerrarán
          sus sesiones. Úsalo si perdió el teléfono.
        </p>
      </DialogoConfirmacion>

      <DialogoConfirmacion
        abierto={dialogo?.tipo === 'cerrarSesiones'}
        titulo="Cerrar sesiones"
        textoConfirmar="Cerrar sesiones"
        cargando={cerrar.isPending}
        error={cerrar.isError ? mensajeDe(cerrar.error) : undefined}
        alCancelar={cerrarDialogo}
        alConfirmar={() => dialogo?.tipo === 'cerrarSesiones' && cerrar.mutate(dialogo.usuario)}
      >
        <p>
          Se cerrarán todas las sesiones abiertas de{' '}
          <strong>{dialogo && 'usuario' in dialogo ? dialogo.usuario.nombre : ''}</strong>. Podrá
          volver a entrar con su usuario, contraseña y código.
        </p>
      </DialogoConfirmacion>
    </>
  );
}
