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
import { desactivarCuenta, reactivarCuenta } from '../../../modulos/cuentas-dinero/api.js';
import { CLAVE_CUENTAS, useCuentas } from '../../../modulos/cuentas-dinero/consultas.js';
import type { CuentaDinero } from '../../../modulos/cuentas-dinero/tipos.js';

import { FormularioCuenta } from './FormularioCuenta.js';

const ETIQUETAS_TIPO = {
  caja: 'Caja',
  banco: 'Banco',
  billetera: 'Billetera',
} as const;

type DialogoActivo = { tipo: 'crear' } | { tipo: 'editar' | 'desactivar'; cuenta: CuentaDinero };
interface MensajePagina {
  tipo: 'exito' | 'error';
  texto: string;
}

export function PaginaCuentas() {
  useTitulo('Cuentas · Configuración');
  const cliente = useQueryClient();
  const [mostrarInactivas, setMostrarInactivas] = useState(false);
  const [dialogo, setDialogo] = useState<DialogoActivo | null>(null);
  const [mensaje, setMensaje] = useState<MensajePagina | null>(null);

  const lista = useCuentas();

  const alExito = (texto: string) => {
    setMensaje({ tipo: 'exito', texto });
    setDialogo(null);
    return cliente.invalidateQueries({ queryKey: CLAVE_CUENTAS });
  };

  const desactivar = useMutation({
    mutationFn: (cuenta: CuentaDinero) => desactivarCuenta(cuenta.id),
    onSuccess: (_r, cuenta) => alExito(`${cuenta.nombre} fue desactivada.`),
  });
  const reactivar = useMutation({
    mutationFn: (cuenta: CuentaDinero) => reactivarCuenta(cuenta.id),
    onSuccess: (_r, cuenta) => alExito(`${cuenta.nombre} fue reactivada.`),
    onError: (error) => setMensaje({ tipo: 'error', texto: mensajeDe(error) }),
  });

  const cuentas = (lista.data?.cuentas ?? []).filter((c) => mostrarInactivas || c.activa);

  return (
    <>
      <div className="cabecera-pagina cabecera-pagina--acciones">
        <div>
          <h2>Cuentas</h2>
          <p>
            Cajas, cuentas bancarias y billeteras del negocio. Sin saldo todavía: eso llega con las
            operaciones.
          </p>
        </div>
        <Boton
          onClick={() => {
            setMensaje(null);
            setDialogo({ tipo: 'crear' });
          }}
        >
          Nueva cuenta
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

      {lista.isPending && <Cargando texto="Cargando las cuentas…" />}
      {lista.isError && <Aviso tipo="error">{mensajeDe(lista.error)}</Aviso>}
      {lista.data && (
        <TablaCatalogo
          tituloLista="Cuentas de dinero"
          items={cuentas}
          idDe={(c) => c.id}
          nombreDe={(c) => c.nombre}
          activaDe={(c) => c.activa}
          columnas={[
            { encabezado: 'Nombre', render: (c) => c.nombre },
            { encabezado: 'Tipo', render: (c) => ETIQUETAS_TIPO[c.tipo] },
            { encabezado: 'Moneda', render: (c) => c.moneda },
            {
              encabezado: 'Banco',
              render: (c) =>
                c.bancoNombre ? `${c.bancoNombre} ····${c.ultimos4Digitos ?? ''}` : '—',
            },
            { encabezado: 'Sucursal', render: (c) => c.sucursalNombre },
          ]}
          alEditar={(cuenta) => {
            setMensaje(null);
            setDialogo({ tipo: 'editar', cuenta });
          }}
          alDesactivar={(cuenta) => {
            setMensaje(null);
            desactivar.reset();
            setDialogo({ tipo: 'desactivar', cuenta });
          }}
          alReactivar={(cuenta) => {
            setMensaje(null);
            reactivar.mutate(cuenta);
          }}
        />
      )}

      <Dialogo
        abierto={dialogo?.tipo === 'crear' || dialogo?.tipo === 'editar'}
        alCerrar={() => setDialogo(null)}
        titulo={dialogo?.tipo === 'editar' ? 'Editar cuenta' : 'Nueva cuenta'}
        ancho
      >
        <FormularioCuenta
          cuenta={dialogo?.tipo === 'editar' ? dialogo.cuenta : undefined}
          alGuardar={() => {
            void alExito(
              dialogo?.tipo === 'editar' ? 'Se guardaron los cambios.' : 'Se creó la cuenta.',
            );
          }}
          alCancelar={() => setDialogo(null)}
        />
      </Dialogo>

      <DialogoConfirmacion
        abierto={dialogo?.tipo === 'desactivar'}
        titulo="¿Desactivar cuenta?"
        textoConfirmar="Sí, desactivar"
        peligrosa
        cargando={desactivar.isPending}
        error={desactivar.isError ? mensajeDe(desactivar.error) : undefined}
        alConfirmar={() => dialogo?.tipo === 'desactivar' && desactivar.mutate(dialogo.cuenta)}
        alCancelar={() => setDialogo(null)}
      >
        {dialogo?.tipo === 'desactivar' && (
          <p>“{dialogo.cuenta.nombre}” ya no se podrá usar en operaciones nuevas.</p>
        )}
      </DialogoConfirmacion>
    </>
  );
}
