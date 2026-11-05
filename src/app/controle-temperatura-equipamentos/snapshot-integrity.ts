import "server-only";
import { isDeepStrictEqual } from "node:util";
import type { Prisma, ControleTemperaturaEquipamento } from "@prisma/client";
import { formatAppDateInput, parseAppDateInput } from "@/lib/date-time";

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
  if (fields.length) throw new Error(`Aferição #${record.id} — ${record.equipamento}, ${record.turno === "MANHA" ? "manhã" : "tarde"}, ${formatAppDateInput(record.data)}: o registro foi alterado após o salvamento (${fields.slice(0, 8).join(", ")}${fields.length > 8 ? ", outros campos" : ""}). Confira a aferição e atualize a consulta antes de assinar.`);
}

export function parseTemperatureKey(key: string) {
  const match = /^(\d+):(\d{4}-\d{2}-\d{2}):(MANHA|TARDE)(?::[a-f0-9-]{36})?$/.exec(key);
  const date = match && parseAppDateInput(match[2]);
  if (!match || !date || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) < 1) throw new Error("Aferição inválida.");
  return { equipmentId: Number(match[1]), date, shift: match[3] as "MANHA" | "TARDE" };
}

export function temperatureSnapshot(record: ControleTemperaturaEquipamento): Prisma.InputJsonObject {
  // Signature metadata is evidence about this content, never part of the content itself.
  const { assinaturaNutricionistaUsuarioId, assinaturaNutricionistaNome, assinaturaNutricionistaPerfil,
    assinaturaNutricionistaDataHora, updatedAt, ...content } = record;
  void assinaturaNutricionistaUsuarioId; void assinaturaNutricionistaNome; void assinaturaNutricionistaPerfil;
  void assinaturaNutricionistaDataHora; void updatedAt;
  return JSON.parse(JSON.stringify(content));
}
