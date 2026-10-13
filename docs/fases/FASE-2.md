# Fase 2 — Remesas

> Referencia: `docs/PROYECTO.md` §5.1 (clientes), §5.3 (venta), §5.4 (digitador), §7.2 (conversión), §8 (máquina de estados), §12 (MVP, fase 2).
> Rama: `fase-2-remesas` (creada desde `rediseno-interfaz`).

## Objetivo

El vendedor registra una remesa COP → VES, el digitador la paga desde el celular y el cliente
recibe su recibo y un enlace de seguimiento.

**Fuera de alcance:** liquidez (fase 9), doble control (fase 10), cumplimiento (fase 7), caja y
turnos (fase 3), WhatsApp automático (fase 12), lectura del comprobante (fase 12b).

## Decisiones de negocio (confirmadas el 2026-10-13)

| # | Tema | Decisión |
|---|---|---|
| 1 | Verificación del pago | Efectivo: pasa a la cola al guardar. Transferencia: el vendedor la verifica antes. |
| 2 | Número de comprobante | Consecutivo simple que empieza en 1 (el sistema es nuevo, no migra el anterior). |
| 3 | Tasa en la remesa | Usa la publicada. Solo el administrador puede cambiarla, con motivo. Sin rango hasta la fase 10. |
| 4 | Anulación | Solo antes de que el digitador la tome, con motivo. |
| 5 | Remesa tomada y abandonada | Queda tomada; el administrador puede liberarla. Sin liberación automática. |
| 6 | Visibilidad del vendedor | Ve todas las remesas del local. |
| 7 | Cierre por el digitador | Captura obligatoria. Referencia y costo bancario opcionales. |
| 8 | Recibo | Ticket impreso desde el navegador (58 u 80 mm, a confirmar el ancho). |
| 9 | Seguimiento | Solo estado, bolívares y fecha. Sin cuenta ni cédula. |
| 10 | Tipos de documento | Lista fija: V, E, J, G, P / CC, CE, PPT, PAS, NIT. |
| 11 | Caja y turno | La remesa se guarda sin turno; la fase 3 la enlaza. |

## Tareas

Cada una termina con pruebas, `npm run check` en verde y commit.

| # | Tarea | Estado |
|---|---|---|
| 2.1 | Clientes y medios de pago | Hecha |
| 2.2 | Registrar remesa (operación, transferencia, número de comprobante, idempotencia) | Hecha |
| 2.3 | Estados: verificar pago, publicar en cola, anular | Hecha |
| 2.4 | Cola del digitador: tomar con bloqueo, liberar, completar, incidencia | Pendiente |
| 2.5 | Corrección de incidencias por el vendedor | Pendiente |
| 2.6 | Tiempo real con Socket.IO (con consulta periódica de respaldo) | Pendiente |
| 2.7 | Recibo en ticket | Pendiente |
| 2.8 | Seguimiento público por código | Pendiente |
| 2.9 | Pantallas del vendedor y del digitador | Pendiente |
| 2.10 | Pruebas de extremo a extremo y cierre | Pendiente |

## Garantías que se prueban antes que cualquier pantalla

- El digitador nunca recibe pesos, tasa ni datos del remitente (en el API, no solo en pantalla).
- Dos digitadores no pueden tomar la misma remesa.
- Un reintento con la misma clave de idempotencia no crea una remesa duplicada.
- La tasa usada queda congelada aunque después se publique otra.
- El número de comprobante no tiene saltos ni repetidos.
