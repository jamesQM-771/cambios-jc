-- CreateTable
CREATE TABLE "permisos_rol" (
    "rol" "rol" NOT NULL,
    "permisos" TEXT[],
    "actualizado_por" UUID NOT NULL,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permisos_rol_pkey" PRIMARY KEY ("rol")
);

