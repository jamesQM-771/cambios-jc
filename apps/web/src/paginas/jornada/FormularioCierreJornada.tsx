import { comparar, formatearMoneda, restar, type Moneda } from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { mensajeDe } from '../../lib/api.js';
import { avisoDecimalAmbiguo, normalizarDecimal } from '../../lib/formato.js';
import { cerrarJornada } from '../../modulos/jornadas/api.js';
import { CLAVE_JORNADAS } from '../../modulos/jornadas/consultas.js';
import type { DetalleJornada } from '../../modulos/jornadas/tipos.js';

/** Diferencia entre lo reportado y lo esperado, o `null` si todavía no se puede calcular. */
export function diferenciaDe(reportado: string, esperado: string | null): string | null {
  if (esperado === null) return null;
  const texto = normalizarDecimal(reportado);
  if (!/^\d+(\.\d+)?$/.test(texto)) return null;
  return restar(texto, esperado).toFixed();
}

interface Propiedades {
  detalle: DetalleJornada;
  alCerrar: (detalle: DetalleJornada) => void;
}

/**
 * Cerrar la jornada: el administrador reporta el saldo real de cada cuenta sin caja (bóveda,
 * bancos y billeteras). No hay tolerancia: cualquier diferencia pide su explicación (D128).
 */
export function FormularioCierreJornada({ detalle, alCerrar }: Propiedades) {
  const consultas = useQueryClient();
  const { cuentasPorArquear, pendientes } = detalle;
  const [reportados, setReportados] = useState<Record<string, string>>({});
  const [explicaciones, setExplicaciones] = useState<Record<string, string>>({});

  const cerrar = useMutation({
    mutationFn: () =>
      cerrarJornada(detalle.jornada.id, {
        saldos: cuentasPorArquear.map(({ cuenta }) => {
          const explicacion = (explicaciones[cuenta.id] ?? '').trim();
          return {
            cuentaId: cuenta.id,
            reportado: normalizarDecimal(reportados[cuenta.id] ?? ''),
            ...(explicacion === '' ? {} : { explicacion }),
          };
        }),
      }),
    onSuccess: async ({ detalle: cerrada }) => {
      await consultas.invalidateQueries({ queryKey: CLAVE_JORNADAS });
      alCerrar(cerrada);
    },
  });

  const impedida = pendientes.turnosAbiertos.length > 0;
  const incompleto = cuentasPorArquear.some(
    ({ cuenta }) =>
      (reportados[cuenta.id] ?? '').trim() === '' ||
      avisoDecimalAmbiguo(reportados[cuenta.id] ?? '') !== null,
  );

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    cerrar.mutate();
  };

  return (
    <form onSubmit={enviar} noValidate>
      <h3>Cerrar la jornada</h3>
      {impedida ? (
        <Aviso tipo="advertencia">
          Todavía hay turnos abiertos. Cada vendedor tiene que cerrar el suyo, o puedes cerrarlo tú
          desde la lista de arriba, antes de cerrar la jornada.
        </Aviso>
      ) : (
        <p>
          Cuenta el dinero de la bóveda, los bancos y las billeteras, y escribe lo que hay en cada
          una. Si no coincide con lo que el sistema espera, explica la diferencia: quedará a tu
          nombre.
        </p>
      )}

      {cuentasPorArquear.length === 0 && (
        <p className="campo__ayuda">No hay cuentas por arquear: solo cuentan las cajas.</p>
      )}

      {cuentasPorArquear.map(({ cuenta, esperado }) => {
        const reportado = reportados[cuenta.id] ?? '';
        const diferencia = diferenciaDe(reportado, esperado);
        const hayDiferencia = diferencia !== null && comparar(diferencia, '0') !== 0;
        return (
          <fieldset key={cuenta.id} className="grupo-campos">
            <legend>
              {cuenta.nombre} ({cuenta.moneda})
            </legend>
            <p className="campo__ayuda">
              {esperado === null
                ? 'Es la primera vez que se arquea esta cuenta: no hay un valor esperado.'
                : `El sistema espera ${formatearMoneda(esperado, cuenta.moneda as Moneda)}.`}
            </p>
            <Campo
              etiqueta={`Saldo real de ${cuenta.nombre}`}
              inputMode="decimal"
              autoComplete="off"
              value={reportado}
              onChange={(evento) =>
                setReportados((antes) => ({ ...antes, [cuenta.id]: evento.target.value }))
              }
              error={avisoDecimalAmbiguo(reportado) ?? undefined}
            />
            {diferencia !== null && (
              <p role="status" className={hayDiferencia ? 'campo__error' : 'campo__ayuda'}>
                {hayDiferencia
                  ? `${comparar(diferencia, '0') > 0 ? 'Sobrante' : 'Faltante'} de ${formatearMoneda(
                      diferencia.replace('-', ''),
                      cuenta.moneda as Moneda,
                    )}`
                  : 'Cuadra.'}
              </p>
            )}
            <Campo
              etiqueta={`Explicación de la diferencia en ${cuenta.nombre}`}
              ayuda="Solo si el saldo no cuadra. Si cuadra, déjala vacía."
              maxLength={300}
              autoComplete="off"
              value={explicaciones[cuenta.id] ?? ''}
              onChange={(evento) =>
                setExplicaciones((antes) => ({ ...antes, [cuenta.id]: evento.target.value }))
              }
            />
          </fieldset>
        );
      })}

      {cerrar.isError && <Aviso tipo="error">{mensajeDe(cerrar.error)}</Aviso>}

      <div className="acciones acciones--derecha">
        <Boton type="submit" cargando={cerrar.isPending} disabled={impedida || incompleto}>
          Cerrar jornada
        </Boton>
      </div>
    </form>
  );
}
