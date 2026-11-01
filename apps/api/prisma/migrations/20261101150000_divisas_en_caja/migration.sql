-- CreateEnum
CREATE TYPE "tipo_operacion_divisa" AS ENUM ('compra', 'venta');

-- AlterEnum
ALTER TYPE "origen_inventario" ADD VALUE 'divisa_compra';
ALTER TYPE "origen_inventario" ADD VALUE 'divisa_venta';
ALTER TYPE "origen_inventario" ADD VALUE 'divisa_anulacion';

-- AlterEnum
ALTER TYPE "origen_movimiento" ADD VALUE 'divisa_entrada';
ALTER TYPE "origen_movimiento" ADD VALUE 'divisa_salida';
ALTER TYPE "origen_movimiento" ADD VALUE 'divisa_anulacion';

-- AlterTable
ALTER TABLE "movimiento_cuenta" ADD COLUMN     "operacion_divisa_id" UUID;

-- AlterTable
ALTER TABLE "movimiento_inventario" ADD COLUMN     "operacion_divisa_id" UUID;

-- CreateTable
CREATE TABLE "operacion_divisa" (
    "id" UUID NOT NULL,
    "numero_comprobante" INTEGER NOT NULL,
    "tipo" "tipo_operacion_divisa" NOT NULL,
    "linea_negocio_id" UUID NOT NULL,
    "tasa_id" UUID NOT NULL,
    "moneda" CHAR(3) NOT NULL,
    "monto_divisa" DECIMAL(18,2) NOT NULL,
    "monto_pesos" DECIMAL(18,2) NOT NULL,
    "tasa_calculada" DECIMAL(18,6) NOT NULL,
    "tasa_usada" DECIMAL(18,6) NOT NULL,
    "motivo_tasa" TEXT,
    "cliente_nombre" TEXT,
    "cliente_documento" TEXT,
    "turno_id" UUID NOT NULL,
    "cuenta_divisa_id" UUID NOT NULL,
    "cuenta_pesos_id" UUID NOT NULL,
    "costo_promedio" DECIMAL(18,6),
    "ganancia" DECIMAL(18,2),
    "impresiones" INTEGER NOT NULL DEFAULT 0,
    "clave_idempotencia" VARCHAR(64) NOT NULL,
    "creado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulado_en" TIMESTAMPTZ(6),
    "anulado_por_id" UUID,
    "motivo_anulacion" TEXT,

    CONSTRAINT "operacion_divisa_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operacion_divisa_montos_positivos" CHECK ("monto_divisa" > 0 AND "monto_pesos" > 0 AND "tasa_usada" > 0)
);

-- CreateTable
CREATE TABLE "denominacion_operacion" (
    "id" UUID NOT NULL,
    "operacion_divisa_id" UUID NOT NULL,
    "sentido" "sentido_movimiento" NOT NULL,
    "moneda" CHAR(3) NOT NULL,
    "denominacion_id" UUID NOT NULL,
    "valor" DECIMAL(18,3) NOT NULL,
    "cantidad" INTEGER NOT NULL,

    CONSTRAINT "denominacion_operacion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "denominacion_operacion_cantidad_positiva" CHECK ("cantidad" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "operacion_divisa_numero_comprobante_key" ON "operacion_divisa"("numero_comprobante");

-- CreateIndex
CREATE UNIQUE INDEX "operacion_divisa_clave_idempotencia_key" ON "operacion_divisa"("clave_idempotencia");

-- CreateIndex
CREATE INDEX "operacion_divisa_turno_id_idx" ON "operacion_divisa"("turno_id");

-- CreateIndex
CREATE INDEX "operacion_divisa_creado_en_idx" ON "operacion_divisa"("creado_en");

-- CreateIndex
CREATE INDEX "denominacion_operacion_operacion_divisa_id_idx" ON "denominacion_operacion"("operacion_divisa_id");

-- CreateIndex
CREATE INDEX "movimiento_cuenta_operacion_divisa_id_idx" ON "movimiento_cuenta"("operacion_divisa_id");

-- AddForeignKey
ALTER TABLE "movimiento_cuenta" ADD CONSTRAINT "movimiento_cuenta_operacion_divisa_id_fkey" FOREIGN KEY ("operacion_divisa_id") REFERENCES "operacion_divisa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_operacion_divisa_id_fkey" FOREIGN KEY ("operacion_divisa_id") REFERENCES "operacion_divisa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion_divisa" ADD CONSTRAINT "operacion_divisa_linea_negocio_id_fkey" FOREIGN KEY ("linea_negocio_id") REFERENCES "linea_negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion_divisa" ADD CONSTRAINT "operacion_divisa_tasa_id_fkey" FOREIGN KEY ("tasa_id") REFERENCES "tasa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion_divisa" ADD CONSTRAINT "operacion_divisa_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion_divisa" ADD CONSTRAINT "operacion_divisa_cuenta_divisa_id_fkey" FOREIGN KEY ("cuenta_divisa_id") REFERENCES "cuenta_dinero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion_divisa" ADD CONSTRAINT "operacion_divisa_cuenta_pesos_id_fkey" FOREIGN KEY ("cuenta_pesos_id") REFERENCES "cuenta_dinero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion_divisa" ADD CONSTRAINT "operacion_divisa_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion_divisa" ADD CONSTRAINT "operacion_divisa_anulado_por_id_fkey" FOREIGN KEY ("anulado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "denominacion_operacion" ADD CONSTRAINT "denominacion_operacion_operacion_divisa_id_fkey" FOREIGN KEY ("operacion_divisa_id") REFERENCES "operacion_divisa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "denominacion_operacion" ADD CONSTRAINT "denominacion_operacion_denominacion_id_fkey" FOREIGN KEY ("denominacion_id") REFERENCES "denominacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

