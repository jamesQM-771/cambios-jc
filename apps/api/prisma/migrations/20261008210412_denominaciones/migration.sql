-- CreateTable
CREATE TABLE "denominacion" (
    "id" UUID NOT NULL,
    "moneda" CHAR(3) NOT NULL,
    "valor" DECIMAL(18,3) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "denominacion_pkey" PRIMARY KEY ("id")
);
