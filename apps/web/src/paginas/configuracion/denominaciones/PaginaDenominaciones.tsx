import type { Moneda } from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Aviso } from '../../../componentes/Aviso.js';
import { Boton } from '../../../componentes/Boton.js';
import { CampoSelector } from '../../../componentes/CampoSelector.js';
import { Dialogo } from '../../../componentes/Dialogo.js';
import { DialogoConfirmacion } from '../../../componentes/DialogoConfirmacion.js';
import { useNotificar } from '../../../componentes/Notificaciones.js';
import { Esqueleto } from '../../../componentes/Pagina.js';
import { TablaCatalogo } from '../../../componentes/TablaCatalogo.js';
import { mensajeDe } from '../../../lib/api.js';
import { ETIQUETAS_MONEDA, MONEDAS_SOPORTADAS } from '../../../lib/formato.js';
import { useTitulo } from '../../../lib/titulo.js';
import {
  desactivarDenominacion,
  reactivarDenominacion,
} from '../../../modulos/denominaciones/api.js';
import {
  CLAVE_DENOMINACIONES,
  useDenominaciones,
} from '../../../modulos/denominaciones/consultas.js';
import type { Denominacion } from '../../../modulos/denominaciones/tipos.js';

import { FormularioDenominacion } from './FormularioDenominacion.js';

type DialogoActivo =
  { tipo: 'crear' } | { tipo: 'editar' | 'desactivar'; denominacion: Denominacion };
interface MensajePagina {
  tipo: 'exito' | 'error';
  texto: string;
}

export function PaginaDenominaciones() {
  useTitulo('Denominaciones · Configuración');
  const cliente = useQueryClient();
  const notificar = useNotificar();
  const [moneda, setMoneda] = useState<Moneda | ''>('');
  const [mostrarInactivas, setMostrarInactivas] = useState(false);
  const [dialogo, setDialogo] = useState<DialogoActivo | null>(null);
  const [mensaje, setMensaje] = useState<MensajePagina | null>(null);

  const lista = useDenominaciones();

  const alExito = (texto: string) => {
    setMensaje(null);
    notificar(texto);
    setDialogo(null);
    return cliente.invalidateQueries({ queryKey: CLAVE_DENOMINACIONES });
  };

  const desactivar = useMutation({
    mutationFn: (denominacion: Denominacion) => desactivarDenominacion(denominacion.id),
    onSuccess: (_r, denominacion) =>
      alExito(`${ETIQUETAS_MONEDA[denominacion.moneda]} ${denominacion.valor} fue desactivada.`),
  });
  const reactivar = useMutation({
    mutationFn: (denominacion: Denominacion) => reactivarDenominacion(denominacion.id),
    onSuccess: (_r, denominacion) =>
      alExito(`${ETIQUETAS_MONEDA[denominacion.moneda]} ${denominacion.valor} fue reactivada.`),
    onError: (error) => setMensaje({ tipo: 'error', texto: mensajeDe(error) }),
  });

  const denominaciones = (lista.data?.denominaciones ?? []).filter(
    (d) => (mostrarInactivas || d.activa) && (moneda === '' || d.moneda === moneda),
  );

  return (
    <>
      <div className="cabecera-pagina cabecera-pagina--acciones">
        <div>
          <h2>Denominaciones</h2>
          <p>Billetes y monedas, para el conteo del arqueo de caja.</p>
        </div>
        <Boton
          onClick={() => {
            setMensaje(null);
            setDialogo({ tipo: 'crear' });
          }}
        >
          Nueva denominación
        </Boton>
      </div>

      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}

      {lista.isPending && <Esqueleto texto="Cargando las denominaciones…" />}
      {lista.isError && <Aviso tipo="error">{mensajeDe(lista.error)}</Aviso>}
      {lista.data && (
        <TablaCatalogo
          tituloLista="Denominaciones"
          items={denominaciones}
          idDe={(d) => d.id}
          nombreDe={(d) => `${ETIQUETAS_MONEDA[d.moneda]} ${d.valor}`}
          activaDe={(d) => d.activa}
          columnas={[
            { encabezado: 'Moneda', render: (d) => ETIQUETAS_MONEDA[d.moneda] },
            { encabezado: 'Valor', render: (d) => d.valor },
          ]}
          buscarEn={(d) => `${d.moneda} ${d.valor}`}
          nombrePlural="denominaciones"
          filtros={
            <>
              <CampoSelector
                etiqueta="Moneda"
                value={moneda}
                onChange={(evento) => setMoneda(evento.target.value as Moneda | '')}
              >
                <option value="">Todas</option>
                {MONEDAS_SOPORTADAS.map((opcion) => (
                  <option key={opcion} value={opcion}>
                    {ETIQUETAS_MONEDA[opcion]}
                  </option>
                ))}
              </CampoSelector>
              <label className="campo__casilla">
                <input
                  type="checkbox"
                  checked={mostrarInactivas}
                  onChange={(evento) => setMostrarInactivas(evento.target.checked)}
                />
                Mostrar desactivadas
              </label>
            </>
          }
          alEditar={(denominacion) => {
            setMensaje(null);
            setDialogo({ tipo: 'editar', denominacion });
          }}
          alDesactivar={(denominacion) => {
            setMensaje(null);
            desactivar.reset();
            setDialogo({ tipo: 'desactivar', denominacion });
          }}
          alReactivar={(denominacion) => {
            setMensaje(null);
            reactivar.mutate(denominacion);
          }}
        />
      )}

      <Dialogo
        abierto={dialogo?.tipo === 'crear' || dialogo?.tipo === 'editar'}
        alCerrar={() => setDialogo(null)}
        titulo={dialogo?.tipo === 'editar' ? 'Editar denominación' : 'Nueva denominación'}
      >
        <FormularioDenominacion
          denominacion={dialogo?.tipo === 'editar' ? dialogo.denominacion : undefined}
          alGuardar={() => {
            void alExito(
              dialogo?.tipo === 'editar' ? 'Se guardaron los cambios.' : 'Se creó la denominación.',
            );
          }}
          alCancelar={() => setDialogo(null)}
        />
      </Dialogo>

      <DialogoConfirmacion
        abierto={dialogo?.tipo === 'desactivar'}
        titulo="¿Desactivar denominación?"
        textoConfirmar="Sí, desactivar"
        peligrosa
        cargando={desactivar.isPending}
        error={desactivar.isError ? mensajeDe(desactivar.error) : undefined}
        alConfirmar={() =>
          dialogo?.tipo === 'desactivar' && desactivar.mutate(dialogo.denominacion)
        }
        alCancelar={() => setDialogo(null)}
      >
        {dialogo?.tipo === 'desactivar' && <p>Ya no se podrá usar en el conteo de caja.</p>}
      </DialogoConfirmacion>
    </>
  );
}
