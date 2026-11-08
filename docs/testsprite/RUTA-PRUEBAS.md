# Ruta de pruebas — Cambios JC (TestSprite)

Plan para probar el sistema con TestSprite. Se apoya en el PRD (`docs/testsprite/PRD.md`). Los casos
van en el orden de una jornada real: primero se prepara el negocio, luego se opera y al final se
cierra el día. Cada caso tiene un identificador, una prioridad (P0 crítico, P1 importante, P2
deseable), pasos y resultado esperado.

## 1. Preparar el entorno

1. PostgreSQL encendido y el `.env` configurado (ver README).
2. Base con tablas y datos iniciales:
   ```powershell
   npm run db:migrate
   npm run db:seed
   ```
   La semilla crea la empresa, la sucursal principal, el administrador inicial, los bancos
   venezolanos, las denominaciones, las líneas de negocio y las categorías de gasto. **No** crea cajas,
   cuentas de dinero, tasas ni más usuarios: eso lo hace la suite S0 de abajo.
3. Arrancar: `npm run compilar` y luego `npm run iniciar` (o doble clic en `iniciar-windows.bat`).

| Servicio | Dirección | Uso en TestSprite |
|---|---|---|
| Web | `http://localhost:5173` | Pruebas de frontend (tipo *Frontend*, puerto 5173) |
| API | `http://localhost:3000` | Pruebas de backend (tipo *Backend*, puerto 3000). Sin prefijo `/api` |

> Recomendado: usar una base dedicada a TestSprite (por ejemplo `cambios_jc_testsprite`) para que los
> datos que crea no se mezclen con los de desarrollo. Basta crearla con `scripts/db-preparar.sql` como
> guía, apuntar `DATABASE_URL` a ella, y repetir el paso 2.

## 2. Cuentas de prueba y 2FA

El 2FA es obligatorio para todos, así que TestSprite necesita generar el código de 6 dígitos.

1. Entra como administrador (`ADMIN_LOGIN_INICIAL` / `ADMIN_CONTRASENA_INICIAL`), cambia la contraseña y,
   en la pantalla del QR, **copia la clave en texto** (botón "Copiar") antes de escanear.
2. En **Usuarios** crea `vendedor.prueba` (rol Vendedor) y `digitador.prueba` (rol Digitador). Entra con
   cada uno y haz lo mismo: cambiar contraseña y copiar su clave 2FA.
3. Copia `credenciales.ejemplo.md` como `credenciales.md` en esta carpeta y completa usuario,
   contraseña y clave 2FA de cada uno. `credenciales.md` está en `.gitignore`: **no se sube a GitHub**.
4. Indica a TestSprite cómo generar el código (Python):
   ```python
   import pyotp
   codigo = pyotp.TOTP("CLAVE_2FA_SIN_ESPACIOS").now()   # SHA-1, 6 dígitos, 30 s
   ```
   Si un código falla justo en el cambio de ventana de 30 s, se genera de nuevo y se reintenta una vez.

**Flujo de acceso en la web:** `/acceso` → usuario y contraseña → "Continuar" → código de 6 dígitos →
"Entrar" → Inicio (`/`). El digitador entra directo a su cola de pagos.

**Flujo de acceso en la API** (la cookie `cambios_sesion` se conserva entre peticiones):

```
POST /auth/login          { "login": "admin", "contrasena": "..." }  → { "siguientePaso": "verificar_2fa", "nombre": "..." }
POST /auth/2fa/verificar  { "codigo": "123456" }                     → { "usuario": { "id", "nombre", "login", "rol" } }
GET  /auth/yo                                                        → usuario, permisos y empresa
```

Atención al límite: 10 intentos por minuto en las rutas de acceso y bloqueo de 15 minutos tras 5
contraseñas erradas. Conviene iniciar sesión una vez por rol y reutilizar la sesión.

## 3. Datos de referencia que usan los casos

| Dato | Valor |
|---|---|
| Tasa de la línea de remesas (modo directo) | venta **3,76** pesos por bolívar |
| Remesa de ejemplo | **COP 162.000** → **VES 43.085,106** (162000 ÷ 3,76, redondeo al tercer decimal) |
| Tasa de USD en caja (modo directo) | compra **3.900**, venta **4.000** pesos por dólar |
| Venta de divisas de ejemplo | **USD 150** → **COP 600.000** |
| Remitente | CC 1000000001, "Ana Prueba Uno" |
| Beneficiario | V 10000001, "Pedro Prueba", cuenta `0102 0000 0000 0000 0001` (Banco de Venezuela) |

Datos ficticios: nunca usar datos de clientes reales.

## 4. Suites y casos

### S0 — Preparar el negocio (administrador) · P0

| ID | Caso | Pasos | Resultado esperado |
|---|---|---|---|
| S0-01 | Crear caja | Configuración → Cajas → nueva "Caja 1" en la sucursal principal | Aparece activa en la lista |
| S0-02 | Crear cuentas de dinero | Configuración → Cuentas: "Efectivo Caja 1" (caja, COP), "Bóveda" (caja, COP), "Banco VES 1" (banco, VES, banco 0102), "Efectivo USD" (caja, USD) | Las cuatro aparecen activas con su moneda |
| S0-03 | Publicar tasa de remesas | Configuración → Tasas → línea de remesas, modo directo, venta `3,76`, motivo | Queda vigente con hora; se muestra `3,76` |
| S0-04 | Tasa ambigua | Escribir `3.200` como tasa | No se publica; el campo pide aclarar el valor |
| S0-05 | Publicar tasa USD | Línea de divisas USD, compra `3900`, venta `4000` | Queda vigente |
| S0-06 | Empresa | Empresa → teléfono, WhatsApp y texto al pie del recibo | Se guarda y aparece en el recibo |

### S1 — Acceso y sesión · P0

| ID | Caso | Resultado esperado |
|---|---|---|
| S1-01 | Login correcto de cada rol (admin, vendedor, digitador) con 2FA | Llega a Inicio; el encabezado muestra nombre y rol |
| S1-02 | Contraseña incorrecta | Mensaje de error en español; no dice si el usuario existe |
| S1-03 | Código 2FA incorrecto (`000000`) | Mensaje de código inválido; no entra |
| S1-04 | Entrar a `/remesas` sin sesión | Redirige a `/acceso` |
| S1-05 | Salir | Vuelve a `/acceso`; al pulsar "atrás" no se ve contenido protegido |
| S1-06 | API sin cookie: `GET /auth/yo` | 401 con `{ error: { codigo: "NO_AUTENTICADO" } }` |
| S1-07 | API con login pero sin 2FA: `GET /remesas` | 401 `SESION_INCOMPLETA` |

### S2 — Navegación y menú por rol · P0

| ID | Caso | Resultado esperado |
|---|---|---|
| S2-01 | Administrador | Ve los grupos General, Operación, Administración y Seguridad (20 módulos) |
| S2-02 | Vendedor | Ve solo sus módulos (Inicio, Mi turno, Remesas, Divisas, Traslados, Gastos, Clientes); no ve Usuarios, Permisos ni Configuración |
| S2-03 | Digitador | Sin panel lateral; entra directo a su cola de pagos |
| S2-04 | Vendedor escribe `/usuarios` en la barra | Pantalla "Sin acceso" |
| S2-05 | Escritorio 1440 px: "Contraer el menú" | Panel a iconos; los enlaces muestran su nombre al pasar el cursor; al recargar sigue contraído |
| S2-06 | Tableta 900 px: "Expandir el menú" | El panel flota sobre el contenido; Escape lo vuelve a contraer |
| S2-07 | Celular 390 px: botón "Menú" | Se abre el cajón; "Cerrar el menú", tocar fuera o elegir un módulo lo cierra; sin desplazamiento horizontal |
| S2-08 | Botón de tema | Cambia entre claro y oscuro y lo recuerda |

### S3 — Usuarios y permisos (administrador) · P1

| ID | Caso | Resultado esperado |
|---|---|---|
| S3-01 | Crear usuario con login repetido | Error `LOGIN_EN_USO` en español |
| S3-02 | Desactivar y reactivar un usuario | El desactivado no puede entrar; reactivado sí |
| S3-03 | Desactivarse a sí mismo | Lo impide (`NO_PUEDES_DESACTIVARTE`) |
| S3-04 | Permisos: dar al vendedor "tomar y completar remesas" teniendo "registrar remesa" | Rechazado con la explicación "quien recibe el dinero no es quien lo paga" |
| S3-05 | Permisos: quitar al administrador "configurar permisos" | Rechazado |
| S3-06 | Quitar un permiso al vendedor y "volver a fábrica" | El cambio se aplica al vendedor; volver a fábrica lo restablece |

### S4 — Turno del vendedor · P0

| ID | Caso | Resultado esperado |
|---|---|---|
| S4-01 | Abrir turno en "Caja 1" contando billetes (por ejemplo 10 × 50.000 = COP 500.000) | Turno abierto; el total se calcula solo |
| S4-02 | Abrir un segundo turno sin cerrar el primero | No lo permite |

### S5 — Clientes · P0

| ID | Caso | Resultado esperado |
|---|---|---|
| S5-01 | Crear remitente CC 1000000001 | Queda guardado; se encuentra buscando por documento |
| S5-02 | Crear beneficiario V 10000001 con cuenta de 20 dígitos | El banco se reconoce por los 4 primeros dígitos; la cuenta se muestra en grupos de 4 |
| S5-03 | Cuenta con 19 dígitos | Error de validación en español |
| S5-04 | Documento repetido (mismo tipo y número) | Error de valor en uso |
| S5-05 | Beneficiario con pago móvil (banco + teléfono + documento) | Se guarda como medio de pago |

### S6 — Remesas (vendedor) · P0

| ID | Caso | Resultado esperado |
|---|---|---|
| S6-01 | Registrar remesa de COP 162.000, efectivo, cuenta "Efectivo Caja 1" | Muestra VES 43.085,106 antes de guardar; queda registrada con número de comprobante |
| S6-02 | Registrar indicando bolívares (VES 43.085,106) | Calcula los pesos a la inversa |
| S6-03 | Enviar pesos y bolívares a la vez (API) | 400 `VALIDACION_FALLIDA`: "Indica los pesos o los bolívares, no los dos" |
| S6-04 | Repetir `POST /remesas` con la misma `claveIdempotencia` | No crea una segunda remesa; devuelve la misma |
| S6-05 | Aviso de liquidez sin bolívares suficientes | Avisa antes de guardar, pero permite registrar |
| S6-06 | Verificar pago | La remesa pasa a "en cola" |
| S6-07 | Imprimir recibo | Ticket con logo, contacto, comprobante, cédula, titular, banco, cuenta, COP 162.000, VES 43.085,106, fecha y vendedor |
| S6-08 | Reimprimir | El ticket sale marcado **COPIA** |
| S6-09 | Enviar por WhatsApp | Abre un enlace `wa.me` con el texto del recibo y el enlace de seguimiento |
| S6-10 | Anular una remesa registrada sin motivo | Pide el motivo (mínimo 3 caracteres); con motivo queda "anulada" |
| S6-11 | Montos en pantalla | Formato `COP 162.000` y `VES 43.085,106`; nunca `$` solo |

### S7 — Cola del digitador · P0 (incluye privacidad)

| ID | Caso | Resultado esperado |
|---|---|---|
| S7-01 | Ver la cola | Lista de la más antigua a la más nueva; antes de tomar solo banco y monto en bolívares |
| S7-02 | Tomar la remesa de S6 | Aparecen titular, banco, cuenta, cédula y VES 43.085,106 con botones de copiar |
| S7-03 | **Privacidad en pantalla** | En ningún momento aparecen pesos, tasa, ganancia ni el nombre del remitente |
| S7-04 | **Privacidad en la API**: `GET /cola` con sesión de digitador | Cada remesa trae solo `id, estado, enviadaEn, montoBolivares, tomadaPorMi, pago{...}`; no existen campos de pesos, tasa, ganancia ni remitente |
| S7-05 | Digitador llama `GET /remesas` | 403 `SIN_PERMISO` |
| S7-06 | Completar con comprobante PNG, cuenta "Banco VES 1", referencia y costo | Remesa "completada"; el vendedor recibe el aviso en vivo |
| S7-07 | Dos digitadores toman la misma remesa | Solo uno la obtiene; el otro recibe error de estado |
| S7-08 | Reportar incidencia con motivo | Pasa a "con incidencia"; el vendedor la ve, puede corregir los datos y vuelve a la cola |
| S7-09 | Liberar una tomada | Vuelve a "en cola" |

### S8 — Seguimiento público · P1

| ID | Caso | Resultado esperado |
|---|---|---|
| S8-01 | Abrir `/seguimiento/<código del recibo>` sin sesión | Muestra el estado (en cola, pagada o con incidencia) |
| S8-02 | Remesa completada | Muestra el comprobante; no muestra montos en pesos, tasa ni documentos completos |
| S8-03 | Código inexistente | Mensaje claro de "no encontrada" |

### S9 — Divisas, traslados y gastos (vendedor) · P1

| ID | Caso | Resultado esperado |
|---|---|---|
| S9-01 | Venta de USD 150 a 4.000 con billetes entregados | COP 600.000; recibo; el esperado de la caja cambia |
| S9-02 | Compra de USD a 3.900 | Pesos = dólares × 3.900 |
| S9-03 | Traslado de COP 200.000 de "Efectivo Caja 1" a "Bóveda" | Saldo de ambas cuentas actualizado; anulable con motivo |
| S9-04 | Gasto operativo "Papelería y aseo" COP 20.000 | Resta a la ganancia del día |
| S9-05 | Retiro del dueño | No resta a la ganancia |

### S10 — Contrapartes, compras e inventario (administrador) · P1

| ID | Caso | Resultado esperado |
|---|---|---|
| S10-01 | Crear contraparte proveedor | Queda en la lista |
| S10-02 | Préstamo que doy COP 1.000.000 | Saldo "Me debe COP 1.000.000" (sin signos) |
| S10-03 | Abono que me hace COP 400.000 | "Me debe COP 600.000" |
| S10-04 | Compra de bolívares a crédito | "Le debo" en COP; inventario VES sube y el costo promedio se recalcula ponderado |
| S10-05 | Filtro "Me deben" / "Les debo" | Muestra solo las que corresponden |
| S10-06 | Anular un movimiento con motivo | El saldo vuelve al anterior; el movimiento queda visible como anulado |

### S11 — Cierre del día · P0

| ID | Caso | Resultado esperado |
|---|---|---|
| S11-01 | Cerrar jornada con un turno abierto o una remesa tomada | No lo permite y explica qué falta |
| S11-02 | Vendedor cierra turno contando lo mismo que el esperado | **CUADRADO** |
| S11-03 | Cierre contando de menos | **FALTANTE**; la explicación es obligatoria |
| S11-04 | Administrador cierra la jornada | Resumen con disponible, contrapartes, ganancia neta, gastos, retiros y posición total; queda en solo lectura |
| S11-05 | Reabrir la jornada | Solo el administrador; queda en la bitácora |

### S12 — Liquidez, reportes, aprobaciones, cumplimiento y actividad (administrador) · P1–P2

| ID | Caso | Resultado esperado |
|---|---|---|
| S12-01 | Liquidez con una remesa en cola | Comprometido = sus bolívares; libre = disponible − comprometido |
| S12-02 | Tablero del dueño | Ganancia del día y del mes, liquidez, deudas y alertas |
| S12-03 | Reporte por periodo y exportación | Descarga el archivo; montos con el formato correcto |
| S12-04 | Encender doble control de anulaciones y anular | "Quedó pendiente de aprobación" (202); aparece en Aprobaciones |
| S12-05 | Quien solicitó intenta aprobar | Rechazado: nadie aprueba lo propio |
| S12-06 | Otro administrador aprueba | Se ejecuta la anulación con él como autor |
| S12-07 | Cumplimiento: ficha ampliada y nivel de riesgo con motivo | Se guardan; quedan en la bitácora |
| S12-08 | Actividad | Cada acción anterior aparece con quién, cuándo y qué; no hay botones para editar ni borrar |

### S13 — API: permisos y contratos · P0

Para cada grupo de rutas, probar con los tres roles. Lo esperado:

| Ruta | Administrador | Vendedor | Digitador |
|---|---|---|---|
| `GET /usuarios`, `PUT /permisos/:rol`, `PATCH /empresa` | 200 | 403 | 403 |
| `POST /remesas`, `GET /remesas`, `POST /clientes` | 200/201 | 200/201 | 403 |
| `GET /cola`, `POST /cola/:id/tomar`, `POST /cola/:id/completar` | 403 | 403 | 200 |
| `POST /jornadas/:id/cerrar`, `GET /reportes/tablero` | 200 | 403 | 403 |
| `GET /seguimiento/:codigo` | público | público | público |
| `GET /salud` | público | público | público |

Además:

- Todos los montos y tasas de las respuestas son **texto** (`"162000.00"`), nunca números.
- Todo error tiene la forma `{ "error": { "codigo", "mensaje" } }`, con mensaje en español y sin
  trazas ni SQL.
- Cuerpos inválidos devuelven 400 `VALIDACION_FALLIDA` con `detalles`.
- Ninguna ruta permite borrar operaciones: no existen `DELETE` de remesas, gastos, divisas ni movimientos.

## 5. Orden recomendado

1. S0 y S1 (sin esto no funciona lo demás).
2. Camino feliz de una remesa: S4-01 → S5-01/02 → S6-01 → S6-06 → S7-02 → S7-06 → S8-01.
3. Privacidad del digitador y permisos: S7-03, S7-04, S7-05 y S13.
4. Resto de la operación: S6, S9, S10.
5. Cierre: S11.
6. Complementarios: S2 (responsive), S3, S12.

## 6. Qué reportar

Para cada fallo: ID del caso, rol, pantalla o ruta, datos usados, resultado obtenido vs esperado y
captura. Los fallos de privacidad del digitador (S7-03, S7-04) o de cálculo de dinero son críticos.
