-- AlterTable
ALTER TABLE "turno" ADD COLUMN "cerrado_por_id" UUID,
ADD COLUMN "motivo_cierre" TEXT;

-- AddForeignKey
ALTER TABLE "turno" ADD CONSTRAINT "turno_cerrado_por_id_fkey" FOREIGN KEY ("cerrado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
