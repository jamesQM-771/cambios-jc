import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Esqueleto } from '../../componentes/Pagina.js';
import { mensajeDe } from '../../lib/api.js';
import {
  desactivarCliente,
  desactivarMedioPago,
  reactivarCliente,
  reactivarMedioPago,
} from '../../modulos/clientes/api.js';
import {
  CLAVE_CLIENTES,
  useBancosDisponibles,
  useCliente,
} from '../../modulos/clientes/consultas.js';
import { formatearCuenta, type MedioPago } from '../../modulos/clientes/tipos.js';
import { formatearTelefono } from '../../lib/telefono.js';

import { FormularioCliente } from './FormularioCliente.js';
import { FormularioMedioPago } from './FormularioMedioPago.js';

interface PropiedadesDetalleCliente {
  clienteId: string;
  alCerrar: () => void;
}

/** Ficha de un cliente: datos, estado y sus medios de pago (cuentas y pagos móviles). */
export function DetalleCliente({ clienteId, alCerrar }: PropiedadesDetalleCliente) {
  const consultas = useQueryClient();
  const detalle = useCliente(clienteId);
  const bancos = useBancosDisponibles();
  const [editando, setEditando] = useState(false);
  const [agregando, setAgregando] = useState(false);

  const refrescar = () => consultas.invalidateQueries({ queryKey: CLAVE_CLIENTES });

  const cambiarCliente = useMutation({
    mutationFn: (activar: boolean) =>
      activar ? reactivarCliente(clienteId) : desactivarCliente(clienteId),
    onSuccess: refrescar,
  });
  const cambiarMedio = useMutation({
    mutationFn: (medio: MedioPago) =>
      medio.activo
        ? desactivarMedioPago(clienteId, medio.id)
        : reactivarMedioPago(clienteId, medio.id),
    onSuccess: refrescar,
  });

  if (detalle.isPending) return <Esqueleto texto="Cargando el cliente…" />;
  if (detalle.isError) return <Aviso tipo="error">{mensajeDe(detalle.error)}</Aviso>;
  const { cliente } = detalle.data;

  if (editando) {
    return (
      <FormularioCliente
        cliente={cliente}
        alGuardar={() => setEditando(false)}
        alCancelar={() => setEditando(false)}
      />
    );
  }
  if (agregando) {
    return (
      <FormularioMedioPago
        clienteId={cliente.id}
        titularInicial={cliente.nombre}
        bancos={bancos.data?.bancos ?? []}
        alGuardar={() => setAgregando(false)}
        alCancelar={() => setAgregando(false)}
      />
    );
  }

  return (
    <div>
      {(cambiarCliente.isError || cambiarMedio.isError) && (
        <Aviso tipo="error">{mensajeDe(cambiarCliente.error ?? cambiarMedio.error)}</Aviso>
      )}
      <dl className="datos-registro">
        <dt>Documento</dt>
        <dd className="mono">
          {cliente.tipoDocumento} {cliente.numeroDocumento}
        </dd>
        <dt>Teléfono</dt>
        <dd>{cliente.telefono ? formatearTelefono(cliente.telefono) : '—'}</dd>
        <dt>Estado</dt>
        <dd>
          <span className={`etiqueta ${cliente.activo ? 'etiqueta--exito' : ''}`}>
            {cliente.activo ? 'Activo' : 'Desactivado'}
          </span>
        </dd>
      </dl>
      <div className="acciones">
        <Boton variante="secundario" chico onClick={() => setEditando(true)}>
          Editar datos
        </Boton>
        <Boton
          variante={cliente.activo ? 'peligro' : 'secundario'}
          chico
          cargando={cambiarCliente.isPending}
          onClick={() => cambiarCliente.mutate(!cliente.activo)}
        >
          {cliente.activo ? 'Desactivar cliente' : 'Reactivar cliente'}
        </Boton>
      </div>

      <h3>Datos de pago</h3>
      {cliente.mediosPago.length === 0 ? (
        <p>Todavía no tiene cuentas ni pagos móviles registrados.</p>
      ) : (
        <ul className="lista-medios">
          {cliente.mediosPago.map((medio) => (
            <li key={medio.id} className={medio.activo ? undefined : 'lista-medios__inactivo'}>
              <div>
                <strong>{medio.banco.nombre}</strong>
                <span className="mono">
                  {medio.tipo === 'cuenta_bancaria'
                    ? formatearCuenta(medio.numeroCuenta ?? '')
                    : (medio.telefonoPagoMovil ?? '')}
                </span>
                <small>
                  {medio.titular} · {medio.tipoDocumentoTitular} {medio.numeroDocumentoTitular}
                  {medio.activo ? '' : ' · Desactivado'}
                </small>
              </div>
              <Boton
                variante="fantasma"
                chico
                cargando={cambiarMedio.isPending && cambiarMedio.variables.id === medio.id}
                onClick={() => cambiarMedio.mutate(medio)}
              >
                {medio.activo ? 'Desactivar' : 'Reactivar'}
              </Boton>
            </li>
          ))}
        </ul>
      )}
      <div className="acciones">
        <Boton chico disabled={!cliente.activo} onClick={() => setAgregando(true)}>
          Agregar cuenta o pago móvil
        </Boton>
      </div>
      <div className="acciones acciones--derecha">
        <Boton variante="secundario" onClick={alCerrar}>
          Cerrar
        </Boton>
      </div>
    </div>
  );
}
