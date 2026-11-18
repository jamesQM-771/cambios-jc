import type { Permiso, Rol } from '@cambios-jc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { useNotificar } from '../../componentes/Notificaciones.js';
import { EncabezadoPagina, Esqueleto } from '../../componentes/Pagina.js';
import { api, mensajeDe } from '../../lib/api.js';
import { ETIQUETAS_PERMISO } from '../../lib/etiquetas-permisos.js';
import { ETIQUETAS_ROL } from '../../lib/formato.js';
import { useTitulo } from '../../lib/titulo.js';

interface VistaPermisos {
  catalogo: Permiso[];
  roles: { rol: Rol; permisos: Permiso[]; deFabrica: Permiso[]; configurado: boolean }[];
  restricciones: { soloAdministrador: Permiso[]; incompatibles: [Permiso, Permiso][] };
}

const CLAVE = ['permisos'] as const;

/** Qué puede hacer cada rol (§6.1). El servidor aplica las restricciones que nadie puede saltarse. */
export function PaginaPermisos() {
  useTitulo('Permisos');
  const notificar = useNotificar();
  const consultas = useQueryClient();
  const vista = useQuery({ queryKey: CLAVE, queryFn: () => api.get<VistaPermisos>('/permisos') });
  const [cambios, setCambios] = useState<Partial<Record<Rol, Permiso[]>>>({});

  const guardar = useMutation({
    mutationFn: (rol: Rol) =>
      api.put<VistaPermisos>(`/permisos/${rol}`, { permisos: cambios[rol] ?? [] }),
    onSuccess: async (_datos, rol) => {
      setCambios((actual) => ({ ...actual, [rol]: undefined }));
      notificar(`Permisos de ${ETIQUETAS_ROL[rol]} guardados.`);
      await consultas.invalidateQueries();
    },
  });
  const restablecer = useMutation({
    mutationFn: (rol: Rol) => api.post<VistaPermisos>(`/permisos/${rol}/restablecer`),
    onSuccess: async (_datos, rol) => {
      setCambios((actual) => ({ ...actual, [rol]: undefined }));
      notificar(`${ETIQUETAS_ROL[rol]} volvió a los permisos de fábrica.`);
      await consultas.invalidateQueries();
    },
  });

  if (vista.isPending) return <Esqueleto texto="Cargando los permisos…" />;
  if (vista.isError) return <Aviso tipo="error">{mensajeDe(vista.error)}</Aviso>;
  const { catalogo, roles, restricciones } = vista.data;
  const actuales = (rol: Rol) => cambios[rol] ?? roles.find((r) => r.rol === rol)?.permisos ?? [];
  const alternar = (rol: Rol, permiso: Permiso, activo: boolean) =>
    setCambios((actual) => {
      const base = actual[rol] ?? roles.find((r) => r.rol === rol)?.permisos ?? [];
      return {
        ...actual,
        [rol]: activo ? [...base, permiso] : base.filter((p) => p !== permiso),
      };
    });

  return (
    <>
      <EncabezadoPagina
        titulo="Permisos"
        descripcion="Marca qué puede hacer cada rol. Los cambios valen desde la siguiente acción de cada persona."
      />
      <Aviso tipo="info">
        Hay reglas que ningún rol puede saltarse: reabrir un cierre es solo del administrador, quien
        registra remesas no puede pagarlas y el administrador no puede perder la gestión de usuarios
        ni de permisos.
      </Aviso>
      {(guardar.isError || restablecer.isError) && (
        <Aviso tipo="error">{mensajeDe(guardar.error ?? restablecer.error)}</Aviso>
      )}
      <div className="tabla-contenedor">
        <table className="tabla">
          <caption className="solo-lectores">Permisos por rol</caption>
          <thead>
            <tr>
              <th scope="col">Permiso</th>
              {roles.map((r) => (
                <th key={r.rol} scope="col">
                  {ETIQUETAS_ROL[r.rol]}
                  {r.configurado && <small>Personalizado</small>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {catalogo.map((permiso) => (
              <tr key={permiso}>
                <th scope="row">
                  {ETIQUETAS_PERMISO[permiso]}
                  <small className="mono">{permiso}</small>
                </th>
                {roles.map((r) => {
                  const bloqueado =
                    r.rol !== 'administrador' && restricciones.soloAdministrador.includes(permiso);
                  return (
                    <td key={r.rol}>
                      <input
                        type="checkbox"
                        aria-label={`${ETIQUETAS_ROL[r.rol]}: ${ETIQUETAS_PERMISO[permiso]}`}
                        checked={actuales(r.rol).includes(permiso)}
                        disabled={bloqueado}
                        onChange={(evento) => alternar(r.rol, permiso, evento.target.checked)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">
                <span className="solo-lectores">Acciones</span>
              </th>
              {roles.map((r) => (
                <td key={r.rol}>
                  <div className="acciones">
                    <Boton
                      chico
                      disabled={cambios[r.rol] === undefined}
                      cargando={guardar.isPending && guardar.variables === r.rol}
                      onClick={() => guardar.mutate(r.rol)}
                    >
                      Guardar
                    </Boton>
                    {r.configurado && (
                      <Boton
                        variante="secundario"
                        chico
                        cargando={restablecer.isPending && restablecer.variables === r.rol}
                        onClick={() => restablecer.mutate(r.rol)}
                      >
                        De fábrica
                      </Boton>
                    )}
                  </div>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
