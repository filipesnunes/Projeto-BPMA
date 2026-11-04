import "server-only";
import { isDeepStrictEqual } from "node:util";
import type { Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth-session";
import { formatAppDateInput, getAppDate } from "@/lib/date-time";
import { workflowReviewEligibility } from "@/lib/operational-workflow/review-eligibility";
import { buffetSnapshot, type BuffetDraft } from "./workflow-adapter";
import { buffetRecordValues } from "./row-save";
import { validateBuffetRow, type BuffetRowIssue } from "./row-validation";
import { buffetProgress } from "./progress";

export async function buffetServiceReview(db: Prisma.TransactionClient, user: AuthenticatedUser, flowId: string, monthClosed: boolean) {
  const unit = await db.fluxoOperacional.findUniqueOrThrow({ where: { id: flowId }, include: {
    amostras: { where: { excluidoEm: null }, orderBy: { id: "asc" } }, versoes: { orderBy: { versao: "desc" }, take: 1 }
  } });
  const version = unit.versoes[0], draft = version?.rascunho as unknown as BuffetDraft | undefined;
  const actions = await db.controleBuffetAmostraAcaoCorretiva.findMany({ where: { ativo: true }, select: { nome: true } });
  const issues: BuffetRowIssue[] = [];
  for (const item of draft?.manifest ?? []) {
    const record = unit.amostras.find(row => row.itemId === item.id);
    const values = record && record.status !== "PENDENTE" ? buffetRecordValues(record) : { ...(record ? buffetRecordValues(record) : {}), ...draft?.rows[`item-${item.id}`] };
    const missingFields = validateBuffetRow(item, values, { date: formatAppDateInput(unit.dataReferencia), actions, historicalAction: record?.acaoCorretiva });
    if (missingFields.length) issues.push({ rowKey: `item-${item.id}`, nome: item.nome, missingFields });
  }
  for (const row of unit.amostras.filter(row => row.itemExtra)) {
    const missingFields = validateBuffetRow({ ...row, nome: row.itemNome }, (row.status === "PENDENTE" ? { ...buffetRecordValues(row), ...draft?.rows[`extra-${row.id}`] } : buffetRecordValues(row)), { date: formatAppDateInput(unit.dataReferencia), actions, historicalAction: row.acaoCorretiva });
    if (missingFields.length) issues.push({ rowKey: `extra-${row.id}`, nome: row.itemNome, missingFields });
  }
  const deny = (reason: string) => ({ allowed: false, reason, issues });
  if (unit.modulo !== "amostras" || unit.excluidoEm) return deny("Serviço indisponível.");
  if (unit.assinaturaVigenteId) return deny("O serviço já possui assinatura vigente.");
  if (unit.dataReferencia > getAppDate()) return deny("Não é possível assinar serviços futuros.");
  if (monthClosed) return deny("Competência fechada. Solicite a reabertura mensal autorizada.");
  if (issues.length) return deny("Confira todas as pendências dos itens antes da assinatura.");
  if (!draft || !Array.isArray(draft.manifest) || !buffetProgress(unit.amostras, draft.manifest).complete) return deny("Há itens sem aferição persistida. Confira as pendências e salve o serviço.");
  if (!unit.preenchimentoCompleto || !version?.completo || !["COMPLETO", "REABERTO"].includes(unit.estado)) return deny("Os itens e o estado do serviço divergem. É necessária conferência autorizada; não altere temperaturas para liberar a assinatura.");
  if (version.versao !== unit.versao || !isDeepStrictEqual(version.dados, buffetSnapshot(unit.amostras, draft.manifest))) return deny("Versão desatualizada ou divergente dos dados persistidos. Recarregue e solicite conferência antes de assinar.");
  const eligibility = await workflowReviewEligibility(db, user, "amostras", unit.id, unit.versao, "modulo.amostras.assinar_servico");
  return { ...eligibility, reason: eligibility.allowed ? "" : eligibility.reason + (eligibility.reason.includes("Quem preencheu") ? ` Participação registrada para ${user.nomeCompleto}.` : "") + " A revisão deve ser realizada por outro profissional formalmente autorizado quando houver participação no preenchimento.", issues };
}
