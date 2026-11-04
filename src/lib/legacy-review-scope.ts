import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { OperationalSignatureModuleCode } from "./module-signatures";

// No schema change or rewriting of old signatures. New reviews bind the content
// displayed to the reviewer and record that scope in the existing audit log.
export async function legacyReviewScope(tx: Prisma.TransactionClient, module: OperationalSignatureModuleCode, date: Date) {
  const rows = module === "hortifruti" ? await tx.higienizacaoHortifruti.findMany({ where: { data: date, excluidoEm: null }, orderBy: { id: "asc" } })
    : module === "limpeza_diaria" ? await tx.planoLimpezaDiarioRegistro.findMany({ where: { data: date, excluidoEm: null }, orderBy: { id: "asc" } })
    : module === "limpeza_semanal" ? await tx.planoLimpezaSemanalExecucao.findMany({ where: { dataExecucao: date, excluidoEm: null }, orderBy: { id: "asc" } })
    : [];
  return { rows, token: createHash("sha256").update(JSON.stringify(rows)).digest("hex") };
}
