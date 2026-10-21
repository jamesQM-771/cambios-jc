import { bolivaresDesdePesos, formatearMoneda, multiplicar } from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { CampoSelector } from '../../componentes/CampoSelector.js';
import { Dialogo } from '../../componentes/Dialogo.js';
import { SeccionFormulario } from '../../componentes/Pagina.js';
import { erroresPorCampo, mensajeDe } from '../../lib/api.js';
import { avisoDecimalAmbiguo, formatearTasa, normalizarDecimal } from '../../lib/formato.js';
import { useBancosDisponibles, useCliente } from '../../modulos/clientes/consultas.js';
import { resumenMedioPago, type Cliente } from '../../modulos/clientes/tipos.js';
import { registrarRemesa } from '../../modulos/remesas/api.js';
import { CLAVE_REMESAS } from '../../modulos/remesas/consultas.js';
import type { FormaPago, OpcionesRemesa, Remesa } from '../../modulos/remesas/tipos.js';
import { FormularioCliente } from '../clientes/FormularioCliente.js';
import { FormularioMedioPago } from '../clientes/FormularioMedioPago.js';

import { SelectorCliente } from './SelectorCliente.js';

interface PropiedadesFormularioRemesa {
  opciones: OpcionesRemesa;
  /** Con el permiso `tasa.cambiar_en_operacion` se puede usar otra tasa, con motivo. */
  puedeCambiarTasa: boolean;
  alRegistrar: (remesa: Remesa) => void;
  alCancelar: () => void;
}

type ModoMonto = 'pesos' | 'bolivares';

/** Cálculo solo para mostrar: el servidor vuelve a calcular y es el que cuenta (D101). */
function vistaPrevia(modo: ModoMonto, monto: string, tasa: string | null): string | null {
  if (!tasa || monto === '' || !/^\d+(\.\d+)?$/.test(monto)) return null;
  try {
    if (modo === 'pesos') {
      return formatearMoneda(bolivaresDesdePesos(monto, tasa), 'VES');
    }
    return formatearMoneda(multiplicar(monto, tasa), 'COP');
  } catch {
    return null;
  }
}

export function FormularioRemesa({
  opciones,
  puedeCambiarTasa,
  alRegistrar,
  alCancelar,
}: PropiedadesFormularioRemesa) {
  const consultas = useQueryClient();
  // Una clave por formulario abierto: un reintento por mala conexión no duplica la remesa (D101).
  const clave = useRef(crypto.randomUUID());
  const [remitente, setRemitente] = useState<Cliente | null>(null);
  const [beneficiario, setBeneficiario] = useState<Cliente | null>(null);
  const [medioPagoId, setMedioPagoId] = useState('');
  const [agregandoMedio, setAgregandoMedio] = useState(false);
  // Los diálogos van fuera del <form> (un formulario dentro de otro no es válido en HTML).
  const [registrandoCliente, setRegistrandoCliente] = useState<'remitente' | 'beneficiario' | null>(
    null,
  );
  const [lineaId, setLineaId] = useState(opciones.lineas.find((l) => l.tasaVenta)?.id ?? '');
  const [formaPago, setFormaPago] = useState<FormaPago>('efectivo');
  const [cuentaElegida, setCuentaElegida] = useState('');
  const [modo, setModo] = useState<ModoMonto>('pesos');
  const [monto, setMonto] = useState('');
  const [cambiarTasa, setCambiarTasa] = useState(false);
  const [tasaManual, setTasaManual] = useState('');
  const [motivoTasa, setMotivoTasa] = useState('');

  const bancos = useBancosDisponibles();
  const detalleBeneficiario = useCliente(beneficiario?.id ?? null);
  const medios = (detalleBeneficiario.data?.cliente.mediosPago ?? []).filter((m) => m.activo);
  const medioElegido =
    medios.find((m) => m.id === medioPagoId) ?? (medios.length === 1 ? medios[0] : undefined);

  const linea = opciones.lineas.find((l) => l.id === lineaId);
  // El efectivo solo entra a la caja del propio turno: es la que se arquea al cerrarlo.
  const cuentas = opciones.cuentasIngreso.filter(
    (c) =>
      c.moneda === linea?.monedaOrigen &&
      (formaPago === 'efectivo') === (c.tipo === 'caja') &&
      (formaPago !== 'efectivo' || c.cajaId === opciones.miTurno?.caja.id),
  );
  const cuentaId = cuentas.some((c) => c.id === cuentaElegida)
    ? cuentaElegida
    : (cuentas[0]?.id ?? '');

  const montoNormalizado = normalizarDecimal(monto);
  const avisoMonto = avisoDecimalAmbiguo(monto);
  const tasaNormalizada = normalizarDecimal(tasaManual);
  const tasaUsada =
    cambiarTasa && tasaNormalizada !== '' ? tasaNormalizada : (linea?.tasaVenta ?? null);
  const previa = avisoMonto ? null : vistaPrevia(modo, montoNormalizado, tasaUsada);

  const registrar = useMutation({
    mutationFn: () =>
      registrarRemesa({
        claveIdempotencia: clave.current,
        lineaNegocioId: lineaId,
        remitenteId: remitente?.id ?? '',
        medioPagoId: medioElegido?.id ?? '',
        formaPago,
        cuentaIngresoId: cuentaId,
        ...(modo === 'pesos'
          ? { montoPesos: montoNormalizado }
          : { montoBolivares: montoNormalizado }),
        ...(cambiarTasa
          ? { tasaManual: { tasa: tasaNormalizada, motivo: motivoTasa.trim() } }
          : {}),
      }),
    onSuccess: async ({ remesa }) => {
      await consultas.invalidateQueries({ queryKey: CLAVE_REMESAS });
      alRegistrar(remesa);
    },
  });

  const delServidor = erroresPorCampo(registrar.error);
  const completo =
    remitente !== null &&
    medioElegido !== undefined &&
    lineaId !== '' &&
    cuentaId !== '' &&
    montoNormalizado !== '' &&
    !avisoMonto &&
    (!cambiarTasa || (tasaNormalizada !== '' && motivoTasa.trim().length >= 3));

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    if (completo) registrar.mutate();
  };

  if (opciones.lineas.length === 0) {
    return (
      <Aviso tipo="advertencia">
        No hay una línea de remesas activa. Pídele al administrador que la configure.
      </Aviso>
    );
  }

  if (!opciones.miTurno) {
    return (
      <Aviso tipo="advertencia">
        No tienes un turno de caja abierto. Ábrelo antes de registrar una remesa.
      </Aviso>
    );
  }

  return (
    <>
      <form onSubmit={enviar} noValidate>
        {registrar.isError && <Aviso tipo="error">{mensajeDe(registrar.error)}</Aviso>}

        <SeccionFormulario titulo="Remitente" descripcion="Quien entrega el dinero en el local.">
          <SelectorCliente
            etiqueta="Remitente"
            valor={remitente}
            alCambiar={setRemitente}
            alRegistrarNuevo={() => setRegistrandoCliente('remitente')}
          />
        </SeccionFormulario>

        <SeccionFormulario titulo="Beneficiario" descripcion="Quien recibe los bolívares.">
          <SelectorCliente
            etiqueta="Beneficiario"
            valor={beneficiario}
            alCambiar={(cliente) => {
              setBeneficiario(cliente);
              setMedioPagoId('');
            }}
            alRegistrarNuevo={() => setRegistrandoCliente('beneficiario')}
          />
          {beneficiario && (
            <fieldset className="medios-pago">
              <legend className="campo__etiqueta">Dónde recibe</legend>
              {detalleBeneficiario.isPending && <span className="campo__ayuda">Cargando…</span>}
              {medios.map((medio) => (
                <label key={medio.id} className="medios-pago__opcion">
                  <input
                    type="radio"
                    name="medio-pago"
                    checked={medioElegido?.id === medio.id}
                    onChange={() => setMedioPagoId(medio.id)}
                  />
                  <span>{resumenMedioPago(medio)}</span>
                </label>
              ))}
              {detalleBeneficiario.data && medios.length === 0 && (
                <span className="campo__ayuda">Todavía no tiene cuenta ni pago móvil.</span>
              )}
              <div>
                <Boton variante="fantasma" chico onClick={() => setAgregandoMedio(true)}>
                  Agregar cuenta o pago móvil
                </Boton>
              </div>
            </fieldset>
          )}
          {delServidor.medioPagoId && <p className="campo__error">{delServidor.medioPagoId}</p>}
        </SeccionFormulario>

        <SeccionFormulario titulo="Montos" descripcion="El servidor calcula con la tasa vigente.">
          {opciones.lineas.length > 1 && (
            <CampoSelector
              etiqueta="Línea de negocio"
              value={lineaId}
              onChange={(evento) => setLineaId(evento.target.value)}
            >
              {opciones.lineas.map((opcion) => (
                <option key={opcion.id} value={opcion.id} disabled={!opcion.tasaVenta}>
                  {opcion.nombre}
                  {opcion.tasaVenta ? '' : ' (sin tasa)'}
                </option>
              ))}
            </CampoSelector>
          )}
          {linea?.tasaVenta ? (
            <p className="tasa-aplicada">
              Tasa vigente: <strong className="mono">{formatearTasa(linea.tasaVenta)}</strong>
            </p>
          ) : (
            <Aviso tipo="advertencia">Esta línea todavía no tiene una tasa publicada.</Aviso>
          )}
          <div className="campos-en-fila">
            <CampoSelector
              etiqueta="Forma de pago del cliente"
              value={formaPago}
              onChange={(evento) => setFormaPago(evento.target.value as FormaPago)}
            >
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
            </CampoSelector>
            <CampoSelector
              etiqueta={formaPago === 'efectivo' ? 'Caja donde entra' : 'Cuenta donde entra'}
              value={cuentaId}
              onChange={(evento) => setCuentaElegida(evento.target.value)}
              error={delServidor.cuentaIngresoId}
            >
              {cuentas.length === 0 && <option value="">Sin cuentas disponibles</option>}
              {cuentas.map((cuenta) => (
                <option key={cuenta.id} value={cuenta.id}>
                  {cuenta.nombre}
                </option>
              ))}
            </CampoSelector>
          </div>
          <div className="campos-en-fila">
            <CampoSelector
              etiqueta="Quién fija el monto"
              value={modo}
              onChange={(evento) => setModo(evento.target.value as ModoMonto)}
            >
              <option value="pesos">El cliente entrega pesos</option>
              <option value="bolivares">El beneficiario recibe bolívares</option>
            </CampoSelector>
            <Campo
              etiqueta={modo === 'pesos' ? 'Pesos entregados (COP)' : 'Bolívares a enviar (VES)'}
              inputMode="decimal"
              autoComplete="off"
              required
              value={monto}
              onChange={(evento) => setMonto(evento.target.value)}
              error={avisoMonto ?? delServidor.montoPesos ?? delServidor.montoBolivares}
            />
          </div>
          {previa && (
            <p className="vista-previa" role="status">
              {modo === 'pesos' ? 'El beneficiario recibe' : 'El cliente entrega'}{' '}
              <strong className="mono">{previa}</strong>
            </p>
          )}

          {puedeCambiarTasa && (
            <>
              <label className="campo__casilla">
                <input
                  type="checkbox"
                  checked={cambiarTasa}
                  onChange={(evento) => setCambiarTasa(evento.target.checked)}
                />
                Usar otra tasa en esta remesa
              </label>
              {cambiarTasa && (
                <div className="campos-en-fila">
                  <Campo
                    etiqueta="Tasa para esta remesa"
                    inputMode="decimal"
                    autoComplete="off"
                    value={tasaManual}
                    onChange={(evento) => setTasaManual(evento.target.value)}
                  />
                  <Campo
                    etiqueta="Motivo del cambio"
                    autoComplete="off"
                    value={motivoTasa}
                    onChange={(evento) => setMotivoTasa(evento.target.value)}
                    error={delServidor['tasaManual.motivo']}
                  />
                </div>
              )}
            </>
          )}
        </SeccionFormulario>

        <div className="acciones acciones--derecha">
          <Boton variante="secundario" onClick={alCancelar} disabled={registrar.isPending}>
            Cancelar
          </Boton>
          <Boton type="submit" cargando={registrar.isPending} disabled={!completo}>
            Registrar remesa
          </Boton>
        </div>
      </form>

      <Dialogo
        abierto={registrandoCliente !== null}
        alCerrar={() => setRegistrandoCliente(null)}
        titulo="Nuevo cliente"
      >
        <FormularioCliente
          alGuardar={(cliente) => {
            if (registrandoCliente === 'remitente') setRemitente(cliente);
            else {
              setBeneficiario(cliente);
              setMedioPagoId('');
            }
            setRegistrandoCliente(null);
          }}
          alCancelar={() => setRegistrandoCliente(null)}
        />
      </Dialogo>

      <Dialogo
        abierto={agregandoMedio}
        alCerrar={() => setAgregandoMedio(false)}
        titulo="Datos de pago del beneficiario"
      >
        {beneficiario && (
          <FormularioMedioPago
            clienteId={beneficiario.id}
            titularInicial={beneficiario.nombre}
            bancos={bancos.data?.bancos ?? []}
            alGuardar={(medio) => {
              setAgregandoMedio(false);
              setMedioPagoId(medio.id);
            }}
            alCancelar={() => setAgregandoMedio(false)}
          />
        )}
      </Dialogo>
    </>
  );
}
