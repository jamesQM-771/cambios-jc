# Cambios JC

Sistema de operación y contabilidad para Cambios JC: remesas COP → VES, compra y venta de USD, contrapartes y caja diaria.

- Especificación: [`docs/PROYECTO.md`](docs/PROYECTO.md)
- Reglas de trabajo: [`CLAUDE.md`](CLAUDE.md)
- Estado al 2026-11-01: fases 0 a 13 hechas o documentadas; ver [`docs/RESUMEN-SESION-2026-11-01.md`](docs/RESUMEN-SESION-2026-11-01.md)
- Decisiones: [`docs/DECISIONES.md`](docs/DECISIONES.md)

## Estado y plan de fases

El proyecto se entrega en 14 fases agrupadas en 4 versiones (detalle en `docs/PROYECTO.md` §12).

| Versión                               | Fases                                                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **MVP** — primer uso real             | 0. Base · 1. Configuración · 2. Remesas · 3. Caja                                                                                       |
| **v1** — reemplazo completo del Excel | 4. Inventario y contrapartes · 5. Divisas en caja · 6. Facturación DIAN (opcional) · 7. Cumplimiento · 8. Reportes y migración          |
| **v1.5** — control y comodidad        | 9. Liquidez · 10. Doble control · 11. Tasa asistida · 12. WhatsApp · 12b. Comprobante (OCR) · 13. Permisos                              |
| 10. Doble control                     | Completa salvo monto y tasa fuera de rango (D166): solicitudes, bandeja, nadie aprueba lo propio, apagado por defecto                   |
| 11, 12, 12b                           | 12 en su primera etapa (recibo por WhatsApp con enlace); 11, la API de WhatsApp y 12b bloqueadas por definiciones externas (FASE-11-12) |
| 13. Permisos                          | Completa: el dueño configura los permisos de cada rol, con restricciones que nadie se salta                                             |
| **v2** — otros negocios               | Solo después de varios meses estables en Cambios JC                                                                                     |

| Fase             | Estado                                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Base          | Completa                                                                                                                                            |
| 1. Configuración | Completa en la rama `fase-1-configuracion`: bancos, sucursales, cajas, denominaciones, líneas de negocio, tasas y cuentas                           |
| Rediseño         | Interfaz nueva en la rama `rediseno-interfaz` (fuera de las fases numeradas; no cambia backend, rutas ni permisos)                                  |
| 2. Remesas       | Completa en la rama `fase-2-remesas`: clientes, remesas, cola del digitador, recibo, seguimiento público y avisos en vivo                           |
| 3. Caja          | Completa: turnos con arqueo por denominación, libro de movimientos, traslados, gastos, devoluciones y cierre de jornada                             |
| 4. Inventario    | Completa: contrapartes con cuenta corriente, compras de bolívares, costo promedio, ganancia por remesa y posición del día                           |
| 5. Divisas       | Completa: compra y venta de dólares en caja con billetes, inventario, ganancia y recibo                                                             |
| 6. Facturación   | Omitida: opcional y desactivada en Cambios JC (D149)                                                                                                |
| 7. Cumplimiento  | Completa con umbrales apagados hasta definirlos: ficha, nivel de riesgo, lista restrictiva, alertas y exporte CSV                                   |
| 8. Reportes      | Completa salvo la carga histórica de los .xlsx (bloqueada, ver FASE-8): reportes, histórico, tablero, exportación de datos y saldos de contrapartes |
| 9. Liquidez      | Completa: disponible, comprometido y libre, límites diarios, anticipos en tránsito, alertas y aviso al registrar                                    |

Cada fase vive en su propia rama (`fase-0-base`, `fase-1-configuracion`…) y se fusiona a `main` al cerrarla.

Lo que existe hoy: acceso, usuarios, empresa, bitácora, configuración y, desde la fase 2, la operación de remesas (vendedor, digitador y seguimiento del cliente). Lo contable empieza en la fase 3 (caja); el menú crece con cada fase.

## Interfaz

Layout A (panel lateral) con acento azul cielo, en tema claro y oscuro (D172; antes índigo, D75 a D80 en `docs/DECISIONES.md`).

- **Tokens:** todo color, espacio y tamaño sale de `apps/web/src/estilos/tokens.css`. Los componentes usan clases propias de `componentes.css`; no hay Tailwind ni librerías de componentes.
- **Tipografía:** Inter para texto y JetBrains Mono para cifras y códigos, servidas desde `apps/web/src/estilos/fuentes/` (licencia OFL incluida). No se pide nada a terceros.
- **Iconos:** propios, en `apps/web/src/componentes/Icono.tsx`; cada módulo del menú tiene el suyo para reconocerlo en el riel plegado.
- **Cifras:** las tasas se muestran con coma decimal (`5,19`) mediante `formatearTasa` en `apps/web/src/lib/formato.ts`. La API sigue enviando y recibiendo punto (`5.190000`).
- **Estructura (layout A, D172):** panel lateral a toda la altura con la marca, los módulos por grupo (General, Operación, Administración, Seguridad) y abajo el botón «Contraer / Expandir»; a su derecha, el encabezado con la fecha y la persona, y el contenido. En escritorio el panel se despliega (248 px) o se pliega a un riel de iconos (72 px) y recuerda la elección; en tableta (801 a 1100 px) arranca como riel y al desplegarlo flota encima del contenido; en celular es un cajón que se abre con ☰ y se cierra con la X, tocando fuera o con Escape. Quien solo tiene "Inicio" (el digitador) ve una estructura mínima sin panel.
- **Componentes compartidos** (`apps/web/src/componentes/`): `Notificaciones` (éxitos que se cierran solos), `MenuAcciones` (acciones de una fila, con teclado), `Pagina.tsx` (encabezado de página, barra de búsqueda y filtros, secciones de formulario, estado vacío y carga con forma) y `CamposEspeciales.tsx` (solo dígitos, teléfono con país y resumen de errores). Decisiones D82 a D95.
- **Movimiento (D96):** el panel lateral se despliega y se pliega con una transición suave. Las animaciones viven al final de `estilos/componentes.css` y usan los tokens `--transicion-*`. Si el sistema operativo tiene desactivadas las animaciones (en Windows: Configuración → Accesibilidad → Pantalla → "Mostrar animaciones en Windows"), la interfaz no anima nada: es lo esperado.
- **Datos por partes:** el NIT, los teléfonos y la dirección se capturan por partes y se guardan como un solo texto (`lib/empresa.ts`, `lib/telefono.ts`). La API no cambió.
- **Tasas a mano:** se pueden escribir con coma o con punto. Un valor ambiguo como `3.200` no se publica: el campo pide aclararlo.
- **Actividad:** es la bitácora de auditoría con otro nombre en el menú y en lenguaje claro. Los registros, el permiso y la protección contra cambios son los mismos.

## Requisitos

| Herramienta | Versión             | Comprobar                                                       |
| ----------- | ------------------- | --------------------------------------------------------------- |
| Node.js     | 26 o superior       | `node -v`                                                       |
| Git         | cualquiera reciente | `git --version`                                                 |
| PostgreSQL  | 18                  | Windows: servicio `postgresql-x64-18` · macOS: `psql --version` |

No hace falta Docker para desarrollar (ver D14 en `docs/DECISIONES.md`).

## Levantar el proyecto desde cero

### 1. Instalar PostgreSQL 18

- **Windows:** instalador oficial de EDB (https://www.postgresql.org/download/windows/). Anota la contraseña del usuario `postgres`. Queda como servicio `postgresql-x64-18` en el puerto 5432.
- **macOS:** `brew install postgresql@18` y `brew services start postgresql@18`, o Postgres.app.

### 2. Clonar e instalar

```bash
git clone https://github.com/jamesQM-771/cambios-jc.git
cd cambios-jc
npm install
```

### 3. Crear el usuario y las bases de datos

1. Abre `scripts/db-preparar.sql` y cambia `CAMBIA_ESTA_CLAVE` por una clave propia (no la subas al repositorio).
2. Ejecútalo como `postgres`:
   - **Windows (pgAdmin):** abre el servidor → _Query Tool_ → pega el contenido → ejecutar.
   - **Windows (consola):** `"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -f scripts/db-preparar.sql`
   - **macOS:** `psql -U postgres -f scripts/db-preparar.sql` (con Homebrew el superusuario puede ser tu usuario: `psql -d postgres -f ...`).
3. Deshaz el cambio en el archivo: `git checkout scripts/db-preparar.sql`.

Se crean el usuario `cambios_jc` y dos bases: `cambios_jc` (desarrollo) y `cambios_jc_pruebas` (pruebas automáticas).

### 4. Variables de entorno

```bash
cp .env.example .env
```

Completa en `.env` la clave de `DATABASE_URL` y `DATABASE_URL_PRUEBAS`. Cada variable indica en qué tarea empieza a usarse.

### 5. Arrancar en desarrollo

La primera vez (y cada vez que haya migraciones nuevas), prepara la base:

```bash
npm run db:migrate
npm run db:seed
```

Luego:

```bash
npm run dev
```

- API: http://localhost:3000
- Web: http://localhost:5173

La API está lista cuando la terminal muestra `Server listening at http://127.0.0.1:3000`; antes de eso la web responde con un error de conexión.

#### Para usar el sistema sin esperar: `npm run iniciar`

Con `npm run dev` la API se transpila al vuelo y en un equipo lento tarda **entre 30 y 60 segundos** en responder (medido; ver D81). Mientras tanto la web ya abre, pero cualquier intento de entrar falla con "El servidor todavía no responde". No está caída: hay que esperar la línea `Server listening at http://127.0.0.1:3000`.

Para navegar y probar el sistema (no para programar la API) es más rápido usar la versión compilada:

```bash
npm run compilar   # una vez, y de nuevo cada vez que cambie el código de la API o de shared
npm run iniciar    # API compilada + web; la API responde en unos 10 segundos
```

Luego abre http://localhost:5173/acceso. Para detenerlo, `Ctrl+C` en esa terminal. Si un arranque anterior quedó abierto, ciérralo antes: dos copias pelean por los puertos 3000 y 5173.

#### En Windows, con doble clic: `iniciar-windows.bat`

Para usar el sistema sin escribir comandos ni pasar por GitHub, haz doble clic en `iniciar-windows.bat`
(raíz del proyecto). Ejecuta `scripts/iniciar-windows.ps1`, que trabaja solo con el código de la carpeta:

1. Revisa Node.js 26 y enciende el servicio de PostgreSQL si está detenido.
2. La primera vez pregunta las claves, crea la base con `scripts/db-preparar.sql` y escribe el `.env`.
3. Instala dependencias si faltan (`npm install`; solo esto usa internet).
4. Aplica migraciones pendientes con `prisma migrate deploy`, que nunca borra datos ni pregunta.
5. Compila solo si el código cambió y arranca con `npm run iniciar`; abre el navegador cuando la web responde.

#### Para abrirlo desde un celular en la misma red: `npm run iniciar:red`

`npm run iniciar` solo escucha en tu equipo (`localhost`), a propósito: el sistema maneja dinero y no
debe quedar a la vista de toda la red sin que lo decidas. Para probar la cola del digitador desde un
teléfono conectado a la misma wifi:

```bash
npm run iniciar:red
```

Vite muestra entonces una línea `Network: http://192.168.x.x:5173/`. Esa es la dirección que abres en
el teléfono. La API no se expone: la web habla con ella por dentro de tu equipo (`/api`), así que el
teléfono solo necesita la dirección de la web. Si Windows pregunta por el Firewall, permite Node.js en
**redes privadas**. Cuando termines, detén con `Ctrl+C` y vuelve a `npm run iniciar`.

## Comandos

| Comando                            | Qué hace                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `npm run iniciar`                  | API compilada + web, para usar y probar el sistema (antes: `npm run compilar`)               |
| `npm run dev`                      | API y web en modo desarrollo                                                                 |
| `npm run db:migrate`               | Aplica migraciones (desde la tarea 0.4)                                                      |
| `npm run db:seed`                  | Datos ficticios y administrador inicial (desde la tarea 0.4)                                 |
| `npm run test`                     | Pruebas                                                                                      |
| `npm run e2e`                      | Recorrido de una remesa y del cierre del día en un navegador real (compila antes; ver abajo) |
| `npm run lint`                     | ESLint + formato con Prettier                                                                |
| `npm run typecheck`                | Verificación de tipos                                                                        |
| `npm run check`                    | lint + typecheck + pruebas (obligatorio antes de cada commit)                                |
| `npm run build`                    | Compila todos los paquetes (`shared` primero)                                                |
| `npm run start -w @cambios-jc/api` | Arranca la API ya compilada (tras `npm run build`)                                           |
| `npm run format`                   | Aplica el formato de Prettier                                                                |

## Pruebas de extremo a extremo

`npm run e2e` abre un navegador real (Chromium) y recorre una remesa completa: el vendedor la
registra y emite el recibo, el digitador la paga desde un teléfono, el vendedor recibe el aviso en
vivo y el cliente la consulta con su código. Antes, el vendedor abre su turno en Mi turno; después
registra un gasto y un traslado, cierra el turno con arqueo y el administrador cierra la jornada.
Usa la API compilada y la base `*_pruebas` (que rehace desde cero en cada corrida), nunca la de
desarrollo. No forma parte de `npm run check` porque necesita compilar y un navegador.

La primera vez: `npm run navegadores -w @cambios-jc/e2e` (descarga Chromium, unos 120 MB). Si falla,
`e2e/test-results/` guarda el rastro de cada paso (`npx playwright show-trace`).

## Pruebas de la API con base de datos

`npm run check` reinicia la base `cambios_jc_pruebas` (borra y vuelve a crear todas sus tablas) antes de las pruebas de integración. Por seguridad, se niega a reiniciar cualquier base cuyo nombre no termine en `_pruebas`.

Para repetir solo las pruebas de la API sin reiniciar la base (más rápido), con la base de pruebas ya migrada:

```bash
CONSERVAR_BASE_PRUEBAS=1 npx vitest run --project api
```

## Primer acceso del administrador

1. En `.env`, define `ADMIN_LOGIN_INICIAL` y `ADMIN_CONTRASENA_INICIAL` (mínimo 10 caracteres) y ejecuta `npm run db:seed`.
2. Ejecuta `npm run dev` y abre http://localhost:5173.
3. Inicia sesión con esas credenciales. La contraseña es temporal: el sistema pide cambiarla.
4. Configura la verificación en dos pasos: escanea el código QR con Google Authenticator (o Authy) y escribe el primer código de 6 dígitos. El mismo QR se puede escanear en **varios teléfonos**: todos darán los mismos códigos.
5. Los accesos siguientes piden usuario, contraseña y el código de la aplicación.

> Si recargas la página a mitad del acceso, empiezas de nuevo desde el usuario y la contraseña.

### Credenciales en la instalación local

- **Usuario:** el de `ADMIN_LOGIN_INICIAL` en `.env` (en la instalación de desarrollo de Cambios JC es `admin`).
- **Contraseña:** la que el administrador eligió en su primer acceso. **No se escribe en este repositorio** ni en ningún archivo que se suba a Git (ver `CLAUDE.md` §7); guárdala en un gestor de contraseñas.
- **Código de 6 dígitos:** el de la aplicación de autenticación del teléfono.
- La semilla (`npm run db:seed`) solo crea al administrador la primera vez: cambiar `ADMIN_CONTRASENA_INICIAL` después no cambia la contraseña de un administrador que ya existe.
- Si se olvida la contraseña o se pierde el teléfono, ver [Recuperar el acceso de un administrador](#recuperar-el-acceso-de-un-administrador).

## Cómo se conecta la web con la API

La web siempre habla con la API por el mismo origen, bajo `/api`: en desarrollo, Vite reenvía `/api/*` a la API (el puerto sale de `PUERTO_API` en `.env`); en producción lo hará el servidor web. Así la cookie de sesión funciona sin configurar CORS.

`CLAVE_CIFRADO_2FA` (en `.env`) cifra los secretos de la verificación en dos pasos en la base de datos. Si la cambias, los secretos ya guardados dejan de servir y hay que reiniciar el 2FA de cada usuario. Genérala con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Logo y archivos subidos

El logo de la empresa se sube desde el sistema (PNG o JPG, máximo 1 MB) y se guarda en la carpeta que indica `CARPETA_SUBIDAS` del `.env` (por defecto `uploads`, dentro de `apps/api`; Git la ignora).

- **Respaldos:** esa carpeta no está en la base de datos; `scripts/respaldo.sh` la respalda junto con ella (ver abajo).
- Al reemplazar el logo, el archivo anterior se conserva en disco; solo cambia cuál está activo.

## Respaldo y restauración

`scripts/respaldo.sh` guarda dos archivos con la fecha y la hora en el nombre: la base de datos (`cambios_jc_AAAA-MM-DD_HHMMSS.dump`, formato comprimido de `pg_dump`) y la carpeta de subidas (`subidas_….tar.gz`). Lee `DATABASE_URL` y `CARPETA_SUBIDAS` del `.env`.

```bash
scripts/respaldo.sh
```

| Variable (opcional)   | Para qué                                                            | Por defecto                             |
| --------------------- | ------------------------------------------------------------------- | --------------------------------------- |
| `RESPALDOS_DIR`       | Carpeta de destino                                                  | `respaldos/` en la raíz (Git la ignora) |
| `RESPALDOS_CONSERVAR` | Cuántos respaldos de cada tipo se guardan; los más viejos se borran | 14                                      |
| `PG_BIN`              | Carpeta de `pg_dump` si no está en el `PATH`                        | —                                       |

Necesita el cliente de PostgreSQL 18 (`pg_dump`) y Node. **Guarda una copia fuera del servidor** (otro disco o un servicio en la nube): un respaldo en el mismo disco no sirve si el disco se daña.

### Restaurar en una base vacía

1. Crea una base vacía (con un usuario que pueda crear bases):

   ```bash
   createdb -U postgres cambios_jc_restaurada
   ```

2. Restaura el respaldo de la base de datos:

   ```bash
   pg_restore --no-owner --exit-on-error -U postgres -d cambios_jc_restaurada respaldos/cambios_jc_2026-10-02_030000.dump
   ```

3. Restaura las subidas (el logo) en la carpeta de `CARPETA_SUBIDAS`:

   ```bash
   mkdir -p apps/api/uploads && tar -xzf respaldos/subidas_2026-10-02_030000.tar.gz -C apps/api/uploads
   ```

4. Apunta `DATABASE_URL` del `.env` a la base restaurada y arranca la API. La bitácora, los usuarios y las sesiones vuelven tal como estaban (los triggers que impiden editar la bitácora también se restauran).

> Prueba la restauración de vez en cuando en una base de prueba: un respaldo que nunca se ha restaurado no es una garantía.

### Programar el respaldo diario

En el servidor Linux, con `cron` (`crontab -e`), por ejemplo todos los días a las 3:00 a. m.:

```cron
0 3 * * * cd /ruta/a/cambios-jc && scripts/respaldo.sh >> respaldos/respaldo.log 2>&1
```

En Windows (equipo de desarrollo), el Programador de tareas puede ejecutar `bash scripts/respaldo.sh` (con Git Bash) a la hora que quieras.

## Recuperar el acceso de un administrador

Si ningún administrador puede entrar (perdió el teléfono con el 2FA y no hay otro administrador que lo reinicie), se usa el script de emergencia **en el servidor**. No está en la API: hace falta acceso al servidor y a su `.env`.

```bash
npm run build
npm run admin:restablecer -w @cambios-jc/api -- login-del-administrador
```

Pide escribir el login otra vez para confirmar. Después:

- La contraseña pasa a ser una **temporal nueva**, que se muestra una sola vez. Entrégala en persona.
- El 2FA se reinicia: al entrar tendrá que configurarlo de nuevo.
- Si el usuario estaba desactivado, se reactiva; se levanta el bloqueo y se cierran sus sesiones.
- Solo funciona con usuarios administradores y queda registrado en la bitácora (`usuario.restablecer_acceso_emergencia`, sin usuario y con origen "script de emergencia").

Para no llegar a esto: **tener al menos dos administradores** y escanear el QR del 2FA en más de un teléfono.

## Monitoreo de errores (Sentry, opcional)

Sentry está desactivado a menos que haya un DSN. Para activarlo, define en el `.env`:

- `SENTRY_DSN` para la API.
- `VITE_SENTRY_DSN` para la web (se lee al compilar o arrancar la web; normalmente es otro DSN).

Solo se envían errores inesperados (los 500 de la API y los errores no controlados de la pantalla), con la traza y el tipo de error. **No se envían** usuario, IP, cookies, cabeceras, cuerpos de las peticiones, parámetros de la dirección, variables locales ni código fuente; las cuentas bancarias que aparezcan en un mensaje se enmascaran.
