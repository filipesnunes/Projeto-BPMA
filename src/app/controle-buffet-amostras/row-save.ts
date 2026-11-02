import "server-only";
import type { ControleBuffetAmostraRegistro, Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth-session";
import { formatAppDateInput, getAppDate } from "@/lib/date-time";
import { readExecutionTime } from "@/lib/procedure-time";
import { avaliarTemperaturaBuffet, parseTemperatureInput } from "./utils";
import { findAcaoCorretivaByName } from "./catalog";
import { normalizeOption } from "./options";
import { buildRegistroPayload, buildNaoServidoPayload, getRegistroItemIssue, type RegistroItemSource, type RegistroItemPayload } from "./workflow-payload";

export const buffetRowFields = ["tcEquipamento", "primeiraTc", "temperaturaTipo", "acaoCorretiva", "observacao", "naoServido", "horarioExecucao", "horarioNaoInformado", "justificativaHorario"] as const;
export type BuffetRowValues = Record<string, string>;
export class BuffetRowError extends Error { constructor(public rowKey: string, message: string) { super(message); } }
export function buffetRecordValues(record: ControleBuffetAmostraRegistro): BuffetRowValues {
  return { tcEquipamento: String(record.tcEquipamento ?? ""), primeiraTc: String(record.primeiraTc ?? ""), temperaturaTipo: record.temperaturaAmbiente ? "AMBIENTE" : record.primeiraTc !== null ? "NUMERICA" : "", acaoCorretiva: record.acaoCorretiva ?? "", observacao: record.observacao ?? "", naoServido: String(record.status === "NAO_SERVIDO"), horarioExecucao: record.horarioExecucao ?? "", horarioNaoInformado: String(record.horarioNaoInformado), justificativaHorario: record.justificativaHorario ?? "" };
}

export async function prepareBuffetRow(db: Prisma.TransactionClient, params: { form: FormData; rowKey: string; item: RegistroItemSource; date: Date; actor: AuthenticatedUser; old?: ControleBuffetAmostraRegistro; previous?: BuffetRowValues; complete?: boolean }) {
  const { form, rowKey, item, date, actor, old } = params;
  try {
    const settled = old && old.status !== "PENDENTE";
    const base = settled ? buffetRecordValues(old) : { ...(old ? buffetRecordValues(old) : {}), ...params.previous };
    const changed = new Set(form.getAll("changedField").map(String));
    const patch = form.get("rowIntentVersion") === "1";
    if(old&&!buffetRowFields.some(field=>form.has(rowKey+"-"+field))&&!buffetRowFields.some(field=>changed.has(rowKey+"-"+field)))return {row:base,payload:null,issues:[] as string[],unchanged:true};
    if (patch && old && !buffetRowFields.some(field => changed.has(rowKey + "-" + field))) {
      if(buffetRowFields.some(field=>form.has(rowKey+"-"+field)&&String(form.get(rowKey+"-"+field)??"").trim()!==(base[field]??"")))throw Error("O formulário enviou alterações sem identificar os campos editados. Os dados anteriores foram preservados; recarregue e tente novamente.");
      return { row: base, payload: null, issues: [] as string[], unchanged: true };
    }
    const row: BuffetRowValues = {};
    for (const field of buffetRowFields) {
      const key = rowKey + "-" + field, raw = form.get(key);
      const explicit = changed.has(key);
      // An unchecked checkbox is absent from native FormData.
      const incoming = raw === null && explicit && field === "horarioNaoInformado" ? "false" : typeof raw === "string" ? raw.trim() : undefined;
      if (incoming !== undefined && incoming.length > 4000) throw Error("Texto muito longo.");
      if (settled && incoming === "" && base[field] && !explicit && !["naoServido", "horarioNaoInformado"].includes(field)) {
        throw Error("Um campo salvo foi enviado vazio sem indicação de edição. Os dados anteriores foram preservados; recarregue o formulário.");
      }
      row[field] = incoming ?? base[field] ?? "";
    }
    if (!["", "NUMERICA", "AMBIENTE"].includes(row.temperaturaTipo)) throw Error("Tipo de temperatura inválido.");
    if (!["", "true", "false"].includes(row.naoServido) || !["", "true", "false"].includes(row.horarioNaoInformado)) throw Error("Condição do item inválida.");
    const originalActor = old ? { ...actor, id: old.responsavelUsuarioId, nomeCompleto: old.responsavelNome, perfil: old.responsavelPerfil } : actor;
    const preserve = (payload: RegistroItemPayload): RegistroItemPayload => old ? { ...payload, dataHoraRegistro: old.dataHoraRegistro } : payload;
    if (row.naoServido === "true") return { row, payload: preserve(buildNaoServidoPayload({ actor: originalActor, item, observacao: row.observacao })), issues: [], unchanged: false };
    const ambient = row.temperaturaTipo === "AMBIENTE";
    for (const field of ["tcEquipamento", "primeiraTc"] as const) if (!ambient && !(field === "tcEquipamento" && item.usaGarrafaTermica) && row[field] && parseTemperatureInput(row[field]) === null) throw Error(`${field === "primeiraTc" ? "TC do Alimento" : "TC Equipamento"} deve conter uma temperatura válida.`);
    if (row.acaoCorretiva) {
      const historical = Boolean(old?.acaoCorretiva && normalizeOption(old.acaoCorretiva) === normalizeOption(row.acaoCorretiva));
      if (!await findAcaoCorretivaByName(row.acaoCorretiva, !historical, db)) throw Error("Selecione uma ação corretiva válida e ativa. Uma ação histórica inativa só pode ser preservada no próprio registro.");
    }
    const fields = { tcEquipamentoInput: row.tcEquipamento, primeiraTcInput: row.primeiraTc, temperaturaTipo: row.temperaturaTipo, acaoCorretivaInput: row.acaoCorretiva, observacao: row.observacao, naoServido: false };
    const issues = getRegistroItemIssue(item, fields)?.missingFields ?? [];
    const blank = !ambient && ![item.usaGarrafaTermica ? "" : row.tcEquipamento, row.primeiraTc, row.acaoCorretiva, row.observacao].some(Boolean);
    if (blank && !issues.length) issues.push("dados da aferição");
    const food = ambient ? null : parseTemperatureInput(row.primeiraTc);
    const evaluation = food === null ? null : avaliarTemperaturaBuffet(item.classificacao, food);
    if (evaluation?.exigeAcaoCorretiva && normalizeOption(row.acaoCorretiva) === normalizeOption("Não se aplica")) throw Error("A ação corretiva é obrigatória quando a temperatura estiver em Alerta ou Crítico.");
    let execution: ReturnType<typeof readExecutionTime>;
    const timeChanged = ["horarioExecucao", "horarioNaoInformado", "justificativaHorario"].some(field => changed.has(rowKey + "-" + field));
    if (settled && old.status !== "NAO_SERVIDO" && !timeChanged) execution = { horarioExecucao: old.horarioExecucao, horarioNaoInformado: old.horarioNaoInformado, justificativaHorario: old.justificativaHorario };
    else if (formatAppDateInput(date) < formatAppDateInput(getAppDate()) && !row.horarioExecucao && row.horarioNaoInformado !== "true") { issues.push("horário da execução"); execution = { horarioExecucao: null, horarioNaoInformado: false, justificativaHorario: null }; }
    else {
      const times = new FormData(); for (const field of ["horarioExecucao", "horarioNaoInformado", "justificativaHorario"]) times.set(field, row[field]);
      execution = readExecutionTime(times, date);
    }
    if (issues.length) {
      if (params.complete) throw Error(`Preencha ${issues.join(", ")} antes de concluir.`);
      if(settled&&!buffetRowFields.some(field=>changed.has(rowKey+"-"+field)))throw Error(`O item salvo exige conferência de ${issues.join(", ")}. Os dados e o status anteriores foram preservados.`);
      if (!old) return { row, payload: null, issues, unchanged: false };
      const payload: RegistroItemPayload = { ...execution, itemNome: item.nome, classificacao: item.classificacao, usaGarrafaTermica: item.usaGarrafaTermica, temperaturaAmbiente: ambient, tcEquipamento: ambient || item.usaGarrafaTermica ? null : parseTemperatureInput(row.tcEquipamento), primeiraTc: food, segundaTc: null, statusTemperatura: evaluation?.status ?? null, acaoCorretiva: row.acaoCorretiva || null, observacao: row.observacao || null, responsavelUsuarioId: originalActor.id, responsavelNome: originalActor.nomeCompleto, responsavelPerfil: originalActor.perfil, dataHoraRegistro: old.dataHoraRegistro, status: "PENDENTE" };
      return { row, payload, issues, unchanged: false };
    }
    return { row, payload: preserve(await buildRegistroPayload({ actor: originalActor, item, input: { ...fields, execution }, existingCorrectiveAction: old?.acaoCorretiva }, db)), issues, unchanged: false };
  } catch (error) { throw new BuffetRowError(rowKey, error instanceof Error ? error.message : "Não foi possível validar o item."); }
}
