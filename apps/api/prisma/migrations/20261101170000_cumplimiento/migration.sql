-- CreateEnum
CREATE TYPE "nivel_riesgo" AS ENUM ('bajo', 'medio', 'alto');

-- CreateEnum
CREATE TYPE "fuente_lista" AS ENUM ('onu', 'ofac', 'propia');

-- CreateEnum
CREATE TYPE "tipo_alerta" AS ENUM ('lista_restrictiva', 'fraccionamiento', 'concentracion', 'ficha_requerida');

-- CreateEnum
CREATE TYPE "estado_alerta" AS ENUM ('abierta', 'descartada', 'escalada');

-- CreateTable
CREATE TABLE "perfil_riesgo" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "actividad_economica" TEXT,
    "origen_fondos" TEXT,
    "direccion" TEXT,
    "pep" BOOLEAN NOT NULL DEFAULT false,
    "nivel" "nivel_riesgo" NOT NULL DEFAULT 'bajo',
    "motivo_nivel" TEXT,
    "actualizado_por_id" UUID NOT NULL,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "perfil_riesgo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametros_cumplimiento" (
    "id" UUID NOT NULL,
    "unica" BOOLEAN NOT NULL DEFAULT true,
    "umbral_ficha_mensual" DECIMAL(18,2),
    "fraccionamiento_cantidad" INTEGER,
    "fraccionamiento_monto_maximo" DECIMAL(18,2),
    "concentracion_remitentes" INTEGER,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parametros_cumplimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entrada_lista_restrictiva" (
    "id" UUID NOT NULL,
    "fuente" "fuente_lista" NOT NULL,
    "nombre" TEXT NOT NULL,
    "numero_documento" VARCHAR(20),
    "nota" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entrada_lista_restrictiva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerta_cumplimiento" (
    "id" UUID NOT NULL,
    "tipo" "tipo_alerta" NOT NULL,
    "estado" "estado_alerta" NOT NULL DEFAULT 'abierta',
    "cliente_id" UUID NOT NULL,
    "operacion_id" UUID,
    "detalle" JSONB NOT NULL,
    "justificacion" TEXT,
    "resuelta_por_id" UUID,
    "resuelta_en" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerta_cumplimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "perfil_riesgo_cliente_id_key" ON "perfil_riesgo"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "parametros_cumplimiento_unica_key" ON "parametros_cumplimiento"("unica");

-- CreateIndex
CREATE INDEX "entrada_lista_restrictiva_numero_documento_idx" ON "entrada_lista_restrictiva"("numero_documento");

-- CreateIndex
CREATE INDEX "alerta_cumplimiento_estado_creado_en_idx" ON "alerta_cumplimiento"("estado", "creado_en");

-- CreateIndex
CREATE INDEX "alerta_cumplimiento_cliente_id_idx" ON "alerta_cumplimiento"("cliente_id");

-- AddForeignKey
ALTER TABLE "perfil_riesgo" ADD CONSTRAINT "perfil_riesgo_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_riesgo" ADD CONSTRAINT "perfil_riesgo_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entrada_lista_restrictiva" ADD CONSTRAINT "entrada_lista_restrictiva_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerta_cumplimiento" ADD CONSTRAINT "alerta_cumplimiento_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerta_cumplimiento" ADD CONSTRAINT "alerta_cumplimiento_operacion_id_fkey" FOREIGN KEY ("operacion_id") REFERENCES "operacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerta_cumplimiento" ADD CONSTRAINT "alerta_cumplimiento_resuelta_por_id_fkey" FOREIGN KEY ("resuelta_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Una sola fila de parámetros, con todas las reglas apagadas (D150).
INSERT INTO "parametros_cumplimiento" ("id", "unica") VALUES ('01900000-0000-7000-8000-00000000c0a1', true);
