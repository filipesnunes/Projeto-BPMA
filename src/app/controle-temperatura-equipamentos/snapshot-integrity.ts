import "server-only";
import { isDeepStrictEqual } from "node:util";
import { formatAppDateInput } from "@/lib/date-time";

// Return field paths only. In particular, never expose photo bytes or personal
// values when explaining why a collective signature cannot proceed.
export function temperatureSnapshotDifferences(saved: unknown, current: unknown, prefix = ""): string[] {
  if (isDeepStrictEqual(saved, current)) return [];
  if (saved && current && typeof saved === "object" && typeof current === "object" && !Array.isArray(saved) && !Array.isArray(current)) {
    return [...new Set([...Object.keys(saved), ...Object.keys(current)])].flatMap(key =>
      temperatureSnapshotDifferences((saved as Record<string, unknown>)[key], (current as Record<string, unknown>)[key], prefix ? `${prefix}.${key}` : key));
  }
  return [prefix || "conteúdo"];
}

export function assertTemperatureSnapshotIntegrity(record: { id: number; equipamento: string; turno: string; data: Date }, saved: unknown, current: unknown) {
  const fields = temperatureSnapshotDifferences(saved, current);
  if (fields.length) throw new Error(`Aferição #${record.id} — ${record.equipamento}, ${record.turno === "MANHA" ? "manhã" : "tarde"}, ${formatAppDateInput(record.data)}: conteúdo divergente da versão salva (${fields.slice(0, 8).join(", ")}${fields.length > 8 ? ", outros campos" : ""}). A assinatura não foi gravada. Solicite conferência e reconciliação auditável; não salve novamente sem analisar a divergência.`);
}
