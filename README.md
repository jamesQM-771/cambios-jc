# Cambios JC

Sistema de operación y contabilidad para Cambios JC: remesas COP → VES, compra y venta de USD, contrapartes y caja diaria.

- Especificación: [`docs/PROYECTO.md`](docs/PROYECTO.md)
- Reglas de trabajo: [`CLAUDE.md`](CLAUDE.md)
- Fase actual: [`docs/fases/FASE-0.md`](docs/fases/FASE-0.md)
- Decisiones: [`docs/DECISIONES.md`](docs/DECISIONES.md)

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

```bash
npm run dev
```

- API: http://localhost:3000
- Web: http://localhost:5173

## Comandos

| Comando                            | Qué hace                                                      |
| ---------------------------------- | ------------------------------------------------------------- |
| `npm run dev`                      | API y web en modo desarrollo                                  |
| `npm run db:migrate`               | Aplica migraciones (desde la tarea 0.4)                       |
| `npm run db:seed`                  | Datos ficticios y administrador inicial (desde la tarea 0.4)  |
| `npm run test`                     | Pruebas                                                       |
| `npm run lint`                     | ESLint + formato con Prettier                                 |
| `npm run typecheck`                | Verificación de tipos                                         |
| `npm run check`                    | lint + typecheck + pruebas (obligatorio antes de cada commit) |
| `npm run build`                    | Compila todos los paquetes (`shared` primero)                 |
| `npm run start -w @cambios-jc/api` | Arranca la API ya compilada (tras `npm run build`)            |
| `npm run format`                   | Aplica el formato de Prettier                                 |

## Pruebas de la API con base de datos

`npm run check` reinicia la base `cambios_jc_pruebas` (borra y vuelve a crear todas sus tablas) antes de las pruebas de integración. Por seguridad, se niega a reiniciar cualquier base cuyo nombre no termine en `_pruebas`.

Para repetir solo las pruebas de la API sin reiniciar la base (más rápido), con la base de pruebas ya migrada:

```bash
CONSERVAR_BASE_PRUEBAS=1 npx vitest run --project api
```
