import "server-only";
import { Prisma } from "@prisma/client";
import { PERMISSION_DEFINITIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// Register this catalog entry once, using the existing permissions tables.
// Its existence is the marker: subsequent logins must not restore a revoked grant.
export async function registerPersonalizationPermission(): Promise<boolean> {
  const definition = PERMISSION_DEFINITIONS.find(item => item.codigo === "modulo.personalizacao.acessar")!;
  try {
    return await prisma.$transaction(async tx => {
      if (await tx.permissao.findUnique({ where: { codigo: definition.codigo } })) return false;
      const permission = await tx.permissao.create({ data: definition });
      const profiles = await tx.perfilAcesso.findMany({
        where: { OR: [{ codigo: { in: ["GERENTE", "DEV"] } }, { perfilLegado: { in: ["GERENTE", "DEV"] } }] },
        select: { id: true }
      });
      await tx.perfilPermissao.createMany({
        data: profiles.map(profile => ({ perfilId: profile.id, permissaoId: permission.id, permitido: true })),
        skipDuplicates: true
      });
      return true;
    });
  } catch (error) {
    // A simultaneous authenticated request may have registered the same entry.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" &&
      await prisma.permissao.findUnique({ where: { codigo: definition.codigo } })) return true;
    throw error;
  }
}
