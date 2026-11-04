import type { ClassificacaoItemBuffetAmostra } from "@prisma/client";
import { formatAppDateInput, getAppDate } from "@/lib/date-time";
import { isValidProcedureTime } from "@/lib/procedure-time";
import { avaliarTemperaturaBuffet, parseTemperatureInput } from "./utils";
import { normalizeOption } from "./options";

export type BuffetItemSource = { nome: string; classificacao: ClassificacaoItemBuffetAmostra; usaGarrafaTermica: boolean };
export type BuffetRowIssue = { rowKey: string; nome: string; missingFields: string[] };
export type BuffetValues = Record<string, string>;
export const isNotApplicable = (value: string) => normalizeOption(value) === normalizeOption("Não se aplica");

// Pure rules shared by the form, persistence and signature validation. No writes.
export function validateBuffetRow(item: BuffetItemSource, row: BuffetValues, options: {
  date?: string; today?: string; actions?: readonly { nome: string }[]; historicalAction?: string | null;
} = {}): string[] {
  if (row.naoServido === "true") return [];
  const issues: string[] = [];
  const ambient = row.temperaturaTipo === "AMBIENTE";
  if (!["", "NUMERICA", "AMBIENTE"].includes(row.temperaturaTipo ?? "")) issues.push("tipo de temperatura válido");
  if (!ambient) {
    if (!item.usaGarrafaTermica && parseTemperatureInput(row.tcEquipamento ?? "") === null) issues.push("TC Equipamento válida");
    const food = parseTemperatureInput(row.primeiraTc ?? "");
    if (food === null) issues.push("TC do Alimento válida");
    else if (avaliarTemperaturaBuffet(item.classificacao, food).exigeAcaoCorretiva && (!row.acaoCorretiva || isNotApplicable(row.acaoCorretiva))) issues.push("ação corretiva válida para temperatura em Alerta ou Crítico");
  }
  if (row.acaoCorretiva && options.actions && !options.actions.some(a => normalizeOption(a.nome) === normalizeOption(row.acaoCorretiva)) && normalizeOption(row.acaoCorretiva) !== normalizeOption(options.historicalAction ?? "")) issues.push("ação corretiva válida e ativa");
  const today = options.today ?? formatAppDateInput(getAppDate());
  if (options.date && options.date > today) issues.push("data de execução não futura");
  if (row.horarioNaoInformado === "true") {
    if (options.date && options.date >= today) issues.push("horário não informado permitido somente em registros retroativos");
    if (!row.justificativaHorario?.trim() || row.justificativaHorario.trim().length > 1000) issues.push("justificativa do horário não informado (até 1000 caracteres)");
  } else if (options.date && options.date < today && !isValidProcedureTime(row.horarioExecucao ?? "")) issues.push("horário real da execução (HH:mm)");
  return [...new Set(issues)];
}

export function suggestedBuffetAction(item: BuffetItemSource, row: BuffetValues, actions: readonly { nome: string }[]) {
  if (row.naoServido === "true") return row.acaoCorretiva ?? "";
  const temperature = parseTemperatureInput(row.primeiraTc ?? "");
  const conforming = row.temperaturaTipo === "AMBIENTE" || temperature !== null && !avaliarTemperaturaBuffet(item.classificacao, temperature).exigeAcaoCorretiva;
  if (conforming && !row.acaoCorretiva) return actions.find(a => isNotApplicable(a.nome))?.nome ?? "";
  if (!conforming && temperature !== null && isNotApplicable(row.acaoCorretiva ?? "")) return "";
  return row.acaoCorretiva ?? "";
}
