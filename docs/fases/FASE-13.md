# Fase 13 — Permisos configurables

> Referencia: `docs/PROYECTO.md` §6.1 (permisos configurables con restricciones), §12 (v1.5, fase 13).
> Rama: `claude/jc-casa-cambio-dev-e35oml` (D136).

## Cierre de la fase

**Qué se hizo.** El dueño marca en la pantalla **Permisos** qué puede hacer cada rol (administrador,
vendedor, digitador). La elección se guarda en `permisos_rol` (un conjunto por rol; sin fila, el rol usa
los permisos de fábrica de `packages/shared`) y la API la carga en memoria al arrancar y cada vez que
cambia: toda comprobación de permisos del servidor (rutas, tiempo real, `/auth/yo`) usa los permisos
efectivos, así que el cambio vale desde la siguiente acción de cada persona. Restricciones que ningún rol
se salta: reabrir un cierre es solo del administrador; quien registra remesas no puede pagarlas; el
administrador no puede perder la gestión de usuarios ni de permisos. Cada cambio y cada vuelta a fábrica
queda en la bitácora. Decisiones D169 a D171.

**Cómo probarla.** `npm run check` (1336 pruebas en verde). Como administrador, menú Permisos: darle
"Ver reportes" al vendedor y entrar como vendedor.

**Pendiente.** Los permisos son por rol, no por persona; no hay roles nuevos (supervisor y oficial de
cumplimiento siguen descartados, D28).
