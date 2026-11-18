# Fase 10 — Doble control

> Referencia: `docs/PROYECTO.md` §5.12, §6.2 (reglas transversales: "nadie aprueba su propia solicitud"),
> §13 pregunta 11 (montos de doble control: pendiente). Rama: `claude/jc-casa-cambio-dev-e35oml` (D136).

## Tareas

| # | Tarea | Estado |
|---|---|---|
| 10.1 | Solicitudes de aprobación con la acción guardada y ejecución diferida al aprobar | Hecha |
| 10.2 | Reapertura de jornada, devoluciones, anulaciones (remesas, divisas, compras, gastos, traslados) y ajustes (contrapartes e inventario) | Hecha |
| 10.3 | Bandeja: aprobar o rechazar; nadie resuelve lo propio (también en la base) | Hecha |
| 10.4 | Pantalla Aprobaciones con qué acciones lo requieren; avisos de "pendiente" en las pantallas | Hecha |
| 10.5 | Remesa o divisas por encima de un monto; tasa manual fuera de rango | **Pendiente** (D166) |

## Cierre de la fase

**Qué se hizo.** `solicitud_aprobacion` guarda la acción y sus datos; cuando una regla está encendida, la
ruta responde **202** con la solicitud en lugar de ejecutar. Al aprobar, otra persona (permiso
`aprobacion.aprobar`) ejecuta la acción con su nombre; si falla, la solicitud vuelve a pendiente.
Rechazar exige comentario. Todo arranca **apagado**: con un solo administrador nadie podría aprobar.
Decisiones D163 a D166.

**Cómo probarla.** `npm run check` (1328 pruebas en verde). A mano: con dos administradores, encender
"Anular…" en Aprobaciones, anular un gasto con uno y aprobarlo con el otro.

**Pendiente.** 10.5: la remesa "por aprobar" por monto y la tasa fuera de rango necesitan los montos del
dueño (§13, 11), el rango mínimo/máximo de cada tasa y un estado nuevo en la máquina de la remesa (§8).
