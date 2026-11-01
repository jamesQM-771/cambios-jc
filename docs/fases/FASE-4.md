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
| 4.3 | Inventario de bolívares con costo promedio ponderado móvil, inventario inicial y ajuste | Pendiente |
| 4.4 | Compras de bolívares a contrapartes: de contado, a crédito o contra anticipo (fondeo) | Pendiente |
| 4.5 | Ganancia neta por remesa al pagarse, con su costo bancario | Pendiente |
| 4.6 | Jornada: ganancia del día, contrapartes y posición total | Pendiente |
| 4.7 | Pantallas (contrapartes, compras, inventario, ganancia y titular de cuenta) | Pendiente |
| 4.8 | Pruebas de extremo a extremo y cierre | Pendiente |
