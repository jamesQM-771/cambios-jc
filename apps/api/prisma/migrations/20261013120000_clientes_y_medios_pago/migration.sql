-- CreateEnum
CREATE TYPE "tipo_documento" AS ENUM ('V', 'E', 'J', 'G', 'P', 'CC', 'CE', 'PPT', 'PAS', 'NIT');

-- CreateEnum
CREATE TYPE "tipo_medio_pago" AS ENUM ('cuenta_bancaria', 'pago_movil');

-- CreateTable
CREATE TABLE "cliente" (
    "id" UUID NOT NULL,
    "tipo_documento" "tipo_documento" NOT NULL,
    "numero_documento" VARCHAR(20) NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" VARCHAR(20),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medio_pago" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "tipo" "tipo_medio_pago" NOT NULL,
    "banco_id" UUID NOT NULL,
    "numero_cuenta" VARCHAR(20),
    "telefono_pago_movil" VARCHAR(11),
    "titular" TEXT NOT NULL,
    "tipo_documento_titular" "tipo_documento" NOT NULL,
    "numero_documento_titular" VARCHAR(20) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medio_pago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cliente_nombre_idx" ON "cliente"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_tipo_documento_numero_documento_key" ON "cliente"("tipo_documento", "numero_documento");

-- CreateIndex
CREATE INDEX "medio_pago_cliente_id_idx" ON "medio_pago"("cliente_id");

-- AddForeignKey
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medio_pago" ADD CONSTRAINT "medio_pago_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medio_pago" ADD CONSTRAINT "medio_pago_banco_id_fkey" FOREIGN KEY ("banco_id") REFERENCES "banco"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
