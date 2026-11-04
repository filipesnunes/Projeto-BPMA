import "server-only";
import type { ControleQualidadeOleoRegistro, Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth-session";
import { canSignOilSupervisor, oilSignaturePermissions, type OilSignatureKind } from "@/lib/oil-signature-permissions";

type RecordIdentity = Pick<ControleQualidadeOleoRegistro, "id" | "fluxoId">;
const object = (value: Prisma.JsonValue): Prisma.JsonObject => value && !Array.isArray(value) && typeof value === "object" ? value : {};

export async function oilExecutionEvidence(tx: Prisma.TransactionClient, record: RecordIdentity, throughVersion?: number) {
  if (!record.fluxoId) return { originalId: null, participantIds: [] as number[], proven: false };
  const [versions, events] = await Promise.all([
    tx.fluxoVersao.findMany({ where: { fluxoId: record.fluxoId, ...(throughVersion ? { versao: { lte: throughVersion } } : {}) }, orderBy: { versao: "asc" }, select: { versao: true, dados: true, rascunho: true, usuarioId: true } }),
    tx.fluxoEvento.findMany({ where: { fluxoId: record.fluxoId, ...(throughVersion ? { versaoNova: { lte: throughVersion } } : {}) }, select: { operacao: true, usuarioId: true, versaoNova: true } })
  ]);
  const material = versions.filter(version => object(version.dados).id === record.id);
  const authored = material.filter(version => events.some(event => event.versaoNova === version.versao && event.usuarioId === version.usuarioId && ["CRIACAO", "SALVAMENTO", "CORRECAO_REGISTRO"].includes(event.operacao)));
  const legacy = events.some(event => event.operacao === "VINCULO_LEGADO") || versions.some(version => Boolean(object(version.rascunho).registroLegadoOriginal));
  const original = !legacy && material[0] && authored.some(version => version.versao === material[0].versao) ? material[0].usuarioId : null;
  return { originalId: original, participantIds: [...new Set(authored.map(version => version.usuarioId))], proven: Boolean(original) };
}

export async function oilRecordSignatureEligibility(tx: Prisma.TransactionClient, user: AuthenticatedUser, record: RecordIdentity, kind: OilSignatureKind = "individual", version?: number) {
  if (!canSignOilSupervisor(user, kind)) return { allowed: false, reason: "Somente nutricionista habilitada e autorizada pode assinar a supervisão do óleo." };
  const evidence = await oilExecutionEvidence(tx, record, version);
  if (evidence.participantIds.includes(user.id)) return { allowed: false, reason: "Quem preencheu ou corrigiu esta verificação não pode assiná-la como supervisor." };
  if (!evidence.proven) return { allowed: false, reason: "Não é possível comprovar o responsável original desta verificação. A validação exige análise e regularização autorizada." };
  return { allowed: true, reason: "", evidence };
}

export function oilAuthorizationEvidence(user: AuthenticatedUser, kind: OilSignatureKind) {
  return { politica: "oleo-supervisao-v1", usuarioId: user.id, perfil: user.perfil, perfilAcessoId: user.perfilAcessoId,
    permissoes: ["usuarios.responsavel_tecnico", oilSignaturePermissions[kind]], tipo: kind };
}
