import { useState } from 'react';
import { Link } from 'react-router';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Dialogo } from '../../componentes/Dialogo.js';
import { useNotificar } from '../../componentes/Notificaciones.js';
import { EncabezadoPagina, Esqueleto } from '../../componentes/Pagina.js';
import { mensajeDe } from '../../lib/api.js';
import { formatearFechaHora } from '../../lib/formato.js';
import { useTitulo } from '../../lib/titulo.js';
import { useSesionActual } from '../../modulos/auth/ContextoSesion.js';
import { useOpcionesTurno } from '../../modulos/turnos/consultas.js';
import type { Turno } from '../../modulos/turnos/tipos.js';

import { FormularioApertura } from './FormularioApertura.js';
import { FormularioCierre } from './FormularioCierre.js';
import { TablaArqueo } from './TablaArqueo.js';

/** Mi turno: abrir la caja contando el efectivo, trabajar y cerrarla con arqueo (§5.16). */
export function PaginaTurno() {
  useTitulo('Mi turno');
  const notificar = useNotificar();
  const { empresa } = useSesionActual();
  const zona = empresa?.zonaHoraria ?? 'America/Bogota';
  const opciones = useOpcionesTurno();
  const [cerrando, setCerrando] = useState(false);
  // El turno que se acaba de cerrar: se deja a la vista para que se lea el resultado del arqueo.
  const [cerrado, setCerrado] = useState<Turno | null>(null);

  const miTurno = opciones.data?.miTurno ?? null;
  const monedasDeMiCaja =
    opciones.data?.cajas.find((caja) => caja.id === miTurno?.caja.id)?.monedas ?? [];

  return (
    <>
      <EncabezadoPagina
        titulo="Mi turno"
        descripcion="Abre tu caja contando el efectivo y ciérrala al terminar. Sin turno abierto no se registran remesas."
        acciones={
          miTurno ? <Boton onClick={() => setCerrando(true)}>Cerrar turno</Boton> : undefined
        }
      />

      {opciones.isPending && <Esqueleto texto="Cargando tu turno…" />}
      {opciones.isError && <Aviso tipo="error">{mensajeDe(opciones.error)}</Aviso>}

      {cerrado && (
        <section className="tarjeta" aria-labelledby="titulo-cierre">
          <h2 id="titulo-cierre">Turno cerrado</h2>
          <p>
            Cerraste el turno de <strong>{cerrado.caja.nombre}</strong>. Así quedó el arqueo:
          </p>
          <TablaArqueo saldos={cerrado.saldos} momento="cierre" />
          <div className="acciones">
            <Boton variante="secundario" onClick={() => setCerrado(null)}>
              Entendido
            </Boton>
          </div>
        </section>
      )}

      {opciones.data && miTurno && (
        <section className="tarjeta" aria-labelledby="titulo-turno">
          <h2 id="titulo-turno">Turno abierto en {miTurno.caja.nombre}</h2>
          <p>
            Desde {formatearFechaHora(miTurno.abiertoEn, zona)} · jornada del{' '}
            {miTurno.jornada.fecha}.
          </p>
          <h3>Cómo abriste</h3>
          <TablaArqueo saldos={miTurno.saldos} momento="apertura" />
          <p>
            Ya puedes <Link to="/remesas">registrar remesas</Link>. El efectivo que reciban queda en
            esta caja.
          </p>
        </section>
      )}

      {opciones.data && !miTurno && !cerrado && <FormularioApertura cajas={opciones.data.cajas} />}
      {opciones.data && !miTurno && cerrado && (
        <p className="campo__ayuda">Cuando quieras, abre un nuevo turno desde aquí.</p>
      )}

      <Dialogo
        abierto={cerrando && miTurno !== null}
        alCerrar={() => setCerrando(false)}
        titulo="Cerrar turno"
        ancho
      >
        {cerrando && miTurno && (
          <FormularioCierre
            turno={miTurno}
            monedas={monedasDeMiCaja}
            alCancelar={() => setCerrando(false)}
            alCerrar={(turno) => {
              setCerrando(false);
              setCerrado(turno);
              notificar('Turno cerrado.');
            }}
          />
        )}
      </Dialogo>
    </>
  );
}
