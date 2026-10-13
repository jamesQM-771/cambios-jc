-- AlterTable: primero nulo, para poder llenar las operaciones que ya existan.
ALTER TABLE "operacion" ADD COLUMN "codigo_seguimiento" VARCHAR(16);

-- Las operaciones anteriores reciben un código al azar (12 símbolos hexadecimales, un subconjunto del alfabeto).
UPDATE "operacion"
SET "codigo_seguimiento" = upper(substr(md5(random()::text || "id"::text || clock_timestamp()::text), 1, 12))
WHERE "codigo_seguimiento" IS NULL;

ALTER TABLE "operacion" ALTER COLUMN "codigo_seguimiento" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "operacion_codigo_seguimiento_key" ON "operacion"("codigo_seguimiento");
