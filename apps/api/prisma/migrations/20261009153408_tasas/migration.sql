-- CreateEnum
CREATE TYPE "modo_tasa" AS ENUM ('directo', 'porcentaje');

-- AlterTable
ALTER TABLE "linea_negocio" ADD COLUMN     "margen_compra" DECIMAL(18,6),
ADD COLUMN     "margen_venta" DECIMAL(18,6),
ADD COLUMN     "modo_tasa" "modo_tasa" NOT NULL DEFAULT 'directo';

-- CreateTable
CREATE TABLE "tasa" (
    "id" UUID NOT NULL,
    "linea_negocio_id" UUID NOT NULL,
    "tasa_referencia" DECIMAL(18,6),
    "margen_usado" DECIMAL(18,6),
    "tasa_compra" DECIMAL(18,6),
    "tasa_venta" DECIMAL(18,6) NOT NULL,
    "publicada_por_id" UUID NOT NULL,
    "motivo" TEXT,
    "vigente_desde" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigente_hasta" TIMESTAMPTZ(6),

    CONSTRAINT "tasa_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "tasa" ADD CONSTRAINT "tasa_linea_negocio_id_fkey" FOREIGN KEY ("linea_negocio_id") REFERENCES "linea_negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasa" ADD CONSTRAINT "tasa_publicada_por_id_fkey" FOREIGN KEY ("publicada_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
