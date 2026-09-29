-- Cambios JC usa solo tres roles (D28): se quitan supervisor y cumplimiento.
-- Ningún usuario los usa (el seed crea un administrador); si hubiera alguno, esta migración falla en lugar de perder datos.

-- AlterEnum
BEGIN;
CREATE TYPE "rol_new" AS ENUM ('administrador', 'vendedor', 'digitador');
ALTER TABLE "usuario" ALTER COLUMN "rol" TYPE "rol_new" USING ("rol"::text::"rol_new");
ALTER TYPE "rol" RENAME TO "rol_old";
ALTER TYPE "rol_new" RENAME TO "rol";
DROP TYPE "public"."rol_old";
COMMIT;
