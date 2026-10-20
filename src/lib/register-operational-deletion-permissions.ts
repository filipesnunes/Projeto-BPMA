import "server-only";
import { Prisma } from "@prisma/client";
import { PERMISSION_DEFINITIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// Same authenticated one-time registration used by Personalização. Later manual
// revocations are honored; no session restores existing catalog entries/grants.
export async function registerOperationalDeletionPermissions(): Promise<boolean> {
  try {
    return await prisma.$transaction(async tx => {
      if (await tx.permissao.findUnique({ where: { codigo: "modulo.limpeza_diaria.excluir_registro" } })) return false;
      const profiles = await tx.perfilAcesso.findMany({ where: { OR: [
        { codigo: { in: ["DEV", "GERENTE", "NUTRICIONISTA"] } },
        { perfilLegado: { in: ["DEV", "GERENTE", "NUTRICIONISTA"] } }
      ] }, select: { id: true } });
      for (const code of ["limpeza_diaria", "limpeza_semanal", "rastreabilidade", "chamados"]) {
        const definition = PERMISSION_DEFINITIONS.find(p => p.codigo === `modulo.${code}.excluir_registro`)!;
        const permission = await tx.permissao.upsert({ where: { codigo: definition.codigo }, create: definition, update: {} });
        await tx.perfilPermissao.createMany({ data: profiles.map(p => ({ perfilId: p.id, permissaoId: permission.id, permitido: true })), skipDuplicates: true });
      }
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) return true;
    throw error;
  }
}
