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
import { desactivarCaja, reactivarCaja } from '../../../modulos/cajas/api.js';
import { CLAVE_CAJAS, useCajas } from '../../../modulos/cajas/consultas.js';
import type { Caja } from '../../../modulos/cajas/tipos.js';

import { FormularioCaja } from './FormularioCaja.js';

type DialogoActivo = { tipo: 'crear' } | { tipo: 'editar' | 'desactivar'; caja: Caja };
interface MensajePagina {
  tipo: 'exito' | 'error';
  texto: string;
}

export function PaginaCajas() {
  useTitulo('Cajas · Configuración');
  const cliente = useQueryClient();
  const [mostrarInactivas, setMostrarInactivas] = useState(false);
  const [dialogo, setDialogo] = useState<DialogoActivo | null>(null);
  const [mensaje, setMensaje] = useState<MensajePagina | null>(null);

  const lista = useCajas();

  const alExito = (texto: string) => {
    setMensaje({ tipo: 'exito', texto });
    setDialogo(null);
    return cliente.invalidateQueries({ queryKey: CLAVE_CAJAS });
  };

  const desactivar = useMutation({
    mutationFn: (caja: Caja) => desactivarCaja(caja.id),
    onSuccess: (_r, caja) => alExito(`${caja.nombre} fue desactivada.`),
  });
  const reactivar = useMutation({
    mutationFn: (caja: Caja) => reactivarCaja(caja.id),
    onSuccess: (_r, caja) => alExito(`${caja.nombre} fue reactivada.`),
    onError: (error) => setMensaje({ tipo: 'error', texto: mensajeDe(error) }),
  });

  const cajas = (lista.data?.cajas ?? []).filter((c) => mostrarInactivas || c.activa);

  return (
    <>
      <div className="cabecera-pagina cabecera-pagina--acciones">
        <div>
          <h2>Cajas</h2>
          <p>Cajas de cada sucursal, donde los vendedores abren su turno.</p>
        </div>
        <Boton
          onClick={() => {
            setMensaje(null);
            setDialogo({ tipo: 'crear' });
          }}
        >
          Nueva caja
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

      {lista.isPending && <Cargando texto="Cargando las cajas…" />}
      {lista.isError && <Aviso tipo="error">{mensajeDe(lista.error)}</Aviso>}
      {lista.data && (
        <TablaCatalogo
          tituloLista="Cajas"
          items={cajas}
          idDe={(c) => c.id}
          nombreDe={(c) => c.nombre}
          activaDe={(c) => c.activa}
          columnas={[
            { encabezado: 'Nombre', render: (c) => c.nombre },
            { encabezado: 'Sucursal', render: (c) => c.sucursalNombre },
          ]}
          alEditar={(caja) => {
            setMensaje(null);
            setDialogo({ tipo: 'editar', caja });
          }}
          alDesactivar={(caja) => {
            setMensaje(null);
            desactivar.reset();
            setDialogo({ tipo: 'desactivar', caja });
          }}
          alReactivar={(caja) => {
            setMensaje(null);
            reactivar.mutate(caja);
          }}
        />
      )}

      <Dialogo
        abierto={dialogo?.tipo === 'crear' || dialogo?.tipo === 'editar'}
        alCerrar={() => setDialogo(null)}
        titulo={dialogo?.tipo === 'editar' ? 'Editar caja' : 'Nueva caja'}
      >
        <FormularioCaja
          caja={dialogo?.tipo === 'editar' ? dialogo.caja : undefined}
          alGuardar={() => {
            void alExito(
              dialogo?.tipo === 'editar' ? 'Se guardaron los cambios.' : 'Se creó la caja.',
            );
          }}
          alCancelar={() => setDialogo(null)}
        />
      </Dialogo>

      <DialogoConfirmacion
        abierto={dialogo?.tipo === 'desactivar'}
        titulo="¿Desactivar caja?"
        textoConfirmar="Sí, desactivar"
        peligrosa
        cargando={desactivar.isPending}
        error={desactivar.isError ? mensajeDe(desactivar.error) : undefined}
        alConfirmar={() => dialogo?.tipo === 'desactivar' && desactivar.mutate(dialogo.caja)}
        alCancelar={() => setDialogo(null)}
      >
        {dialogo?.tipo === 'desactivar' && (
          <p>“{dialogo.caja.nombre}” ya no se podrá usar para turnos nuevos.</p>
        )}
      </DialogoConfirmacion>
    </>
  );
}
