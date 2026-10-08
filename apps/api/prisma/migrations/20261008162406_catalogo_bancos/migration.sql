-- CreateTable
CREATE TABLE "banco" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(4) NOT NULL,
    "nombre" TEXT NOT NULL,
    "pais" CHAR(2) NOT NULL DEFAULT 'VE',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banco_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "banco_codigo_key" ON "banco"("codigo");
