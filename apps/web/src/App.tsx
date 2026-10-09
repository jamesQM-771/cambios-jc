import { Navigate, Route, Routes } from 'react-router';

import { Estructura } from './componentes/Estructura.js';
import { RutaConPermiso } from './componentes/RutaConPermiso.js';
import { RutaProtegida } from './componentes/RutaProtegida.js';
import { PaginaConfiguracion } from './paginas/configuracion/PaginaConfiguracion.js';
import { PaginaBancos } from './paginas/configuracion/bancos/PaginaBancos.js';
import { PaginaSucursales } from './paginas/configuracion/sucursales/PaginaSucursales.js';
import { EstructuraAcceso } from './paginas/acceso/EstructuraAcceso.js';
import { GuardaPaso } from './paginas/acceso/GuardaPaso.js';
import { PaginaCambiarContrasena } from './paginas/acceso/PaginaCambiarContrasena.js';
import { PaginaConfigurar2fa } from './paginas/acceso/PaginaConfigurar2fa.js';
import { PaginaLogin } from './paginas/acceso/PaginaLogin.js';
import { PaginaVerificar2fa } from './paginas/acceso/PaginaVerificar2fa.js';
import { PaginaBitacora } from './paginas/bitacora/PaginaBitacora.js';
import { PaginaEmpresa } from './paginas/empresa/PaginaEmpresa.js';
import { PaginaInicio } from './paginas/PaginaInicio.js';
import { PaginaNoEncontrada } from './paginas/PaginaNoEncontrada.js';
import { PaginaUsuarios } from './paginas/usuarios/PaginaUsuarios.js';

/** Rutas de la aplicación. El enrutador y los proveedores se montan en `main.tsx` (o en las pruebas). */
export function App() {
  return (
    <Routes>
      <Route path="/acceso" element={<EstructuraAcceso />}>
        <Route index element={<PaginaLogin />} />
        <Route
          path="contrasena"
          element={
            <GuardaPaso paso="cambiar_contrasena">
              <PaginaCambiarContrasena />
            </GuardaPaso>
          }
        />
        <Route
          path="2fa/configurar"
          element={
            <GuardaPaso paso="configurar_2fa">
              <PaginaConfigurar2fa />
            </GuardaPaso>
          }
        />
        <Route
          path="2fa/verificar"
          element={
            <GuardaPaso paso="verificar_2fa">
              <PaginaVerificar2fa />
            </GuardaPaso>
          }
        />
        <Route path="*" element={<PaginaLogin />} />
      </Route>

      <Route element={<RutaProtegida />}>
        <Route element={<Estructura />}>
          <Route index element={<PaginaInicio />} />
          <Route
            path="usuarios"
            element={
              <RutaConPermiso permiso="usuario.gestionar">
                <PaginaUsuarios />
              </RutaConPermiso>
            }
          />
          <Route
            path="empresa"
            element={
              <RutaConPermiso permiso="empresa.configurar">
                <PaginaEmpresa />
              </RutaConPermiso>
            }
          />
          <Route
            path="configuracion"
            element={
              <RutaConPermiso permiso="empresa.configurar">
                <PaginaConfiguracion />
              </RutaConPermiso>
            }
          >
            <Route index element={<Navigate to="bancos" replace />} />
            <Route path="bancos" element={<PaginaBancos />} />
            <Route path="sucursales" element={<PaginaSucursales />} />
          </Route>
          <Route
            path="bitacora"
            element={
              <RutaConPermiso permiso="auditoria.ver">
                <PaginaBitacora />
              </RutaConPermiso>
            }
          />
          <Route path="*" element={<PaginaNoEncontrada />} />
        </Route>
      </Route>
    </Routes>
  );
}
