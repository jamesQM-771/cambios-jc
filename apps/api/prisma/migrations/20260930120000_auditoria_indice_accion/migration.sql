-- Filtrar la bitácora por acción (GET /auditoria) sin recorrer toda la tabla.
-- CreateIndex
CREATE INDEX "auditoria_accion_idx" ON "auditoria"("accion");
