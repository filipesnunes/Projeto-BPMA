-- AlterEnum
ALTER TYPE "StatusPlanoLimpeza" ADD VALUE 'AGUARDANDO_SUPERVISOR';

-- AlterTable
ALTER TABLE "plano_limpeza_diario_registro" ALTER COLUMN "assinaturaResponsavel" SET DEFAULT '',
ALTER COLUMN "assinaturaSupervisor" SET DEFAULT '';
