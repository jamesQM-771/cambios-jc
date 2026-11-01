# Fase 7 — Cumplimiento (SARLAFT / UIAF)

> Referencia: `docs/PROYECTO.md` §5.13, §7.7 (parámetros de ejemplo, **no normativos**), §13 pregunta 9.
> Rama: `claude/jc-casa-cambio-dev-e35oml` (D136).

## Objetivo y alcance provisional

§13 (pregunta 9) deja los umbrales, los reportes y la retención pendientes con el contador, y fija que
"mientras tanto el módulo de cumplimiento arranca con cédula obligatoria y acumulados por cliente, sin
umbrales fijos". Esta fase construye el módulo completo pero **con todas las reglas de umbral apagadas**:
el administrador las enciende cuando el contador dé los valores. La lista restrictiva sí actúa desde ya,
porque no depende de ningún umbral.

## Tareas

| # | Tarea | Estado |
|---|---|---|
| 7.1 | Modelo: ficha ampliada y nivel de riesgo, parámetros, lista restrictiva y alertas | Hecha |
| 7.2 | Reglas al registrar una remesa: lista restrictiva (bloquea), ficha exigida, fraccionamiento y concentración | Hecha |
| 7.3 | Bandeja de alertas (descartar o escalar con justificación), lista, parámetros, nivel y acumulados | Hecha |
| 7.4 | Exporte CSV de operaciones del periodo | Hecha |
| 7.5 | Pantallas: Cumplimiento y ficha de cumplimiento desde Clientes | Hecha |
| 7.6 | Pruebas y cierre | Hecha |

## Cierre de la fase

**Qué se hizo.** Ficha ampliada del cliente (actividad económica, origen de fondos, dirección, PEP) que
llena quien atiende; nivel de riesgo bajo/medio/alto que cambia solo el administrador con motivo;
acumulados por cliente como remitente (pesos) y como beneficiario (bolívares) por día, mes y año; lista
restrictiva propia (ONU, OFAC o propia) que **bloquea** la remesa y deja una alerta escalada si el
remitente o el beneficiario coincide por documento o por nombre; alertas de fraccionamiento y de
concentración (no bloquean) y exigencia de la ficha por acumulado mensual, todas con su parámetro
apagado por defecto; bandeja del administrador para descartar o escalar con justificación; y exporte CSV
de remesas y operaciones de divisas del periodo. Decisiones D150 a D154.

**Cómo probarla.** `npm run check` (1294 pruebas en verde). A mano, como administrador: agregar a alguien
en Cumplimiento → Lista restrictiva e intentar registrarle una remesa (se bloquea y aparece la alerta);
configurar un fraccionamiento de 2 remesas por debajo de 100.000 y registrar tres seguidas.

**Pendiente y límites conocidos.**

- Umbrales, formato oficial del reporte UIAF y plazo de retención: con el contador (§13, 9). El CSV trae
  los campos que el reporte necesita y se ajusta al formato oficial después.
- La lista restrictiva se carga a mano; la consulta automática de ONU/OFAC (§9.1, servicio externo con
  cola de tareas) queda para cuando se defina la fuente.
- El nivel de riesgo no se calcula solo: se asigna a mano con motivo (las "reglas configurables" del
  cálculo están por definir).
- Las reglas solo se evalúan al registrar remesas; las operaciones de divisas en caja guardan el cliente
  en texto libre y entran al exporte, pero no disparan alertas (D154).
- No hay documentos soporte adjuntos a la ficha todavía.
