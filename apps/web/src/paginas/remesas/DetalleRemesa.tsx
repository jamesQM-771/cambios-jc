import { formatearMoneda } from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { BotonCopiar } from '../../componentes/BotonCopiar.js';
import { Dialogo } from '../../componentes/Dialogo.js';
import { useNotificar } from '../../componentes/Notificaciones.js';
import { Esqueleto } from '../../componentes/Pagina.js';
import { urlApi, mensajeDe } from '../../lib/api.js';
import { formatearFechaHora, formatearTasa } from '../../lib/formato.js';
import { useSesionActual } from '../../modulos/auth/ContextoSesion.js';
import { formatearCuenta } from '../../modulos/clientes/tipos.js';
import { useBancosDisponibles, useCliente } from '../../modulos/clientes/consultas.js';
import {
  anularRemesa,
  corregirRemesa,
  devolverRemesa,
  liberarRemesa,
  verificarPago,
} from '../../modulos/remesas/api.js';
import {
  CLAVE_REMESAS,
  useGananciaRemesa,
  useHistorialRemesa,
} from '../../modulos/remesas/consultas.js';
import { ETIQUETAS_ESTADO, type Remesa } from '../../modulos/remesas/tipos.js';
import { FormularioMedioPago } from '../clientes/FormularioMedioPago.js';

import { DialogoRecibo } from './DialogoRecibo.js';
import { EtiquetaEstado } from './EtiquetaEstado.js';

interface PropiedadesDetalleRemesa {
  remesa: Remesa;
  alCerrar: () => void;
}

const ESTADOS_ANULABLES = ['registrada', 'pago_verificado', 'en_cola'];

/** Todo lo de una remesa y las acciones que su estado y los permisos de la persona permiten. */
export function DetalleRemesa({ remesa, alCerrar }: PropiedadesDetalleRemesa) {
  const consultas = useQueryClient();
  const notificar = useNotificar();
  const { permisos, empresa } = useSesionActual();
  const zona = empresa?.zonaHoraria ?? 'America/Bogota';
  const historial = useHistorialRemesa(remesa.id);
  const ganancia = useGananciaRemesa(
    remesa.id,
    permisos.includes('ganancia.ver') && remesa.estado === 'completada',
  );
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [devolviendo, setDevolviendo] = useState(false);
  const [motivoDevolucion, setMotivoDevolucion] = useState('');
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [recibo, setRecibo] = useState(false);

  const refrescar = () => consultas.invalidateQueries({ queryKey: CLAVE_REMESAS });
  const verificar = useMutation({
    mutationFn: () => verificarPago(remesa.id),
    onSuccess: refrescar,
  });
  const liberar = useMutation({ mutationFn: () => liberarRemesa(remesa.id), onSuccess: refrescar });
  const anular = useMutation({
    mutationFn: () => anularRemesa(remesa.id, motivo.trim()),
    onSuccess: async () => {
      setAnulando(false);
      await refrescar();
    },
  });

  const devolver = useMutation({
    mutationFn: () => devolverRemesa(remesa.id, motivoDevolucion.trim()),
    onSuccess: async () => {
      setDevolviendo(false);
      setMotivoDevolucion('');
      notificar(
        `Remesa ${String(remesa.numeroComprobante)} devuelta: el dinero salió de la cuenta.`,
      );
      await refrescar();
    },
  });

  const puede = (permiso: (typeof permisos)[number]) => permisos.includes(permiso);
  const { beneficiario, pago } = remesa;
  const errorAccion = verificar.error ?? liberar.error;

  return (
    <div>
      {errorAccion && <Aviso tipo="error">{mensajeDe(errorAccion)}</Aviso>}
      <div className="detalle-remesa__cabecera">
        <h3>Comprobante N° {remesa.numeroComprobante}</h3>
        <EtiquetaEstado estado={remesa.estado} />
      </div>
      <dl className="datos-registro">
        <dt>Fecha</dt>
        <dd>{formatearFechaHora(remesa.creadoEn, zona)}</dd>
        <dt>Registró</dt>
        <dd>{remesa.creadoPor.nombre}</dd>
        <dt>Remitente</dt>
        <dd>
          {remesa.remitente.nombre} · {remesa.remitente.tipoDocumento}{' '}
          {remesa.remitente.numeroDocumento}
        </dd>
        <dt>Beneficiario</dt>
        <dd>
          {beneficiario.titular} · {beneficiario.tipoDocumentoTitular}{' '}
          {beneficiario.numeroDocumentoTitular}
        </dd>
        <dt>Dónde recibe</dt>
        <dd className="mono">
          {beneficiario.banco.nombre} ·{' '}
          {beneficiario.tipo === 'cuenta_bancaria'
            ? formatearCuenta(beneficiario.numeroCuenta ?? '')
            : `Pago móvil ${beneficiario.telefonoPagoMovil ?? ''}`}
        </dd>
        <dt>Entregó</dt>
        <dd className="mono">{formatearMoneda(remesa.montoPesos, 'COP')}</dd>
        <dt>Recibe</dt>
        <dd className="mono">{formatearMoneda(remesa.montoBolivares, 'VES')}</dd>
        <dt>Tasa usada</dt>
        <dd className="mono">
          {formatearTasa(remesa.tasaUsada)}
          {remesa.motivoTasa ? ` · Cambiada: ${remesa.motivoTasa}` : ''}
        </dd>
        <dt>Forma de pago</dt>
        <dd>
          {remesa.formaPago === 'efectivo' ? 'Efectivo' : 'Transferencia'} ·{' '}
          {remesa.cuentaIngreso.nombre}
        </dd>
        {pago.operador && (
          <>
            <dt>Pagó</dt>
            <dd>{pago.operador.nombre}</dd>
          </>
        )}
        {pago.referenciaBancaria && (
          <>
            <dt>Referencia</dt>
            <dd className="mono">{pago.referenciaBancaria}</dd>
          </>
        )}
        {pago.costoBancario && (
          <>
            <dt>Costo bancario</dt>
            <dd className="mono">{formatearMoneda(pago.costoBancario, 'VES')}</dd>
          </>
        )}
        {ganancia.data?.ganancia && (
          <>
            <dt>Costo de los bolívares</dt>
            <dd className="mono">{formatearTasa(ganancia.data.ganancia.costoPromedio)}</dd>
            <dt>Ganancia neta</dt>
            <dd className="mono">
              {formatearMoneda(ganancia.data.ganancia.neta, 'COP')}
              {ganancia.data.ganancia.costoBancarioPesos !== '0.00' &&
                ` (bruta ${formatearMoneda(ganancia.data.ganancia.bruta, 'COP')} − costo bancario ${formatearMoneda(ganancia.data.ganancia.costoBancarioPesos, 'COP')})`}
            </dd>
          </>
        )}
        {ganancia.data && !ganancia.data.ganancia && (
          <>
            <dt>Ganancia</dt>
            <dd>Sin costo conocido: falta cargar compras o el inventario inicial.</dd>
          </>
        )}
        <dt>Seguimiento</dt>
        <dd>
          <span className="mono">{remesa.codigoSeguimiento}</span>{' '}
          <BotonCopiar texto={remesa.codigoSeguimiento} etiqueta="Copiar código" />
        </dd>
      </dl>

      {pago.tieneComprobante && (
        <figure className="comprobante">
          <img
            src={urlApi(`/remesas/${remesa.id}/comprobante`)}
            alt={`Captura del comprobante del pago de la remesa ${String(remesa.numeroComprobante)}`}
          />
          <figcaption>Captura que cargó quien pagó.</figcaption>
        </figure>
      )}

      <h3>Historial</h3>
      {historial.isPending && <Esqueleto filas={3} texto="Cargando el historial…" />}
      {historial.data && (
        <ol className="historial">
          {historial.data.historial.map((evento) => (
            <li key={`${evento.estadoNuevo}-${evento.creadoEn}`}>
              <strong>{ETIQUETAS_ESTADO[evento.estadoNuevo]}</strong>
              <span>
                {formatearFechaHora(evento.creadoEn, zona)} · {evento.usuario.nombre}
              </span>
              {evento.motivo && <small>{evento.motivo}</small>}
            </li>
          ))}
        </ol>
      )}

      <div className="acciones">
        {remesa.estado === 'registrada' && puede('remesa.verificar_pago') && (
          <Boton cargando={verificar.isPending} onClick={() => verificar.mutate()}>
            Verificar pago recibido
          </Boton>
        )}
        {remesa.estado === 'con_incidencia' && puede('remesa.registrar') && (
          <Boton onClick={() => setCorrigiendo(true)}>Corregir datos de pago</Boton>
        )}
        {remesa.estado === 'con_incidencia' && puede('remesa.devolver') && (
          <Boton variante="peligro" onClick={() => setDevolviendo(true)}>
            Devolver el dinero
          </Boton>
        )}
        {remesa.estado === 'tomada' && puede('remesa.liberar') && (
          <Boton
            variante="secundario"
            cargando={liberar.isPending}
            onClick={() => liberar.mutate()}
          >
            Liberar
          </Boton>
        )}
        {puede('remesa.registrar') &&
          remesa.estado !== 'anulada' &&
          remesa.estado !== 'devuelta' && (
            <Boton variante="secundario" onClick={() => setRecibo(true)}>
              Recibo
            </Boton>
          )}
        {ESTADOS_ANULABLES.includes(remesa.estado) && puede('remesa.anular') && (
          <Boton variante="peligro" onClick={() => setAnulando(true)}>
            Anular
          </Boton>
        )}
      </div>
      <div className="acciones acciones--derecha">
        <Boton variante="secundario" onClick={alCerrar}>
          Cerrar
        </Boton>
      </div>

      <Dialogo abierto={anulando} alCerrar={() => setAnulando(false)} titulo="Anular remesa">
        <p>
          La remesa N° {remesa.numeroComprobante} dejará de estar disponible para pagarse. Queda el
          registro con el motivo.
        </p>
        {anular.isError && <Aviso tipo="error">{mensajeDe(anular.error)}</Aviso>}
        <div className="campo">
          <label className="campo__etiqueta" htmlFor="motivo-anulacion">
            Motivo
          </label>
          <textarea
            id="motivo-anulacion"
            className="campo__entrada"
            rows={3}
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
          />
        </div>
        <div className="acciones acciones--derecha">
          <Boton
            variante="secundario"
            onClick={() => setAnulando(false)}
            disabled={anular.isPending}
          >
            Volver
          </Boton>
          <Boton
            variante="peligro"
            cargando={anular.isPending}
            disabled={motivo.trim().length < 3}
            onClick={() => anular.mutate()}
          >
            Anular remesa
          </Boton>
        </div>
      </Dialogo>

      <Dialogo
        abierto={devolviendo}
        alCerrar={() => setDevolviendo(false)}
        titulo="Devolver el dinero al cliente"
      >
        <p>
          Se le devuelven al cliente{' '}
          <strong className="mono">{formatearMoneda(remesa.montoPesos, 'COP')}</strong>, el monto
          completo, por la misma cuenta por la que entraron:{' '}
          <strong>{remesa.cuentaIngreso.nombre}</strong>. La remesa N° {remesa.numeroComprobante}{' '}
          queda como devuelta y ya no se puede pagar ni anular.
        </p>
        {devolver.isError && <Aviso tipo="error">{mensajeDe(devolver.error)}</Aviso>}
        <div className="campo">
          <label className="campo__etiqueta" htmlFor="motivo-devolucion">
            Motivo
          </label>
          <textarea
            id="motivo-devolucion"
            className="campo__entrada"
            rows={3}
            value={motivoDevolucion}
            onChange={(evento) => setMotivoDevolucion(evento.target.value)}
          />
        </div>
        <div className="acciones acciones--derecha">
          <Boton
            variante="secundario"
            onClick={() => setDevolviendo(false)}
            disabled={devolver.isPending}
          >
            Volver
          </Boton>
          <Boton
            variante="peligro"
            cargando={devolver.isPending}
            disabled={motivoDevolucion.trim().length < 3}
            onClick={() => devolver.mutate()}
          >
            Devolver el dinero
          </Boton>
        </div>
      </Dialogo>

      <Dialogo
        abierto={corrigiendo}
        alCerrar={() => setCorrigiendo(false)}
        titulo="Corregir datos de pago"
      >
        {corrigiendo && (
          <CorregirPago
            remesa={remesa}
            alTerminar={async () => {
              setCorrigiendo(false);
              await refrescar();
            }}
            alCancelar={() => setCorrigiendo(false)}
          />
        )}
      </Dialogo>

      <DialogoRecibo remesa={recibo ? remesa : null} alCerrar={() => setRecibo(false)} />
    </div>
  );
}

interface PropiedadesCorregirPago {
  remesa: Remesa;
  alTerminar: () => void | Promise<void>;
  alCancelar: () => void;
}

/** Elige otros datos de pago del beneficiario (o agrega unos nuevos) y devuelve la remesa a la cola. */
function CorregirPago({ remesa, alTerminar, alCancelar }: PropiedadesCorregirPago) {
  const beneficiario = useCliente(remesa.beneficiario.cliente.id);
  const bancos = useBancosDisponibles();
  const [elegido, setElegido] = useState('');
  const [nota, setNota] = useState('');
  const [agregando, setAgregando] = useState(false);

  const corregir = useMutation({
    mutationFn: () =>
      corregirRemesa(remesa.id, elegido, nota.trim() === '' ? undefined : nota.trim()),
    onSuccess: alTerminar,
  });

  const medios = (beneficiario.data?.cliente.mediosPago ?? []).filter((m) => m.activo);

  if (agregando) {
    return (
      <FormularioMedioPago
        clienteId={remesa.beneficiario.cliente.id}
        titularInicial={remesa.beneficiario.cliente.nombre}
        bancos={bancos.data?.bancos ?? []}
        alGuardar={(medio) => {
          setAgregando(false);
          setElegido(medio.id);
        }}
        alCancelar={() => setAgregando(false)}
      />
    );
  }

  return (
    <div>
      {corregir.isError && <Aviso tipo="error">{mensajeDe(corregir.error)}</Aviso>}
      <p>Elige a dónde se debe pagar. La remesa vuelve a la cola con el mismo monto.</p>
      {beneficiario.isPending && <Esqueleto filas={2} texto="Cargando datos de pago…" />}
      <fieldset className="medios-pago">
        <legend className="campo__etiqueta">Datos de pago</legend>
        {medios.map((medio) => (
          <label key={medio.id} className="medios-pago__opcion">
            <input
              type="radio"
              name="corregir-medio"
              checked={elegido === medio.id}
              onChange={() => setElegido(medio.id)}
            />
            <span>
              {medio.banco.nombre} ·{' '}
              {medio.tipo === 'cuenta_bancaria'
                ? formatearCuenta(medio.numeroCuenta ?? '')
                : (medio.telefonoPagoMovil ?? '')}{' '}
              · {medio.titular}
              {medio.id === remesa.beneficiario.medioPagoId ? ' (el actual)' : ''}
            </span>
          </label>
        ))}
        <div>
          <Boton variante="fantasma" chico onClick={() => setAgregando(true)}>
            Agregar cuenta o pago móvil
          </Boton>
        </div>
      </fieldset>
      <div className="campo">
        <label className="campo__etiqueta" htmlFor="nota-correccion">
          Nota (opcional)
        </label>
        <input
          id="nota-correccion"
          className="campo__entrada"
          value={nota}
          onChange={(evento) => setNota(evento.target.value)}
        />
      </div>
      <div className="acciones acciones--derecha">
        <Boton variante="secundario" onClick={alCancelar} disabled={corregir.isPending}>
          Cancelar
        </Boton>
        <Boton
          cargando={corregir.isPending}
          disabled={elegido === ''}
          onClick={() => corregir.mutate()}
        >
          Devolver a la cola
        </Boton>
      </div>
    </div>
  );
}
