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
import {
  desactivarLineaNegocio,
  reactivarLineaNegocio,
} from '../../../modulos/lineas-negocio/api.js';
import {
  CLAVE_LINEAS_NEGOCIO,
  useLineasNegocio,
} from '../../../modulos/lineas-negocio/consultas.js';
import type { LineaNegocio } from '../../../modulos/lineas-negocio/tipos.js';

import { FormularioLineaNegocio } from './FormularioLineaNegocio.js';

const ETIQUETAS_CLASE = {
  remesa: 'Remesa',
  divisa_caja: 'Divisa en caja',
} as const;

type DialogoActivo = { tipo: 'crear' } | { tipo: 'editar' | 'desactivar'; linea: LineaNegocio };
interface MensajePagina {
  tipo: 'exito' | 'error';
  texto: string;
}

export function PaginaLineasNegocio() {
  useTitulo('Líneas de negocio · Configuración');
  const cliente = useQueryClient();
  const [mostrarInactivas, setMostrarInactivas] = useState(false);
  const [dialogo, setDialogo] = useState<DialogoActivo | null>(null);
  const [mensaje, setMensaje] = useState<MensajePagina | null>(null);

  const lista = useLineasNegocio();

  const alExito = (texto: string) => {
    setMensaje({ tipo: 'exito', texto });
    setDialogo(null);
    return cliente.invalidateQueries({ queryKey: CLAVE_LINEAS_NEGOCIO });
  };

  const desactivar = useMutation({
    mutationFn: (linea: LineaNegocio) => desactivarLineaNegocio(linea.id),
    onSuccess: (_r, linea) => alExito(`${linea.nombre} fue desactivada.`),
  });
  const reactivar = useMutation({
    mutationFn: (linea: LineaNegocio) => reactivarLineaNegocio(linea.id),
    onSuccess: (_r, linea) => alExito(`${linea.nombre} fue reactivada.`),
    onError: (error) => setMensaje({ tipo: 'error', texto: mensajeDe(error) }),
  });

  const lineas = (lista.data?.lineasNegocio ?? []).filter((l) => mostrarInactivas || l.activa);

  return (
    <>
      <div className="cabecera-pagina cabecera-pagina--acciones">
        <div>
          <h2>Líneas de negocio</h2>
          <p>Remesas y compra/venta de divisas que opera el negocio.</p>
        </div>
        <Boton
          onClick={() => {
            setMensaje(null);
            setDialogo({ tipo: 'crear' });
          }}
        >
          Nueva línea
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

      {lista.isPending && <Cargando texto="Cargando las líneas de negocio…" />}
      {lista.isError && <Aviso tipo="error">{mensajeDe(lista.error)}</Aviso>}
      {lista.data && (
        <TablaCatalogo
          tituloLista="Líneas de negocio"
          items={lineas}
          idDe={(l) => l.id}
          nombreDe={(l) => l.nombre}
          activaDe={(l) => l.activa}
          columnas={[
            { encabezado: 'Nombre', render: (l) => l.nombre },
            { encabezado: 'Clase', render: (l) => ETIQUETAS_CLASE[l.clase] },
            {
              encabezado: 'Monedas',
              render: (l) => `${l.monedaOrigen} → ${l.monedaDestino}`,
            },
          ]}
          alEditar={(linea) => {
            setMensaje(null);
            setDialogo({ tipo: 'editar', linea });
          }}
          alDesactivar={(linea) => {
            setMensaje(null);
            desactivar.reset();
            setDialogo({ tipo: 'desactivar', linea });
          }}
          alReactivar={(linea) => {
            setMensaje(null);
            reactivar.mutate(linea);
          }}
        />
      )}

      <Dialogo
        abierto={dialogo?.tipo === 'crear' || dialogo?.tipo === 'editar'}
        alCerrar={() => setDialogo(null)}
        titulo={dialogo?.tipo === 'editar' ? 'Editar línea de negocio' : 'Nueva línea de negocio'}
      >
        <FormularioLineaNegocio
          linea={dialogo?.tipo === 'editar' ? dialogo.linea : undefined}
          alGuardar={() => {
            void alExito(
              dialogo?.tipo === 'editar' ? 'Se guardaron los cambios.' : 'Se creó la línea.',
            );
          }}
          alCancelar={() => setDialogo(null)}
        />
      </Dialogo>

      <DialogoConfirmacion
        abierto={dialogo?.tipo === 'desactivar'}
        titulo="¿Desactivar línea de negocio?"
        textoConfirmar="Sí, desactivar"
        peligrosa
        cargando={desactivar.isPending}
        error={desactivar.isError ? mensajeDe(desactivar.error) : undefined}
        alConfirmar={() => dialogo?.tipo === 'desactivar' && desactivar.mutate(dialogo.linea)}
        alCancelar={() => setDialogo(null)}
      >
        {dialogo?.tipo === 'desactivar' && (
          <p>“{dialogo.linea.nombre}” ya no se podrá usar para operaciones nuevas.</p>
        )}
      </DialogoConfirmacion>
    </>
  );
}
