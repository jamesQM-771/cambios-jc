# Kit de arranque — Cambios JC

Guía para James. Este kit contiene todo lo necesario para empezar a construir el sistema con Claude Code.

## Contenido

```
cambios-jc/
├── LEEME-PRIMERO.md          ← este archivo (para ti)
├── CLAUDE.md                 ← instrucciones permanentes para el agente
└── docs/
    ├── PROYECTO.md           ← especificación completa (v3.5)
    ├── flujo-operacion.mermaid
    ├── DECISIONES.md         ← decisiones tomadas hasta hoy
    ├── fases/
    │   └── FASE-0.md         ← tareas de la primera fase
    └── datos-prueba/
        └── COMO-ARMAR-LOS-DATOS-DE-PRUEBA.md   ← guía para tus archivos de prueba
```

Opcional: si quieres reutilizar el diseño del proyecto anterior, copia la carpeta `design/` de DivSoft en `docs/design/`.

---

## Paso 1 — Preparar tu equipo

Instala (o verifica que tengas):

| Herramienta | Para qué | Comprobar |
|---|---|---|
| Node.js 22 LTS | Ejecutar el proyecto | `node -v` |
| Git | Control de versiones | `git --version` |
| Docker Desktop | PostgreSQL local | `docker -v` |
| WSL2 (solo Windows) | Docker funciona mejor sobre WSL2 | `wsl -l -v` |
| App autenticadora (Google Authenticator, Authy…) | Probar el 2FA | — |
| Cuenta de GitHub | Repositorio y CI | — |

En Windows, trabaja el proyecto **dentro de WSL2** (por ejemplo en `~/proyectos/cambios-jc`), no en `C:\`: Docker y Node van mucho más rápido.

## Paso 2 — Crear el repositorio

1. Crea un repositorio **privado** en GitHub llamado `cambios-jc`.
2. Copia el contenido de esta carpeta dentro del repositorio.
3. Primer commit: `docs: especificación y kit de arranque`.
4. Crea la rama `fase-0-base`.

## Paso 3 — Abrir Claude Code

Abre la carpeta del repositorio en Claude Code (pestaña Code de la app de escritorio, o `claude` en la terminal dentro de la carpeta) y pega el prompt inicial de abajo.

## Paso 4 — Cómo acompañar al agente

- **Revisa cada plan** antes de aprobarlo. Si algo no coincide con cómo funciona el local, dilo: tú conoces la operación.
- **Aprueba tarea por tarea**, no la fase completa de una vez.
- Después de cada tarea, **pruébala tú** (levantar el proyecto, entrar, hacer clic).
- Si el agente propone algo que no está en `PROYECTO.md`, pídele que lo anote en `DECISIONES.md` o que lo descarte.
- Al terminar la fase, haz la **prueba manual** del final de `FASE-0.md`.
- Para la siguiente fase, pide al agente que redacte `docs/fases/FASE-1.md` siguiendo el formato de `FASE-0.md`, revísalo y solo entonces empiecen.

## Paso 5 — Datos de prueba

Sigue `docs/datos-prueba/COMO-ARMAR-LOS-DATOS-DE-PRUEBA.md`. No hacen falta para la fase 0; tenlos listos antes de la fase 3.

## Pendientes con tu papá y el contador

No bloquean la fase 0, pero sí fases posteriores (ver §13 de `PROYECTO.md`):

| Antes de | Pregunta |
|---|---|
| Fase 1 | ¿El margen es porcentaje o valor fijo? ¿De dónde sale la tasa de referencia? ¿El vendedor puede cambiar la tasa sin autorización? ¿Cuántas cajas y vendedores trabajan a la vez? |
| Fase 2 | ¿Referencia y costo bancario obligatorios para el digitador? |
| Fase 4 | **¿Se adopta el costo promedio ponderado?** ¿Las deudas con contrapartes pueden estar en bolívares o dólares? ¿Sara Castro (cuenta de origen) es la misma proveedora del Excel? |
| Fase 5 | ¿Los gastos personales se registran como retiro del dueño? |
| Fase 7 | Umbrales SARLAFT/UIAF y retención de documentos (contador) |
| Salida a producción | Situación formal del negocio (contador o abogado) |

---

## Prompt inicial para Claude Code

Copia y pega esto en la primera sesión:

```text
Hola. Vamos a construir el sistema de Cambios JC, una casa de cambio real.

1. Lee CLAUDE.md completo: son las reglas de trabajo de este repositorio.
2. Lee docs/PROYECTO.md para entender el negocio y el alcance. Pon especial
   atención a las secciones 3 (glosario), 6 (roles), 7 (reglas de dinero),
   9 (arquitectura) y 12 (fases).
3. Lee docs/DECISIONES.md y docs/fases/FASE-0.md.

Vamos a trabajar SOLO la fase 0, en la rama fase-0-base.

Antes de escribir código:
- Resume en pocas líneas qué entendiste del proyecto y de la fase 0.
- Dime si ves contradicciones, vacíos o riesgos en la fase 0.
- Propón el plan de la tarea 0.1 y espera mi aprobación.

Después iremos tarea por tarea: plan, aprobación, código, pruebas,
npm run check en verde, commit, y te detienes para que yo revise.
```

Para las sesiones siguientes basta con:

```text
Continuamos con la fase 0. Revisa el estado del repositorio y de
docs/fases/FASE-0.md, dime qué tareas están terminadas y propón el plan
de la siguiente tarea pendiente.
```
