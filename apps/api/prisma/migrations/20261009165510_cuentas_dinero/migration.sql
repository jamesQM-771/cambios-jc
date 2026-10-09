-- CreateEnum
CREATE TYPE "tipo_cuenta" AS ENUM ('caja', 'banco', 'billetera');

-- CreateTable
CREATE TABLE "cuenta_dinero" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "tipo_cuenta" NOT NULL,
    "moneda" CHAR(3) NOT NULL,
    "banco_id" UUID,
    "ultimos_4_digitos" VARCHAR(4),
    "sucursal_id" UUID NOT NULL,
    "titular" TEXT,
    "responsable_id" UUID,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "limite_diario" DECIMAL(18,3),
    "comision_por_defecto" DECIMAL(18,3),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuenta_dinero_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "cuenta_dinero" ADD CONSTRAINT "cuenta_dinero_banco_id_fkey" FOREIGN KEY ("banco_id") REFERENCES "banco"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuenta_dinero" ADD CONSTRAINT "cuenta_dinero_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuenta_dinero" ADD CONSTRAINT "cuenta_dinero_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
