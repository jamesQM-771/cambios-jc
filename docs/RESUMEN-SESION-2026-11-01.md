# Resumen de la sesión autónoma del 2026-11-01

Pedido: retomar el proyecto desde el estado del repositorio y avanzar todas las fases pendientes sin
detenerse en decisiones técnicas ordinarias. Punto de partida: fase 3 cerrada (1196 pruebas).

## Resultado por fase

| Fase | Estado | Documento |
|---|---|---|
| 4. Inventario y contrapartes | Completa | `fases/FASE-4.md` (D136–D144) |
| 5. Divisas en caja | Completa | `fases/FASE-5.md` (D145–D148) |
| 6. Facturación DIAN | Omitida a propósito (opcional, desactivada, CLAUDE.md §11) | `fases/FASE-6.md` (D149) |
| 7. Cumplimiento | Completa, con umbrales apagados hasta definirlos con el contador | `fases/FASE-7.md` (D150–D154) |
| 8. Reportes y migración | Completa salvo la carga histórica de los `.xlsx` (bloqueada) | `fases/FASE-8.md` (D155–D159) |
| 9. Liquidez | Completa | `fases/FASE-9.md` (D160–D162) |
| 10. Doble control | Completa salvo remesa por monto y tasa fuera de rango | `fases/FASE-10.md` (D163–D166) |
| 11, 12, 12b | 12 en su primera etapa (recibo por WhatsApp); 11, API de WhatsApp y 12b bloqueadas | `fases/FASE-11-12.md` (D167–D168) |
| 13. Permisos configurables | Completa | `fases/FASE-13.md` (D169–D171) |
| 14–16 (v2) | No corresponden todavía: la especificación las deja para después de meses estables y solo si otro negocio lo pide | — |

## Validaciones al cierre

- `npm run lint` y `npm run typecheck`: en verde.
- Pruebas: **1336** en verde (antes 1196), sobre una base de pruebas recién creada.
- `npm run e2e` (recorrido en navegador): **11 de 11** en verde, con los pasos nuevos de compra,
  ganancia y resumen del día.
- Entorno de la sesión: Node 22 y PostgreSQL 16 (el proyecto pide 26 y 18). Conviene repetir
  `npm run check` y `npm run e2e` en el equipo con las versiones fijadas.

## Cómo se corrieron las pruebas aquí (D136)

`prisma migrate reset` exige el consentimiento explícito del dueño y no se forzó. Se usó el modo no
destructivo que ya traía el proyecto (`CONSERVAR_BASE_PRUEBAS=1`, solo `migrate deploy`) sobre una base
`*_pruebas` nueva en cada corrida completa. El e2e acepta lo mismo y `CHROMIUM_RUTA` para un navegador
ya instalado.

## Lo que necesita al dueño o al contador (no se inventó)

1. Archivos anonimizados en `docs/datos-prueba/` y aprobar una librería para leer `.xlsx` → desbloquea la
   carga histórica del Excel (fase 8) y la "ganancia método Excel".
2. Umbrales SARLAFT/UIAF, formato del reporte UIAF y retención (contador) → encender las reglas de la
   fase 7 (Cumplimiento → Parámetros).
3. Montos de doble control y rango de tasas → completar la fase 10 (remesa por aprobar).
4. Fuente de la tasa (BCV y mercado), proveedor de WhatsApp Business y aprobar un OCR → fases 11, 12 y 12b.
5. Confirmar las decisiones provisionales: costo promedio ponderado (D138), deudas en varias monedas
   (D137), titular de cuenta = contraparte (D137), no restar devoluciones de la ganancia del día (D142),
   billetes registrados pero arqueo por total (D148).

## Siguiente paso recomendado

Probar a mano en el local (celular e impresora térmica) las pantallas nuevas, cargar los saldos iniciales
de contrapartes desde el Excel (Reportes → Datos) y el inventario inicial de bolívares (Inventario →
Ajustar), y empezar las 2 semanas de operación en paralelo con el Excel que pide §12.
