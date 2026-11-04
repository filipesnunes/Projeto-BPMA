import { isValidProcedureTime } from "@/lib/procedure-time";
import { parseTemperatureInput } from "./utils";
import type { BuffetValues } from "./row-validation";

export type CollectiveTimeMode = "empty" | "replace";
export type CollectiveTimeRow = { rowKey: string; nome: string; bloqueado: boolean; status: string };
export type CollectiveTimeTarget = { rowKey: string; previousTime: string; previousUnknown: boolean; previousJustification: string };

export function buffetCollectiveTimeTargets(rows: readonly CollectiveTimeRow[], read: (row: CollectiveTimeRow) => BuffetValues,
  time: string, mode: CollectiveTimeMode): CollectiveTimeTarget[] {
  if (!isValidProcedureTime(time)) throw Error("Informe o horário real de execução válido no formato HH:mm.");
  return rows.flatMap(row => {
    if (row.bloqueado || row.status === "ASSINADO") return [];
    const value = read(row);
    if (value.naoServido === "true") return [];
    // A blank item/extra is not proof of a performed procedure. Other missing
    // fields remain pending even when a measured item's time can be supplied.
    if (value.temperaturaTipo !== "AMBIENTE" && parseTemperatureInput(value.primeiraTc ?? "") === null) return [];
    const previousTime = value.horarioExecucao ?? "", previousUnknown = value.horarioNaoInformado === "true";
    if (mode === "empty" && (previousTime.trim() || previousUnknown)) return [];
    if (previousTime === time && !previousUnknown && !value.justificativaHorario) return [];
    return [{ rowKey: row.rowKey, previousTime, previousUnknown, previousJustification: value.justificativaHorario ?? "" }];
  });
}
