import { useState } from 'react';
import { Navigate, Outlet } from 'react-router';

import { urlApi } from '../../lib/api.js';
import { ProveedorAcceso } from '../../modulos/auth/ContextoAcceso.js';
import { useSesion } from '../../modulos/auth/sesion.js';

function Marca() {
  // El logo es público; si la empresa aún no tiene uno, se omite sin avisar.
  const [sinLogo, setSinLogo] = useState(false);
  return (
    <div className="acceso__marca">
      {!sinLogo && <img src={urlApi('/empresa/logo')} alt="" onError={() => setSinLogo(true)} />}
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
        <main className="acceso__tarjeta tarjeta">
          <Marca />
          <Outlet />
        </main>
      </div>
    </ProveedorAcceso>
  );
}
