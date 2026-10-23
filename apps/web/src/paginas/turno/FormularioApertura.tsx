import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { CampoSelector } from '../../componentes/CampoSelector.js';
import { useNotificar } from '../../componentes/Notificaciones.js';
import { EstadoVacio } from '../../componentes/Pagina.js';
import { erroresPorCampo, mensajeDe } from '../../lib/api.js';
import { CLAVE_REMESAS } from '../../modulos/remesas/consultas.js';
import { abrirTurno } from '../../modulos/turnos/api.js';
import { CLAVE_TURNOS } from '../../modulos/turnos/consultas.js';
import type { CajaParaTurno } from '../../modulos/turnos/tipos.js';

import {
  ConteoPorDenominacion,
  conteosParaEnviar,
  type Cantidades,
} from './ConteoPorDenominacion.js';

/** Abrir el turno: elegir una caja libre y contar el efectivo que hay en ella (§5.16). */
export function FormularioApertura({ cajas }: { cajas: readonly CajaParaTurno[] }) {
  const consultas = useQueryClient();
  const notificar = useNotificar();
  const libres = cajas.filter((caja) => caja.ocupadaPor === null);
  const [cajaElegida, setCajaElegida] = useState('');
  const [cantidades, setCantidades] = useState<Cantidades>({});

  const caja = libres.find((c) => c.id === cajaElegida) ?? libres[0];

  const abrir = useMutation({
    mutationFn: () => {
      if (!caja) throw new Error('Elige una caja.');
      return abrirTurno({ cajaId: caja.id, conteos: conteosParaEnviar(caja.monedas, cantidades) });
    },
    onSuccess: async ({ turno }) => {
      await Promise.all([
        consultas.invalidateQueries({ queryKey: CLAVE_TURNOS }),
        // El formulario de remesas depende de que haya turno abierto.
        consultas.invalidateQueries({ queryKey: CLAVE_REMESAS }),
      ]);
      notificar(`Turno abierto en ${turno.caja.nombre}.`);
    },
  });

  const delServidor = erroresPorCampo(abrir.error);

  if (cajas.length === 0) {
    return (
      <EstadoVacio
        titulo="No hay cajas configuradas"
        descripcion="Pídele al administrador que cree una caja con su cuenta de efectivo."
        icono="panel"
      />
    );
  }
  if (!caja) {
    return (
      <Aviso tipo="advertencia">
        Todas las cajas tienen un turno abierto. Espera a que alguien lo cierre o avisa al
        administrador.
      </Aviso>
    );
  }

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    abrir.mutate();
  };

  return (
    <form className="formulario-ancho" onSubmit={enviar} noValidate>
      <CampoSelector
        etiqueta="Caja"
        ayuda="Solo aparecen las cajas libres."
        value={caja.id}
        onChange={(evento) => {
          setCajaElegida(evento.target.value);
          setCantidades({});
        }}
      >
        {libres.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre} · {c.sucursal.nombre}
          </option>
        ))}
      </CampoSelector>

      {caja.monedas.length === 0 && (
        <Aviso tipo="advertencia">
          Esta caja no tiene una cuenta de efectivo. Pídele al administrador que la configure.
        </Aviso>
      )}
      {caja.monedas.map((moneda) => (
        <ConteoPorDenominacion
          key={moneda.moneda}
          moneda={moneda}
          cantidades={cantidades}
          alCambiar={(id, texto) => setCantidades((antes) => ({ ...antes, [id]: texto }))}
        />
      ))}

      {delServidor.conteos && <Aviso tipo="error">{delServidor.conteos}</Aviso>}
      {abrir.isError && !delServidor.conteos && (
        <Aviso tipo="error">{mensajeDe(abrir.error)}</Aviso>
      )}

      <div className="acciones">
        <Boton type="submit" cargando={abrir.isPending} disabled={caja.monedas.length === 0}>
          Abrir turno
        </Boton>
      </div>
    </form>
  );
}
