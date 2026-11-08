# PRD — Cambios JC

Documento de requisitos del producto para pruebas automáticas (TestSprite). Resume la especificación
completa de `docs/PROYECTO.md` y lo que está construido hasta la fase 13. Si este documento y
`PROYECTO.md` no coinciden, manda `PROYECTO.md`.

## 1. Producto

**Cambios JC** es un sistema web para una casa de cambio en Cúcuta (Colombia). Reemplaza un Excel
contable y un software operativo de terceros. Maneja dinero real: un error de cálculo es plata perdida.

Líneas de negocio:

- **Remesas COP → VES:** el cliente paga pesos en el local y un **digitador** en Venezuela paga los
  bolívares por transferencia o pago móvil.
- **Divisas en caja:** compra y venta de dólares en efectivo (USD ↔ COP), contando billetes.
- **Contrapartes:** préstamos, abonos, anticipos y compras de bolívares a proveedores, con saldo
  "me debe" / "le debo".
- **Caja diaria:** turnos con conteo por denominación, arqueo y cierre de jornada.

Una instalación por negocio (no es multiempresa). Idioma de la interfaz: español (Colombia).

## 2. Usuarios y roles

Solo existen tres roles. Cada rol tiene permisos de fábrica que el administrador puede ajustar
(pantalla Permisos), salvo restricciones que ningún rol se salta.

| Rol | Quién es | Qué hace |
|---|---|---|
| **Administrador** | Dueño o encargado | Todo: configuración, usuarios, permisos, tasas, jornada, reportes, aprobaciones, cumplimiento |
| **Vendedor** | Atiende en el local | Abre y cierra su turno, registra clientes, remesas, divisas, gastos y traslados |
| **Digitador** | Opera desde Venezuela, en el celular | Solo ve la cola de pagos: toma una remesa, paga, sube el comprobante y la completa |

**Reglas que ningún rol se salta:**

- El digitador **nunca** recibe del servidor montos en pesos, tasa, ganancia ni datos del remitente.
- Quien recibe el dinero no es quien lo paga (`remesa.registrar` y `remesa.tomar_completar` no pueden
  estar en el mismo rol).
- Nadie aprueba su propia solicitud de doble control.
- Nada se borra: las operaciones se **anulan con motivo**.
- Toda acción queda en la **bitácora** (pantalla Actividad), que no se puede modificar.

## 3. Acceso y seguridad

- Inicio de sesión con usuario y contraseña, y **verificación en dos pasos (TOTP) obligatoria** para
  todos (Google Authenticator: SHA-1, 6 dígitos, 30 segundos).
- Primer acceso: contraseña temporal → cambiarla → configurar 2FA (QR y clave en texto) → entrar.
- Accesos siguientes: usuario + contraseña → código de 6 dígitos.
- Sesión en cookie `cambios_sesion` (httpOnly, sameSite=strict). Cierre por inactividad (30 min) y
  duración máxima (12 h).
- Bloqueo temporal tras 5 intentos fallidos (15 min). Límite de 10 peticiones por minuto en las rutas
  de acceso.
- Los usuarios los crea el administrador; no hay registro público.

## 4. Funcionalidades

Cada funcionalidad indica su pantalla (ruta web), el permiso que exige y sus criterios de aceptación.

### 4.1 Acceso — `/acceso`

- Login correcto con contraseña y 2FA lleva a Inicio (`/`).
- Contraseña o código incorrecto muestra un error en español, sin revelar si el usuario existe.
- Sin sesión, cualquier pantalla protegida redirige a `/acceso`.
- "Salir" cierra la sesión y vuelve a `/acceso`.

### 4.2 Estructura y navegación (layout A)

- Panel lateral con grupos General, Operación, Administración y Seguridad. Cada persona ve solo los
  módulos de sus permisos.
- Escritorio (más de 1100 px): el panel se contrae a iconos (72 px) o se expande (248 px) con el botón
  "Contraer el menú" / "Expandir el menú", y recuerda la elección.
- Tableta (801–1100 px): arranca contraído; al expandirlo flota sobre el contenido; Escape lo cierra.
- Celular (hasta 800 px): botón "Menú" (☰) abre un cajón; se cierra con "Cerrar el menú", tocando
  fuera, con Escape o al elegir un módulo.
- El digitador no tiene panel lateral (estructura mínima, pensada para celular).
- Tema claro y oscuro con el botón de tema; colores azul cielo.

### 4.3 Inicio — `/`

- Saludo con nombre y rol, y una tarjeta por cada módulo permitido con enlace "Abrir".

### 4.4 Configuración — `/configuracion/*` (permiso `empresa.configurar`)

Catálogos con crear, editar, desactivar y reactivar (no se borran):
`bancos`, `sucursales`, `cajas`, `denominaciones`, `lineas-negocio`, `cuentas` (cuentas de dinero:
caja, banco o billetera, en COP, VES o USD), `categorias-gasto` y `tasas`.

- **Tasas:** el administrador publica la tasa de referencia de cada línea. El sistema calcula
  `tasa_compra = referencia × (1 − margen_compra)` y `tasa_venta = referencia × (1 + margen_venta)`.
  Las tasas aceptan coma o punto; un valor ambiguo como `3.200` no se publica hasta aclararlo.

### 4.5 Empresa — `/empresa` (permiso `empresa.configurar`)

- Nombre, NIT, teléfono, WhatsApp, dirección, logo y texto al pie del recibo.

### 4.6 Usuarios — `/usuarios` (permiso `usuario.gestionar`)

- Crear usuario con rol y contraseña temporal; editar; desactivar y reactivar; restablecer
  contraseña; reiniciar 2FA; cerrar sesiones.

### 4.7 Permisos — `/permisos` (permiso `permiso.configurar`)

- Marcar o desmarcar permisos por rol; "volver a fábrica".
- Rechaza con explicación: dar a un rol `remesa.registrar` junto con `remesa.tomar_completar`, sacar
  `caja.reabrir` del administrador, o quitarle al administrador `permiso.configurar` o
  `usuario.gestionar`.

### 4.8 Mi turno — `/turno` (permiso `turno.gestionar_propio`)

- Abrir turno en una caja con **conteo por denominación**; si no coincide con el cierre anterior,
  queda registrada la diferencia.
- Cerrar turno con conteo físico: el sistema compara esperado vs contado y muestra **SOBRANTE**,
  **FALTANTE** o **CUADRADO**; si no cuadra, la explicación es obligatoria.

### 4.9 Clientes — `/clientes` (permiso `cliente.registrar`)

- Documento: tipo (`V`, `E`, `J`, `G`, `P`, `CC`, `CE`, `PPT`, `PAS`, `NIT`) + número, único.
- Beneficiarios con medios de pago: **cuenta bancaria** de 20 dígitos (los 4 primeros definen el banco)
  o **pago móvil** (banco + teléfono + documento del titular).
- Búsqueda por documento o nombre.

### 4.10 Remesas — `/remesas` (permiso `remesa.registrar`)

Registro:

1. Remitente, beneficiario y medio de pago.
2. Monto en pesos **o** en bolívares (no los dos): `bolívares = pesos ÷ tasa`.
3. Forma de pago y cuenta por donde entró el dinero.
4. Tasa vigente; cambio manual solo con permiso y con motivo.
5. Aviso si la liquidez en bolívares no alcanza (avisa, no bloquea).
6. Cada registro lleva una clave de idempotencia: un reintento no duplica la remesa.

Después: verificar pago → la remesa pasa a la cola. Anular con motivo, corregir datos tras una
incidencia, devolver. Recibo en ticket (58 u 80 mm) con número de comprobante consecutivo; la
reimpresión sale marcada **COPIA**. Botón "Enviar por WhatsApp" con el texto del recibo y el enlace de
seguimiento.

**Estados:** `registrada` → `pago_verificado` → `en_cola` → `tomada` → `completada`; desde `tomada`
puede volver a `en_cola` (liberar) o pasar a `con_incidencia`; desde `con_incidencia` vuelve a
`en_cola` (corregida) o termina `devuelta`; `registrada` puede terminar `anulada`.

### 4.11 Cola de pagos (digitador) — `/cola` (permiso `remesa.tomar_completar`)

- Lista de remesas en cola, de la más antigua a la más nueva.
- Antes de tomarla solo ve banco y monto en bolívares. Al **tomarla** (con bloqueo: dos digitadores no
  toman la misma) ve titular, banco, número de cuenta o teléfono, documento del titular y monto, con
  botones de copiar.
- Completar: comprobante (PNG/JPG), cuenta de origen (propone la última usada), referencia y costo
  bancario opcionales.
- Reportar incidencia con motivo, o liberarla.
- **Nunca** ve pesos, tasa, ganancia ni datos del remitente, ni en pantalla ni en las respuestas de la API.
- El vendedor recibe un aviso en tiempo real cuando la remesa se completa.

### 4.12 Seguimiento público — `/seguimiento/:codigo`

- Sin sesión. Con el código del recibo muestra el estado (en cola, pagada, con incidencia) y, al
  completarse, el comprobante. Sin datos sensibles.

### 4.13 Divisas — `/divisas` (permiso `divisa_caja.operar`)

- Compra y venta de USD en efectivo a tasa de compra o de venta: `pesos = dólares × tasa`.
- Registro de billetes recibidos y entregados por denominación; afecta el esperado de la caja.
- Recibo por operación; anular con motivo.

### 4.14 Traslados — `/traslados` y Gastos — `/gastos`

- Traslado de dinero entre cuentas (caja, bóveda, banco), con anulación.
- Gasto con categoría, valor y cuenta: **operativo** (resta a la ganancia) o **retiro del dueño**
  (no resta).

### 4.15 Contrapartes — `/contrapartes` (permiso `contraparte.registrar_movimiento`)

- Contraparte con nombre, documento opcional, teléfono y tipo.
- Movimientos: préstamo que doy (me debe más), préstamo que recibo (le debo más), abonos, anticipo a
  proveedor, compra a crédito, ajuste (con motivo), otro (con nota). Indican si movieron dinero y de
  qué cuenta.
- Saldo por moneda; resumen filtrable "Me deben" / "Les debo". En pantalla solo etiquetas, nunca signos.

### 4.16 Compras e Inventario — `/compras`, `/inventario` (permiso `compra_contraparte.registrar`)

- Compra de bolívares a un proveedor, de contado o a crédito. Actualiza el **costo promedio
  ponderado**: `costo = (inventario × costo + cantidad × tasa) ÷ (inventario + cantidad)`.
- Ganancia de cada remesa: `(tasa_venta − costo_promedio) × cantidad − costos bancarios`.

### 4.17 Jornada — `/jornada` (permiso `jornada.cerrar`)

- Cierre de jornada: exige todos los turnos cerrados y ninguna remesa `tomada`.
- Muestra dinero disponible, contrapartes y resumen: ganancia neta, gastos, retiros y
  `posición = disponible + me deben − le debo − devoluciones pendientes`.
- Jornada cerrada queda en solo lectura; reabrir exige permiso (y doble control si está encendido).

### 4.18 Liquidez — `/liquidez` (permiso `liquidez.ver`)

- Por moneda destino: disponible, comprometido (remesas en cola o tomadas) y
  `libre = disponible − comprometido`; anticipos en tránsito, límites diarios por cuenta y alertas.

### 4.19 Reportes — `/reportes` (permiso `reporte.ver`)

- Tablero del dueño (ganancia del día y del mes, liquidez, deudas, alertas), reportes por periodo,
  búsqueda avanzada, exportación CSV/Excel e impresión.

### 4.20 Aprobaciones (doble control) — `/aprobaciones` (permiso `aprobacion.aprobar`)

- Apagado al instalar. Con la regla encendida, reabrir jornada, devoluciones, anulaciones y ajustes
  quedan **pendientes de aprobación** (respuesta 202, aviso "Quedó pendiente de aprobación").
- Otra persona aprueba (y se ejecuta) o rechaza. Nadie resuelve lo propio.

### 4.21 Cumplimiento — `/cumplimiento` (permiso `cumplimiento.gestionar_alertas`)

- Ficha ampliada del cliente (actividad, origen de fondos, PEP), nivel de riesgo, lista restrictiva,
  alertas (umbrales, fraccionamiento) y exporte de operaciones. Umbrales apagados hasta configurarlos.

### 4.22 Actividad — `/bitacora` (permiso `auditoria.ver`)

- Bitácora de todas las acciones (quién, cuándo, qué, antes y después), con búsqueda. Solo lectura.

## 5. Reglas de dinero y formato

- Montos con decimales exactos: pesos con 2, bolívares con 3, tasas con 6. Redondeo `ROUND_HALF_UP`
  solo al final.
- En la API los montos viajan como **texto** (`"162000.00"`), nunca como número.
- En pantalla: `COP 162.000`, `VES 43.085,106`, `USD 150,00` (miles con punto, decimales con coma).
  Nunca el signo `$` solo.
- Fechas guardadas en UTC y mostradas en hora de Bogotá. La fecha de una operación la pone el servidor.

## 6. API

- Base: `http://localhost:3000` (directo) o `http://localhost:5173/api` (a través de la web).
- Errores con formato `{ "error": { "codigo", "mensaje", "detalles?" } }` y mensajes en español.
  Códigos frecuentes: `VALIDACION_FALLIDA` (400), `NO_AUTENTICADO` y `SESION_INCOMPLETA` (401),
  `SIN_PERMISO` (403), `NO_ENCONTRADO` (404), `ESTADO_INVALIDO` y `VALOR_EN_USO` (409),
  `CREDENCIALES_INVALIDAS`, `CODIGO_INVALIDO`, `CUENTA_BLOQUEADA` y `DEMASIADAS_PETICIONES` (429).
- Cada ruta exige un permiso; sin permiso responde 403.
- Salud: `GET /salud`.
- Esquemas de entrada y salida: `apps/api/src/modulos/<modulo>/esquemas.ts`.

## 7. Requisitos no funcionales

- Toda pantalla funciona en celular (la del digitador es primero celular). Sin desplazamiento
  horizontal a 390 px.
- Accesible por teclado (enlace "Saltar al contenido", foco visible) y con lectores de pantalla.
- Respeta "reducir movimiento" del sistema operativo.
- Textos en español con tildes.

## 8. Fuera de alcance

Registro público de usuarios, app para el cliente final, criptomonedas, facturación electrónica
(desactivada en Cambios JC), integración con bancos venezolanos, modo sin conexión, multiempresa.
Bloqueados por falta de definiciones: tasa asistida (BCV), API de WhatsApp Business, lectura OCR del
comprobante y la carga del histórico de Excel.
