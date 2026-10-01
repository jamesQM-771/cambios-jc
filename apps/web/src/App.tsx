import { Route, Routes } from 'react-router';

import { Estructura } from './componentes/Estructura.js';
import { RutaConPermiso } from './componentes/RutaConPermiso.js';
import { RutaProtegida } from './componentes/RutaProtegida.js';
import { EstructuraAcceso } from './paginas/acceso/EstructuraAcceso.js';
import { GuardaPaso } from './paginas/acceso/GuardaPaso.js';
import { PaginaCambiarContrasena } from './paginas/acceso/PaginaCambiarContrasena.js';
import { PaginaConfigurar2fa } from './paginas/acceso/PaginaConfigurar2fa.js';
import { PaginaLogin } from './paginas/acceso/PaginaLogin.js';
import { PaginaVerificar2fa } from './paginas/acceso/PaginaVerificar2fa.js';
import { PaginaEnConstruccion } from './paginas/PaginaEnConstruccion.js';
import { PaginaInicio } from './paginas/PaginaInicio.js';
import { PaginaNoEncontrada } from './paginas/PaginaNoEncontrada.js';

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
                <PaginaEnConstruccion titulo="Usuarios" />
              </RutaConPermiso>
            }
          />
          <Route
            path="empresa"
            element={
              <RutaConPermiso permiso="empresa.configurar">
                <PaginaEnConstruccion titulo="Empresa" />
              </RutaConPermiso>
            }
          />
          <Route
            path="bitacora"
            element={
              <RutaConPermiso permiso="auditoria.ver">
                <PaginaEnConstruccion titulo="Bitácora" />
              </RutaConPermiso>
            }
          />
          <Route path="*" element={<PaginaNoEncontrada />} />
        </Route>
      </Route>
    </Routes>
  );
}
