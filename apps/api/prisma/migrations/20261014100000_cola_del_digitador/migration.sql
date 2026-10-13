-- AlterTable
ALTER TABLE "transferencia" ADD COLUMN     "completada_en" TIMESTAMPTZ(6),
ADD COLUMN     "comprobante_clave" TEXT,
ADD COLUMN     "costo_bancario" DECIMAL(18,3),
ADD COLUMN     "cuenta_origen_id" UUID,
ADD COLUMN     "operador_id" UUID,
ADD COLUMN     "referencia_bancaria" VARCHAR(40),
ADD COLUMN     "tomada_en" TIMESTAMPTZ(6);

-- CreateIndex
CREATE UNIQUE INDEX "transferencia_cuenta_origen_id_referencia_bancaria_key" ON "transferencia"("cuenta_origen_id", "referencia_bancaria");

-- AddForeignKey
ALTER TABLE "transferencia" ADD CONSTRAINT "transferencia_operador_id_fkey" FOREIGN KEY ("operador_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencia" ADD CONSTRAINT "transferencia_cuenta_origen_id_fkey" FOREIGN KEY ("cuenta_origen_id") REFERENCES "cuenta_dinero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
