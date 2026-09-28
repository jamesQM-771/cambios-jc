# Registro de decisiones

Cada decisión técnica o de negocio no obvia se anota aquí. Formato: fecha · decisión · motivo · alternativas descartadas.

## Decisiones previas al desarrollo (2026-09-27)

| # | Decisión | Motivo | Descartado |
|---|---|---|---|
| D1 | Stack React + Node (Fastify) + PostgreSQL, todo en TypeScript | Uso real con varios usuarios en dos países; tipos para montos y estados | React + localStorage (DivSoft), PHP |
| D2 | Una instalación independiente por negocio | Pocos clientes conocidos; cada negocio custodia sus datos; menos complejidad | Plataforma multiempresa compartida con RLS |
| D3 | Montos con `Decimal`, nunca `float`; en JSON como string | Precisión en dinero | `number` de JavaScript |
| D4 | Nada se borra; las operaciones se anulan con motivo | Trazabilidad y control | Borrado físico o lógico sin motivo |
| D5 | Costo promedio ponderado móvil por divisa (pendiente de confirmar con el dueño y el contador) | El Excel promedia puntos sin ponderar; ≈ 9 % de diferencia acumulada | Promedio simple diario del Excel |
| D6 | Contrapartes como cuentas corrientes separadas del dinero disponible | Préstamos y deudas descuadraban el arqueo del Excel | Saldos digitados a mano en la fila de totales |
| D7 | Tasas = referencia + margen por línea de negocio, con cambio manual registrado | Así opera el negocio y se necesita flexibilidad | Tasa fija o solo manual |
| D8 | Roles base: administrador, vendedor, digitador | Son los que ya usa el negocio | Nombres nuevos (cajero, operador) |
| D9 | El digitador solo recibe titular, banco, cuenta o teléfono, cédula del titular y monto en bolívares | Mínima información; así trabaja hoy | Mostrar la operación completa |
| D10 | Recibo en ticket térmico por operación; facturación electrónica como módulo opcional, desactivado en Cambios JC | Así opera hoy el local | Facturación electrónica obligatoria |
| D11 | Migración desde la exportación `.xlsx` del programa actual y desde el Excel contable | No hay acceso al código ni a la base del programa actual | Acceso directo a su base de datos |
| D12 | Una fase a la vez, con plan previo y revisión al terminar | Proyecto grande, un solo desarrollador revisando | Construir todo de una vez |
