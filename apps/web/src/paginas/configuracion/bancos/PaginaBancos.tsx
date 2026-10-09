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
import { desactivarBanco, reactivarBanco } from '../../../modulos/bancos/api.js';
import { CLAVE_BANCOS, useBancos } from '../../../modulos/bancos/consultas.js';
import type { Banco } from '../../../modulos/bancos/tipos.js';

import { FormularioBanco } from './FormularioBanco.js';

type DialogoActivo = { tipo: 'crear' } | { tipo: 'editar' | 'desactivar'; banco: Banco };
interface MensajePagina {
  tipo: 'exito' | 'error';
  texto: string;
}

export function PaginaBancos() {
  useTitulo('Bancos · Configuración');
  const cliente = useQueryClient();
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [dialogo, setDialogo] = useState<DialogoActivo | null>(null);
  const [mensaje, setMensaje] = useState<MensajePagina | null>(null);

  const lista = useBancos();

  const alExito = (texto: string) => {
    setMensaje({ tipo: 'exito', texto });
    setDialogo(null);
    return cliente.invalidateQueries({ queryKey: CLAVE_BANCOS });
  };

  const desactivar = useMutation({
    mutationFn: (banco: Banco) => desactivarBanco(banco.id),
    onSuccess: (_r, banco) => alExito(`${banco.nombre} fue desactivado.`),
  });
  const reactivar = useMutation({
    mutationFn: (banco: Banco) => reactivarBanco(banco.id),
    onSuccess: (_r, banco) => alExito(`${banco.nombre} fue reactivado.`),
    onError: (error) => setMensaje({ tipo: 'error', texto: mensajeDe(error) }),
  });

  const bancos = (lista.data?.bancos ?? []).filter((b) => mostrarInactivos || b.activo);

  return (
    <>
      <div className="cabecera-pagina cabecera-pagina--acciones">
        <div>
          <h2>Bancos</h2>
          <p>Catálogo de bancos venezolanos, para identificar cuentas y beneficiarios.</p>
        </div>
        <Boton
          onClick={() => {
            setMensaje(null);
            setDialogo({ tipo: 'crear' });
          }}
        >
          Nuevo banco
        </Boton>
      </div>

      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}

      <label className="campo__casilla">
        <input
          type="checkbox"
          checked={mostrarInactivos}
          onChange={(evento) => setMostrarInactivos(evento.target.checked)}
        />
        Mostrar desactivados
      </label>

      {lista.isPending && <Cargando texto="Cargando los bancos…" />}
      {lista.isError && <Aviso tipo="error">{mensajeDe(lista.error)}</Aviso>}
      {lista.data && (
        <TablaCatalogo
          tituloLista="Bancos"
          items={bancos}
          idDe={(b) => b.id}
          nombreDe={(b) => b.nombre}
          activaDe={(b) => b.activo}
          columnas={[
            { encabezado: 'Código', render: (b) => b.codigo },
            { encabezado: 'Nombre', render: (b) => b.nombre },
          ]}
          alEditar={(banco) => {
            setMensaje(null);
            setDialogo({ tipo: 'editar', banco });
          }}
          alDesactivar={(banco) => {
            setMensaje(null);
            desactivar.reset();
            setDialogo({ tipo: 'desactivar', banco });
          }}
          alReactivar={(banco) => {
            setMensaje(null);
            reactivar.mutate(banco);
          }}
        />
      )}

      <Dialogo
        abierto={dialogo?.tipo === 'crear' || dialogo?.tipo === 'editar'}
        alCerrar={() => setDialogo(null)}
        titulo={dialogo?.tipo === 'editar' ? 'Editar banco' : 'Nuevo banco'}
      >
        <FormularioBanco
          banco={dialogo?.tipo === 'editar' ? dialogo.banco : undefined}
          alGuardar={() => {
            void alExito(
              dialogo?.tipo === 'editar' ? 'Se guardaron los cambios.' : 'Se creó el banco.',
            );
          }}
          alCancelar={() => setDialogo(null)}
        />
      </Dialogo>

      <DialogoConfirmacion
        abierto={dialogo?.tipo === 'desactivar'}
        titulo="¿Desactivar banco?"
        textoConfirmar="Sí, desactivar"
        peligrosa
        cargando={desactivar.isPending}
        error={desactivar.isError ? mensajeDe(desactivar.error) : undefined}
        alConfirmar={() => dialogo?.tipo === 'desactivar' && desactivar.mutate(dialogo.banco)}
        alCancelar={() => setDialogo(null)}
      >
        {dialogo?.tipo === 'desactivar' && (
          <p>“{dialogo.banco.nombre}” ya no se podrá usar para cuentas nuevas.</p>
        )}
      </DialogoConfirmacion>
    </>
  );
}
