-- AlterEnum
ALTER TYPE "origen_movimiento" ADD VALUE 'traslado_salida';
ALTER TYPE "origen_movimiento" ADD VALUE 'traslado_entrada';
ALTER TYPE "origen_movimiento" ADD VALUE 'traslado_anulacion';

-- CreateTable
CREATE TABLE "traslado" (
    "id" UUID NOT NULL,
    "origen_id" UUID NOT NULL,
    "destino_id" UUID NOT NULL,
    "monto" DECIMAL(18,3) NOT NULL,
    "nota" TEXT,
    "turno_id" UUID,
    "clave_idempotencia" VARCHAR(64) NOT NULL,
    "creado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulado_en" TIMESTAMPTZ(6),
    "anulado_por_id" UUID,
    "motivo_anulacion" TEXT,

    CONSTRAINT "traslado_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "traslado_monto_positivo" CHECK ("monto" > 0),
    CONSTRAINT "traslado_cuentas_distintas" CHECK ("origen_id" <> "destino_id")
);

-- AlterTable
ALTER TABLE "movimiento_cuenta" ADD COLUMN "traslado_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "traslado_clave_idempotencia_key" ON "traslado"("clave_idempotencia");

-- CreateIndex
CREATE INDEX "traslado_origen_id_creado_en_idx" ON "traslado"("origen_id", "creado_en");

-- CreateIndex
CREATE INDEX "traslado_destino_id_creado_en_idx" ON "traslado"("destino_id", "creado_en");

-- CreateIndex
CREATE INDEX "movimiento_cuenta_traslado_id_idx" ON "movimiento_cuenta"("traslado_id");

-- AddForeignKey
ALTER TABLE "traslado" ADD CONSTRAINT "traslado_origen_id_fkey" FOREIGN KEY ("origen_id") REFERENCES "cuenta_dinero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslado" ADD CONSTRAINT "traslado_destino_id_fkey" FOREIGN KEY ("destino_id") REFERENCES "cuenta_dinero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslado" ADD CONSTRAINT "traslado_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslado" ADD CONSTRAINT "traslado_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslado" ADD CONSTRAINT "traslado_anulado_por_id_fkey" FOREIGN KEY ("anulado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_cuenta" ADD CONSTRAINT "movimiento_cuenta_traslado_id_fkey" FOREIGN KEY ("traslado_id") REFERENCES "traslado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
