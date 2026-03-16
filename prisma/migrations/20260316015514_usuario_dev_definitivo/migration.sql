-- DropIndex
DROP INDEX "usuario_perfil_status_idx";

-- AlterTable
ALTER TABLE "usuario" ADD COLUMN     "isDevDefinitivo" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "usuario_perfil_status_isDevDefinitivo_idx" ON "usuario"("perfil", "status", "isDevDefinitivo");
