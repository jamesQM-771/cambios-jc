# Registro de decisiones

Cada decisión técnica o de negocio no obvia se anota aquí. Formato: fecha · decisión · motivo · alternativas descartadas.

## Decisiones previas al desarrollo (2026-09-27)

| # | Decisión | Motivo | Descartado |
|---|---|---|---|
| D1 | Stack React + Node (Fastify) + PostgreSQL, todo en TypeScript | Uso real con varios usuarios en dos países; tipos para montos y estados | React + localStorage (DivSoft), PHP |
| D2 | Una instalación independiente por negocio | Pocos clientes conocidos; cada negocio custodia sus datos; menos complejidad | Plataforma multiempresa compartida con RLS |
| D3 | Montos con `Decimal`, nunca `float`; en JSON como string | Precisión en dinero | `number` de JavaScript |
| D4 | Nada se borra; las operaciones se anulan con motivo | Trazabilidad y control | Borrado físico o lógico sin motivo |
| D5 | Costo promedio ponderado móvil por divisa (pendiente de confirmar con el dueño y el contador) | El Excel promedia puntos sin ponderar; ≈ 9 % de diferencia acumulada | Promedio simple diario del Excel |
| D6 | Contrapartes como cuentas corrientes separadas del dinero disponible | Préstamos y deudas descuadraban el arqueo del Excel | Saldos digitados a mano en la fila de totales |
| D7 | Tasas = referencia + margen por línea de negocio, con cambio manual registrado | Así opera el negocio y se necesita flexibilidad | Tasa fija o solo manual |
| D8 | Roles base: administrador, vendedor, digitador | Son los que ya usa el negocio | Nombres nuevos (cajero, operador) |
| D9 | El digitador solo recibe titular, banco, cuenta o teléfono, cédula del titular y monto en bolívares | Mínima información; así trabaja hoy | Mostrar la operación completa |
| D10 | Recibo en ticket térmico por operación; facturación electrónica como módulo opcional, desactivado en Cambios JC | Así opera hoy el local | Facturación electrónica obligatoria |
| D11 | Migración desde la exportación `.xlsx` del programa actual y desde el Excel contable | No hay acceso al código ni a la base del programa actual | Acceso directo a su base de datos |
| D12 | Una fase a la vez, con plan previo y revisión al terminar | Proyecto grande, un solo desarrollador revisando | Construir todo de una vez |

## Arranque de la fase 0 (2026-09-27)

| # | Decisión | Motivo | Descartado |
|---|---|---|---|
| D13 | Node.js 26 como versión objetivo (local, CI y producción) | Es la versión instalada en el equipo de desarrollo y pasa a LTS en octubre de 2026. Riesgo: módulos nativos (argon2) sin binarios para Node 26; se verifica en la tarea 0.7 | Node 22 (en mantenimiento), Node 24 |
| D14 | PostgreSQL 18 en todos los entornos; en desarrollo, instalación nativa de Windows sin Docker ni WSL2, con bases separadas para desarrollo y pruebas. En CI, PostgreSQL 18 como servicio de GitHub Actions | En el equipo de desarrollo no se pueden ejecutar Docker ni WSL2, y PostgreSQL 18 ya está instalado. Usar la misma versión en todos lados evita diferencias | PostgreSQL 16 (versión inicial de la especificación), Docker local |
| D15 | Los montos en bolívares se guardan y muestran con **3 decimales** (`162000 ÷ 3,76 = 43085,106`), columna `Decimal(18,3)`. El resultado se **trunca** al tercer decimal (confirmado por el usuario: `49800 ÷ 3,76 = 13244,680`, no `13244,681`) | Decisión del usuario. El programa actual trunca a bolívares enteros (150000 ÷ 3,76 exporta 39893 en vez de 39893,62) y pierde valor | Enteros truncados (programa actual), 2 decimales |
| D16 | Repositorio Git propio en `cambios-jc/`, remoto privado `jamesQM-771/cambios-jc`. Los archivos con datos reales (p. ej. `ver_transferencia.xls`) quedan fuera del repositorio | La carpeta de usuario tenía un `git init` accidental; `CLAUDE.md §7` prohíbe subir datos reales | Trabajar dentro del repositorio de la carpeta de usuario |
| D17 | No hay Excel contable fiable para usar como fuente de verdad | Informado por el usuario. Riesgo: las pruebas contra resultados esperados (§9.4) y la migración §11.2 dependerán de casos armados a mano y de saldos iniciales | Validar contra el Excel histórico |
| D18 | TypeScript **6.0.3** en vez de la última (7.0.2) | `typescript-eslint` 8.70.1 solo admite TypeScript `>=4.8.4 <6.1.0`; con la 7 no hay lint con tipos. Se revisa cuando `typescript-eslint` soporte la 7 | TypeScript 7 sin lint con tipos |
| D19 | Tarea 0.1: `npm run dev`, `db:migrate` y `db:seed` son marcadores (`scripts/pendiente.mjs`) que fallan con un mensaje hasta las tareas 0.2 y 0.4. `npm run lint` incluye `prettier --check`. `packages/shared` se consume como código fuente TS (`exports` → `src/index.ts`); cómo se empaqueta la API con `shared` se define en la tarea 0.6 | Mantener §9 de `CLAUDE.md` completo sin adelantar tareas; que el formato también bloquee el commit | Omitir scripts hasta tenerlos; compilar `shared` antes de cada uso |
| D20 | Tarea 0.2 adelanta la instalación mínima de Fastify (API con `GET /`) y de Vite + React (página provisional), previstas para 0.6 y 0.10, más `concurrently` y `tsx` | El criterio de aceptación de 0.2 exige que `npm run dev` levante API y web | Dejar `dev` como marcador hasta 0.6/0.10 |
