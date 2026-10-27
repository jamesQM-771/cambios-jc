# Fase 3 — Caja

> Referencia: `docs/PROYECTO.md` §5.16 (turnos y arqueo), §5.11 (gastos), §7.6 (fórmulas de caja), §12 (MVP, fase 3).
> Rama: `fase-3-caja` (creada desde `fase-2-remesas`).

## Objetivo

Que cada vendedor abra y cierre su turno contando el efectivo por denominación, que el sistema sepa
cuánto debería haber en cada caja y que el administrador cierre la jornada del día.

**Fuera de alcance:** ganancia neta por remesa (necesita el costo promedio de los bolívares, fase 4),
contrapartes (fase 4), divisas en caja (fase 5), doble control (fase 10).

## Decisiones de negocio (confirmadas el 2026-10-21)

| # | Tema | Decisión |
|---|---|---|
| 1 | Turno para registrar remesas | Obligatorio para cualquiera que registre una remesa. |
| 2 | Turnos a la vez | Una caja y una persona, un solo turno abierto cada una. |
| 3 | Qué cuenta el vendedor al cerrar | Solo su caja física; bancos y billeteras los arquea el administrador al cerrar la jornada. |
| 4 | Tolerancia | Ninguna: toda diferencia es sobrante o faltante, con explicación obligatoria, atribuida a ese turno y vendedor. |
| 5 | Bóveda | Cuenta de efectivo de la sucursal sin puesto; los traslados son un movimiento con dos patas. |
| 6 | Devoluciones | Solo el administrador, con motivo; monto completo en pesos, por la misma vía que entró. |
| 7 | Gastos | Categorías en un catálogo simple; todo gasto sale de una cuenta; anular solo el administrador, con motivo. |
| 8 | Turno olvidado de otro día | Bloquea abrir otro en esa caja; el administrador lo cierra con motivo y la diferencia queda con el vendedor original. |
| 9 | Jornada | Se abre sola con el primer turno del día (hora de Bogotá); la reabre solo el administrador, con motivo. |
| 10 | Cuántas cajas y vendedores a la vez | Pendiente de respuesta; el diseño admite las que sean. |

## Tareas

Cada una termina con pruebas, `npm run check` en verde y commit.

| # | Tarea | Estado |
|---|---|---|
| 3.1 | Cuentas de efectivo ligadas a su caja; turnos con apertura por conteo de denominaciones | Hecha |
| 3.2 | Libro de movimientos por cuenta (entradas y salidas con su origen) | Hecha |
| 3.3 | La remesa queda ligada al turno que la registra | Hecha |
| 3.4 | Traslados entre cajas, bóveda y bancos | Hecha |
| 3.5 | Gastos: operativos y retiros del dueño | Hecha |
| 3.6 | Devoluciones de remesas | Hecha |
| 3.7 | Cierre de turno con arqueo | Hecha |
| 3.8 | Cierre de jornada, resumen y reapertura | Hecha |
| 3.9 | Pantallas (Mi turno, devolver, traslados, gastos, jornada y categorías) | Hecha |
| 3.10 | Pruebas de extremo a extremo y cierre | Hecha |

## Cierre de la fase

**Qué se hizo.** Cada vendedor abre su turno contando el efectivo por denominación, vende (la remesa
queda ligada a su turno), registra gastos y traslados, y cierra el turno con arqueo sin tolerancia;
el administrador cierra la jornada contando bóveda, bancos y billeteras, ve el resumen del día y puede
reabrirla con motivo. Todo el dinero pasa por un libro de movimientos de solo inserción (D120) del que
salen los saldos y los esperados. Hay pantallas para todo: Mi turno, Remesas (con devolución), Traslados,
Gastos, Jornada y Categorías de gasto (decisiones D116 a D134).

**Cómo probarla.**

- `npm run check` (lint, tipos y 1196 pruebas) debe quedar en verde.
- `npm run e2e` recorre en un navegador real: abrir turno desde Mi turno, remesa con recibo, pago del
  digitador en un teléfono, reimpresión, gasto de 10.000, traslado de 20.000 a la bóveda, cierre de
  turno (arqueo cuadrado en 20.000) y cierre de jornada con su resumen, más los permisos por rol.
  9 pasos, todos en verde. La primera vez: `npm run navegadores -w @cambios-jc/e2e`.
- A mano: `npm run compilar` y `npm run iniciar` (con `npm run iniciar:red` se ve desde el celular).

**Pendiente y límites conocidos.**

- Las pantallas nuevas se probaron con pruebas automáticas y con el e2e, pero nadie las ha usado todavía
  a mano en el celular ni en la impresora térmica.
- Un movimiento del administrador sin turno después de cerrar la jornada no se bloquea (D128).
- Un movimiento justo en el instante de cerrar un turno puede aparecer como diferencia en la siguiente
  apertura (D127).
- La decisión 10 (cuántas cajas y vendedores a la vez) sigue sin respuesta; el diseño admite las que sean.
- La nota de Obsidian del proyecto no se pudo actualizar (el servidor local no conectaba): pendiente.
- Fuera de alcance, para la fase 4: ganancia neta por remesa (costo promedio de los bolívares) y
  contrapartes.
