import "server-only";
import { Prisma, StatusQualidadeOleo } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NO_OIL_STRIP } from "./strip-choice";
import { findCanonicalOilStripRuleByLabel, normalizeOption } from "./options";
import { parseTemperatureInput, isTemperatureBelowOilStripMinimum, isTemperatureCritical, OIL_STRIP_TEMPERATURE_SAVE_MESSAGE } from "./utils";
const getInputValue = (form: FormData, key: string) => typeof form.get(key) === "string" ? String(form.get(key)).trim() : "";
type PreviousStrip = { fitaOleo: string | null; status: StatusQualidadeOleo | null; orientacao: string };
export function preserveOilStrip(formData: FormData, previous?: PreviousStrip | null) {
  const form = new FormData();
  formData.forEach((value, key) => form.append(key, value));
  if (!form.has("fitaOleo") && previous) form.set("fitaOleo", previous.fitaOleo || NO_OIL_STRIP);
  return form;
}
export async function getRegistroPayload(formData: FormData, responsavelLogado: string, db: Prisma.TransactionClient = prisma, previous?: PreviousStrip | null) {
  const input = preserveOilStrip(formData, previous);
  const fitaChoice = getInputValue(input, "fitaOleo");
  const fitaInput = fitaChoice === NO_OIL_STRIP ? "" : fitaChoice;
  const temperaturaInput = getInputValue(formData, "temperatura");
  const semUtilizacao = getInputValue(formData, "semUtilizacao") === "true";
  const observacao = getInputValue(formData, "observacao");

  if (!responsavelLogado.trim()) {
    throw new Error("Não foi possível identificar o usuário logado para o campo Responsável.");
  }

  if (semUtilizacao) {
    return {
      fitaOleo: null,
      temperatura: null,
      status: StatusQualidadeOleo.SEM_UTILIZACAO,
      orientacao: "Sem utilização no período.",
      temperaturaCritica: false,
      semUtilizacao: true,
      responsavel: responsavelLogado.trim(),
      observacao: observacao || null
    };
  }

  if (!temperaturaInput) {
    throw new Error("Preencha todos os campos obrigatórios do registro.");
  }

  if (input.getAll("fitaOleo").length !== 1 || !fitaChoice) {
    throw new Error("Selecione a fita ou confirme Sem aferição da fita.");
  }

  const preserving = Boolean(fitaInput && fitaInput === previous?.fitaOleo);
  const fitaOption = fitaInput ? (await db.controleQualidadeOleoOpcaoFita.findMany({ where: { ativo: true } })).find(option => normalizeOption(option.rotulo) === normalizeOption(fitaInput)) : null;
  if (fitaInput && !fitaOption && !preserving) {
    throw new Error("Selecione uma opção válida no campo % da Fita do Óleo.");
  }

  const canonicalRule = fitaOption ? findCanonicalOilStripRuleByLabel(fitaOption.rotulo) : null;

  const temperatura = parseTemperatureInput(temperaturaInput);
  if (temperatura === null) {
    throw new Error("Informe uma temperatura válida.");
  }
  if (fitaInput && isTemperatureBelowOilStripMinimum(temperatura)) {
    throw new Error(OIL_STRIP_TEMPERATURE_SAVE_MESSAGE);
  }

  return {
    fitaOleo: preserving ? previous!.fitaOleo : fitaOption?.rotulo ?? null,
    temperatura,
    status: preserving ? previous!.status : canonicalRule?.statusAssociado ?? fitaOption?.statusAssociado ?? null,
    orientacao: preserving ? previous!.orientacao : canonicalRule?.descricao ?? fitaOption?.descricao ?? "",
    temperaturaCritica: isTemperatureCritical(temperatura),
    semUtilizacao: false,
    responsavel: responsavelLogado.trim(),
    observacao: observacao || null
  };
}

