import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { CampoSelector } from '../../componentes/CampoSelector.js';
import { erroresPorCampo, mensajeDe } from '../../lib/api.js';
import { avisoDecimalAmbiguo, normalizarDecimal } from '../../lib/formato.js';
import { registrarGasto } from '../../modulos/gastos/api.js';
import { CLAVE_GASTOS } from '../../modulos/gastos/consultas.js';
import {
  ETIQUETAS_TIPO_GASTO,
  type CuentaParaGasto,
  type Gasto,
  type OpcionesGasto,
  type TipoGasto,
} from '../../modulos/gastos/tipos.js';

interface PropiedadesFormularioGasto {
  opciones: OpcionesGasto;
  alRegistrar: (gasto: Gasto) => void;
  alCancelar: () => void;
}

/**
 * De qué cuentas se puede pagar. El servidor es quien decide (D125): quien no administra paga con
 * el efectivo de la caja de su turno; el administrador, desde cualquier cuenta.
 */
export function cuentasParaPagar(
  cuentas: readonly CuentaParaGasto[],
  cajaPropiaId: string | null,
  puedeGestionar: boolean,
): CuentaParaGasto[] {
  if (puedeGestionar) return [...cuentas];
  return cuentas.filter(
    (cuenta) => cuenta.tipo === 'caja' && cajaPropiaId !== null && cuenta.cajaId === cajaPropiaId,
  );
}

/** Registrar un gasto operativo o, el administrador, un retiro del dueño (§5.18). */
export function FormularioGasto({ opciones, alRegistrar, alCancelar }: PropiedadesFormularioGasto) {
  const consultas = useQueryClient();
  // Una clave por formulario abierto: un reintento por mala conexión no duplica el gasto.
  const clave = useRef(crypto.randomUUID());
  const { categorias, miTurno, puedeGestionar } = opciones;
  const [tipo, setTipo] = useState<TipoGasto>('operativo');
  const [categoriaElegida, setCategoriaElegida] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [cuentaElegida, setCuentaElegida] = useState('');
  const [monto, setMonto] = useState('');

  const cuentas = cuentasParaPagar(opciones.cuentas, miTurno?.caja.id ?? null, puedeGestionar);
  const cuenta = cuentas.find((c) => c.id === cuentaElegida) ?? cuentas[0];
  const esRetiro = tipo === 'retiro_dueno';
  const categoria = categorias.find((c) => c.id === categoriaElegida) ?? categorias[0];
  const ambiguo = avisoDecimalAmbiguo(monto);

  const registrar = useMutation({
    mutationFn: () => {
      if (!cuenta) throw new Error('Elige la cuenta.');
      return registrarGasto({
        claveIdempotencia: clave.current,
        tipo,
        ...(!esRetiro && categoria ? { categoriaId: categoria.id } : {}),
        descripcion: descripcion.trim(),
        cuentaId: cuenta.id,
        monto: normalizarDecimal(monto),
      });
    },
    onSuccess: async ({ gasto }) => {
      await consultas.invalidateQueries({ queryKey: CLAVE_GASTOS });
      alRegistrar(gasto);
    },
  });

  const delServidor = erroresPorCampo(registrar.error);

  if (!puedeGestionar && !miTurno) {
    return (
      <>
        <Aviso tipo="advertencia">
          Abre tu turno de caja antes de registrar un gasto: se paga con el efectivo de tu caja.
        </Aviso>
        <div className="acciones acciones--derecha">
          <Boton variante="secundario" onClick={alCancelar}>
            Cerrar
          </Boton>
        </div>
      </>
    );
  }
  if (!esRetiro && categorias.length === 0) {
    return (
      <>
        <Aviso tipo="advertencia">
          No hay categorías de gasto. Pídele al administrador que cree al menos una.
        </Aviso>
        <div className="acciones acciones--derecha">
          <Boton variante="secundario" onClick={alCancelar}>
            Cerrar
          </Boton>
        </div>
      </>
    );
  }

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    if (ambiguo) return;
    registrar.mutate();
  };

  return (
    <form className="formulario-ancho" onSubmit={enviar} noValidate>
      {puedeGestionar && (
        <CampoSelector
          etiqueta="Qué es"
          value={tipo}
          onChange={(evento) => setTipo(evento.target.value as TipoGasto)}
        >
          <option value="operativo">{ETIQUETAS_TIPO_GASTO.operativo} del negocio</option>
          <option value="retiro_dueno">{ETIQUETAS_TIPO_GASTO.retiro_dueno}</option>
        </CampoSelector>
      )}

      {!esRetiro && (
        <CampoSelector
          etiqueta="Categoría"
          value={categoria?.id ?? ''}
          onChange={(evento) => setCategoriaElegida(evento.target.value)}
          error={delServidor.categoriaId}
        >
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </CampoSelector>
      )}

      <Campo
        etiqueta="Descripción"
        maxLength={200}
        autoComplete="off"
        value={descripcion}
        onChange={(evento) => setDescripcion(evento.target.value)}
        error={delServidor.descripcion}
      />

      <CampoSelector
        etiqueta="Se paga con"
        ayuda={
          puedeGestionar
            ? 'El dinero sale de esta cuenta.'
            : 'Los gastos salen del efectivo de la caja de tu turno.'
        }
        value={cuenta?.id ?? ''}
        onChange={(evento) => setCuentaElegida(evento.target.value)}
        error={delServidor.cuentaId}
      >
        {cuentas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre} ({c.moneda})
          </option>
        ))}
      </CampoSelector>
      {cuentas.length === 0 && (
        <Aviso tipo="advertencia">Tu caja no tiene una cuenta de efectivo configurada.</Aviso>
      )}

      <Campo
        etiqueta={`Monto${cuenta ? ` (${cuenta.moneda})` : ''}`}
        inputMode="decimal"
        autoComplete="off"
        value={monto}
        onChange={(evento) => setMonto(evento.target.value)}
        error={delServidor.monto ?? ambiguo ?? undefined}
      />

      {registrar.isError &&
        !delServidor.monto &&
        !delServidor.cuentaId &&
        !delServidor.categoriaId &&
        !delServidor.descripcion && <Aviso tipo="error">{mensajeDe(registrar.error)}</Aviso>}

      <div className="acciones acciones--derecha">
        <Boton variante="secundario" onClick={alCancelar} disabled={registrar.isPending}>
          Cancelar
        </Boton>
        <Boton
          type="submit"
          cargando={registrar.isPending}
          disabled={
            !cuenta || monto.trim() === '' || descripcion.trim().length < 3 || ambiguo !== null
          }
        >
          {esRetiro ? 'Registrar retiro' : 'Registrar gasto'}
        </Boton>
      </div>
    </form>
  );
}
