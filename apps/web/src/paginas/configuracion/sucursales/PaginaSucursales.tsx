import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Aviso } from '../../../componentes/Aviso.js';
import { Boton } from '../../../componentes/Boton.js';
import { Cargando } from '../../../componentes/Cargando.js';
import { Dialogo } from '../../../componentes/Dialogo.js';
import { DialogoConfirmacion } from '../../../componentes/DialogoConfirmacion.js';
import { TablaCatalogo } from '../../../componentes/TablaCatalogo.js';
import { mensajeDe } from '../../../lib/api.js';
import { useTitulo } from '../../../lib/titulo.js';
import { desactivarSucursal, reactivarSucursal } from '../../../modulos/sucursales/api.js';
import { CLAVE_SUCURSALES, useSucursalesTodas } from '../../../modulos/sucursales/consultas.js';
import type { Sucursal } from '../../../modulos/sucursales/tipos.js';

import { FormularioSucursal } from './FormularioSucursal.js';

type DialogoActivo = { tipo: 'crear' } | { tipo: 'editar' | 'desactivar'; sucursal: Sucursal };
interface MensajePagina {
  tipo: 'exito' | 'error';
  texto: string;
}

export function PaginaSucursales() {
  useTitulo('Sucursales · Configuración');
  const cliente = useQueryClient();
  const [mostrarInactivas, setMostrarInactivas] = useState(false);
  const [dialogo, setDialogo] = useState<DialogoActivo | null>(null);
  const [mensaje, setMensaje] = useState<MensajePagina | null>(null);

  const lista = useSucursalesTodas();

  const alExito = (texto: string) => {
    setMensaje({ tipo: 'exito', texto });
    setDialogo(null);
    return cliente.invalidateQueries({ queryKey: CLAVE_SUCURSALES });
  };

  const desactivar = useMutation({
    mutationFn: (sucursal: Sucursal) => desactivarSucursal(sucursal.id),
    onSuccess: (_r, sucursal) => alExito(`${sucursal.nombre} fue desactivada.`),
    // Sin onError: el diálogo de confirmación ya muestra el error en su propio aviso.
  });
  const reactivar = useMutation({
    mutationFn: (sucursal: Sucursal) => reactivarSucursal(sucursal.id),
    onSuccess: (_r, sucursal) => alExito(`${sucursal.nombre} fue reactivada.`),
    onError: (error) => setMensaje({ tipo: 'error', texto: mensajeDe(error) }),
  });

  const sucursales = (lista.data?.sucursales ?? []).filter((s) => mostrarInactivas || s.activa);

  return (
    <>
      <div className="cabecera-pagina cabecera-pagina--acciones">
        <div>
          <h2>Sucursales</h2>
          <p>Locales del negocio. Cambios JC tiene una sola sucursal, en Cúcuta.</p>
        </div>
        <Boton
          onClick={() => {
            setMensaje(null);
            setDialogo({ tipo: 'crear' });
          }}
        >
          Nueva sucursal
        </Boton>
      </div>

      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}

      <label className="campo__casilla">
        <input
          type="checkbox"
          checked={mostrarInactivas}
          onChange={(evento) => setMostrarInactivas(evento.target.checked)}
        />
        Mostrar desactivadas
      </label>

      {lista.isPending && <Cargando texto="Cargando las sucursales…" />}
      {lista.isError && <Aviso tipo="error">{mensajeDe(lista.error)}</Aviso>}
      {lista.data && (
        <TablaCatalogo
          tituloLista="Sucursales"
          items={sucursales}
          idDe={(s) => s.id}
          nombreDe={(s) => s.nombre}
          activaDe={(s) => s.activa}
          columnas={[
            { encabezado: 'Nombre', render: (s) => s.nombre },
            { encabezado: 'Ciudad', render: (s) => s.ciudad },
          ]}
          alEditar={(sucursal) => {
            setMensaje(null);
            setDialogo({ tipo: 'editar', sucursal });
          }}
          alDesactivar={(sucursal) => {
            setMensaje(null);
            desactivar.reset();
            setDialogo({ tipo: 'desactivar', sucursal });
          }}
          alReactivar={(sucursal) => {
            setMensaje(null);
            reactivar.mutate(sucursal);
          }}
        />
      )}

      <Dialogo
        abierto={dialogo?.tipo === 'crear' || dialogo?.tipo === 'editar'}
        alCerrar={() => setDialogo(null)}
        titulo={dialogo?.tipo === 'editar' ? 'Editar sucursal' : 'Nueva sucursal'}
      >
        <FormularioSucursal
          sucursal={dialogo?.tipo === 'editar' ? dialogo.sucursal : undefined}
          alGuardar={() => {
            void alExito(
              dialogo?.tipo === 'editar' ? 'Se guardaron los cambios.' : 'Se creó la sucursal.',
            );
          }}
          alCancelar={() => setDialogo(null)}
        />
      </Dialogo>

      <DialogoConfirmacion
        abierto={dialogo?.tipo === 'desactivar'}
        titulo="¿Desactivar sucursal?"
        textoConfirmar="Sí, desactivar"
        peligrosa
        cargando={desactivar.isPending}
        error={desactivar.isError ? mensajeDe(desactivar.error) : undefined}
        alConfirmar={() => dialogo?.tipo === 'desactivar' && desactivar.mutate(dialogo.sucursal)}
        alCancelar={() => setDialogo(null)}
      >
        {dialogo?.tipo === 'desactivar' && (
          <p>
            No se puede desactivar si tiene usuarios activos o cajas activas asignadas. “
            {dialogo.sucursal.nombre}”.
          </p>
        )}
      </DialogoConfirmacion>
    </>
  );
}
