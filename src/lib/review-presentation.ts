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
  return `${signature.usuarioNome}${signature.mecanismo?.includes("retroativa") ? ` — ${signature.mecanismo}${isNonTechnicalRetroactive(signature.mecanismo) ? "; não substitui revisão técnica" : ""}` : ""}`;
}
