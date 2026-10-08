# Fase 1 — Configuración

> Referencia: `docs/PROYECTO.md` §4 (modelo de instalación), §5.2 (tasas), §5.9 (cuentas), §5.16 (denominaciones), §6 (roles y permisos), §12 (MVP, fase 1).
> Rama: `fase-1-configuracion`

## Objetivo

Dejar configurable todo lo que las fases siguientes van a necesitar: sucursales y cajas, denominaciones de billetes, líneas de negocio, cuentas de dinero, catálogo de bancos, y tasas (referencia, márgenes y tasa calculada). Nada de esto mueve dinero todavía: es la base de datos maestra sobre la que la fase 2 (remesas) y la fase 3 (caja) van a operar.

**Al terminar la fase:** el administrador configura sucursales, cajas, denominaciones, líneas de negocio, bancos y cuentas; publica la tasa de referencia del día con sus márgenes y ve la tasa de compra/venta calculada; puede hacer un cambio manual de tasa con motivo, y el historial de tasas queda consultable.

**Fuera de alcance:** cualquier operación que mueva dinero (remesas, compra/venta de divisas, movimientos de contrapartes, apertura/cierre de caja) — eso es de las fases 2 y 3. **Tasa asistida** (consulta automática de BCV y mercado) está en la hoja de ruta para la fase 11 (v1.5), no en esta. **Contrapartes** (tabla `Contraparte`) es de la fase 4: donde el modelo de cuentas de `PROYECTO.md` §5.9 menciona una "contraparte titular" opcional, ver la decisión pendiente más abajo.

---

## Dos decisiones pendientes antes de empezar (necesito tu respuesta)

Estas dos cosas cambian la forma de una tabla, así que mejor confirmarlas antes de migrar la base de datos (`PROYECTO.md` las marca como "por confirmar" o generan un hueco entre fases):

1. **Tipo de margen de tasa** (`PROYECTO.md` §13, pregunta 1, sin responder): ¿el margen de compra/venta de una línea de negocio es **porcentaje**, **valor fijo** (ej. +0,02 puntos), o **puede ser cualquiera de los dos según la línea**? Esto decide si la tabla de línea de negocio guarda un tipo de margen o solo un número.
2. **Cuenta de dinero → contraparte titular** (`PROYECTO.md` §5.9): el modelo de cuentas menciona que una cuenta puede asociarse a una "contraparte titular" (ej. "VZLA SARA CASTRO"), pero la tabla `Contraparte` no existe hasta la fase 4. Para esta fase propongo: la cuenta guarda un **nombre de titular en texto libre** (sin tabla aparte), y en la fase 4 se agrega la relación real con `Contraparte`, migrando ese texto a la referencia. ¿Te parece bien, o prefieres esperar a tener cuentas completas hasta la fase 4?

Mientras tanto, puedo empezar por las tareas que no dependen de esto (1.1 a 1.4).

---

## Tareas

Cada tarea termina con `npm run check` en verde y un commit. Presento el plan de cada tarea antes de empezar.

### 1.1 Catálogo de bancos
- Tabla `Banco`: código (los primeros 4 dígitos de una cuenta venezolana, según §5.1), nombre, país, activo.
- API: listar, crear, editar, desactivar (sin borrado, igual que el resto del sistema).
- Semilla con los bancos venezolanos más comunes (ficticios por ahora o, si me compartes la lista real de bancos que usa el negocio, con esos códigos).

**Aceptación:** pruebas de integración de cada endpoint, incluido el caso sin permiso (`empresa.configurar`).

### 1.2 Sucursales (CRUD completo)
- La tabla `Sucursal` ya existe (fase 0, de solo lectura para asignar usuarios). Se agrega: crear, editar (nombre, ciudad), desactivar.
- Una sucursal no se puede desactivar si tiene usuarios activos asignados (o cajas activas, una vez exista 1.3) — regla a confirmar contigo si hace falta otra restricción.

**Aceptación:** pruebas de cada acción y de la restricción de desactivar con usuarios activos.

### 1.3 Cajas
- Tabla `Caja`: nombre, sucursal (relación), activa.
- API: listar (por sucursal), crear, editar, desactivar.

**Aceptación:** pruebas de integración; una caja no puede crearse en una sucursal inactiva.

### 1.4 Denominaciones
- Tabla `Denominacion`: moneda (`COP`, `VES`, `USD`), valor (ej. 50000, 100000 para COP), activa.
- API: listar por moneda, crear, editar, desactivar.
- Semilla con los billetes y monedas reales que circulan en Colombia y USD (los de VES, a definir según lo que uses: bolívares en efectivo está desactivado en Cambios JC, D-confirmación #6, pero la tabla debe poder tener denominaciones VES para otras instalaciones).

**Aceptación:** pruebas de integración; no se repite un valor activo en la misma moneda.

### 1.5 Líneas de negocio
- Tabla `LineaNegocio`: nombre, clase (`remesa` | `divisa_caja`), moneda origen, moneda destino, activa.
- Semilla con las dos líneas de Cambios JC (§4.3 de `PROYECTO.md`): "Transferencias a Venezuela" (remesa, COP→VES) y "Dólares" (divisa_caja, USD↔COP). "Bolívares en efectivo" se crea desactivada.
- API: listar, crear, editar, activar/desactivar.

**Aceptación:** pruebas de integración; las semillas quedan con el estado correcto (dos activas, una desactivada).

### 1.6 Tasas (depende de la decisión 1 de arriba)
- Tabla `LineaNegocio` se extiende con el margen de compra y de venta (según la decisión pendiente).
- Tabla `Tasa`: línea de negocio, tasa de referencia, margen de compra y venta usados, tasa de compra y venta **calculadas**, quién la publicó, cuándo, vigente desde/hasta (la nueva cierra la vigencia de la anterior de esa línea).
- **Cambio manual del día:** un supervisor/dueño (aquí, el administrador — D28) publica una tasa nueva con motivo; se guarda el historial completo, nunca se sobrescribe.
- API: publicar tasa (permiso `tasa.publicar`), configurar márgenes (permiso `margen.configurar`), consultar tasa vigente por línea, historial con filtros de fecha.

**Aceptación:** pruebas de los cálculos (incluido el caso real `162000 ÷ 3.76`, reutilizando `packages/shared/src/dinero/`), del historial y del permiso.

### 1.7 Cuentas de dinero (depende de la decisión 2 de arriba)
- Tabla `CuentaDinero`: nombre, tipo (`caja`, `banco`, `billetera`), moneda, banco (relación, opcional — solo aplica a tipo `banco`), últimos 4 dígitos, sucursal, titular (texto libre, ver decisión 2), responsable (usuario, opcional), activa, límite diario, comisión por defecto.
- API: listar (filtrable por moneda/sucursal/tipo), crear, editar, desactivar.
- Sin saldo todavía: el saldo sale de los movimientos, que no existen hasta la fase 2/3. Por ahora la cuenta es solo catálogo.

**Aceptación:** pruebas de integración, incluida la validación de que el banco solo aplica a cuentas tipo `banco`.

### 1.8 Frontend: pantallas de configuración
- Una sección "Configuración" en el menú del administrador, con pestañas o sub-rutas: Sucursales, Cajas, Denominaciones, Líneas de negocio, Bancos, Cuentas, Tasas.
- Reutiliza los componentes ya hechos en la fase 0 (`Dialogo`, `CampoSelector`, `Paginacion`, tablas con menú de acciones).
- Pantalla de Tasas: formulario para publicar la tasa de referencia y ver la tasa de compra/venta calculada en vivo (cálculo client-side solo para mostrar antes de guardar; el servidor recalcula y es la fuente de verdad).

**Aceptación:** el administrador completa toda la configuración mínima de Cambios JC (sucursal, caja, denominaciones, dos líneas activas, bancos, cuentas, tasa del día) sin tocar la base de datos a mano.

---

## Definición de terminado de la fase 1

- [ ] Tareas 1.1–1.8 con sus criterios de aceptación cumplidos (1.6 y 1.7 según cómo se resuelvan las decisiones pendientes).
- [ ] `npm run check` y CI en verde.
- [ ] `docs/DECISIONES.md` con las decisiones tomadas (incluidas las dos de arriba).
- [ ] Resumen final para el usuario: qué se hizo, cómo probarlo, pendientes, riesgos.

## Prueba manual que hará el usuario

1. Configurar las dos sucursales... (en Cambios JC es una sola, Cúcuta) y al menos una caja.
2. Revisar las denominaciones precargadas de COP y USD; agregar o desactivar alguna.
3. Confirmar que las líneas de negocio de Cambios JC están correctas (Transferencias a Venezuela activa, Dólares activa, Bolívares en efectivo desactivada).
4. Crear al menos un banco y una cuenta de cada tipo (caja, banco, billetera).
5. Publicar la tasa de referencia del día para "Transferencias a Venezuela" con sus márgenes, y confirmar que la tasa de compra/venta calculada es correcta.
6. Hacer un cambio manual de tasa con motivo y confirmar que el historial muestra ambas.
