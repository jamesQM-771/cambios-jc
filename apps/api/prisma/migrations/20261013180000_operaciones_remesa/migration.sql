-- CreateEnum
CREATE TYPE "tipo_operacion" AS ENUM ('remesa_venta');

-- CreateEnum
CREATE TYPE "estado_operacion" AS ENUM ('registrada', 'pago_verificado', 'en_cola', 'tomada', 'completada', 'con_incidencia', 'devuelta', 'anulada');

-- CreateEnum
CREATE TYPE "forma_pago" AS ENUM ('efectivo', 'transferencia');

-- CreateTable
CREATE TABLE "operacion" (
    "id" UUID NOT NULL,
    "numero_comprobante" INTEGER NOT NULL,
    "tipo" "tipo_operacion" NOT NULL,
    "estado" "estado_operacion" NOT NULL DEFAULT 'registrada',
    "linea_negocio_id" UUID NOT NULL,
    "tasa_id" UUID NOT NULL,
    "remitente_id" UUID NOT NULL,
    "forma_pago" "forma_pago" NOT NULL,
    "cuenta_ingreso_id" UUID NOT NULL,
    "monto_pesos" DECIMAL(18,2) NOT NULL,
    "monto_bolivares" DECIMAL(18,3) NOT NULL,
    "tasa_calculada" DECIMAL(18,6) NOT NULL,
    "tasa_usada" DECIMAL(18,6) NOT NULL,
    "motivo_tasa" TEXT,
    "clave_idempotencia" VARCHAR(64) NOT NULL,
    "creado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transferencia" (
    "id" UUID NOT NULL,
    "operacion_id" UUID NOT NULL,
    "medio_pago_id" UUID NOT NULL,

    CONSTRAINT "transferencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_operacion" (
    "id" UUID NOT NULL,
    "operacion_id" UUID NOT NULL,
    "estado_anterior" "estado_operacion",
    "estado_nuevo" "estado_operacion" NOT NULL,
    "motivo" TEXT,
    "usuario_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_operacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contador" (
    "clave" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,

    CONSTRAINT "contador_pkey" PRIMARY KEY ("clave")
);

-- CreateIndex
CREATE UNIQUE INDEX "operacion_numero_comprobante_key" ON "operacion"("numero_comprobante");

-- CreateIndex
CREATE UNIQUE INDEX "operacion_clave_idempotencia_key" ON "operacion"("clave_idempotencia");

-- CreateIndex
CREATE INDEX "operacion_estado_creado_en_idx" ON "operacion"("estado", "creado_en");

-- CreateIndex
CREATE UNIQUE INDEX "transferencia_operacion_id_key" ON "transferencia"("operacion_id");

-- CreateIndex
CREATE INDEX "evento_operacion_operacion_id_creado_en_idx" ON "evento_operacion"("operacion_id", "creado_en");

-- AddForeignKey
ALTER TABLE "operacion" ADD CONSTRAINT "operacion_linea_negocio_id_fkey" FOREIGN KEY ("linea_negocio_id") REFERENCES "linea_negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion" ADD CONSTRAINT "operacion_tasa_id_fkey" FOREIGN KEY ("tasa_id") REFERENCES "tasa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion" ADD CONSTRAINT "operacion_remitente_id_fkey" FOREIGN KEY ("remitente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion" ADD CONSTRAINT "operacion_cuenta_ingreso_id_fkey" FOREIGN KEY ("cuenta_ingreso_id") REFERENCES "cuenta_dinero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion" ADD CONSTRAINT "operacion_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencia" ADD CONSTRAINT "transferencia_operacion_id_fkey" FOREIGN KEY ("operacion_id") REFERENCES "operacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencia" ADD CONSTRAINT "transferencia_medio_pago_id_fkey" FOREIGN KEY ("medio_pago_id") REFERENCES "medio_pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_operacion" ADD CONSTRAINT "evento_operacion_operacion_id_fkey" FOREIGN KEY ("operacion_id") REFERENCES "operacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_operacion" ADD CONSTRAINT "evento_operacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El primer comprobante emitido será el 1 (el sistema es nuevo, no continúa otro).
INSERT INTO "contador" ("clave", "valor") VALUES ('comprobante', 0);
