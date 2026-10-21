-- CreateEnum
CREATE TYPE "estado_jornada" AS ENUM ('abierta', 'cerrada');

-- CreateEnum
CREATE TYPE "estado_turno" AS ENUM ('abierto', 'cerrado');

-- CreateEnum
CREATE TYPE "momento_conteo" AS ENUM ('apertura', 'cierre');

-- AlterTable
ALTER TABLE "cuenta_dinero" ADD COLUMN "caja_id" UUID;

-- CreateTable
CREATE TABLE "jornada" (
    "id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "estado" "estado_jornada" NOT NULL DEFAULT 'abierta',
    "cerrada_en" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jornada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turno" (
    "id" UUID NOT NULL,
    "caja_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "jornada_id" UUID NOT NULL,
    "estado" "estado_turno" NOT NULL DEFAULT 'abierto',
    "abierto_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerrado_en" TIMESTAMPTZ(6),
    "caja_en_uso" UUID,
    "usuario_en_uso" UUID,

    CONSTRAINT "turno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conteo_turno" (
    "id" UUID NOT NULL,
    "turno_id" UUID NOT NULL,
    "momento" "momento_conteo" NOT NULL,
    "moneda" CHAR(3) NOT NULL,
    "denominacion_id" UUID NOT NULL,
    "valor" DECIMAL(18,3) NOT NULL,
    "cantidad" INTEGER NOT NULL,

    CONSTRAINT "conteo_turno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saldo_turno" (
    "id" UUID NOT NULL,
    "turno_id" UUID NOT NULL,
    "momento" "momento_conteo" NOT NULL,
    "moneda" CHAR(3) NOT NULL,
    "esperado" DECIMAL(18,3),
    "contado" DECIMAL(18,3) NOT NULL,
    "diferencia" DECIMAL(18,3),
    "explicacion" TEXT,

    CONSTRAINT "saldo_turno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jornada_sucursal_id_fecha_key" ON "jornada"("sucursal_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "turno_caja_en_uso_key" ON "turno"("caja_en_uso");

-- CreateIndex
CREATE UNIQUE INDEX "turno_usuario_en_uso_key" ON "turno"("usuario_en_uso");

-- CreateIndex
CREATE INDEX "turno_jornada_id_idx" ON "turno"("jornada_id");

-- CreateIndex
CREATE INDEX "turno_caja_id_abierto_en_idx" ON "turno"("caja_id", "abierto_en");

-- CreateIndex
CREATE INDEX "conteo_turno_turno_id_momento_idx" ON "conteo_turno"("turno_id", "momento");

-- CreateIndex
CREATE UNIQUE INDEX "saldo_turno_turno_id_momento_moneda_key" ON "saldo_turno"("turno_id", "momento", "moneda");

-- AddForeignKey
ALTER TABLE "cuenta_dinero" ADD CONSTRAINT "cuenta_dinero_caja_id_fkey" FOREIGN KEY ("caja_id") REFERENCES "caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jornada" ADD CONSTRAINT "jornada_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turno" ADD CONSTRAINT "turno_caja_id_fkey" FOREIGN KEY ("caja_id") REFERENCES "caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turno" ADD CONSTRAINT "turno_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turno" ADD CONSTRAINT "turno_jornada_id_fkey" FOREIGN KEY ("jornada_id") REFERENCES "jornada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conteo_turno" ADD CONSTRAINT "conteo_turno_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conteo_turno" ADD CONSTRAINT "conteo_turno_denominacion_id_fkey" FOREIGN KEY ("denominacion_id") REFERENCES "denominacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saldo_turno" ADD CONSTRAINT "saldo_turno_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
