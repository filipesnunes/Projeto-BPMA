import { findMatchingTemperatureRule, type CategoriaTemperatura, type RegraTemperaturaCategoria, type TurnoTemperatura } from "./utils";

export const PERSISTENT_TEMPERATURE_ACTION = "Transferir insumos para outro equipamento e acionar manutenção.";

export type PreviousTemperatureRecord = {
  equipamento: string;
  categoriaEquipamento: CategoriaTemperatura;
  data: string;
  turno: TurnoTemperatura;
  statusOperacionalEquipamento: string;
  temperaturaAferida: number | null;
  status: string;
};

export function previousScheduledShift(data: string, turno: TurnoTemperatura, shifts: TurnoTemperatura[]) {
  if (turno === "TARDE" && shifts.includes("MANHA")) return { data, turno: "MANHA" as const };
  const previousDay = new Date(`${data}T00:00:00Z`);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);
  return { data: previousDay.toISOString().slice(0, 10), turno: shifts.includes("TARDE") ? "TARDE" as const : "MANHA" as const };
}

// Only the rule that explicitly asks for a follow-up next shift is escalated.
// Use the same configured ranges on the client and server; no new temperature limits.
export function correctiveActionWithPersistence(params: {
  equipamento: string; categoria: CategoriaTemperatura; data: string; turno: TurnoTemperatura;
  shifts: TurnoTemperatura[]; rule: RegraTemperaturaCategoria; rules: RegraTemperaturaCategoria[];
  previous: PreviousTemperatureRecord | null;
}): string {
  const { rule, previous } = params;
  const action = rule.acaoCorretiva;
  if (rule.status !== "ALERTA" || !/persistir\s+no\s+turno\s+seguinte/i.test(action)) return action;
  const expected = previousScheduledShift(params.data, params.turno, params.shifts);
  if (!previous || previous.equipamento !== params.equipamento || previous.categoriaEquipamento !== params.categoria ||
    previous.data !== expected.data || previous.turno !== expected.turno ||
    previous.statusOperacionalEquipamento !== "EM_OPERACAO" || previous.status !== "ALERTA" || previous.temperaturaAferida === null) return action;
  const previousRule = findMatchingTemperatureRule(previous.temperaturaAferida, params.rules);
  if (!previousRule || previousRule.ordem !== rule.ordem) return action;
  return params.rules.find((candidate) => candidate.isActive !== false && candidate.status === "CRITICO" &&
    /transferir insumos/i.test(candidate.acaoCorretiva) && /manuten/i.test(candidate.acaoCorretiva))?.acaoCorretiva || PERSISTENT_TEMPERATURE_ACTION;
}
