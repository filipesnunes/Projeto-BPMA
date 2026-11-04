import "server-only";
import type { Prisma } from "@prisma/client";
import { PERMISSION_DEFINITIONS } from "./permissions";

// Catalog only: no profile grants, including when an administrator opens the editor.
export async function registerRetroactiveReviewPermissions(tx: Prisma.TransactionClient) {
  for (const definition of PERMISSION_DEFINITIONS.filter(p => p.acao === "assinar_retroativo")) {
    await tx.permissao.upsert({ where: { codigo: definition.codigo }, create: definition, update: definition });
  }
}
