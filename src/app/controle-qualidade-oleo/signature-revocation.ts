import "server-only";
import type { Prisma } from "@prisma/client";

// Revocation is signature maintenance, never permission to edit the procedure.
export async function pendingOilSignatureRevocation(tx: Prisma.TransactionClient, flowId: string) {
  const revocation=await tx.fluxoEvento.findFirst({where:{fluxoId:flowId,operacao:"REVOGACAO_ASSINATURA"},orderBy:{criadoEm:"desc"}});
  if(!revocation)return null;
  const subsequent=await tx.fluxoEvento.findFirst({where:{fluxoId:flowId,operacao:{in:["ASSINATURA","NOVA_ASSINATURA"]},criadoEm:{gte:revocation.criadoEm}}});
  return subsequent?null:revocation;
}
