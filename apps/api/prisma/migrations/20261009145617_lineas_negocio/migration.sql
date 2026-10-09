-- CreateEnum
CREATE TYPE "clase_linea" AS ENUM ('remesa', 'divisa_caja');

-- CreateTable
CREATE TABLE "linea_negocio" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "clase" "clase_linea" NOT NULL,
    "moneda_origen" CHAR(3) NOT NULL,
    "moneda_destino" CHAR(3) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "linea_negocio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "linea_negocio_nombre_key" ON "linea_negocio"("nombre");
