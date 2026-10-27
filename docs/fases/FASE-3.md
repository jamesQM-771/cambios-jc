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
| 3.9 | Pantallas (por partes: Mi turno ✓ · devolver ✓ · traslados ✓ · gastos ✓ · jornada · categorías) | En curso |
| 3.10 | Pruebas de extremo a extremo y cierre | Pendiente |
