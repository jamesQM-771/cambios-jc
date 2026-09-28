# Cómo armar los datos de prueba

Guía para James. Estos archivos sirven para que el sistema se pruebe contra casos reales **sin exponer datos de clientes**. Se usan desde la fase 3 (cálculos de caja) y en la migración (fase 8); en la fase 0 todavía no son necesarios, así que puedes prepararlos con calma.

Colócalos en esta misma carpeta con estos nombres:

| Archivo | Qué es |
|---|---|
| `exportacion-prueba.xlsx` | Una exportación del programa actual (transferencias) |
| `contabilidad-prueba.xlsx` | Una hoja diaria del Excel de contabilidad |
| `resultados-esperados.xlsx` | Los totales correctos calculados a mano (opcional pero muy útil) |

---

## Regla de oro: anonimizar sin romper los números

Los **datos personales** se reemplazan; los **números del negocio** se conservan (o se alteran de forma coherente), porque son justamente lo que se va a probar.

| Dato | Qué hacer | Ejemplo |
|---|---|---|
| Nombres de clientes | Reemplazar por nombres inventados | Yamileth Freydes → Ana Prueba Uno |
| Cédulas | Reemplazar por números inventados, conservando la letra | V 16407501 → V 10000001 |
| Cuentas bancarias | **Conservar los 4 primeros dígitos** (código del banco) y cambiar los otros 16 | 0102 0241 8100 0016 4441 → 0102 0000 0000 0000 0001 |
| Teléfonos de pago móvil | Reemplazar | 0414-0000001 |
| Contrapartes (BARTOLO, ALFRAN, SARA…) | Reemplazar **siempre por el mismo nombre ficticio** para que se note que es la misma persona | ALFRAN → PROVEEDOR A; SARA CASTRO → PROVEEDOR B |
| Cuentas del negocio ("VZLA SARA CASTRO") | Igual que contrapartes, coherente | VZLA PROVEEDOR B |
| Login de vendedores | Reemplazar | JAMES → VENDEDOR1 |
| Montos, tasas, fechas, horas, estados | **Conservar** | 162.000 · 3,76 · 43.085 |
| Capturas de comprobantes | Reemplazar por una imagen genérica, o tapar nombre, cuentas y número de operación **conservando visible el monto** | — |

Verifica al final que **Dinero Enviado = Dinero Recibido ÷ Tasa** siga cumpliéndose en cada fila.

Lleva en un papel aparte (no en el repositorio) la equivalencia real → ficticio, por si necesitas revisar un caso.

---

## 1. `exportacion-prueba.xlsx`

Exporta **un día completo** que también tenga su hoja en el Excel de contabilidad. Después asegúrate de que el archivo tenga **al menos una fila de cada caso** (si el día no los tiene, agrega filas copiando y modificando otras):

- [ ] Estado **Ejecutada**
- [ ] Estado **Pendiente**
- [ ] Estado **En proceso**
- [ ] Estado **Corregida**
- [ ] Estado **Rechazada**
- [ ] Una transferencia a **pago móvil** (teléfono en vez de cuenta)
- [ ] Varias cuentas de origen distintas en "Mis Cuentas"
- [ ] Varios vendedores en "Login"
- [ ] Una cédula tipo **E** además de las **V**
- [ ] Una fila con captura y una sin captura
- [ ] **Una fila con error a propósito**: cuenta de 19 dígitos (para probar la validación). Márcala en la columna `emisor` con el texto `ERROR_PRUEBA`.

No cambies los nombres de las columnas ni el orden: el script de migración debe leer el archivo tal como lo entrega el programa.

## 2. `contabilidad-prueba.xlsx`

Copia **la hoja del mismo día** del Excel de contabilidad (con sus fórmulas) a un libro nuevo.

- Anonimiza nombres de clientes, proveedores y contrapartes según la tabla de arriba.
- Conserva todas las fórmulas y la estructura de filas y columnas.
- Si ese día no tiene gastos, compra/venta de dólares o devoluciones, agrega **al menos una de cada una** con valores inventados pero realistas.
- Asegúrate de que haya **al menos una contraparte con saldo negativo** (nos debe) y una con saldo positivo (le debemos), según la convención del Excel.
- Idealmente, que el día tenga **un faltante o sobrante** distinto de cero.

## 3. `resultados-esperados.xlsx` (recomendado)

Una hoja sencilla con los valores que el sistema debería calcular para ese día, hechos a mano o con fórmulas propias:

| Concepto | Valor |
|---|---|
| Total pesos recibidos por transferencias | |
| Total bolívares enviados | |
| Total bolívares comprados a proveedores | |
| Costo promedio ponderado de los bolívares del día (Σ pesos pagados ÷ Σ bolívares comprados) | |
| Ganancia de transferencias con costo ponderado | |
| Ganancia según el Excel (método actual) | |
| Ganancia de dólares | |
| Total gastos | |
| Saldo final por cada cuenta (caja, Bancolombia, Nequi…) | |
| Total me deben / total le debo | |
| Resultado del arqueo (sobrante / faltante / cuadrado y valor) | |

Con esto, las pruebas automáticas comparan lo que calcula el sistema contra lo que ustedes saben que es correcto.

---

## Antes de subirlos al repositorio

- [ ] Abrí cada archivo y busqué a ojo nombres, cédulas o cuentas reales: no queda ninguno.
- [ ] Las capturas no muestran datos reales legibles.
- [ ] Los montos siguen cuadrando.
- [ ] Los archivos están en `docs/datos-prueba/`.
