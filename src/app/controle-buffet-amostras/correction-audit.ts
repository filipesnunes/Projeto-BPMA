import "server-only";
import { isDeepStrictEqual } from "node:util";
import type { ControleBuffetAmostraRegistro, FluxoOperacional, Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth-session";
import { hasBuffetExecution } from "./authorship";
import type { BuffetCorrectionAudit } from "./correction-evidence";

const fields = ["classificacao", "usaGarrafaTermica", "temperaturaAmbiente", "tcEquipamento", "primeiraTc", "segundaTc", "statusTemperatura", "acaoCorretiva", "observacao", "status", "horarioExecucao", "horarioNaoInformado", "justificativaHorario"] as const;

export async function auditBuffetCorrections(tx: Prisma.TransactionClient, user: AuthenticatedUser, unit: FluxoOperacional,
  before: ControleBuffetAmostraRegistro[], after: ControleBuffetAmostraRegistro[], complete: boolean, justification: string) {
  if (justification.length > 4000) throw Error("A justificativa das correções deve ter até 4000 caracteres.");
  const items: BuffetCorrectionAudit["itens"] = [];
  for (const original of before) {
    if (!hasBuffetExecution(original)) continue;
    const current = after.find(row => row.id === original.id);
    if (!current) continue;
    const changes = fields.filter(field => !isDeepStrictEqual(original[field], current[field])).map(field => ({ campo: field, antes: original[field], depois: current[field] }));
    if (!changes.length) continue;
    items.push({ id: original.id, nome: original.itemNome, executorOriginal: { id: original.responsavelUsuarioId, nome: original.responsavelNome }, campos: changes });
  }
  if (!items.length) return;
  const evidence: BuffetCorrectionAudit = { tipo: "CORRECAO_ITENS_BUFFET", formato: 1, justificativa: justification || null, itens: items };
  // The core saves this exact next version in the same transaction. Failure of
  // either the version or the audit rolls back the item updates as well.
  await tx.fluxoEvento.create({ data: {
    fluxoId: unit.id, operacao: "CORRECAO_REGISTRO", versaoAnterior: unit.versao, versaoNova: unit.versao + 1,
    estadoAnterior: unit.estado, estadoNovo: unit.estado === "REABERTO" ? "REABERTO" : complete ? "COMPLETO" : "PENDENTE",
    usuarioId: user.id, usuarioNome: user.nomeCompleto, usuarioPerfil: user.perfil, justificativa: JSON.stringify(evidence)
  } });
}
