-- CreateTable
CREATE TABLE "impresion_recibo" (
    "id" UUID NOT NULL,
    "operacion_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "es_copia" BOOLEAN NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "impresion_recibo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "impresion_recibo_operacion_id_creado_en_idx" ON "impresion_recibo"("operacion_id", "creado_en");

-- AddForeignKey
ALTER TABLE "impresion_recibo" ADD CONSTRAINT "impresion_recibo_operacion_id_fkey" FOREIGN KEY ("operacion_id") REFERENCES "operacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impresion_recibo" ADD CONSTRAINT "impresion_recibo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
