# Fase 0 — Base del sistema

> Referencia: `docs/PROYECTO.md` §5.18, §6, §9 y §12 (MVP, fase 0).
> Rama: `fase-0-base`

## Objetivo

Dejar lista la base técnica sobre la que se construyen todos los módulos: repositorio, base de datos, autenticación segura con 2FA, roles y permisos, bitácora de auditoría, configuración de la empresa, utilidades de dinero, pruebas y CI.

**Al terminar la fase:** un administrador entra con usuario, contraseña y código 2FA; configura los datos de la empresa; crea usuarios con rol vendedor o digitador; cada uno ve un menú distinto según su rol; y toda acción queda en la bitácora.

**Fuera de alcance:** clientes, tasas, operaciones, caja, cuentas de dinero (fases 1 en adelante). Redis y Socket.IO todavía no.

---

## Tareas

Cada tarea termina con `npm run check` en verde y un commit. Presenta el plan de cada tarea antes de empezar.

### 0.1 Monorepo
- npm workspaces: `apps/api`, `apps/web`, `packages/shared`.
- TypeScript `strict` con `tsconfig` base compartido.
- ESLint + Prettier con configuración única.
- Scripts raíz de §9 de `CLAUDE.md`.
- `.gitignore`, `.editorconfig`, `.nvmrc` (Node 22).

**Aceptación:** `npm install && npm run check` funciona en un clon limpio.

### 0.2 Entorno local con Docker
- `docker-compose.yml` con PostgreSQL 16 (desarrollo) y una segunda base para pruebas.
- `.env.example` con todas las variables documentadas.
- `README.md` con los pasos para levantar el proyecto desde cero en Windows (WSL2) y macOS.

**Aceptación:** siguiendo el README en una máquina limpia, `npm run dev` levanta API y web.

### 0.3 Utilidades de dinero (`packages/shared/src/dinero/`)
- Tipo y funciones sobre `Decimal`: suma, resta, multiplicación, división, redondeo `ROUND_HALF_UP`.
- Conversión: `bolivares = pesos ÷ tasa` y `pesos = divisa × tasa`, con precisión definida.
- Serialización a/desde string para JSON.
- Formateo de pantalla: `COP 162.000`, `VES 43.085,00`, `USD 150,00`.
- Enmascarado de cuentas: `0102 **** **** **** 4441`.

**Aceptación:** pruebas unitarias con casos límite, incluido el caso real `162000 ÷ 3.76 = 43085.11` (redondeo a 2 decimales) y montos de hasta 12 dígitos.

### 0.4 Base de datos inicial (Prisma)
Tablas de esta fase:

| Tabla | Campos principales |
|---|---|
| `Empresa` | id, nombre, nit, telefono, whatsapp, direccion, logoUrl, monedaLocal, zonaHoraria, textoPieRecibo, creadaEn, actualizadaEn (una sola fila) |
| `Sucursal` | id, nombre, ciudad, activa |
| `Usuario` | id, nombre, login (único), hashContrasena, rol, sucursalId?, activo, secreto2fa (cifrado), tiene2fa, ultimoAcceso, creadoEn |
| `Sesion` | id, usuarioId, creadaEn, expiraEn, ultimaActividad, ip, agenteUsuario, revocada |
| `Auditoria` | id, fecha, usuarioId?, accion, entidad, entidadId?, antes (json)?, despues (json)?, ip, agenteUsuario |

- `Auditoria` es **solo inserción**: trigger en PostgreSQL que rechaza `UPDATE` y `DELETE`.
- El secreto 2FA se guarda cifrado (clave en variable de entorno).
- Seed: empresa de ejemplo ficticia, una sucursal y **un administrador inicial** cuyo login y contraseña temporal se leen de variables de entorno; debe configurar 2FA en su primer acceso.

**Aceptación:** `npm run db:migrate && npm run db:seed` crea todo; una prueba confirma que actualizar o borrar en `Auditoria` falla.

### 0.5 Roles y permisos (`packages/shared/src/permisos/`)
- Roles: `administrador`, `vendedor`, `digitador` (y `supervisor`, `cumplimiento` definidos pero opcionales).
- Permisos como strings (`usuario.gestionar`, `empresa.configurar`, `auditoria.ver`…). Incluir desde ya los permisos de fases futuras listados en la tabla §6.2 de `PROYECTO.md`, aunque sus pantallas no existan.
- Mapa rol → permisos en código (en la fase 13 pasará a ser configurable).
- Restricciones fijas: nadie aprueba lo propio; solo el administrador reabre cierres.

**Aceptación:** pruebas del mapa de permisos por rol.

### 0.6 Backend: base Fastify
- Estructura por módulos, manejo de errores uniforme (`{ error: { codigo, mensaje } }`), logger con enmascarado de datos sensibles.
- Plugin de validación con Zod (entrada y salida).
- Plugin de permisos: cada ruta declara su permiso; sin permiso declarado, la ruta no arranca.
- Plugin de auditoría: función `registrarAuditoria()` que usan los servicios.
- `@fastify/helmet`, CORS restringido, rate limit.
- Endpoint `GET /salud` (estado de API y base de datos).

**Aceptación:** prueba de que una ruta sin permiso declarado hace fallar el arranque; prueba de acceso denegado (403) con usuario sin permiso.

### 0.7 Autenticación con 2FA
Flujo:
1. `POST /auth/login` (login + contraseña) → si es válido, sesión **parcial** que solo permite el paso 2FA.
2. Si el usuario no tiene 2FA: `POST /auth/2fa/configurar` devuelve el QR (TOTP) y `POST /auth/2fa/activar` lo confirma con un código.
3. `POST /auth/2fa/verificar` → sesión completa.
4. `POST /auth/logout`, `GET /auth/yo` (usuario, rol, permisos, datos de la empresa).

Reglas:
- Contraseñas con argon2; mínimo 10 caracteres.
- Cookie `httpOnly`, `sameSite=strict`, `secure` en producción.
- Expiración por inactividad y máxima (valores en `.env`, por defecto 30 min y 12 h).
- Bloqueo temporal tras 5 intentos fallidos de contraseña o de código.
- Todo login, fallo, activación de 2FA y cierre de sesión va a la bitácora.
- El administrador puede **cerrar las sesiones** de un usuario y **reiniciar su 2FA**.

**Aceptación:** pruebas de integración de todo el flujo, incluidos contraseña errada, código errado, bloqueo, sesión expirada y sesión parcial intentando acceder a otra ruta.

### 0.8 Usuarios (API)
- Listar, crear, editar (nombre, rol, sucursal), desactivar/reactivar, restablecer contraseña (queda temporal y obliga a cambiarla), reiniciar 2FA, cerrar sesiones.
- No hay borrado. Un administrador no puede desactivarse a sí mismo ni quitarse el rol si es el único administrador activo.

**Aceptación:** pruebas de cada acción y de las dos restricciones.

### 0.9 Configuración de la empresa (API)
- Leer y editar los datos de `Empresa` (§4.2 de `PROYECTO.md`, solo los campos de esta fase).
- Subida del logo (PNG/JPG, máximo 1 MB) a una carpeta local configurable (en fases siguientes pasará a almacenamiento compatible S3).

**Aceptación:** cambio registrado en la bitácora con valores antes/después.

### 0.10 Frontend: base
- Tokens de diseño en variables CSS (usar `docs/design/tokens.css` si existe) con modo claro y oscuro.
- Pantallas:
  - **Login** → **Configurar 2FA** (QR + código) → **Verificar 2FA**.
  - **Estructura principal**: barra lateral con menú según el rol, encabezado con nombre del usuario, rol y botón de salir. Adaptable a móvil.
  - **Inicio** por rol (por ahora, bienvenida y accesos disponibles).
  - **Usuarios** (administrador).
  - **Configuración de la empresa** (administrador).
  - **Bitácora** (administrador): tabla filtrable por fecha, usuario, acción y entidad, con detalle antes/después.
- El digitador ve una estructura mínima pensada para móvil (en esta fase solo la bienvenida).
- Manejo de sesión expirada: redirige al login con mensaje.

**Aceptación:** los tres roles entran y ven menús distintos; las rutas protegidas no se abren sin sesión completa.

### 0.11 CI
- GitHub Actions en cada push y pull request: instalar, lint, typecheck, pruebas (con PostgreSQL como servicio) y build.

**Aceptación:** el pipeline pasa en la rama de la fase.

### 0.12 Respaldo y monitoreo (mínimo)
- Script `scripts/respaldo.sh` con `pg_dump` comprimido y con fecha; documentar cómo restaurar.
- Integración opcional con Sentry (API y web) activada solo si existe la variable `SENTRY_DSN`.
- Guía en el README para programar el respaldo diario.

**Aceptación:** restaurar un respaldo en una base vacía funciona siguiendo el README.

---

## Definición de terminado de la fase 0

- [ ] Todas las tareas 0.1–0.12 con sus criterios de aceptación cumplidos.
- [ ] `npm run check` y CI en verde.
- [ ] README permite levantar el proyecto desde cero.
- [ ] `.env.example` completo.
- [ ] `docs/DECISIONES.md` con las decisiones tomadas.
- [ ] Resumen final para el usuario: qué se hizo, cómo probarlo, pendientes, riesgos.

## Prueba manual que hará el usuario

1. Clonar, seguir el README y levantar el sistema.
2. Entrar como administrador inicial, configurar 2FA con una app autenticadora.
3. Editar los datos de la empresa y subir un logo.
4. Crear un vendedor y un digitador; entrar con cada uno y verificar que ven menús distintos.
5. Fallar la contraseña 5 veces y confirmar el bloqueo.
6. Revisar en la bitácora que todo lo anterior quedó registrado.
