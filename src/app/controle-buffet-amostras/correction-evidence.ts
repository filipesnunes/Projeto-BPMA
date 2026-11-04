export type BuffetCorrectionAudit = {
  tipo: "CORRECAO_ITENS_BUFFET"; formato: 1; justificativa: string | null;
  itens: Array<{ id: number; nome: string; executorOriginal: { id: number; nome: string };
    campos: Array<{ campo: string; antes: string | number | boolean | null; depois: string | number | boolean | null }> }>;
};
export function readBuffetCorrection(value: string | null): BuffetCorrectionAudit | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed?.tipo !== "CORRECAO_ITENS_BUFFET" || parsed.formato !== 1 || !(parsed.justificativa === null || typeof parsed.justificativa === "string") || !Array.isArray(parsed.itens) ||
      !parsed.itens.every((item: BuffetCorrectionAudit["itens"][number]) => Number.isSafeInteger(item?.id) && typeof item.nome === "string" && typeof item.executorOriginal?.nome === "string" && Array.isArray(item.campos) && item.campos.every(field => typeof field?.campo === "string" && [field.antes, field.depois].every(value => value === null || ["string", "number", "boolean"].includes(typeof value))))) return null;
    return parsed;
  } catch { return null; }
}
