# Fase 5 — Divisas en caja

> Referencia: `docs/PROYECTO.md` §5.7 (divisas en caja), §7.2 (`pesos = dólares × tasa`), §7.3 (costo
> y ganancia), §5.16 (caja), §12 (v1, fase 5).
> Rama: `claude/jc-casa-cambio-dev-e35oml` (D136).

## Objetivo

Comprar y vender dólares en efectivo en la caja del turno, contando los billetes, con recibo, costo
promedio de la divisa y ganancia de cada venta.

**Fuera de alcance:** facturación electrónica (fase 6, desactivada en Cambios JC), ficha del cliente y
umbrales de cumplimiento (fase 7), doble control por monto (fase 10).

## Tareas

| # | Tarea | Estado |
|---|---|---|
| 5.1 | Modelo: operación de divisa con su consecutivo, billetes por operación e inventario USD | Hecha |
| 5.2 | Compra y venta en el turno: dinero en el libro, inventario, ganancia de la venta, tasa manual | Hecha |
| 5.3 | Anulación, consulta y recibo (original y COPIA) | Hecha |
| 5.4 | Resumen de la jornada con las divisas y su ganancia | Hecha |
| 5.5 | Pantalla Divisas (billetes, vista previa, recibo y anulación) | Hecha |
| 5.6 | Pruebas y cierre | Hecha |

## Cierre de la fase

**Qué se hizo.** `operacion_divisa` (compra o venta) con el mismo consecutivo de comprobante que las
remesas, la tasa publicada (compra o venta) o una manual con permiso y motivo, y los billetes de la
divisa contados uno a uno (`denominacion_operacion`), que deben sumar el monto exacto. El efectivo entra
y sale de las cuentas de efectivo de la caja del turno (una por moneda, D116), así el cierre de turno
arquea también los dólares. La compra alimenta el inventario USD con costo promedio; la venta sale al
costo vigente y fija su ganancia, visible solo con `ganancia.ver`. Anular (solo el administrador) devuelve
el dinero y deshace el inventario. Recibo en ticket: el primero es el original y los siguientes salen
como COPIA. El resumen de la jornada suma la ganancia de las ventas a la ganancia del día y muestra lo
comprado y vendido. Decisiones D145 a D148.

**Cómo probarla.** `npm run check` (1277 pruebas en verde). A mano: en Configuración, crear en la caja
una cuenta de efectivo en USD, dar de alta billetes en USD (Denominaciones) y publicar la tasa de la
línea Dólares con compra y venta; abrir el turno y registrar en Divisas una compra y una venta.

**Pendiente y límites conocidos.**

- El arqueo sigue siendo por total de cada moneda (D127). Los billetes de cada operación quedan
  registrados, pero el "esperado por denominación" (§7.6) no se calcula todavía: los traslados y gastos
  en USD no llevan billetes y el esperado quedaría incompleto (D148).
- El cliente es opcional y en texto libre (nombre y documento); la ficha y los umbrales llegan en la
  fase 7.
- El recorrido e2e en navegador no se amplió para divisas: cubren la fase las pruebas de integración y
  de pantalla. Agregarlo implica contar dólares en el cierre de turno del recorrido.
- Los billetes que entrega el cliente en pesos (en una venta) no se registran; solo los de la divisa.
