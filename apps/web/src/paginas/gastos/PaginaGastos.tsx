import { formatearMoneda, type Moneda } from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { CampoAreaTexto } from '../../componentes/CampoAreaTexto.js';
import { Dialogo } from '../../componentes/Dialogo.js';
import { useNotificar } from '../../componentes/Notificaciones.js';
import {
  BarraHerramientas,
  EncabezadoPagina,
  EstadoVacio,
  Esqueleto,
} from '../../componentes/Pagina.js';
import { mensajeDe } from '../../lib/api.js';
import { formatearFechaHora } from '../../lib/formato.js';
import { useTitulo } from '../../lib/titulo.js';
import { useSesionActual } from '../../modulos/auth/ContextoSesion.js';
import { anularGasto } from '../../modulos/gastos/api.js';
import { CLAVE_GASTOS, useGastos, useOpcionesGasto } from '../../modulos/gastos/consultas.js';
import { ETIQUETAS_TIPO_GASTO, type Gasto, type TipoGasto } from '../../modulos/gastos/tipos.js';

import { FormularioGasto } from './FormularioGasto.js';

/** Gastos operativos y retiros del dueño: cada uno sale de una cuenta y queda en el libro (§5.18). */
export function PaginaGastos() {
  useTitulo('Gastos');
  const notificar = useNotificar();
  const consultas = useQueryClient();
  const { permisos, empresa } = useSesionActual();
  const zona = empresa?.zonaHoraria ?? 'America/Bogota';
  const puedeVerTodos = permisos.includes('gasto.gestionar');
  const [tipo, setTipo] = useState<TipoGasto | ''>('');
  const [creando, setCreando] = useState(false);
  const [anulando, setAnulando] = useState<Gasto | null>(null);
  const [motivo, setMotivo] = useState('');

  const lista = useGastos(puedeVerTodos, tipo === '' ? undefined : tipo);
  const opciones = useOpcionesGasto(creando);
  const gastos = lista.data?.gastos ?? [];

  const anular = useMutation({
    mutationFn: () => {
      if (!anulando) throw new Error('Elige un gasto.');
      return anularGasto(anulando.id, motivo.trim());
    },
    onSuccess: async () => {
      setAnulando(null);
      setMotivo('');
      notificar('Gasto anulado: el dinero volvió a la cuenta.');
      await consultas.invalidateQueries({ queryKey: CLAVE_GASTOS });
    },
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Gastos"
        descripcion="Registra lo que se paga con el dinero del negocio. Cada gasto sale de una cuenta y queda anotado con quién lo hizo."
        acciones={<Boton onClick={() => setCreando(true)}>Nuevo gasto</Boton>}
      />

      {!puedeVerTodos && (
        <p className="campo__ayuda">
          Aquí registras tus gastos. El administrador ve el historial completo.
        </p>
      )}

      {puedeVerTodos && (
        <BarraHerramientas {...(lista.data ? { resumen: `${String(gastos.length)} gastos` } : {})}>
          <div className="campo">
            <label className="campo__etiqueta" htmlFor="filtro-tipo-gasto">
              Tipo
            </label>
            <select
              id="filtro-tipo-gasto"
              className="campo__entrada"
              value={tipo}
              onChange={(evento) => setTipo(evento.target.value as TipoGasto | '')}
            >
              <option value="">Todos</option>
              <option value="operativo">Gastos</option>
              <option value="retiro_dueno">Retiros del dueño</option>
            </select>
          </div>
        </BarraHerramientas>
      )}

      {puedeVerTodos && lista.isPending && <Esqueleto texto="Cargando los gastos…" />}
      {puedeVerTodos && lista.isError && <Aviso tipo="error">{mensajeDe(lista.error)}</Aviso>}
      {lista.data && gastos.length === 0 && (
        <EstadoVacio
          titulo={tipo === '' ? 'Todavía no hay gastos' : 'No hay registros de ese tipo'}
          descripcion={tipo === '' ? 'Registra el primero con el botón "Nuevo gasto".' : undefined}
          icono="flecha"
        />
      )}
      {gastos.length > 0 && (
        <div className="tabla-contenedor">
          <table className="tabla">
            <caption className="solo-lectores">Gastos</caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Descripción</th>
                <th scope="col">Se pagó con</th>
                <th scope="col" className="tabla__numero">
                  Monto
                </th>
                <th scope="col">Hecho por</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="solo-lectores">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {gastos.map((gasto) => (
                <tr key={gasto.id}>
                  <td>{formatearFechaHora(gasto.creadoEn, zona)}</td>
                  <td>
                    {gasto.descripcion}
                    <small>
                      {gasto.tipo === 'retiro_dueno'
                        ? ETIQUETAS_TIPO_GASTO.retiro_dueno
                        : (gasto.categoria?.nombre ?? ETIQUETAS_TIPO_GASTO.operativo)}
                    </small>
                  </td>
                  <td>{gasto.cuenta.nombre}</td>
                  <td className="tabla__numero mono">
                    {formatearMoneda(gasto.monto, gasto.cuenta.moneda as Moneda)}
                  </td>
                  <td>{gasto.creadoPor.nombre}</td>
                  <td>
                    {gasto.anulado ? (
                      <>
                        Anulado
                        <small>{gasto.anulado.motivo}</small>
                      </>
                    ) : (
                      'Vigente'
                    )}
                  </td>
                  <td>
                    {!gasto.anulado && (
                      <Boton
                        variante="secundario"
                        chico
                        aria-label={`Anular el gasto ${gasto.descripcion}`}
                        onClick={() => setAnulando(gasto)}
                      >
                        Anular
                      </Boton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialogo abierto={creando} alCerrar={() => setCreando(false)} titulo="Nuevo gasto">
        {creando && opciones.isPending && <Esqueleto texto="Cargando el formulario…" />}
        {creando && opciones.isError && <Aviso tipo="error">{mensajeDe(opciones.error)}</Aviso>}
        {creando && opciones.data && (
          <FormularioGasto
            opciones={opciones.data}
            alCancelar={() => setCreando(false)}
            alRegistrar={(gasto) => {
              setCreando(false);
              notificar(gasto.tipo === 'retiro_dueno' ? 'Retiro registrado.' : 'Gasto registrado.');
            }}
          />
        )}
      </Dialogo>

      <Dialogo
        abierto={anulando !== null}
        alCerrar={() => setAnulando(null)}
        titulo="Anular el gasto"
      >
        {anulando && (
          <>
            <p>
              Se devuelven{' '}
              <strong className="mono">
                {formatearMoneda(anulando.monto, anulando.cuenta.moneda as Moneda)}
              </strong>{' '}
              a <strong>{anulando.cuenta.nombre}</strong>. El gasto no se borra: queda anulado, con
              tu nombre y el motivo.
            </p>
            {anular.isError && <Aviso tipo="error">{mensajeDe(anular.error)}</Aviso>}
            <CampoAreaTexto
              etiqueta="Motivo"
              rows={3}
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
            />
            <div className="acciones acciones--derecha">
              <Boton
                variante="secundario"
                onClick={() => setAnulando(null)}
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
                Anular gasto
              </Boton>
            </div>
          </>
        )}
      </Dialogo>
    </>
  );
}
