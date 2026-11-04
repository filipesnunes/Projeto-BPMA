import "server-only";
import Link from "next/link";
import type { AuthenticatedUser } from "@/lib/auth-session";
import { formatAppDateInput, getAppDate } from "@/lib/date-time";
import { prisma } from "@/lib/prisma";
import { isNonTechnicalRetroactive } from "@/lib/review-presentation";
import { retroactiveReviewScope } from "@/lib/retroactive-review";
import { legacyOilSignature } from "./legacy-workflow";

export async function oilRetroactiveAccess(user: AuthenticatedUser, recordId: number) {
  const record = await prisma.controleQualidadeOleoRegistro.findUniqueOrThrow({ where: { id: recordId } });
  if (record.excluidoEm || record.data >= getAppDate()) return null;
  if (record.fluxoId) {
    const unit = await prisma.fluxoOperacional.findUnique({ where: { id: record.fluxoId, modulo: "oleo", excluidoEm: null }, include: { assinaturaVigente: true } });
    if (!unit) return { reason: "Vínculo operacional indisponível. Solicite conferência antes de assinar." };
    if (unit.estado === "FECHADO" && unit.assinaturaVigente && !isNonTechnicalRetroactive(unit.assinaturaVigente.mecanismo)) return null;
  } else if ((await legacyOilSignature(prisma, record)).signed) return null;
  const scope = { module: "oleo" as const, date: record.data, flowId: record.fluxoId ?? undefined, legacyRecordId: record.fluxoId ? undefined : record.id };
  const review = await retroactiveReviewScope(prisma, user, scope);
  return review.allowed
    ? { href: `/historico-operacional/revisao-retroativa?modulo=oleo&data=${formatAppDateInput(record.data)}&${record.fluxoId ? `fluxo=${record.fluxoId}` : `legado=${record.id}`}` }
    : { reason: review.reason };
}

export async function OilRetroactiveReviewAccess({ user, recordId }: { user: AuthenticatedUser; recordId: number }) {
  const access = await oilRetroactiveAccess(user, recordId);
  if (!access) return null;
  return <div className="my-3 space-y-2 text-sm">
    {access.href ? <><Link className="btn-primary" href={access.href}>Assinar retroativamente</Link><p>Revisão autorizada com justificativa, senha e preservação da autoria histórica.</p></> : <p role="status">Revisão retroativa: {access.reason}</p>}
  </div>;
}
