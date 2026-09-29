-- Sesiones identificadas por el hash de un token aleatorio, y último paso TOTP usado (anti-reutilización).
-- La tabla "sesion" aún no tiene filas (no había autenticación); si las hubiera, esta migración falla en lugar de inventar tokens.

-- AlterTable
ALTER TABLE "sesion" ADD COLUMN     "token_hash" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "usuario" ADD COLUMN     "ultimo_paso_2fa" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "sesion_token_hash_key" ON "sesion"("token_hash");
