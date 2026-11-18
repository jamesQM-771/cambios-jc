import { formatearMoneda } from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { CampoAreaTexto } from '../../componentes/CampoAreaTexto.js';
import { CampoSelector } from '../../componentes/CampoSelector.js';
import { useNotificar } from '../../componentes/Notificaciones.js';
import { Esqueleto } from '../../componentes/Pagina.js';
import { mensajeDe } from '../../lib/api.js';
import { useSesionActual } from '../../modulos/auth/ContextoSesion.js';
import { guardarFicha, guardarNivel } from '../../modulos/cumplimiento/api.js';
import {
  CLAVE_CUMPLIMIENTO,
  useCumplimientoCliente,
} from '../../modulos/cumplimiento/consultas.js';
import {
  ETIQUETAS_ALERTA,
  ETIQUETAS_ESTADO_ALERTA,
  ETIQUETAS_NIVEL,
  type CumplimientoCliente,
  type NivelRiesgo,
} from '../../modulos/cumplimiento/tipos.js';

/** Ficha ampliada, acumulados y nivel de riesgo de un cliente (§5.13). */
export function FichaCumplimiento({
  clienteId,
  alVolver,
}: {
  clienteId: string;
  alVolver: () => void;
}) {
  const datos = useCumplimientoCliente(clienteId);
  if (datos.isPending) return <Esqueleto texto="Cargando la ficha…" />;
  if (datos.isError) return <Aviso tipo="error">{mensajeDe(datos.error)}</Aviso>;
  return <Contenido datos={datos.data} alVolver={alVolver} />;
}

function Contenido({ datos, alVolver }: { datos: CumplimientoCliente; alVolver: () => void }) {
  const consultas = useQueryClient();
  const notificar = useNotificar();
  const { permisos } = useSesionActual();
  const gestiona = permisos.includes('cumplimiento.gestionar_alertas');
  const { perfil, acumulados } = datos;
  const [actividad, setActividad] = useState(perfil?.actividadEconomica ?? '');
  const [origen, setOrigen] = useState(perfil?.origenFondos ?? '');
  const [direccion, setDireccion] = useState(perfil?.direccion ?? '');
  const [pep, setPep] = useState(perfil?.pep ?? false);
  const [nivel, setNivel] = useState<NivelRiesgo>(perfil?.nivel ?? 'bajo');
  const [motivo, setMotivo] = useState('');

  const refrescar = () => consultas.invalidateQueries({ queryKey: CLAVE_CUMPLIMIENTO });
  const ficha = useMutation({
    mutationFn: () =>
      guardarFicha(datos.cliente.id, {
        actividadEconomica: actividad.trim() || null,
        origenFondos: origen.trim() || null,
        direccion: direccion.trim() || null,
        pep,
      }),
    onSuccess: async () => {
      notificar('Ficha guardada.');
      await refrescar();
    },
  });
  const cambiarNivel = useMutation({
    mutationFn: () => guardarNivel(datos.cliente.id, { nivel, motivo: motivo.trim() }),
    onSuccess: async () => {
      setMotivo('');
      notificar('Nivel de riesgo actualizado.');
      await refrescar();
    },
  });

  const enviarFicha = (evento: SyntheticEvent) => {
    evento.preventDefault();
    ficha.mutate();
  };

  return (
    <div>
      <h3>Acumulados</h3>
      <dl className="datos-registro">
        <dt>Envió hoy / este mes / este año</dt>
        <dd className="mono">
          {formatearMoneda(acumulados.comoRemitente.dia, 'COP')} /{' '}
          {formatearMoneda(acumulados.comoRemitente.mes, 'COP')} /{' '}
          {formatearMoneda(acumulados.comoRemitente.anio, 'COP')}
        </dd>
        <dt>Recibió hoy / este mes / este año</dt>
        <dd className="mono">
          {formatearMoneda(acumulados.comoBeneficiario.dia, 'VES')} /{' '}
          {formatearMoneda(acumulados.comoBeneficiario.mes, 'VES')} /{' '}
          {formatearMoneda(acumulados.comoBeneficiario.anio, 'VES')}
        </dd>
        <dt>Nivel de riesgo</dt>
        <dd>
          {ETIQUETAS_NIVEL[perfil?.nivel ?? 'bajo']}
          {perfil?.motivoNivel ? ` · ${perfil.motivoNivel}` : ''}
        </dd>
      </dl>

      <form className="formulario-ancho" onSubmit={enviarFicha} noValidate>
        <h3>Ficha ampliada</h3>
        <Campo
          etiqueta="Actividad económica"
          maxLength={150}
          value={actividad}
          onChange={(evento) => setActividad(evento.target.value)}
        />
        <Campo
          etiqueta="Origen de los fondos"
          maxLength={150}
          value={origen}
          onChange={(evento) => setOrigen(evento.target.value)}
        />
        <Campo
          etiqueta="Dirección"
          maxLength={200}
          value={direccion}
          onChange={(evento) => setDireccion(evento.target.value)}
        />
        <label className="campo__casilla">
          <input
            type="checkbox"
            checked={pep}
            onChange={(evento) => setPep(evento.target.checked)}
          />
          Persona expuesta políticamente (PEP)
        </label>
        {ficha.isError && <Aviso tipo="error">{mensajeDe(ficha.error)}</Aviso>}
        <div className="acciones">
          <Boton type="submit" chico cargando={ficha.isPending}>
            Guardar ficha
          </Boton>
        </div>
      </form>

      {gestiona && (
        <>
          <h3>Cambiar nivel de riesgo</h3>
          <CampoSelector
            etiqueta="Nivel"
            value={nivel}
            onChange={(evento) => setNivel(evento.target.value as NivelRiesgo)}
          >
            <option value="bajo">Bajo</option>
            <option value="medio">Medio</option>
            <option value="alto">Alto</option>
          </CampoSelector>
          <CampoAreaTexto
            etiqueta="Motivo del cambio"
            rows={2}
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
          />
          {cambiarNivel.isError && <Aviso tipo="error">{mensajeDe(cambiarNivel.error)}</Aviso>}
          <div className="acciones">
            <Boton
              chico
              cargando={cambiarNivel.isPending}
              disabled={motivo.trim().length < 5}
              onClick={() => cambiarNivel.mutate()}
            >
              Guardar nivel
            </Boton>
          </div>
          {datos.alertas.length > 0 && (
            <>
              <h3>Alertas del cliente</h3>
              <ul>
                {datos.alertas.map((a) => (
                  <li key={a.id}>
                    {ETIQUETAS_ALERTA[a.tipo]} · {ETIQUETAS_ESTADO_ALERTA[a.estado]}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <div className="acciones acciones--derecha">
        <Boton variante="secundario" onClick={alVolver}>
          Volver
        </Boton>
      </div>
    </div>
  );
}
