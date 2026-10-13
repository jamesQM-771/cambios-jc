import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { CampoSelector } from '../../componentes/CampoSelector.js';
import { erroresPorCampo, mensajeDe } from '../../lib/api.js';
import { agregarMedioPago } from '../../modulos/clientes/api.js';
import { CLAVE_CLIENTES } from '../../modulos/clientes/consultas.js';
import {
  TIPOS_DOCUMENTO,
  type DatosMedioPagoNuevo,
  type MedioPago,
  type TipoDocumento,
  type TipoMedioPago,
} from '../../modulos/clientes/tipos.js';
import { CLAVE_REMESAS } from '../../modulos/remesas/consultas.js';

export interface BancoOpcion {
  id: string;
  codigo: string;
  nombre: string;
}

interface PropiedadesFormularioMedioPago {
  clienteId: string;
  /** Titular propuesto (por lo general el mismo beneficiario). */
  titularInicial?: string;
  bancos: readonly BancoOpcion[];
  alGuardar: (medio: MedioPago) => void;
  alCancelar: () => void;
}

/** Datos para pagar al beneficiario: cuenta bancaria (20 dígitos) o pago móvil. */
export function FormularioMedioPago({
  clienteId,
  titularInicial = '',
  bancos,
  alGuardar,
  alCancelar,
}: PropiedadesFormularioMedioPago) {
  const consultas = useQueryClient();
  const [tipo, setTipo] = useState<TipoMedioPago>('cuenta_bancaria');
  const [bancoId, setBancoId] = useState(bancos[0]?.id ?? '');
  const [numeroCuenta, setNumeroCuenta] = useState('');
  const [telefono, setTelefono] = useState('');
  const [titular, setTitular] = useState(titularInicial);
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>('V');
  const [numeroDocumento, setNumeroDocumento] = useState('');

  const guardar = useMutation({
    mutationFn: () => {
      const comun = {
        bancoId,
        titular: titular.trim(),
        tipoDocumentoTitular: tipoDocumento,
        numeroDocumentoTitular: numeroDocumento.trim(),
      };
      const datos: DatosMedioPagoNuevo =
        tipo === 'cuenta_bancaria'
          ? { tipo, numeroCuenta, ...comun }
          : { tipo, telefonoPagoMovil: telefono, ...comun };
      return agregarMedioPago(clienteId, datos);
    },
    onSuccess: async ({ medioPago }) => {
      await Promise.all([
        consultas.invalidateQueries({ queryKey: CLAVE_CLIENTES }),
        consultas.invalidateQueries({ queryKey: CLAVE_REMESAS }),
      ]);
      alGuardar(medioPago);
    },
  });

  const delServidor = erroresPorCampo(guardar.error);
  const banco = bancos.find((b) => b.id === bancoId);

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    guardar.mutate();
  };

  return (
    <form onSubmit={enviar} noValidate>
      {guardar.isError && <Aviso tipo="error">{mensajeDe(guardar.error)}</Aviso>}
      <div className="campos-en-fila">
        <CampoSelector
          etiqueta="Forma de recibir"
          value={tipo}
          onChange={(evento) => setTipo(evento.target.value as TipoMedioPago)}
        >
          <option value="cuenta_bancaria">Cuenta bancaria</option>
          <option value="pago_movil">Pago móvil</option>
        </CampoSelector>
        <CampoSelector
          etiqueta="Banco"
          value={bancoId}
          onChange={(evento) => setBancoId(evento.target.value)}
          error={delServidor.bancoId}
        >
          {bancos.map((opcion) => (
            <option key={opcion.id} value={opcion.id}>
              {opcion.codigo} · {opcion.nombre}
            </option>
          ))}
        </CampoSelector>
      </div>
      {tipo === 'cuenta_bancaria' ? (
        <Campo
          etiqueta="Número de cuenta"
          inputMode="numeric"
          autoComplete="off"
          required
          value={numeroCuenta}
          onChange={(evento) => setNumeroCuenta(evento.target.value.replace(/[^\d\s-]/g, ''))}
          ayuda={`20 dígitos${banco ? `; deben empezar por ${banco.codigo}` : ''}.`}
          error={delServidor.numeroCuenta}
        />
      ) : (
        <Campo
          etiqueta="Teléfono del pago móvil"
          inputMode="numeric"
          autoComplete="off"
          required
          value={telefono}
          onChange={(evento) => setTelefono(evento.target.value.replace(/[^\d\s-]/g, ''))}
          ayuda="11 dígitos, empezando por 0 (ejemplo: 04141234567)."
          error={delServidor.telefonoPagoMovil}
        />
      )}
      <Campo
        etiqueta="Titular de la cuenta"
        autoComplete="off"
        required
        value={titular}
        onChange={(evento) => setTitular(evento.target.value)}
        error={delServidor.titular}
      />
      <div className="campos-en-fila">
        <CampoSelector
          etiqueta="Documento del titular"
          value={tipoDocumento}
          onChange={(evento) => setTipoDocumento(evento.target.value as TipoDocumento)}
        >
          {TIPOS_DOCUMENTO.map((opcion) => (
            <option key={opcion} value={opcion}>
              {opcion}
            </option>
          ))}
        </CampoSelector>
        <Campo
          etiqueta="Número del documento"
          autoComplete="off"
          required
          value={numeroDocumento}
          onChange={(evento) => setNumeroDocumento(evento.target.value)}
          error={delServidor.numeroDocumentoTitular}
        />
      </div>
      <div className="acciones acciones--derecha">
        <Boton variante="secundario" onClick={alCancelar} disabled={guardar.isPending}>
          Cancelar
        </Boton>
        <Boton
          type="submit"
          cargando={guardar.isPending}
          disabled={
            bancoId === '' ||
            titular.trim().length < 2 ||
            numeroDocumento.trim().length < 4 ||
            (tipo === 'cuenta_bancaria' ? numeroCuenta.trim() === '' : telefono.trim() === '')
          }
        >
          Guardar datos de pago
        </Boton>
      </div>
    </form>
  );
}
