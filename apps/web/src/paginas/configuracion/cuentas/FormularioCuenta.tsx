import type { Moneda } from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../../componentes/Aviso.js';
import { Boton } from '../../../componentes/Boton.js';
import { Campo } from '../../../componentes/Campo.js';
import { CampoSelector } from '../../../componentes/CampoSelector.js';
import { erroresPorCampo, mensajeDe } from '../../../lib/api.js';
import { ETIQUETAS_MONEDA, MONEDAS_SOPORTADAS } from '../../../lib/formato.js';
import { useSesionActual } from '../../../modulos/auth/ContextoSesion.js';
import { useBancos } from '../../../modulos/bancos/consultas.js';
import { useOpcionesContraparte } from '../../../modulos/contrapartes/consultas.js';
import { crearCuenta, editarCuenta } from '../../../modulos/cuentas-dinero/api.js';
import { CLAVE_CUENTAS } from '../../../modulos/cuentas-dinero/consultas.js';
import type {
  CambiosCuenta,
  CuentaDinero,
  TipoCuenta,
} from '../../../modulos/cuentas-dinero/tipos.js';
import { useSucursales, useUsuarios } from '../../../modulos/usuarios/consultas.js';

const ETIQUETAS_TIPO: Record<TipoCuenta, string> = {
  caja: 'Caja (efectivo)',
  banco: 'Cuenta bancaria',
  billetera: 'Billetera',
};

// Vacío = "sin límite" o "sin comisión": el campo queda opcional, no en cero.
const aNuloOVacio = (valor: string): string | null => (valor.trim() === '' ? null : valor);

interface PropiedadesFormulario {
  /** Con `cuenta` se edita (datos limitados); sin ella se crea una nueva. */
  cuenta?: CuentaDinero;
  alGuardar: () => void;
  alCancelar: () => void;
}

export function FormularioCuenta({ cuenta, alGuardar, alCancelar }: PropiedadesFormulario) {
  const cliente = useQueryClient();
  const sucursales = useSucursales();
  const bancos = useBancos();
  const usuarios = useUsuarios({
    busqueda: '',
    rol: '',
    activo: 'true',
    pagina: 1,
    porPagina: 100,
  });

  const [nombre, setNombre] = useState(cuenta?.nombre ?? '');
  const [tipo, setTipo] = useState<TipoCuenta>(cuenta?.tipo ?? 'caja');
  const [moneda, setMoneda] = useState<Moneda>('COP');
  const [sucursalId, setSucursalId] = useState('');
  const [bancoId, setBancoId] = useState('');
  const [ultimos4Digitos, setUltimos4Digitos] = useState(cuenta?.ultimos4Digitos ?? '');
  const [titular, setTitular] = useState(cuenta?.titular ?? '');
  const { permisos } = useSesionActual();
  const contrapartes = useOpcionesContraparte(
    permisos.includes('contraparte.registrar_movimiento'),
  );
  const [contraparteTitularId, setContraparteTitularId] = useState(
    cuenta?.contraparteTitularId ?? '',
  );
  const [responsableId, setResponsableId] = useState(cuenta?.responsableId ?? '');
  const [limiteDiario, setLimiteDiario] = useState(cuenta?.limiteDiario ?? '');
  const [comisionPorDefecto, setComisionPorDefecto] = useState(cuenta?.comisionPorDefecto ?? '');

  const guardar = useMutation({
    mutationFn: () => {
      if (!cuenta) {
        const comunes = {
          nombre,
          moneda,
          sucursalId,
          titular: aNuloOVacio(titular),
          contraparteTitularId: contraparteTitularId === '' ? null : contraparteTitularId,
          responsableId: responsableId === '' ? null : responsableId,
          limiteDiario: aNuloOVacio(limiteDiario),
          comisionPorDefecto: aNuloOVacio(comisionPorDefecto),
        };
        return crearCuenta(
          tipo === 'banco' ? { tipo, bancoId, ultimos4Digitos, ...comunes } : { tipo, ...comunes },
        );
      }
      const cambios: CambiosCuenta = {};
      if (nombre.trim() !== cuenta.nombre) cambios.nombre = nombre;
      if (cuenta.tipo === 'banco' && ultimos4Digitos.trim() !== (cuenta.ultimos4Digitos ?? '')) {
        cambios.ultimos4Digitos = ultimos4Digitos;
      }
      if (aNuloOVacio(titular) !== cuenta.titular) cambios.titular = aNuloOVacio(titular);
      const contraparteNueva = contraparteTitularId === '' ? null : contraparteTitularId;
      if (contraparteNueva !== cuenta.contraparteTitularId) {
        cambios.contraparteTitularId = contraparteNueva;
      }
      const responsableNuevo = responsableId === '' ? null : responsableId;
      if (responsableNuevo !== cuenta.responsableId) cambios.responsableId = responsableNuevo;
      if (aNuloOVacio(limiteDiario) !== cuenta.limiteDiario) {
        cambios.limiteDiario = aNuloOVacio(limiteDiario);
      }
      if (aNuloOVacio(comisionPorDefecto) !== cuenta.comisionPorDefecto) {
        cambios.comisionPorDefecto = aNuloOVacio(comisionPorDefecto);
      }
      return editarCuenta(cuenta.id, cambios);
    },
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: CLAVE_CUENTAS });
      alGuardar();
    },
  });

  const delServidor = erroresPorCampo(guardar.error);

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    guardar.mutate();
  };

  const esNueva = !cuenta;
  const esBanco = esNueva ? tipo === 'banco' : cuenta.tipo === 'banco';
  const bancosActivos = (bancos.data?.bancos ?? []).filter((b) => b.activo);

  return (
    <form onSubmit={enviar} noValidate>
      {guardar.isError && <Aviso tipo="error">{mensajeDe(guardar.error)}</Aviso>}
      <Campo
        etiqueta="Nombre"
        autoComplete="off"
        required
        value={nombre}
        onChange={(evento) => setNombre(evento.target.value)}
        error={delServidor.nombre}
      />
      {esNueva && (
        <>
          <CampoSelector
            etiqueta="Tipo"
            value={tipo}
            onChange={(evento) => setTipo(evento.target.value as TipoCuenta)}
            error={delServidor.tipo}
          >
            {(Object.keys(ETIQUETAS_TIPO) as TipoCuenta[]).map((opcion) => (
              <option key={opcion} value={opcion}>
                {ETIQUETAS_TIPO[opcion]}
              </option>
            ))}
          </CampoSelector>
          <CampoSelector
            etiqueta="Moneda"
            value={moneda}
            onChange={(evento) => setMoneda(evento.target.value as Moneda)}
            error={delServidor.moneda}
          >
            {MONEDAS_SOPORTADAS.map((opcion) => (
              <option key={opcion} value={opcion}>
                {ETIQUETAS_MONEDA[opcion]}
              </option>
            ))}
          </CampoSelector>
          <CampoSelector
            etiqueta="Sucursal"
            required
            value={sucursalId}
            onChange={(evento) => setSucursalId(evento.target.value)}
            disabled={sucursales.isPending}
            error={delServidor.sucursalId}
            ayuda={sucursales.isError ? 'No se pudieron cargar las sucursales.' : undefined}
          >
            <option value="">Elige una sucursal…</option>
            {sucursales.data?.map((sucursal) => (
              <option key={sucursal.id} value={sucursal.id}>
                {sucursal.nombre} · {sucursal.ciudad}
              </option>
            ))}
          </CampoSelector>
        </>
      )}
      {esBanco && esNueva && (
        <CampoSelector
          etiqueta="Banco"
          required
          value={bancoId}
          onChange={(evento) => setBancoId(evento.target.value)}
          disabled={bancos.isPending}
          error={delServidor.bancoId}
          ayuda={bancos.isError ? 'No se pudieron cargar los bancos.' : undefined}
        >
          <option value="">Elige un banco…</option>
          {bancosActivos.map((banco) => (
            <option key={banco.id} value={banco.id}>
              {banco.codigo} · {banco.nombre}
            </option>
          ))}
        </CampoSelector>
      )}
      {esBanco && (
        <Campo
          etiqueta="Últimos 4 dígitos"
          autoComplete="off"
          inputMode="numeric"
          maxLength={4}
          required
          value={ultimos4Digitos}
          onChange={(evento) => setUltimos4Digitos(evento.target.value)}
          error={delServidor.ultimos4Digitos}
        />
      )}
      <Campo
        etiqueta="Titular"
        autoComplete="off"
        ayuda="Opcional. Si la cuenta es de un tercero (ej. un proveedor de bolívares)."
        value={titular}
        onChange={(evento) => setTitular(evento.target.value)}
        error={delServidor.titular}
      />
      {contrapartes.data && (
        <CampoSelector
          etiqueta="Contraparte titular"
          value={contraparteTitularId}
          onChange={(evento) => setContraparteTitularId(evento.target.value)}
          error={delServidor.contraparteTitularId}
          ayuda="Opcional. Si la cuenta está a nombre de una contraparte (ej. quien te vende bolívares), sus saldos se ven juntos."
        >
          <option value="">Ninguna</option>
          {contrapartes.data.contrapartes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </CampoSelector>
      )}
      <CampoSelector
        etiqueta="Responsable"
        value={responsableId}
        onChange={(evento) => setResponsableId(evento.target.value)}
        disabled={usuarios.isPending}
        error={delServidor.responsableId}
        ayuda={usuarios.isError ? 'No se pudieron cargar los usuarios.' : 'Opcional.'}
      >
        <option value="">Sin responsable</option>
        {usuarios.data?.usuarios.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nombre} ({u.login})
          </option>
        ))}
      </CampoSelector>
      <Campo
        etiqueta="Límite diario"
        autoComplete="off"
        inputMode="decimal"
        ayuda="Opcional, sin separador de miles."
        value={limiteDiario}
        onChange={(evento) => setLimiteDiario(evento.target.value)}
        error={delServidor.limiteDiario}
      />
      <Campo
        etiqueta="Comisión por defecto"
        autoComplete="off"
        inputMode="decimal"
        ayuda="Opcional: lo que cobra el banco por transferencia, se puede cambiar cuando quieras."
        value={comisionPorDefecto}
        onChange={(evento) => setComisionPorDefecto(evento.target.value)}
        error={delServidor.comisionPorDefecto}
      />
      <div className="acciones acciones--derecha">
        <Boton variante="secundario" onClick={alCancelar} disabled={guardar.isPending}>
          Cancelar
        </Boton>
        <Boton
          type="submit"
          cargando={guardar.isPending}
          disabled={
            nombre.trim().length < 2 ||
            (esNueva && (sucursalId === '' || (tipo === 'banco' && bancoId === ''))) ||
            (esBanco && ultimos4Digitos.trim().length !== 4)
          }
        >
          {cuenta ? 'Guardar cambios' : 'Crear cuenta'}
        </Boton>
      </div>
    </form>
  );
}
