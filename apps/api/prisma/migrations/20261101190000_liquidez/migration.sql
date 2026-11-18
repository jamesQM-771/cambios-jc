-- CreateTable
CREATE TABLE "parametros_liquidez" (
    "id" UUID NOT NULL,
    "unica" BOOLEAN NOT NULL DEFAULT true,
    "umbral_libre" DECIMAL(18,3),
    "porcentaje_limite" INTEGER,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parametros_liquidez_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parametros_liquidez_unica_key" ON "parametros_liquidez"("unica");


ALTER TABLE "parametros_liquidez" ADD CONSTRAINT "parametros_liquidez_porcentaje_valido"
  CHECK ("porcentaje_limite" IS NULL OR ("porcentaje_limite" BETWEEN 1 AND 100));

INSERT INTO "parametros_liquidez" ("id", "unica") VALUES ('01900000-0000-7000-8000-00000000c0a2', true);
