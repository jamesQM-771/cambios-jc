-- AlterTable
ALTER TABLE "operacion" ADD COLUMN "turno_id" UUID;

-- CreateIndex
CREATE INDEX "operacion_turno_id_idx" ON "operacion"("turno_id");

-- AddForeignKey
ALTER TABLE "operacion" ADD CONSTRAINT "operacion_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
