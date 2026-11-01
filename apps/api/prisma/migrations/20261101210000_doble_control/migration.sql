-- CreateEnum
CREATE TYPE "accion_aprobacion" AS ENUM ('reabrir_jornada', 'devolver_remesa', 'anular_remesa', 'anular_divisa', 'anular_compra', 'anular_gasto', 'anular_traslado', 'ajuste_contraparte', 'ajuste_inventario');

-- CreateEnum
CREATE TYPE "estado_solicitud" AS ENUM ('pendiente', 'aprobada', 'rechazada');

-- CreateTable
CREATE TABLE "parametros_doble_control" (
    "id" UUID NOT NULL,
    "unica" BOOLEAN NOT NULL DEFAULT true,
    "reapertura_jornada" BOOLEAN NOT NULL DEFAULT false,
    "devoluciones" BOOLEAN NOT NULL DEFAULT false,
    "anulaciones" BOOLEAN NOT NULL DEFAULT false,
    "ajustes" BOOLEAN NOT NULL DEFAULT false,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parametros_doble_control_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitud_aprobacion" (
    "id" UUID NOT NULL,
    "accion" "accion_aprobacion" NOT NULL,
    "entidad_id" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "descripcion" TEXT NOT NULL,
    "estado" "estado_solicitud" NOT NULL DEFAULT 'pendiente',
    "solicitante_id" UUID NOT NULL,
    "aprobador_id" UUID,
    "comentario" TEXT,
    "resuelta_en" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitud_aprobacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parametros_doble_control_unica_key" ON "parametros_doble_control"("unica");

-- CreateIndex
CREATE INDEX "solicitud_aprobacion_estado_creado_en_idx" ON "solicitud_aprobacion"("estado", "creado_en");

-- AddForeignKey
ALTER TABLE "solicitud_aprobacion" ADD CONSTRAINT "solicitud_aprobacion_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_aprobacion" ADD CONSTRAINT "solicitud_aprobacion_aprobador_id_fkey" FOREIGN KEY ("aprobador_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Una sola solicitud pendiente por acción y registro: pedir dos veces lo mismo no duplica.
CREATE UNIQUE INDEX "solicitud_aprobacion_una_pendiente"
  ON "solicitud_aprobacion"("accion", "entidad_id") WHERE "estado" = 'pendiente';

-- Quien solicita no es quien aprueba (§5.12), también en la base.
ALTER TABLE "solicitud_aprobacion" ADD CONSTRAINT "solicitud_aprobacion_no_lo_propio"
  CHECK ("aprobador_id" IS NULL OR "aprobador_id" <> "solicitante_id");

INSERT INTO "parametros_doble_control" ("id", "unica") VALUES ('01900000-0000-7000-8000-00000000c0a3', true);
