# Resumen de sesión — Cambios JC (hasta el 2026-10-10)

> Nota para Obsidian. Resume lo trabajado con Claude Code en el repositorio `cambios-jc`
> (GitHub `jamesQM-771/cambios-jc`). No contiene contraseñas, tokens ni claves: esos valores
> viven solo en `.env` y en tu gestor de contraseñas.

## 1. Estado del proyecto

| Fase | Estado |
|---|---|
| 0. Base | Completa, fusionada |
| 1. Configuración | Código completo en la rama `fase-1-configuracion`, CI en verde. **Falta tu prueba manual y decidir la fusión a `main`** |
| 2. Remesas | No iniciada (requiere tu instrucción) |
| 3 a 13 | No iniciadas |

El plan total son 14 fases (0 a 13, más la 12b) en 4 versiones: MVP (0–3), v1 (4–8), v1.5 (9–13) y
v2 (instalación para otros negocios). Detalle en `docs/PROYECTO.md` §12.

## 2. Qué se construyó en la fase 1

| Tarea | Contenido |
|---|---|
| 1.1 | Catálogo de bancos (27 bancos reales de Venezuela, sin el 0001 del BCV) |
| 1.2 | Sucursales (CRUD completo) |
| 1.3 | Cajas por sucursal |
| 1.4 | Denominaciones por moneda (COP, USD, VES) |
| 1.5 | Líneas de negocio: Transferencias a Venezuela y Dólares activas; Bolívares en efectivo desactivada |
| 1.6 | Tasas: modo directo y modo porcentaje, con historial que nunca se sobrescribe |
| 1.7 | Cuentas de dinero (caja, banco, billetera) |
| 1.8.1–1.8.5 | Las 7 pantallas dentro de la sección "Configuración" |

Último commit de la fase: `770d29f`. Pruebas automatizadas: 710 en todo el monorepo.

## 3. Reglas de negocio que confirmaste

- **Dólares:** la tasa de compra y la de venta se publican directamente cada día (modo `directo`).
- **Transferencias a Venezuela:** se publica solo la tasa del proveedor y el sistema suma el margen
  configurado (modo `porcentaje`). Ejemplo real: 4,68 + 11 % = 5,19.
- Publicar la tasa y configurar el margen son acciones y permisos distintos
  (`tasa.publicar` y `margen.configurar`).
- La comisión por defecto de una cuenta es un **monto fijo** (no porcentaje) y se puede editar,
  porque el banco puede cambiar su tarifa.
- Sara Castro es **digitadora** (se le paga por su trabajo), no una contraparte que provee
  bolívares. Por eso el "titular" de una cuenta es texto libre.

## 4. Decisiones técnicas registradas (D64–D74)

Están completas en `docs/DECISIONES.md`. Las más importantes:

- **D64 / D68:** modelo de tasas por línea (`directo` o `porcentaje`) y margen configurado aparte.
- **D65 / D70:** titular en texto libre; comisión como monto fijo editable.
- **D66:** la bitácora oculta cualquier campo llamado `codigo` (pensado para el 2FA); el código del
  banco se guarda como `codigoBanco` para no perderse.
- **D67:** las denominaciones no tienen restricción única en la base; la unicidad entre activas se
  valida en el servicio.
- **D71:** las variantes de una unión discriminada de Zod llevan `.strict()`.
- **D72 / D73:** tabla de catálogo reutilizable y una sola entrada "Configuración" con sub-navegación.
- **D74:** el generador de códigos de prueba excluye también el `0001`.

## 5. Cómo levantar el proyecto en local (lo que sí funcionó)

`npm run dev` resultó poco fiable en este equipo: la API en modo `tsx watch` se quedó sin arrancar
varios minutos. La causa de fondo **no quedó confirmada**; lo comprobado es que la versión compilada
arranca en segundos.

```bash
npm run build -w @cambios-jc/shared
npm run build -w @cambios-jc/api
```

Terminal 1 (API):

```bash
cd apps/api
node --env-file=../../.env dist/servidor.js
```

Terminal 2 (web):

```bash
cd apps/web
npx vite
```

Luego abrir `http://localhost:5173/acceso`. Espera a ver `Server listening at http://127.0.0.1:3000`
antes de entrar. Si cambia el código de la API hay que volver a compilar.

Otros hallazgos del arranque:

- El usuario `admin` de la base local venía de una corrida vieja con otra contraseña; la semilla no
  cambia la contraseña de un administrador existente. Se resolvió con
  `npm run admin:restablecer -w @cambios-jc/api -- admin`.
- Quedaron procesos duplicados ocupando los puertos 3000 y 5173. Si vuelve a pasar, cierra las
  terminales viejas antes de arrancar de nuevo.
- El administrador ya tiene contraseña definitiva y 2FA configurado por ti.

## 6. Pendientes

1. **Tu prueba manual de la fase 1** (lista al final de `docs/fases/FASE-1.md`): sucursal y caja,
   denominaciones, líneas de negocio, banco y cuentas, publicar 4,68 → 5,19, y un segundo cambio de
   tasa para revisar el historial.
2. **README.md:** en esta sesión se reescribió sin confirmar y **se perdieron secciones del README
   original** (respaldo y restauración, recuperar el acceso de un administrador, Sentry, primer
   acceso). El cambio no está confirmado en Git, así que se puede recuperar. Falta fusionar ambas
   versiones antes de hacer commit.
3. `package-lock.json` quedó modificado por un `npm install`; revisar antes de confirmar.
4. Investigar por qué `tsx watch` se queda colgado y, si aplica, anotarlo en `docs/DECISIONES.md`.
5. Decidir si se fusiona `fase-1-configuracion` a `main`.
6. Dar la instrucción para empezar la fase 2 (Remesas).
7. `npm audit` reporta vulnerabilidades en dependencias de desarrollo (`prisma`, `concurrently`);
   no se debe usar `npm audit fix --force`.

## 7. Obsidian y modelo

- El servidor MCP `obsidian` está registrado y conectado en `http://localhost:3001/mcp`, pero sus
  herramientas solo se cargan al iniciar una sesión nueva.
- El token de ese servidor quedó escrito en el chat; conviene regenerarlo.
- La sesión pasó a Opus 5.5.

## 8. Forma de trabajo acordada

- Una fase a la vez: plan, aprobación, código, pruebas, `npm run check` en verde, commit.
- Claude puede ejecutar `npm run check` por su cuenta y continuar.
- Al terminar una fase, Claude se detiene y entrega el resumen.
