-- CreateEnum
CREATE TYPE "tipo_contraparte" AS ENUM ('proveedor', 'familiar', 'socio', 'tercero', 'otro');

-- CreateEnum
CREATE TYPE "tipo_movimiento_contraparte" AS ENUM ('prestamo_otorgado', 'prestamo_recibido', 'abono_recibido', 'abono_entregado', 'anticipo_proveedor', 'compra_credito', 'ajuste', 'otro');

-- AlterEnum
ALTER TYPE "origen_movimiento" ADD VALUE 'contraparte';
ALTER TYPE "origen_movimiento" ADD VALUE 'contraparte_anulacion';

-- AlterTable
ALTER TABLE "cuenta_dinero" ADD COLUMN     "contraparte_titular_id" UUID;

-- AlterTable
ALTER TABLE "movimiento_cuenta" ADD COLUMN     "movimiento_contraparte_id" UUID;

-- CreateTable
CREATE TABLE "contraparte" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "documento" TEXT,
    "telefono" TEXT,
    "tipo" "tipo_contraparte" NOT NULL,
    "notas" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contraparte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimiento_contraparte" (
    "id" UUID NOT NULL,
    "contraparte_id" UUID NOT NULL,
    "tipo" "tipo_movimiento_contraparte" NOT NULL,
    "moneda" CHAR(3) NOT NULL,
    "monto" DECIMAL(18,3) NOT NULL,
    "signo" SMALLINT NOT NULL,
    "cuenta_id" UUID,
    "nota" TEXT,
    "revierte_id" UUID,
    "turno_id" UUID,
    "clave_idempotencia" VARCHAR(64) NOT NULL,
    "usuario_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimiento_contraparte_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "movimiento_contraparte_monto_positivo" CHECK ("monto" > 0),
    CONSTRAINT "movimiento_contraparte_signo_valido" CHECK ("signo" IN (1, -1)),
    CONSTRAINT "movimiento_contraparte_ajuste_sin_cuenta" CHECK ("tipo" NOT IN ('ajuste', 'compra_credito') OR "cuenta_id" IS NULL)
);

-- CreateIndex
CREATE UNIQUE INDEX "movimiento_contraparte_revierte_id_key" ON "movimiento_contraparte"("revierte_id");

-- CreateIndex
CREATE UNIQUE INDEX "movimiento_contraparte_clave_idempotencia_key" ON "movimiento_contraparte"("clave_idempotencia");

-- CreateIndex
CREATE INDEX "movimiento_contraparte_contraparte_id_creado_en_idx" ON "movimiento_contraparte"("contraparte_id", "creado_en");

-- CreateIndex
CREATE INDEX "movimiento_contraparte_creado_en_idx" ON "movimiento_contraparte"("creado_en");

-- CreateIndex
CREATE INDEX "movimiento_cuenta_movimiento_contraparte_id_idx" ON "movimiento_cuenta"("movimiento_contraparte_id");

-- AddForeignKey
ALTER TABLE "cuenta_dinero" ADD CONSTRAINT "cuenta_dinero_contraparte_titular_id_fkey" FOREIGN KEY ("contraparte_titular_id") REFERENCES "contraparte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_cuenta" ADD CONSTRAINT "movimiento_cuenta_movimiento_contraparte_id_fkey" FOREIGN KEY ("movimiento_contraparte_id") REFERENCES "movimiento_contraparte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contraparte" ADD CONSTRAINT "contraparte_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_contraparte" ADD CONSTRAINT "movimiento_contraparte_contraparte_id_fkey" FOREIGN KEY ("contraparte_id") REFERENCES "contraparte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_contraparte" ADD CONSTRAINT "movimiento_contraparte_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuenta_dinero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_contraparte" ADD CONSTRAINT "movimiento_contraparte_revierte_id_fkey" FOREIGN KEY ("revierte_id") REFERENCES "movimiento_contraparte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_contraparte" ADD CONSTRAINT "movimiento_contraparte_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_contraparte" ADD CONSTRAINT "movimiento_contraparte_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Dos contrapartes no pueden llamarse igual, sin importar mayúsculas ni espacios de los extremos.
CREATE UNIQUE INDEX "contraparte_nombre_unico" ON "contraparte"(lower(btrim("nombre")));

-- La cuenta corriente es de solo inserción, como el libro: anular es agregar el movimiento contrario.
CREATE FUNCTION "movimiento_contraparte_rechazar_modificacion"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La cuenta corriente es de solo inserción: % no está permitido', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "movimiento_contraparte_sin_update_ni_delete"
  BEFORE UPDATE OR DELETE ON "movimiento_contraparte"
  FOR EACH ROW EXECUTE FUNCTION "movimiento_contraparte_rechazar_modificacion"();

CREATE TRIGGER "movimiento_contraparte_sin_truncate"
  BEFORE TRUNCATE ON "movimiento_contraparte"
  FOR EACH STATEMENT EXECUTE FUNCTION "movimiento_contraparte_rechazar_modificacion"();
