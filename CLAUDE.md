# CLAUDE.md — Instrucciones para trabajar en Cambios JC

Este archivo se lee al inicio de cada sesión. Define **cómo** se trabaja en este repositorio.
**Qué** se construye está en `docs/PROYECTO.md`.

---

## 1. Contexto en tres líneas

- Sistema web para una casa de cambio real en Cúcuta (Colombia): remesas COP → VES pagadas por un **digitador** en Venezuela, compra/venta de USD, contrapartes (deudas y préstamos) y caja diaria con arqueo.
- Reemplaza un Excel contable y un software operativo de terceros. Maneja **dinero real**: un error de cálculo es plata perdida.
- Una instalación por negocio (no es SaaS multiempresa). Usuarios: administrador, vendedor, digitador (supervisor y cumplimiento opcionales).

## 2. Documentos de referencia

| Archivo | Para qué |
|---|---|
| `docs/PROYECTO.md` | Especificación completa: módulos, reglas, fórmulas, modelo de datos, fases |
| `docs/flujo-operacion.mermaid` | Flujo de una jornada completa |
| `docs/fases/FASE-N.md` | Tareas y criterios de aceptación de la fase activa |
| `docs/DECISIONES.md` | Registro de decisiones técnicas (créalo si no existe) |
| `docs/datos-prueba/` | Archivos anonimizados del Excel y del programa actual |

Antes de implementar algo, lee la sección de `PROYECTO.md` que lo describe. Si el documento no lo cubre o se contradice, **pregunta**; no inventes reglas de negocio.

## 3. Forma de trabajo (obligatorio)

1. **Una fase a la vez.** Solo se trabaja la fase indicada por el usuario. No adelantes módulos de fases futuras, aunque parezca fácil.
2. **Plan antes de código.** Al empezar una fase o una tarea grande, presenta un plan corto (archivos, tablas, endpoints, pruebas) y **espera aprobación**.
3. **Tareas pequeñas.** Cada tarea termina con: código + pruebas + `npm run check` en verde + commit.
4. **Detente al terminar la fase.** Entrega un resumen: qué se hizo, cómo probarlo, qué quedó pendiente, decisiones tomadas. No sigas con la siguiente fase sin instrucción.
5. **Registra decisiones.** Toda decisión técnica no obvia va a `docs/DECISIONES.md` (fecha, decisión, motivo, alternativas descartadas).
6. **Si algo del plan no funciona**, detente y explica; no lo reemplaces en silencio por otra solución.

## 4. Stack aprobado

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 26 (LTS desde oct-2026; ver D13) |
| Lenguaje | TypeScript en modo `strict` en todo el repositorio |
| Monorepo | npm workspaces |
| Frontend | React 19 + Vite + React Router + TanStack Query |
| Backend | Fastify 5 |
| Validación | Zod (esquemas compartidos en `packages/shared`) |
| ORM | Prisma + PostgreSQL 18 (ver D14) |
| Colas | BullMQ + Redis 7 (desde la fase en que se necesiten; no en fase 0) |
| Tiempo real | Socket.IO (desde la fase 2) |
| Pruebas | Vitest (unitarias e integración); Playwright (e2e, desde fase 2) |
| Lint / formato | ESLint + Prettier |
| Contenedores | Docker + Docker Compose (solo producción y CI; en desarrollo PostgreSQL nativo, ver D14) |
| CI | GitHub Actions |

**No agregues dependencias fuera de esta lista sin preguntar.** Prohibido: Redux, Zustand, MUI, Tailwind, librerías de componentes UI, ORMs alternativos, `moment`.

Usa la última versión estable de cada paquete al crear el proyecto y fija versiones exactas en `package.json`.

## 5. Estructura del repositorio

```
cambios-jc/
├── apps/
│   ├── api/          # Fastify + Prisma
│   │   ├── prisma/   # schema.prisma, migraciones, seed
│   │   └── src/
│   │       ├── modulos/<modulo>/   # rutas, servicio, esquemas, pruebas de cada módulo
│   │       ├── plugins/            # auth, auditoría, errores, rate limit
│   │       └── lib/
│   └── web/          # React + Vite
│       └── src/
│           ├── paginas/
│           ├── componentes/
│           ├── modulos/<modulo>/
│           └── lib/
├── packages/
│   └── shared/       # esquemas Zod, tipos, utilidades de dinero, constantes de roles y permisos
├── docs/
├── docker-compose.yml
├── CLAUDE.md
└── package.json
```

## 6. Convenciones de código

### Idioma
- **Dominio en español, sin tildes ni ñ en identificadores:** `operacion`, `contraparte`, `tasaUsada`, `numeroComprobante`, `anio`.
- Términos técnicos genéricos pueden ir en inglés si es lo natural (`middleware`, `hook`, `handler`).
- Textos visibles al usuario: español correcto, con tildes.
- Usa el vocabulario del glosario (§3 de `PROYECTO.md`): vendedor, digitador, contraparte, punto, arqueo, jornada, turno.

### Dinero (reglas no negociables)
- **Nunca** `number` para montos, tasas ni márgenes. Usa `Decimal` (Prisma.Decimal / decimal.js) en todo el backend y en los cálculos compartidos.
- En la base de datos: montos `Decimal(18,2)`, montos en bolívares `Decimal(18,3)` (ver D15), tasas y márgenes `Decimal(18,6)`.
- En JSON viajan como **string** (`"162000.00"`), nunca como número.
- Redondeo solo al fijar el monto final o al mostrar; nunca en pasos intermedios. Modo de redondeo: `ROUND_HALF_UP`, documentado en `packages/shared`.
- Toda función que calcule dinero vive en `packages/shared/src/dinero/` o en el servicio del módulo, **nunca en un componente React**, y tiene pruebas.
- Formato de pantalla: `COP 162.000`, `VES 43.085,106`, `USD 150,00` (separador de miles `.`, decimales `,`). No usar el signo `$` solo: es ambiguo entre pesos y dólares.

### Datos
- **Nada se borra.** Las operaciones se anulan con motivo. No hay `DELETE` en tablas de negocio.
- Toda mutación registra quién, cuándo y qué en la **bitácora de auditoría** (tabla de solo inserción).
- Fechas en UTC en la base; se muestran en `America/Bogota`. La fecha de una operación la pone el servidor, nunca el cliente.
- Migraciones con `prisma migrate`. Nunca edites una migración ya aplicada; crea una nueva.
- Operaciones que mueven dinero van dentro de una **transacción**.

### API
- Cada ruta valida entrada y salida con Zod.
- Cada ruta declara el **permiso** que exige (`operacion.crear`, `usuario.gestionar`…). Sin permiso declarado no se registra la ruta.
- Errores con formato uniforme: `{ error: { codigo, mensaje, detalles? } }`. Mensajes en español, sin exponer trazas ni SQL.
- Endpoints que crean operaciones aceptan una **clave de idempotencia**.

### Frontend
- Estado del servidor con TanStack Query; estado local con `useState`/`useReducer`. Sin librería global de estado.
- Estilos con variables CSS (tokens) y clases propias. Si existe `docs/design/tokens.css`, úsalo como base.
- Toda pantalla debe funcionar en móvil (la del digitador es móvil primero).

## 7. Seguridad

- No subas secretos: usa `.env` (ignorado) y mantén `.env.example` actualizado.
- Contraseñas con **argon2**. 2FA TOTP obligatorio para todos los usuarios.
- Cookie de sesión `httpOnly`, `secure` (en producción), `sameSite=strict`.
- Rate limit en login y en endpoints sensibles.
- **No uses datos reales de clientes** en código, pruebas, seeds ni commits. Solo los archivos anonimizados de `docs/datos-prueba/`.
- Los logs no incluyen contraseñas, códigos 2FA, cédulas ni números de cuenta completos (enmascarar: `0102 **** **** **** 4441`).
- El digitador **nunca** recibe del backend montos en pesos, tasa, ganancia ni datos del remitente. Esto se garantiza en el backend, no solo ocultándolo en la pantalla.

## 8. Pruebas

- Toda regla de negocio y todo cálculo de dinero: prueba unitaria.
- Todo endpoint: al menos una prueba de integración con base de datos real (base PostgreSQL de pruebas separada de la de desarrollo), incluyendo el caso **sin permiso**.
- Casos límite obligatorios en cálculos: cero, montos grandes, muchos decimales, redondeo.
- Cuando existan, usa los archivos de `docs/datos-prueba/` para pruebas contra resultados esperados.
- `npm run check` = lint + typecheck + pruebas. Debe pasar antes de cada commit.

## 9. Comandos

Mantén estos scripts en el `package.json` raíz y actualiza esta sección si cambian:

```bash
npm install            # instala todo el monorepo
# PostgreSQL 18 debe estar corriendo (servicio nativo en desarrollo; ver README)
npm run dev            # api + web en modo desarrollo
npm run db:migrate     # aplica migraciones
npm run db:seed        # datos de ejemplo ficticios + usuario administrador inicial
npm run test           # pruebas
npm run lint
npm run typecheck
npm run check          # lint + typecheck + test
npm run build
```

## 10. Git

- Rama por fase: `fase-0-base`, `fase-1-configuracion`…
- Commits pequeños en español con prefijo: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`.
- Nunca hagas commit con `npm run check` en rojo.

## 11. Lo que NO se construye

Aunque parezca útil, no implementes sin instrucción explícita:
- Registro de usuarios desde fuera (los crea el administrador).
- App o web para que el cliente final envíe dinero.
- Criptomonedas, contabilidad NIIF completa, integración con bancos venezolanos.
- Modo sin conexión completo.
- Multiempresa compartida (RLS, suscripciones).
- Facturación electrónica (módulo opcional, fase posterior y desactivado en Cambios JC).
