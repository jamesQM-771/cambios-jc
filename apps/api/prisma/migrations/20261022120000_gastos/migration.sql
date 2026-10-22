-- CreateEnum
CREATE TYPE "tipo_gasto" AS ENUM ('operativo', 'retiro_dueno');

-- AlterEnum
ALTER TYPE "origen_movimiento" ADD VALUE 'gasto';
ALTER TYPE "origen_movimiento" ADD VALUE 'retiro_dueno';
ALTER TYPE "origen_movimiento" ADD VALUE 'gasto_anulacion';

-- CreateTable
CREATE TABLE "categoria_gasto" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categoria_gasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gasto" (
    "id" UUID NOT NULL,
    "tipo" "tipo_gasto" NOT NULL,
    "categoria_id" UUID,
    "descripcion" TEXT NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "monto" DECIMAL(18,3) NOT NULL,
    "turno_id" UUID,
    "clave_idempotencia" VARCHAR(64) NOT NULL,
    "creado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulado_en" TIMESTAMPTZ(6),
    "anulado_por_id" UUID,
    "motivo_anulacion" TEXT,

    CONSTRAINT "gasto_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gasto_monto_positivo" CHECK ("monto" > 0),
    CONSTRAINT "gasto_operativo_con_categoria" CHECK ("tipo" <> 'operativo' OR "categoria_id" IS NOT NULL)
);

-- AlterTable
ALTER TABLE "movimiento_cuenta" ADD COLUMN "gasto_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "categoria_gasto_nombre_key" ON "categoria_gasto"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "gasto_clave_idempotencia_key" ON "gasto"("clave_idempotencia");

-- CreateIndex
CREATE INDEX "gasto_cuenta_id_creado_en_idx" ON "gasto"("cuenta_id", "creado_en");

-- CreateIndex
CREATE INDEX "gasto_creado_en_idx" ON "gasto"("creado_en");

-- CreateIndex
CREATE INDEX "movimiento_cuenta_gasto_id_idx" ON "movimiento_cuenta"("gasto_id");

-- AddForeignKey
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria_gasto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuenta_dinero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_anulado_por_id_fkey" FOREIGN KEY ("anulado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_cuenta" ADD CONSTRAINT "movimiento_cuenta_gasto_id_fkey" FOREIGN KEY ("gasto_id") REFERENCES "gasto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
