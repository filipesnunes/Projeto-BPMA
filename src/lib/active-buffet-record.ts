import type { Prisma } from "@prisma/client";

// PostgreSQL enforces uniqueness only for active rows (partial unique index).
export async function saveActiveBuffetRecord(db: Prisma.TransactionClient,
  where: { data: Date; servicoId: number; itemId: number },
  create: Prisma.ControleBuffetAmostraRegistroUncheckedCreateInput,
  update: Prisma.ControleBuffetAmostraRegistroUncheckedUpdateInput) {
  const existing = await db.controleBuffetAmostraRegistro.findFirst({ where: { ...where, excluidoEm: null } });
  return existing
    ? db.controleBuffetAmostraRegistro.update({ where: { id: existing.id }, data: update })
    : db.controleBuffetAmostraRegistro.create({ data: create });
}
