import "server-only";
import type { Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth-session";
import { canSignTechnicalReview } from "@/lib/signature-authorization";

const object = (value: Prisma.JsonValue): Prisma.JsonObject => value && !Array.isArray(value) && typeof value === "object" ? value : {};

export async function workflowReviewEligibility(
  tx: Prisma.TransactionClient, user: AuthenticatedUser,
  module: "amostras" | "temperatura" | "rastreabilidade", flowId: string | null,
  version: number | undefined, permission: string
) {
  if (!canSignTechnicalReview(user, permission)) return { allowed: false, reason: "A revisão exige nutricionista responsável técnico com a permissão específica." };
  if (!flowId) return { allowed: false, reason: "Registro legado sem comprovação da autoria original. É necessária regularização autorizada antes de uma nova assinatura." };
  const source = await tx.fluxoOperacional.findUniqueOrThrow({ where: { id: flowId }, include: {
    versoes: { where: version ? { versao: { lte: version } } : {}, orderBy: { versao: "asc" } },
    eventos: true, amostras: { where: { excluidoEm: null } }
  } });
  if (source.modulo !== module) return { allowed: false, reason: "Escopo de assinatura inválido." };
  const material = source.versoes.filter(v => module === "amostras"
    ? Array.isArray(object(v.dados).records) && (object(v.dados).records as Prisma.JsonArray).length > 0
    : typeof object(v.dados).id === "number");
  const authors = material.filter(v => source.eventos.some(e => e.versaoNova === v.versao && e.usuarioId === v.usuarioId
    && ["CRIACAO", "SALVAMENTO", "CORRECAO_REGISTRO"].includes(e.operacao)));
  const participants = new Set(authors.map(v => v.usuarioId));
  if (module === "amostras") source.amostras.forEach(row => participants.add(row.responsavelUsuarioId));
  if (participants.has(user.id)) return { allowed: false, reason: "Quem preencheu ou corrigiu qualquer item deste registro não pode assinar sua revisão." };
  const legacy = source.eventos.some(e => e.operacao === "VINCULO_LEGADO") || source.versoes.some(v => Boolean(object(v.rascunho).registroLegadoOriginal));
  if (legacy || !material.length || !authors.some(v => v.versao === material[0].versao))
    return { allowed: false, reason: "Não é possível comprovar a autoria original. A validação exige regularização autorizada." };
  return { allowed: true, reason: "" };
}
