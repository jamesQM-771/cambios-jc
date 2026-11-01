# Fase 4 — Inventario y contrapartes

> Referencia: `docs/PROYECTO.md` §5.5 (costos por operación), §5.6 (compra de moneda destino),
> §5.8 (contrapartes), §5.9 (cuentas y titular), §7.3 (costo y ganancia), §7.5 (contrapartes),
> §7.6 (resumen de la jornada), §12 (v1, fase 4).
> Rama: `claude/jc-casa-cambio-dev-e35oml` (rama de trabajo de la sesión; ver D136).

## Objetivo

Que el sistema sepa a cuánto le costaron los bolívares que paga el digitador, cuánto ganó cada remesa
neta de costos bancarios, y cuánto le debe o le debe el negocio a cada contraparte, separado del dinero
disponible.

**Fuera de alcance:** divisas en caja (fase 5), doble control para ajustes (fase 10; mientras tanto el
ajuste es solo del administrador y con motivo), tablero de liquidez y compras en tránsito (fase 9),
"ganancia método Excel" y carga de saldos del Excel (fase 8).

## Decisiones de negocio provisionales

Las preguntas abiertas de `PROYECTO.md` §13 que afectan a esta fase no tienen respuesta del dueño. Se
toma lo que ya describe la especificación, se registra en `DECISIONES.md` y se puede cambiar sin
migrar datos:

| # | Pregunta abierta | Lo que se hace mientras tanto |
|---|---|---|
| 3 | ¿Costo promedio ponderado móvil? | Sí, como dice §7.3 (D138). |
| 5 | ¿Deudas en bolívares o dólares? | Saldo por moneda (COP, VES y USD), como dice §5.8 (D137). |
| 17 | ¿El titular de una cuenta VES es la misma contraparte que vende bolívares? | La cuenta puede asociarse a una contraparte titular, opcional (D137). |
| — | §7.6 resta las devoluciones de la ganancia del día | No se restan: una devolución reembolsa una remesa que nunca generó ganancia (D142). Pendiente de confirmar. |

## Tareas

Cada una termina con pruebas, `npm run check` en verde y commit.

| # | Tarea | Estado |
|---|---|---|
| 4.1 | Contrapartes: catálogo y contraparte titular de una cuenta | Hecha |
| 4.2 | Cuenta corriente: movimientos por tipo, saldo por moneda y anulación | Hecha |
| 4.3 | Inventario de bolívares con costo promedio ponderado móvil, inventario inicial y ajuste | Hecha |
| 4.4 | Compras de bolívares a contrapartes: de contado, a crédito o contra anticipo (fondeo) | Hecha |
| 4.5 | Ganancia neta por remesa al pagarse, con su costo bancario | Hecha |
| 4.6 | Jornada: ganancia del día, contrapartes y posición total | Hecha |
| 4.7 | Pantallas (contrapartes, compras, inventario, ganancia y titular de cuenta) | Hecha |
| 4.8 | Pruebas de extremo a extremo y cierre | Hecha |

## Cierre de la fase

**Qué se hizo.** Contrapartes con cuenta corriente por moneda (préstamos, abonos, anticipos, ajustes y
compras a crédito; solo inserción, anulación con movimiento contrario) y contraparte titular en las
cuentas; inventario de bolívares con costo promedio ponderado móvil, inventario inicial y ajustes;
compras a contrapartes de contado o a crédito (el fondeo contra anticipo descuenta el anticipo) con
anulación; ganancia neta de cada remesa fijada al pagarse, neta de su costo bancario, visible solo con
`ganancia.ver`; y el resumen de la jornada con ganancia del día, contrapartes, devoluciones pendientes y
posición total. Pantallas: Contrapartes, Compras, Inventario, ganancia en el detalle de la remesa,
resumen del día y titular en el formulario de cuentas (decisiones D136 a D144).

**Cómo probarla.**

- `npm run check`: lint, tipos y 1259 pruebas en verde (en este contenedor, con Node 22 y PostgreSQL 16;
  conviene repetirlo con Node 26 y PostgreSQL 18).
- `npm run e2e`: 11 pasos en verde, con la compra, la ganancia y el resumen del día. En un entorno donde
  no se debe reiniciar la base: crear una base `*_pruebas` vacía, apuntar `DATABASE_URL_PRUEBAS` a ella
  y correr con `CONSERVAR_BASE_PRUEBAS=1` (y `CHROMIUM_RUTA` si el navegador ya está instalado).
- A mano: `npm run db:migrate`, `npm run compilar`, `npm run iniciar`. Orden sugerido: crear una
  contraparte, cargar el inventario inicial (Inventario → Ajustar) o registrar una compra, pagar una
  remesa como digitador y abrirla como administrador.

**Pendiente y límites conocidos.**

- Preguntas de negocio resueltas de forma provisional (ver la tabla del inicio y D137, D138, D142):
  costo promedio ponderado, deudas en varias monedas, titular = contraparte y no restar devoluciones de
  la ganancia del día. Confirmar con el dueño.
- El ajuste de contrapartes e inventario es solo del administrador con motivo; el doble control llega
  en la fase 10.
- Las remesas pagadas entre una compra y su anulación conservan el costo con que se pagaron (D139).
- Las pruebas de integración dejan remesas sin transferencia en la base de pruebas; con
  `CONSERVAR_BASE_PRUEBAS=1` sobre una base usada, el listado de remesas falla. Usar siempre una base
  nueva en ese modo (es lo que hace el reinicio normal).
- Nadie ha usado todavía estas pantallas a mano en el celular.
- Fuera de alcance: divisas en caja (fase 5), "ganancia método Excel" y carga de saldos del Excel
  (fase 8), compras en tránsito y tablero de liquidez (fase 9).
