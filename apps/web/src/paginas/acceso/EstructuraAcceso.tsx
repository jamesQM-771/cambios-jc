import { useState } from 'react';
import { Navigate, Outlet } from 'react-router';

import { Icono } from '../../componentes/Icono.js';
import { urlApi } from '../../lib/api.js';
import { ProveedorAcceso } from '../../modulos/auth/ContextoAcceso.js';
import { useSesion } from '../../modulos/auth/sesion.js';

function Marca() {
  // El logo es público; si la empresa aún no tiene uno, se omite sin avisar.
  const [sinLogo, setSinLogo] = useState(false);
  return (
    <div className="acceso__marca">
      {sinLogo ? (
        <span className="acceso__sello" aria-hidden="true">
          JC
        </span>
      ) : (
        <img src={urlApi('/empresa/logo')} alt="" onError={() => setSinLogo(true)} />
      )}
      <strong>Cambios JC</strong>
    </div>
  );
}

/** Marco de las pantallas de acceso. Quien ya tiene una sesión completa pasa directo al sistema. */
export function EstructuraAcceso() {
  const sesion = useSesion();
  if (sesion.data) return <Navigate to="/" replace />;
  return (
    <ProveedorAcceso>
      <div className="acceso">
        <aside className="acceso__panel">
          <Marca />
          <p className="acceso__lema">Cada operación, registrada una sola vez.</p>
          <p className="acceso__bajada">
            Remesas, divisas, contrapartes y caja en un mismo sistema, con rastro de quién hizo qué.
          </p>
          <ul className="acceso__puntos">
            <li>
              <Icono nombre="escudo" />
              Verificación en dos pasos obligatoria para todos los usuarios
            </li>
            <li>
              <Icono nombre="bitacora" />
              Nada se borra: cada cambio queda en la bitácora
            </li>
            <li>
              <Icono nombre="usuarios" />
              Cada persona ve solo lo que su rol le permite
            </li>
          </ul>
        </aside>
        <div className="acceso__lado">
          <main className="acceso__tarjeta">
            <Outlet />
          </main>
        </div>
      </div>
    </ProveedorAcceso>
  );
}
