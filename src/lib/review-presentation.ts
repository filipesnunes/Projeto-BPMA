import { formatAppDateTime } from "./date-time";

// Read persisted evidence; a profile label alone never proves a retroactive
// review's professional nature. This module is also safe in report renderers.
export function retroactiveNature(observation?: string | null): string | null {
  if (!observation) return null;
  try {
    const value = JSON.parse(observation);
    return value.operacao === "REVISAO_RETROATIVA" && typeof value.natureza === "string" ? value.natureza : null;
  } catch { return null; }
}

export function isNonTechnicalRetroactive(mechanism?: string | null) {
  return Boolean(mechanism && /retroativa/i.test(mechanism) && !/técnica/i.test(mechanism));
}

export function technicalReviewPending(observation?: string | null) {
  try {
    const value = JSON.parse(observation ?? "null");
    return Boolean(value?.operacao === "REVISAO_RETROATIVA" && (value.revisaoTecnicaPendente || isNonTechnicalRetroactive(value.natureza)));
  } catch { return false; }
}

export function reviewSignatureLabel(signature?: { usuarioNome: string; mecanismo?: string; assinadoEm?: Date } | null) {
  if (!signature) return "Pendente de revisão";
  return `${signature.usuarioNome}${isNonTechnicalRetroactive(signature.mecanismo) ? ` — ${signature.mecanismo?.includes("gerencial") ? "Revisão gerencial" : "Revisão operacional"}; não substitui revisão técnica` : ""}`;
}

export function signatureBadgeLabel(observation?: string | null) {
  const nature = retroactiveNature(observation);
  if (!nature || !technicalReviewPending(observation)) return "Assinado pelo Supervisor";
  return nature.includes("gerencial") ? "Revisão gerencial" : "Revisão operacional";
}

export function reportSignatureLabel(signature?: { usuarioNome: string; assinadoEm?: Date | null; mecanismo?: string | null; observacao?: string | null } | null) {
  if (!signature) return "-";
  const nature = retroactiveNature(signature.observacao) ?? signature.mecanismo;
  const label = reviewSignatureLabel({ usuarioNome: signature.usuarioNome, mecanismo: nature ?? undefined });
  return `${label}${signature.assinadoEm ? ` — ${formatAppDateTime(signature.assinadoEm)}` : ""}${nature?.includes("retroativa") && !isNonTechnicalRetroactive(nature) ? " — Assinatura retroativa" : ""}`;
}

// Only the two reports whose supervision cells require a name-only display.
// Nontechnical reviews remain explicitly classified, rather than impersonating
// a technical supervisor. Persisted evidence and other reports are untouched.
export function reportSupervisorName(signature?: { usuarioNome: string; mecanismo?: string | null; observacao?: string | null } | null) {
  if (!signature) return "-";
  const nature = retroactiveNature(signature.observacao) ?? signature.mecanismo;
  if (technicalReviewPending(signature.observacao) || isNonTechnicalRetroactive(nature)) {
    return `${signature.usuarioNome} — ${nature?.includes("gerencial") ? "Revisão gerencial" : "Revisão operacional"}; não substitui revisão técnica`;
  }
  return signature.usuarioNome;
}
