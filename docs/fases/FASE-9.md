# Fase 9 — Liquidez

> Referencia: `docs/PROYECTO.md` §5.10, §7.4, §5.3 (paso 8), §12 (v1.5, fase 9).
> Rama: `claude/jc-casa-cambio-dev-e35oml` (D136).

## Tareas

| # | Tarea | Estado |
|---|---|---|
| 9.1 | Cálculo de liquidez por moneda destino: disponible por cuenta y total, comprometido, libre, uso del límite diario | Hecha |
| 9.2 | Compras en tránsito (anticipos a proveedores sin entregar) | Hecha |
| 9.3 | Alertas configurables: libre bajo un umbral, cuenta cerca de su límite, cola más rápida que el fondeo | Hecha |
| 9.4 | Aviso antes de guardar una remesa si lo libre no alcanza (sin mostrar saldos al vendedor) | Hecha |
| 9.5 | Pantalla Liquidez y pruebas | Hecha |

## Cierre de la fase

**Qué se hizo.** `GET /liquidez` (permiso nuevo `liquidez.ver`, administrador) con disponible, comprometido
y libre por moneda destino, el uso del límite diario de cada cuenta, los anticipos sin entregar y las
alertas; `GET /liquidez/alcanza` para quien registra remesas, que solo responde sí o no; umbrales en
`parametros_liquidez`, apagados por defecto. La pantalla se refresca cada minuto y el formulario de
remesa avisa (sin bloquear) si los bolívares libres no alcanzan. Decisiones D160 a D162.

**Cómo probarla.** `npm run check` (1320 pruebas en verde). Como administrador, menú Liquidez.

**Pendiente.** Las alertas se calculan al abrir la pantalla: no se empujan en vivo ni por WhatsApp (eso
iría con la cola de tareas, BullMQ, que aún no se instala). "Cola más rápida que el fondeo" usa una ventana
fija de 2 horas (D161), a ajustar con el uso.
