import { useQuery } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { useNavigate, useParams } from 'react-router';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { Esqueleto } from '../../componentes/Pagina.js';
import { ErrorApi, mensajeDe } from '../../lib/api.js';
import { formatearFechaHora } from '../../lib/formato.js';
import { useTitulo } from '../../lib/titulo.js';
import { consultarSeguimiento } from '../../modulos/seguimiento/api.js';
import type { EstadoSeguimiento } from '../../modulos/seguimiento/tipos.js';

const TONO: Record<EstadoSeguimiento, string> = {
  recibida: 'etiqueta--alerta',
  en_proceso: '',
  enviada: 'etiqueta--exito',
  en_revision: 'etiqueta--alerta',
  anulada: 'etiqueta--error',
  devuelta: '',
};

const TITULO: Record<EstadoSeguimiento, string> = {
  recibida: 'Recibida',
  en_proceso: 'En proceso',
  enviada: 'Enviada',
  en_revision: 'En revisión',
  anulada: 'Anulada',
  devuelta: 'Devuelta',
};

/**
 * Seguimiento de un envío para el cliente final (§5.15): se abre con el código del recibo, sin
 * iniciar sesión. Solo muestra el estado, los bolívares y las fechas.
 */
export function PaginaSeguimiento() {
  useTitulo('Seguimiento de tu envío');
  const { codigo } = useParams();
  const navegar = useNavigate();
  const [escrito, setEscrito] = useState('');

  const consulta = useQuery({
    queryKey: ['seguimiento', codigo],
    queryFn: () => consultarSeguimiento(codigo ?? ''),
    enabled: Boolean(codigo),
    // Un código que no existe no mejora reintentando.
    retry: false,
    // Mientras el envío está en camino, se actualiza solo.
    refetchInterval: 30_000,
  });

  const buscar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    const limpio = escrito.trim();
    if (limpio !== '') void navegar(`/seguimiento/${encodeURIComponent(limpio)}`);
  };

  const noExiste = consulta.error instanceof ErrorApi && consulta.error.estado === 404;
  const seguimiento = consulta.data?.seguimiento;

  return (
    <main className="seguimiento">
      <div className="seguimiento__tarjeta tarjeta">
        <h1>Seguimiento de tu envío</h1>

        {codigo && consulta.isPending && <Esqueleto filas={3} texto="Buscando tu envío…" />}
        {noExiste && (
          <Aviso tipo="advertencia">
            No encontramos un envío con ese código. Revisa que esté escrito como aparece en tu
            recibo.
          </Aviso>
        )}
        {consulta.isError && !noExiste && <Aviso tipo="error">{mensajeDe(consulta.error)}</Aviso>}

        {seguimiento && (
          <section aria-live="polite">
            <p className="seguimiento__empresa">{seguimiento.empresa.nombre}</p>
            <p className={`etiqueta seguimiento__estado ${TONO[seguimiento.estado]}`}>
              {TITULO[seguimiento.estado]}
            </p>
            <p className="seguimiento__mensaje">{seguimiento.mensaje}</p>
            <dl className="datos-registro">
              <dt>Comprobante</dt>
              <dd className="mono">N° {seguimiento.numeroComprobante}</dd>
              <dt>Monto a recibir</dt>
              <dd className="mono">{seguimiento.montoBolivaresTexto}</dd>
              <dt>Registrado</dt>
              <dd>{formatearFechaHora(seguimiento.fecha, seguimiento.empresa.zonaHoraria)}</dd>
              <dt>Última novedad</dt>
              <dd>
                {formatearFechaHora(seguimiento.actualizadaEn, seguimiento.empresa.zonaHoraria)}
              </dd>
            </dl>
          </section>
        )}

        {(!codigo || noExiste) && (
          <form onSubmit={buscar} noValidate>
            <Campo
              etiqueta="Código de seguimiento"
              autoComplete="off"
              autoCapitalize="characters"
              ayuda="Está en tu recibo, junto al número de comprobante."
              value={escrito}
              onChange={(evento) => setEscrito(evento.target.value)}
            />
            <Boton type="submit" ancho disabled={escrito.trim().length < 6}>
              Consultar
            </Boton>
          </form>
        )}
      </div>
    </main>
  );
}
