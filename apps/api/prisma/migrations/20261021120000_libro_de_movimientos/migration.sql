-- CreateEnum
CREATE TYPE "sentido_movimiento" AS ENUM ('entrada', 'salida');

-- CreateEnum
CREATE TYPE "origen_movimiento" AS ENUM ('remesa_ingreso', 'remesa_pago', 'remesa_costo', 'remesa_anulacion');

-- CreateTable
CREATE TABLE "movimiento_cuenta" (
    "id" UUID NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "sentido" "sentido_movimiento" NOT NULL,
    "monto" DECIMAL(18,3) NOT NULL,
    "origen" "origen_movimiento" NOT NULL,
    "operacion_id" UUID,
    "turno_id" UUID,
    "revierte_id" UUID,
    "usuario_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimiento_cuenta_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "movimiento_cuenta_monto_positivo" CHECK ("monto" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "movimiento_cuenta_revierte_id_key" ON "movimiento_cuenta"("revierte_id");

-- CreateIndex
CREATE INDEX "movimiento_cuenta_cuenta_id_creado_en_idx" ON "movimiento_cuenta"("cuenta_id", "creado_en");

-- CreateIndex
CREATE INDEX "movimiento_cuenta_operacion_id_idx" ON "movimiento_cuenta"("operacion_id");

-- AddForeignKey
ALTER TABLE "movimiento_cuenta" ADD CONSTRAINT "movimiento_cuenta_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuenta_dinero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_cuenta" ADD CONSTRAINT "movimiento_cuenta_operacion_id_fkey" FOREIGN KEY ("operacion_id") REFERENCES "operacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_cuenta" ADD CONSTRAINT "movimiento_cuenta_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_cuenta" ADD CONSTRAINT "movimiento_cuenta_revierte_id_fkey" FOREIGN KEY ("revierte_id") REFERENCES "movimiento_cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_cuenta" ADD CONSTRAINT "movimiento_cuenta_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El libro es de solo inserción, igual que la bitácora: un error se corrige con un movimiento contrario.
CREATE FUNCTION "movimiento_cuenta_rechazar_modificacion"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'El libro de movimientos es de solo inserción: % no está permitido', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "movimiento_cuenta_sin_update_ni_delete"
  BEFORE UPDATE OR DELETE ON "movimiento_cuenta"
  FOR EACH ROW EXECUTE FUNCTION "movimiento_cuenta_rechazar_modificacion"();

CREATE TRIGGER "movimiento_cuenta_sin_truncate"
  BEFORE TRUNCATE ON "movimiento_cuenta"
  FOR EACH STATEMENT EXECUTE FUNCTION "movimiento_cuenta_rechazar_modificacion"();
