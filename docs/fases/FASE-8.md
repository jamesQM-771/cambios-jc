# Fase 8 — Reportes y migración

> Referencia: `docs/PROYECTO.md` §5.17 (histórico y reportes), §9.8 (exportación completa), §11.2
> (migración desde el Excel), §12 (v1, fase 8: "al terminar se apaga el Excel").
> Rama: `claude/jc-casa-cambio-dev-e35oml` (D136).

## Tareas

| # | Tarea | Estado |
|---|---|---|
| 8.1 | Búsqueda avanzada en el histórico (comprobante, documento o nombre, usuario, estado, fecha igual/mayor/menor/entre) | Hecha |
| 8.2 | Reportes: ganancia neta por día, top clientes, volumen por proveedor, diferencias de arqueo por vendedor, tasas manuales, costos bancarios | Hecha |
| 8.3 | Tablero del dueño: ganancia de hoy y del mes, liquidez, deudas y alertas abiertas | Hecha |
| 8.4 | Exportes: CSV para Excel e impresión; exportación completa de datos (JSON) | Hecha |
| 8.5 | Carga de saldos iniciales de contrapartes desde CSV del Excel (signo invertido, vista previa, sin duplicar) | Hecha |
| 8.6 | Carga histórica del Excel y de la exportación del programa actual | **Bloqueada** (ver abajo) |
| 8.7 | Pantalla Reportes (tablero, reportes, histórico y datos) | Hecha |

## Bloqueo de la tarea 8.6

La carga de los `.xlsx` (las 174 hojas del Excel y las exportaciones del programa actual con sus capturas
incrustadas, §11.1 y §11.2) **no se pudo hacer** en esta sesión, por dos motivos que no dependen del código:

1. `docs/datos-prueba/` no tiene todavía los archivos anonimizados (`exportacion-prueba.xlsx`,
   `contabilidad-prueba.xlsx`, `resultados-esperados.xlsx`): no hay contra qué escribir ni probar el
   lector, y `CLAUDE.md` prohíbe usar datos reales.
2. Leer `.xlsx` (y extraer las imágenes ancladas a cada fila) necesita una librería que no está en el
   stack aprobado; `CLAUDE.md` §4 pide preguntar antes de agregar dependencias (D158).

Lo que sí quedó listo: la carga de **saldos iniciales de contrapartes** (§11.2, pasos 3 y 4) desde un CSV
exportado del Excel, que es lo que no se puede reconstruir de otra forma (el Excel no guarda movimientos).

**Siguiente paso para desbloquear:** subir los tres archivos anonimizados y aprobar una librería de
lectura de `.xlsx` (por ejemplo `exceljs`), o exportar cada hoja a CSV y ampliar el importador CSV.

## Cierre de la fase

**Qué se hizo.** Todo lo de §5.17 menos la exportación contable al software del contador (formato por
definir) y la "ganancia método Excel" (D159); exportación completa de los datos del negocio (§9.8) y carga
de saldos de contrapartes. Decisiones D155 a D159.

**Cómo probarla.** `npm run check` (1311 pruebas en verde). Como administrador, menú Reportes.

**Pendiente.**

- 8.6 bloqueada (arriba). Por eso el Excel **todavía no se puede apagar**: hace falta la carga histórica
  y operar en paralelo las 2 semanas que pide §12.
- PDF: se imprime desde el navegador (la impresora o "Guardar como PDF"); no se generan PDF en el servidor.
- Exportación contable para Siigo/Alegra/World Office: formato por definir con el contador.
- "Ganancia método Excel" para la transición (§7.3): pendiente de ver una hoja real del Excel.
