-- CreateEnum
CREATE TYPE "tipo_evento_jornada" AS ENUM ('cierre', 'reapertura');

-- AlterTable
ALTER TABLE "jornada" ADD COLUMN "cerrada_por_id" UUID,
ADD COLUMN "ciclo" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "resumen" JSONB;

-- CreateTable
CREATE TABLE "evento_jornada" (
    "id" UUID NOT NULL,
    "jornada_id" UUID NOT NULL,
    "tipo" "tipo_evento_jornada" NOT NULL,
    "usuario_id" UUID NOT NULL,
    "motivo" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_jornada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saldo_cuenta_jornada" (
    "id" UUID NOT NULL,
    "jornada_id" UUID NOT NULL,
    "ciclo" INTEGER NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "moneda" CHAR(3) NOT NULL,
    "esperado" DECIMAL(18,3),
    "reportado" DECIMAL(18,3) NOT NULL,
    "diferencia" DECIMAL(18,3),
    "explicacion" TEXT,

    CONSTRAINT "saldo_cuenta_jornada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evento_jornada_jornada_id_creado_en_idx" ON "evento_jornada"("jornada_id", "creado_en");

-- CreateIndex
CREATE INDEX "saldo_cuenta_jornada_cuenta_id_idx" ON "saldo_cuenta_jornada"("cuenta_id");

-- CreateIndex
CREATE UNIQUE INDEX "saldo_cuenta_jornada_jornada_id_ciclo_cuenta_id_key" ON "saldo_cuenta_jornada"("jornada_id", "ciclo", "cuenta_id");

-- AddForeignKey
ALTER TABLE "jornada" ADD CONSTRAINT "jornada_cerrada_por_id_fkey" FOREIGN KEY ("cerrada_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_jornada" ADD CONSTRAINT "evento_jornada_jornada_id_fkey" FOREIGN KEY ("jornada_id") REFERENCES "jornada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_jornada" ADD CONSTRAINT "evento_jornada_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saldo_cuenta_jornada" ADD CONSTRAINT "saldo_cuenta_jornada_jornada_id_fkey" FOREIGN KEY ("jornada_id") REFERENCES "jornada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saldo_cuenta_jornada" ADD CONSTRAINT "saldo_cuenta_jornada_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuenta_dinero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
