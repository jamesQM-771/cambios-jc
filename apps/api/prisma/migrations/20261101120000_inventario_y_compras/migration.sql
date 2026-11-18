-- CreateEnum
CREATE TYPE "origen_inventario" AS ENUM ('ajuste', 'compra', 'compra_anulacion', 'remesa_pago');

-- CreateEnum
CREATE TYPE "forma_pago_compra" AS ENUM ('contado', 'credito');

-- AlterEnum
ALTER TYPE "origen_movimiento" ADD VALUE 'compra_ingreso';
ALTER TYPE "origen_movimiento" ADD VALUE 'compra_pago';
ALTER TYPE "origen_movimiento" ADD VALUE 'compra_anulacion';

-- AlterTable
ALTER TABLE "movimiento_cuenta" ADD COLUMN     "compra_id" UUID;

-- AlterTable
ALTER TABLE "operacion" ADD COLUMN     "costo_bancario_pesos" DECIMAL(18,2),
ADD COLUMN     "costo_promedio" DECIMAL(18,6),
ADD COLUMN     "ganancia_bruta" DECIMAL(18,2),
ADD COLUMN     "ganancia_neta" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "inventario_divisa" (
    "moneda" CHAR(3) NOT NULL,
    "cantidad" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "costo_promedio" DECIMAL(18,6),
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventario_divisa_pkey" PRIMARY KEY ("moneda")
);

-- CreateTable
CREATE TABLE "movimiento_inventario" (
    "id" UUID NOT NULL,
    "moneda" CHAR(3) NOT NULL,
    "origen" "origen_inventario" NOT NULL,
    "sentido" "sentido_movimiento" NOT NULL,
    "cantidad" DECIMAL(18,3) NOT NULL,
    "tasa" DECIMAL(18,6),
    "cantidad_antes" DECIMAL(18,3) NOT NULL,
    "costo_antes" DECIMAL(18,6),
    "cantidad_despues" DECIMAL(18,3) NOT NULL,
    "costo_despues" DECIMAL(18,6),
    "compra_id" UUID,
    "operacion_id" UUID,
    "nota" TEXT,
    "usuario_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimiento_inventario_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "movimiento_inventario_cantidad_positiva" CHECK ("cantidad" > 0)
);

-- CreateTable
CREATE TABLE "compra_divisa" (
    "id" UUID NOT NULL,
    "contraparte_id" UUID NOT NULL,
    "moneda" CHAR(3) NOT NULL,
    "cantidad" DECIMAL(18,3) NOT NULL,
    "tasa" DECIMAL(18,6) NOT NULL,
    "monto_pesos" DECIMAL(18,2) NOT NULL,
    "cuenta_destino_id" UUID NOT NULL,
    "forma_pago" "forma_pago_compra" NOT NULL,
    "cuenta_pago_id" UUID,
    "movimiento_contraparte_id" UUID,
    "nota" TEXT,
    "turno_id" UUID,
    "clave_idempotencia" VARCHAR(64) NOT NULL,
    "creado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulado_en" TIMESTAMPTZ(6),
    "anulado_por_id" UUID,
    "motivo_anulacion" TEXT,

    CONSTRAINT "compra_divisa_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "compra_divisa_valores_positivos" CHECK ("cantidad" > 0 AND "tasa" > 0 AND "monto_pesos" > 0),
    CONSTRAINT "compra_divisa_pago_segun_forma" CHECK (("forma_pago" = 'contado') = ("cuenta_pago_id" IS NOT NULL))
);

-- CreateIndex
CREATE INDEX "movimiento_inventario_moneda_creado_en_idx" ON "movimiento_inventario"("moneda", "creado_en");

-- CreateIndex
CREATE INDEX "movimiento_inventario_compra_id_idx" ON "movimiento_inventario"("compra_id");

-- CreateIndex
CREATE INDEX "movimiento_inventario_operacion_id_idx" ON "movimiento_inventario"("operacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "compra_divisa_movimiento_contraparte_id_key" ON "compra_divisa"("movimiento_contraparte_id");

-- CreateIndex
CREATE UNIQUE INDEX "compra_divisa_clave_idempotencia_key" ON "compra_divisa"("clave_idempotencia");

-- CreateIndex
CREATE INDEX "compra_divisa_contraparte_id_creado_en_idx" ON "compra_divisa"("contraparte_id", "creado_en");

-- CreateIndex
CREATE INDEX "compra_divisa_creado_en_idx" ON "compra_divisa"("creado_en");

-- CreateIndex
CREATE INDEX "movimiento_cuenta_compra_id_idx" ON "movimiento_cuenta"("compra_id");

-- AddForeignKey
ALTER TABLE "movimiento_cuenta" ADD CONSTRAINT "movimiento_cuenta_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compra_divisa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_moneda_fkey" FOREIGN KEY ("moneda") REFERENCES "inventario_divisa"("moneda") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compra_divisa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_operacion_id_fkey" FOREIGN KEY ("operacion_id") REFERENCES "operacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra_divisa" ADD CONSTRAINT "compra_divisa_contraparte_id_fkey" FOREIGN KEY ("contraparte_id") REFERENCES "contraparte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra_divisa" ADD CONSTRAINT "compra_divisa_cuenta_destino_id_fkey" FOREIGN KEY ("cuenta_destino_id") REFERENCES "cuenta_dinero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra_divisa" ADD CONSTRAINT "compra_divisa_cuenta_pago_id_fkey" FOREIGN KEY ("cuenta_pago_id") REFERENCES "cuenta_dinero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra_divisa" ADD CONSTRAINT "compra_divisa_movimiento_contraparte_id_fkey" FOREIGN KEY ("movimiento_contraparte_id") REFERENCES "movimiento_contraparte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra_divisa" ADD CONSTRAINT "compra_divisa_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra_divisa" ADD CONSTRAINT "compra_divisa_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra_divisa" ADD CONSTRAINT "compra_divisa_anulado_por_id_fkey" FOREIGN KEY ("anulado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- El historial del inventario es de solo inserción, como el libro.
CREATE FUNCTION "movimiento_inventario_rechazar_modificacion"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'El historial del inventario es de solo inserción: % no está permitido', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "movimiento_inventario_sin_update_ni_delete"
  BEFORE UPDATE OR DELETE ON "movimiento_inventario"
  FOR EACH ROW EXECUTE FUNCTION "movimiento_inventario_rechazar_modificacion"();

CREATE TRIGGER "movimiento_inventario_sin_truncate"
  BEFORE TRUNCATE ON "movimiento_inventario"
  FOR EACH STATEMENT EXECUTE FUNCTION "movimiento_inventario_rechazar_modificacion"();
