import {findAcaoCorretivaByName} from "./catalog";
import "server-only";
import {Prisma, StatusItemBuffetAmostra, type ClassificacaoItemBuffetAmostra} from "@prisma/client";
import type {getCurrentUserForAction} from "@/lib/auth-session";
import type {readExecutionTime} from "@/lib/procedure-time";
import {prisma} from "@/lib/prisma";
import {normalizeOption} from "./options";
import {avaliarTemperaturaBuffet,parseTemperatureInput,getCurrentSystemDateTime} from "./utils";
const NAO_SE_APLICA_NORMALIZED=normalizeOption("Não se aplica");
export type RegistroTemperaturaInput = {
  execution?: ReturnType<typeof readExecutionTime>;
  tcEquipamentoInput: string;
  primeiraTcInput: string;
  temperaturaTipo: string;
  acaoCorretivaInput: string;
  observacao: string;
  naoServido: boolean;
};

export type RegistroItemSource = {
  nome: string;
  classificacao: ClassificacaoItemBuffetAmostra;
  usaGarrafaTermica: boolean;
};

export type RegistroItemPayload = {
  horarioExecucao?: string | null;
  horarioNaoInformado?: boolean;
  justificativaHorario?: string | null;
  itemNome: string;
  classificacao: ClassificacaoItemBuffetAmostra;
  tcEquipamento: number | null;
  primeiraTc: number | null;
  segundaTc: number | null;
  usaGarrafaTermica: boolean;
  temperaturaAmbiente: boolean;
  statusTemperatura: ReturnType<typeof avaliarTemperaturaBuffet>["status"] | null;
  acaoCorretiva: string | null;
  observacao: string | null;
  responsavelUsuarioId: number;
  responsavelNome: string;
  responsavelPerfil: Awaited<ReturnType<typeof getCurrentUserForAction>>["perfil"];
  dataHoraRegistro: Date;
  status: StatusItemBuffetAmostra;
};

type RegistroItemIssue = {
  kind: "blank" | "incomplete";
  missingFields: string[];
};

export async function buildRegistroPayload(params: {
  actor: Awaited<ReturnType<typeof getCurrentUserForAction>>;
  item: RegistroItemSource;
  input: RegistroTemperaturaInput;
}, db: Prisma.TransactionClient = prisma): Promise<RegistroItemPayload> {
  const findAction = (name: string) => findAcaoCorretivaByName(name,false,db);
  const temperaturaAmbiente = params.input.temperaturaTipo === "AMBIENTE";
  const usaGarrafaTermica = params.item.usaGarrafaTermica;
  const acaoCorretivaOption = params.input.acaoCorretivaInput
    ? await findAction(params.input.acaoCorretivaInput)
    : null;

  if (params.input.acaoCorretivaInput && !acaoCorretivaOption) {
    throw new Error("Selecione uma ação corretiva válida da lista cadastrada.");
  }

  const acaoCorretiva = acaoCorretivaOption
    ? acaoCorretivaOption.nome
    : await (async () => {
        const naoSeAplica = await findAction("Não se aplica");
        return naoSeAplica?.nome ?? null;
      })();

  if (temperaturaAmbiente) {
    return {
      ...params.input.execution,
    itemNome: params.item.nome,
      classificacao: params.item.classificacao,
      tcEquipamento: null,
      primeiraTc: null,
      segundaTc: null,
      usaGarrafaTermica,
      temperaturaAmbiente: true,
      statusTemperatura: null,
      acaoCorretiva,
      observacao: params.input.observacao || null,
      responsavelUsuarioId: params.actor.id,
      responsavelNome: params.actor.nomeCompleto,
      responsavelPerfil: params.actor.perfil,
      dataHoraRegistro: getCurrentSystemDateTime(),
      status: StatusItemBuffetAmostra.PREENCHIDO
    };
  }

  const tcEquipamento = usaGarrafaTermica
    ? null
    : parseTemperatureInput(params.input.tcEquipamentoInput);
  const primeiraTc = parseTemperatureInput(params.input.primeiraTcInput);

  if ((!usaGarrafaTermica && tcEquipamento === null) || primeiraTc === null) {
    if (usaGarrafaTermica) {
      throw new Error("Preencha TC do Alimento com um valor válido.");
    }

    throw new Error("Preencha TC Equipamento e TC do Alimento com valores válidos.");
  }

  const avaliacao = avaliarTemperaturaBuffet(params.item.classificacao, primeiraTc);

  if (
    avaliacao.exigeAcaoCorretiva &&
    (!acaoCorretivaOption ||
      normalizeOption(acaoCorretivaOption.nome) === NAO_SE_APLICA_NORMALIZED)
  ) {
    throw new Error(
      "A ação corretiva é obrigatória quando a temperatura estiver em Alerta ou Crítico."
    );
  }

  return {
    ...params.input.execution,
    itemNome: params.item.nome,
    classificacao: params.item.classificacao,
    tcEquipamento,
    primeiraTc,
    segundaTc: null,
    usaGarrafaTermica,
    temperaturaAmbiente: false,
    statusTemperatura: avaliacao.status,
    acaoCorretiva,
    observacao: params.input.observacao || null,
    responsavelUsuarioId: params.actor.id,
    responsavelNome: params.actor.nomeCompleto,
    responsavelPerfil: params.actor.perfil,
    dataHoraRegistro: getCurrentSystemDateTime(),
    status: StatusItemBuffetAmostra.PREENCHIDO
  };
}

export function getRegistroItemIssue(
  item: RegistroItemSource,
  input: RegistroTemperaturaInput
): RegistroItemIssue | null {
  if (input.naoServido) {
    return null;
  }

  const temperaturaAmbiente = input.temperaturaTipo === "AMBIENTE";
  const usaGarrafaTermica = item.usaGarrafaTermica;
  const values = [
    usaGarrafaTermica ? "" : input.tcEquipamentoInput,
    input.primeiraTcInput,
    input.acaoCorretivaInput,
    input.observacao,
    temperaturaAmbiente ? "Ambiente" : ""
  ];
  const hasAnyValue = values.some((value) => value.trim().length > 0);

  if (!hasAnyValue) {
    return { kind: "blank", missingFields: [] };
  }

  if (temperaturaAmbiente) {
    return null;
  }

  const missingFields: string[] = [];
  const tcEquipamento = parseTemperatureInput(input.tcEquipamentoInput);
  const primeiraTc = parseTemperatureInput(input.primeiraTcInput);

  if (!usaGarrafaTermica && tcEquipamento === null) {
    missingFields.push("TC Equipamento");
  }

  if (primeiraTc === null) {
    missingFields.push("TC do Alimento");
  } else {
    const avaliacao = avaliarTemperaturaBuffet(item.classificacao, primeiraTc);
    if (avaliacao.exigeAcaoCorretiva && !input.acaoCorretivaInput) {
      missingFields.push("ação corretiva");
    }
  }

  return missingFields.length > 0 ? { kind: "incomplete", missingFields } : null;
}

export function buildNaoServidoPayload(params: {
  actor: Awaited<ReturnType<typeof getCurrentUserForAction>>;
  item: RegistroItemSource;
  observacao?: string;
}): RegistroItemPayload {
  return {
    horarioExecucao: null, horarioNaoInformado: false, justificativaHorario: null,
    itemNome: params.item.nome,
    classificacao: params.item.classificacao,
    tcEquipamento: null,
    primeiraTc: null,
    segundaTc: null,
    usaGarrafaTermica: params.item.usaGarrafaTermica,
    temperaturaAmbiente: false,
    statusTemperatura: null,
    acaoCorretiva: null,
    observacao:
      params.observacao?.trim() || "Item previsto no serviço, mas não servido neste dia.",
    responsavelUsuarioId: params.actor.id,
    responsavelNome: params.actor.nomeCompleto,
    responsavelPerfil: params.actor.perfil,
    dataHoraRegistro: getCurrentSystemDateTime(),
    status: StatusItemBuffetAmostra.NAO_SERVIDO
  };
}

