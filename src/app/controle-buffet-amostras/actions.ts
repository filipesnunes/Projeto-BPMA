"use server";

import {
  ClassificacaoItemBuffetAmostra,
  StatusFechamentoBuffetAmostra,
  StatusItemBuffetAmostra,
  TipoServicoBuffetAmostra
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rethrowIfRedirectError } from "@/lib/redirect-error";

import { getCurrentUserForAction } from "@/lib/auth-session";
import {
  createSignatureLog,
  ensurePermission,
  validateSignaturePassword
} from "@/lib/authz";
import { canEditRecordDate } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { reopenOperationalMonth } from "@/lib/monthly-reopening";

import {
  findAcaoCorretivaByName,
  hasAcaoCorretivaWithSameName,
  hasItemWithSameName,
  hasServicoWithSameName,
  INVALID_ITEM_CLASSIFICATION_MESSAGE,
  parseItemClassification,
  sanitizeCatalogValue
} from "./catalog";
import { normalizeOption } from "./options";
import {
  avaliarTemperaturaBuffet,
  formatDateInput,
  getCurrentSystemDateTime,
  getMonthDateRange,
  getMonthYear,
  getTodaySystemDate,
  isServicoDisponivelNaData,
  parseDateInput,
  parsePositiveInt,
  parseTipoServico,
  parseTemperatureInput
} from "./utils";

const MODULE_PATH = "/controle-buffet-amostras";
const SERVICE_PATH = "/controle-buffet-amostras/servico";
const HISTORY_PATH = "/controle-buffet-amostras/historico";
const OPTIONS_PATH = "/controle-buffet-amostras/opcoes";
const NAO_SE_APLICA_NORMALIZED = normalizeOption("Não se aplica");
const SELF_SUPERVISION_MESSAGE =
  "Este registro foi executado por você. A assinatura de supervisor deve ser feita por outro usuário autorizado.";

type FeedbackType = "success" | "error";
type FormActionState = {
  status: "idle" | "success" | "error";
  message: string;
  invalidRowKey?: string;
  servicoId?: number;
  dataInput?: string;
};

const FORM_ACTION_INITIAL_STATE: FormActionState = {
  status: "idle",
  message: ""
};

type RegistroTemperaturaInput = {
  tcEquipamentoInput: string;
  primeiraTcInput: string;
  temperaturaTipo: string;
  acaoCorretivaInput: string;
  observacao: string;
  naoServido: boolean;
};

type RegistroItemSource = {
  nome: string;
  classificacao: ClassificacaoItemBuffetAmostra;
  usaGarrafaTermica: boolean;
};

type RegistroItemPayload = {
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

function getInputValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getRowInputValue(formData: FormData, rowKey: string, key: string): string {
  return getInputValue(formData, `${rowKey}-${key}`);
}

function getInputNumberList(formData: FormData, key: string): number[] {
  return formData
    .getAll(key)
    .map((value) => (typeof value === "string" ? parsePositiveInt(value) : null))
    .filter((value): value is number => value !== null);
}

function getReturnToPath(formData: FormData, fallbackPath: string): string {
  const value = getInputValue(formData, "returnTo");

  if (!value.startsWith(MODULE_PATH)) {
    return fallbackPath;
  }

  return value;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    const technicalPattern =
      /next_redirect|invalid `prisma|prismaclient|typeerror|referenceerror|syntaxerror|p20\d{2}|stack/i;
    if (technicalPattern.test(error.message)) {
      return fallback;
    }
    return error.message;
  }

  return fallback;
}

function redirectWithFeedback(
  returnTo: string,
  feedbackType: FeedbackType,
  feedback: string
): never {
  const url = new URL(returnTo, "http://localhost");
  if (feedbackType === "success") {
    url.searchParams.delete("new");
    url.searchParams.delete("editServicoId");
    url.searchParams.delete("editItemId");
    url.searchParams.delete("editAcaoId");
    url.searchParams.delete("editRegistroId");
    url.searchParams.delete("signItemId");
  }
  url.searchParams.set("feedbackType", feedbackType);
  url.searchParams.set("feedback", feedback);

  redirect(`${url.pathname}?${url.searchParams.toString()}`);
}

function revalidateModulePaths(servicoId?: number) {
  revalidatePath(MODULE_PATH);
  revalidatePath(HISTORY_PATH);
  revalidatePath(OPTIONS_PATH);

  if (servicoId) {
    revalidatePath(`${SERVICE_PATH}/${servicoId}`);
  }
}

async function isMonthSigned(mes: number, ano: number): Promise<boolean> {
  const fechamento = await prisma.controleBuffetAmostraFechamento.findUnique({
    where: { mes_ano: { mes, ano } }
  });

  return fechamento?.status === StatusFechamentoBuffetAmostra.ASSINADO;
}

async function ensurePeriodIsOpen(date: Date) {
  const period = getMonthYear(date);
  if (await isMonthSigned(period.mes, period.ano)) {
    throw new Error(
      `O mês ${String(period.mes).padStart(2, "0")}/${period.ano} está fechado e não permite alterações.`
    );
  }
}

function parseServicoConfig(formData: FormData, fallback?: {
  tipoServico: TipoServicoBuffetAmostra;
  dataInicio: Date | null;
  dataFim: Date | null;
}) {
  const tipoServico = parseTipoServico(getInputValue(formData, "tipoServico")) ??
    fallback?.tipoServico ??
    TipoServicoBuffetAmostra.FIXO;
  const dataInicioInput = getInputValue(formData, "dataInicio");
  const dataFimInput = getInputValue(formData, "dataFim");
  const dataInicio = dataInicioInput ? parseDateInput(dataInicioInput) : null;
  const dataFim = dataFimInput ? parseDateInput(dataFimInput) : null;

  if (dataInicioInput && !dataInicio) {
    throw new Error("Informe uma data inicial válida para o serviço.");
  }

  if (dataFimInput && !dataFim) {
    throw new Error("Informe uma data final válida para o serviço.");
  }

  if (tipoServico === TipoServicoBuffetAmostra.ESPORADICO && !dataInicio) {
    throw new Error("Serviço esporádico precisa ter data inicial.");
  }

  if (dataInicio && dataFim && dataFim.getTime() < dataInicio.getTime()) {
    throw new Error("A data final do serviço não pode ser menor que a data inicial.");
  }

  return {
    tipoServico,
    dataInicio: tipoServico === TipoServicoBuffetAmostra.ESPORADICO ? dataInicio : null,
    dataFim: tipoServico === TipoServicoBuffetAmostra.ESPORADICO ? dataFim : null
  };
}

function ensureServicoPrevistoNaData(
  servico: {
    tipoServico: TipoServicoBuffetAmostra;
    dataInicio: Date | null;
    dataFim: Date | null;
  },
  date: Date
) {
  if (!isServicoDisponivelNaData(servico, date)) {
    throw new Error("Este serviço não está previsto para a data selecionada.");
  }
}

export async function createServicoEsporadicoStateAction(
  _previousState: FormActionState = FORM_ACTION_INITIAL_STATE,
  formData: FormData
): Promise<FormActionState> {
  try {
    await getCurrentUserForAction();

    const nome = sanitizeCatalogValue(getInputValue(formData, "nome"));
    const dataInput = getInputValue(formData, "data");
    const observacao = getInputValue(formData, "observacao");
    const data = dataInput ? parseDateInput(dataInput) : getTodaySystemDate();

    if (!nome) {
      throw new Error("Informe o nome do serviço esporádico.");
    }

    if (!data) {
      throw new Error("Informe uma data válida para o serviço.");
    }

    await ensurePeriodIsOpen(data);

    if (await hasServicoWithSameName(nome)) {
      throw new Error(
        "Já existe um serviço com este nome. Informe um nome específico para este evento."
      );
    }

    const lastServico = await prisma.controleBuffetAmostraServico.findFirst({
      orderBy: { ordem: "desc" },
      select: { ordem: true }
    });
    const ordem = (lastServico?.ordem ?? 0) + 1;

    const servico = await prisma.controleBuffetAmostraServico.create({
      data: {
        nome,
        tipoServico: TipoServicoBuffetAmostra.ESPORADICO,
        dataInicio: data,
        dataFim: data,
        observacao: observacao || null,
        ativo: true,
        ordem
      }
    });

    revalidateModulePaths(servico.id);
    return {
      status: "success",
      message: "Serviço esporádico criado.",
      servicoId: servico.id,
      dataInput: formatDateInput(data)
    };
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error, "Não foi possível criar o serviço esporádico.")
    };
  }
}

async function buildRegistroPayload(params: {
  actor: Awaited<ReturnType<typeof getCurrentUserForAction>>;
  item: RegistroItemSource;
  input: RegistroTemperaturaInput;
}): Promise<RegistroItemPayload> {
  const temperaturaAmbiente = params.input.temperaturaTipo === "AMBIENTE";
  const usaGarrafaTermica = params.item.usaGarrafaTermica;
  const acaoCorretivaOption = params.input.acaoCorretivaInput
    ? await findAcaoCorretivaByName(params.input.acaoCorretivaInput, false)
    : null;

  if (params.input.acaoCorretivaInput && !acaoCorretivaOption) {
    throw new Error("Selecione uma ação corretiva válida da lista cadastrada.");
  }

  const acaoCorretiva = acaoCorretivaOption
    ? acaoCorretivaOption.nome
    : await (async () => {
        const naoSeAplica = await findAcaoCorretivaByName("Não se aplica", false);
        return naoSeAplica?.nome ?? null;
      })();

  if (temperaturaAmbiente) {
    return {
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

function getRegistroItemIssue(
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

function buildNaoServidoPayload(params: {
  actor: Awaited<ReturnType<typeof getCurrentUserForAction>>;
  item: RegistroItemSource;
  observacao?: string;
}): RegistroItemPayload {
  return {
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

function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "boolean") {
    return value ? "sim" : "não";
  }

  if (typeof value === "number") {
    return String(value).replace(".", ",");
  }

  return String(value);
}

function buildHistoricalChangeSummary(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string {
  const fields = [
    ["tcEquipamento", "TC equipamento"],
    ["primeiraTc", "TC alimento"],
    ["segundaTc", "TC final"],
    ["temperaturaAmbiente", "Temperatura ambiente"],
    ["statusTemperatura", "Status temperatura"],
    ["acaoCorretiva", "Ação corretiva"],
    ["observacao", "Observação"],
    ["responsavelNome", "Responsável"],
    ["dataHoraRegistro", "Data/hora do registro"],
    ["status", "Status do item"]
  ] as const;

  const changes = fields
    .filter(([key]) => formatAuditValue(before[key]) !== formatAuditValue(after[key]))
    .map(
      ([key, label]) =>
        `${label}: ${formatAuditValue(before[key])} -> ${formatAuditValue(after[key])}`
    );

  return changes.length > 0 ? changes.join("; ") : "Nenhum campo operacional alterado.";
}

function preserveHistoricalSignatureStatus(params: {
  currentStatus: StatusItemBuffetAmostra;
  nextStatus: StatusItemBuffetAmostra;
  hasItemSignature: boolean;
}): StatusItemBuffetAmostra {
  if (params.nextStatus === StatusItemBuffetAmostra.NAO_SERVIDO) {
    return StatusItemBuffetAmostra.NAO_SERVIDO;
  }

  if (
    params.currentStatus === StatusItemBuffetAmostra.ASSINADO ||
    params.hasItemSignature
  ) {
    return StatusItemBuffetAmostra.ASSINADO;
  }

  return params.nextStatus;
}

async function isHistoricalBuffetMonthClosed(date: Date): Promise<boolean> {
  const period = getMonthYear(date);
  const [legacyClosure, moduleClosure] = await Promise.all([
    prisma.controleBuffetAmostraFechamento.findUnique({
      where: { mes_ano: { mes: period.mes, ano: period.ano } }
    }),
    prisma.fechamentoMensalModulo.findUnique({
      where: {
        moduloCodigo_ano_mes: {
          moduloCodigo: "amostras",
          ano: period.ano,
          mes: period.mes
        }
      }
    })
  ]);

  return (
    legacyClosure?.status === StatusFechamentoBuffetAmostra.ASSINADO ||
    Boolean(moduleClosure)
  );
}

export async function saveRegistroItemAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, MODULE_PATH);

  try {
    const actor = await getCurrentUserForAction();
    const servicoId = parsePositiveInt(getInputValue(formData, "servicoId"));
    const itemId = parsePositiveInt(getInputValue(formData, "itemId"));
    const dataInput = getInputValue(formData, "data");
    const tcEquipamentoInput = getInputValue(formData, "tcEquipamento");
    const primeiraTcInput = getInputValue(formData, "primeiraTc");
    const temperaturaTipo = getInputValue(formData, "temperaturaTipo");
    const acaoCorretivaInput = getInputValue(formData, "acaoCorretiva");
    const observacao = getInputValue(formData, "observacao");
    const naoServido = getInputValue(formData, "naoServido") === "true";

    if (!servicoId || !itemId) {
      throw new Error("Serviço ou item inválido para registro.");
    }

    const data = parseDateInput(dataInput);
    if (!data) {
      throw new Error("Data inválida para registro do item.");
    }

    await ensurePeriodIsOpen(data);
    if (!canEditRecordDate(actor, "modulo.amostras", data, getTodaySystemDate())) {
      throw new Error("Seu perfil não pode editar registros de amostras nesta data.");
    }

    const [servico, item, vinculacao] = await Promise.all([
      prisma.controleBuffetAmostraServico.findUnique({ where: { id: servicoId } }),
      prisma.controleBuffetAmostraItem.findUnique({ where: { id: itemId } }),
      prisma.controleBuffetAmostraItemServico.findUnique({
        where: { servicoId_itemId: { servicoId, itemId } }
      })
    ]);

    if (!servico || !item || !vinculacao) {
      throw new Error("Item não configurado para o serviço selecionado.");
    }
    ensureServicoPrevistoNaData(servico, data);

    const existing = await prisma.controleBuffetAmostraRegistro.findUnique({
      where: {
        data_servicoId_itemId: {
          data,
          servicoId,
          itemId
        }
      }
    });

    if (existing?.status === StatusItemBuffetAmostra.ASSINADO) {
      throw new Error("Este item já está assinado e não pode ser alterado.");
    }

    const payload = naoServido
      ? buildNaoServidoPayload({ actor, item, observacao })
      : await buildRegistroPayload({
          actor,
          item,
          input: {
            tcEquipamentoInput,
            primeiraTcInput,
            temperaturaTipo,
            acaoCorretivaInput,
            observacao,
            naoServido
          }
        });

    await prisma.controleBuffetAmostraRegistro.upsert({
      where: {
        data_servicoId_itemId: {
          data,
          servicoId,
          itemId
        }
      },
      create: {
        data,
        servicoId,
        itemId,
        ...payload
      },
      update: payload
    });

    revalidateModulePaths(servicoId);
    redirectWithFeedback(returnTo, "success", "Registro do Item Salvo com Sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível salvar o registro. Verifique os campos obrigatórios.")
    );
  }
}

export async function saveServicoItemsStateAction(
  _previousState: FormActionState = FORM_ACTION_INITIAL_STATE,
  formData: FormData
): Promise<FormActionState> {
  try {
    const actor = await getCurrentUserForAction();
    const servicoId = parsePositiveInt(getInputValue(formData, "servicoId"));
    const dataInput = getInputValue(formData, "data");
    const rowKeys = formData
      .getAll("rowKey")
      .map((value) => (typeof value === "string" ? value : ""))
      .filter(Boolean);
    const confirmarItensPendentes =
      getInputValue(formData, "confirmarItensPendentes") === "true";

    if (!servicoId) {
      throw new Error("Serviço inválido para salvar os itens.");
    }

    const data = parseDateInput(dataInput);
    if (!data) {
      throw new Error("Data inválida para salvar os itens.");
    }

    if (rowKeys.length === 0) {
      throw new Error("Não há itens disponíveis para salvar.");
    }

    await ensurePeriodIsOpen(data);
    if (!canEditRecordDate(actor, "modulo.amostras", data, getTodaySystemDate())) {
      throw new Error("Seu perfil não pode editar registros de amostras nesta data.");
    }

    const [servico, registros] = await Promise.all([
      prisma.controleBuffetAmostraServico.findUnique({
        where: { id: servicoId },
        include: {
          itens: {
            where: { item: { ativo: true } },
            include: { item: true }
          }
        }
      }),
      prisma.controleBuffetAmostraRegistro.findMany({
        where: { data, servicoId }
      })
    ]);

    if (!servico) {
      throw new Error("Serviço não encontrado.");
    }
    ensureServicoPrevistoNaData(servico, data);

    const fixedItemsById = new Map(servico.itens.map((vinculo) => [vinculo.itemId, vinculo.item]));
    const registrosByItemId = new Map<number, (typeof registros)[number]>();
    const extraRegistrosById = new Map<number, (typeof registros)[number]>();

    for (const registro of registros) {
      if (registro.itemExtra) {
        extraRegistrosById.set(registro.id, registro);
      } else if (registro.itemId !== null) {
        registrosByItemId.set(registro.itemId, registro);
      }
    }

    const updates: Array<
      | {
          type: "fixed";
          itemId: number;
          payload: RegistroItemPayload;
        }
      | {
          type: "extra";
          registroId: number;
          payload: RegistroItemPayload;
        }
    > = [];

    for (const rowKey of rowKeys) {
      try {
        const input = {
          tcEquipamentoInput: getRowInputValue(formData, rowKey, "tcEquipamento"),
          primeiraTcInput: getRowInputValue(formData, rowKey, "primeiraTc"),
          temperaturaTipo: getRowInputValue(formData, rowKey, "temperaturaTipo"),
          acaoCorretivaInput: getRowInputValue(formData, rowKey, "acaoCorretiva"),
          observacao: getRowInputValue(formData, rowKey, "observacao"),
          naoServido: getRowInputValue(formData, rowKey, "naoServido") === "true"
        };

        if (rowKey.startsWith("item-")) {
          const itemId = parsePositiveInt(rowKey.replace("item-", ""));
          const item = itemId ? fixedItemsById.get(itemId) : null;
          const existing = itemId ? registrosByItemId.get(itemId) : null;

          if (!itemId || !item) {
            throw new Error("Item não configurado para este serviço.");
          }

          if (existing?.status === StatusItemBuffetAmostra.ASSINADO) {
            continue;
          }

          if (input.naoServido) {
            updates.push({
              type: "fixed",
              itemId,
              payload: buildNaoServidoPayload({
                actor,
                item,
                observacao: input.observacao
              })
            });
            continue;
          }

          const issue = getRegistroItemIssue(item, input);
          if (issue) {
            if (!confirmarItensPendentes) {
              return {
                status: "error",
                message:
                  issue.kind === "blank"
                    ? `O item "${item.nome}" está sem preenchimento. Confirme para salvar como não servido.`
                    : `O item "${item.nome}" está incompleto (${issue.missingFields.join(", ")}). Corrija ou confirme para salvar como não servido.`,
                invalidRowKey: rowKey
              };
            }

            updates.push({
              type: "fixed",
              itemId,
              payload: buildNaoServidoPayload({
                actor,
                item,
                observacao: input.observacao
              })
            });
            continue;
          }

          updates.push({
            type: "fixed",
            itemId,
            payload: await buildRegistroPayload({ actor, item, input })
          });
          continue;
        }

        if (rowKey.startsWith("extra-")) {
          const registroId = parsePositiveInt(rowKey.replace("extra-", ""));
          const registro = registroId ? extraRegistrosById.get(registroId) : null;

          if (!registroId || !registro) {
            throw new Error("Item extra não encontrado para este serviço.");
          }

          if (registro.status === StatusItemBuffetAmostra.ASSINADO) {
            continue;
          }

          const item = {
            nome: registro.itemNome,
            classificacao: registro.classificacao,
            usaGarrafaTermica: registro.usaGarrafaTermica
          };

          if (input.naoServido) {
            updates.push({
              type: "extra",
              registroId,
              payload: buildNaoServidoPayload({
                actor,
                item,
                observacao: input.observacao
              })
            });
            continue;
          }

          const issue = getRegistroItemIssue(item, input);
          if (issue) {
            if (!confirmarItensPendentes) {
              return {
                status: "error",
                message:
                  issue.kind === "blank"
                    ? `O item "${registro.itemNome}" está sem preenchimento. Confirme para salvar como não servido.`
                    : `O item "${registro.itemNome}" está incompleto (${issue.missingFields.join(", ")}). Corrija ou confirme para salvar como não servido.`,
                invalidRowKey: rowKey
              };
            }

            updates.push({
              type: "extra",
              registroId,
              payload: buildNaoServidoPayload({
                actor,
                item,
                observacao: input.observacao
              })
            });
            continue;
          }

          updates.push({
            type: "extra",
            registroId,
            payload: await buildRegistroPayload({
              actor,
              item,
              input
            })
          });
          continue;
        }

        throw new Error("Linha inválida para salvar.");
      } catch (error) {
        return {
          status: "error",
          message: getErrorMessage(
            error,
            "Não foi possível salvar os itens. Verifique os campos obrigatórios."
          ),
          invalidRowKey: rowKey
        };
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const update of updates) {
        if (update.type === "fixed") {
          await tx.controleBuffetAmostraRegistro.upsert({
            where: {
              data_servicoId_itemId: {
                data,
                servicoId,
                itemId: update.itemId
              }
            },
            create: {
              data,
              servicoId,
              itemId: update.itemId,
              itemExtra: false,
              ...update.payload
            },
            update: update.payload
          });
        } else {
          await tx.controleBuffetAmostraRegistro.update({
            where: { id: update.registroId },
            data: update.payload
          });
        }
      }
    });

    revalidateModulePaths(servicoId);
    return {
      status: "success",
      message: "Itens do Serviço Salvos com Sucesso."
    };
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(
        error,
        "Não foi possível salvar os itens. Verifique os campos obrigatórios."
      )
    };
  }
}

export async function updateHistoricoRegistroAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, HISTORY_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(
      actor,
      "modulo.amostras.editar_historico",
      "Seu perfil não pode editar registros históricos de amostras."
    );

    const registroId = parsePositiveInt(getInputValue(formData, "registroId"));
    const temperaturaTipo = getInputValue(formData, "temperaturaTipo");
    const tcEquipamentoInput = getInputValue(formData, "tcEquipamento");
    const primeiraTcInput = getInputValue(formData, "primeiraTc");
    const acaoCorretivaInput = getInputValue(formData, "acaoCorretiva");
    const observacao = getInputValue(formData, "observacao");
    const naoServido = getInputValue(formData, "naoServido") === "true";

    if (!registroId) {
      throw new Error("Registro inválido para edição histórica.");
    }

    const registro = await prisma.controleBuffetAmostraRegistro.findUnique({
      where: { id: registroId }
    });

    if (!registro) {
      throw new Error("Registro histórico não encontrado.");
    }

    const item = {
      nome: registro.itemNome,
      classificacao: registro.classificacao,
      usaGarrafaTermica: registro.usaGarrafaTermica
    };
    const input = {
      tcEquipamentoInput,
      primeiraTcInput,
      temperaturaTipo,
      acaoCorretivaInput,
      observacao,
      naoServido
    };
    const payload = naoServido
      ? buildNaoServidoPayload({ actor, item, observacao })
      : await buildRegistroPayload({ actor, item, input });
    const nextStatus = preserveHistoricalSignatureStatus({
      currentStatus: registro.status,
      nextStatus: payload.status,
      hasItemSignature: Boolean(registro.assinaturaDataHora)
    });
    const nextSegundaTc =
      payload.status === StatusItemBuffetAmostra.NAO_SERVIDO ||
      payload.temperaturaAmbiente
        ? null
        : registro.segundaTc;
    const updateData = {
      ...payload,
      segundaTc: nextSegundaTc,
      status: nextStatus
    };
    const monthClosed = await isHistoricalBuffetMonthClosed(registro.data);
    const changeSummary = buildHistoricalChangeSummary(
      {
        tcEquipamento: registro.tcEquipamento,
        primeiraTc: registro.primeiraTc,
        segundaTc: registro.segundaTc,
        temperaturaAmbiente: registro.temperaturaAmbiente,
        statusTemperatura: registro.statusTemperatura,
        acaoCorretiva: registro.acaoCorretiva,
        observacao: registro.observacao,
        responsavelNome: registro.responsavelNome,
        dataHoraRegistro: registro.dataHoraRegistro,
        status: registro.status
      },
      {
        tcEquipamento: updateData.tcEquipamento,
        primeiraTc: updateData.primeiraTc,
        segundaTc: updateData.segundaTc,
        temperaturaAmbiente: updateData.temperaturaAmbiente,
        statusTemperatura: updateData.statusTemperatura,
        acaoCorretiva: updateData.acaoCorretiva,
        observacao: updateData.observacao,
        responsavelNome: updateData.responsavelNome,
        dataHoraRegistro: updateData.dataHoraRegistro,
        status: updateData.status
      }
    );

    await prisma.controleBuffetAmostraRegistro.update({
      where: { id: registro.id },
      data: updateData
    });

    await createSignatureLog({
      user: actor,
      tipo: "RESPONSAVEL_TECNICO",
      modulo: "controle-buffet-amostras/edicao-historica",
      referenciaId: String(registro.id),
      observacao: [
        `Edição histórica do registro ${registro.id} em ${formatDateInput(registro.data)}.`,
        `Mês fechado: ${monthClosed ? "sim" : "não"}.`,
        `Assinatura do item preservada: ${registro.assinaturaDataHora ? "sim" : "não"}.`,
        `Assinatura do supervisor preservada: ${
          registro.assinaturaNutricionistaDataHora ? "sim" : "não"
        }.`,
        `Campos alterados: ${changeSummary}`
      ].join(" ")
    });

    revalidateModulePaths(registro.servicoId);
    redirectWithFeedback(returnTo, "success", "Registro histórico atualizado com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível atualizar o registro histórico.")
    );
  }
}

export async function createExtraItemStateAction(
  _previousState: FormActionState = FORM_ACTION_INITIAL_STATE,
  formData: FormData
): Promise<FormActionState> {
  try {
    const actor = await getCurrentUserForAction();
    const servicoId = parsePositiveInt(getInputValue(formData, "servicoId"));
    const dataInput = getInputValue(formData, "data");
    const nome = sanitizeCatalogValue(getInputValue(formData, "nome"));
    const classificacao = parseItemClassification(getInputValue(formData, "classificacao"));

    if (!servicoId) {
      throw new Error("Serviço inválido para adicionar item extra.");
    }

    const data = parseDateInput(dataInput);
    if (!data) {
      throw new Error("Data inválida para adicionar item extra.");
    }

    if (!nome || !classificacao) {
      throw new Error(!nome ? "Informe o nome do item extra." : INVALID_ITEM_CLASSIFICATION_MESSAGE);
    }

    await ensurePeriodIsOpen(data);
    if (!canEditRecordDate(actor, "modulo.amostras", data, getTodaySystemDate())) {
      throw new Error("Seu perfil não pode editar registros de amostras nesta data.");
    }

    const servico = await prisma.controleBuffetAmostraServico.findUnique({
      where: { id: servicoId }
    });

    if (!servico) {
      throw new Error("Serviço não encontrado.");
    }
    ensureServicoPrevistoNaData(servico, data);

    const existingExtra = await prisma.controleBuffetAmostraRegistro.findFirst({
      where: {
        data,
        servicoId,
        itemExtra: true,
        itemNome: { equals: nome, mode: "insensitive" }
      },
      select: { id: true }
    });

    if (existingExtra) {
      throw new Error("Este item extra já foi adicionado para o serviço nesta data.");
    }

    await prisma.controleBuffetAmostraRegistro.create({
      data: {
        data,
        servicoId,
        itemId: null,
        itemExtra: true,
        itemNome: nome,
        classificacao,
        usaGarrafaTermica: false,
        responsavelUsuarioId: actor.id,
        responsavelNome: actor.nomeCompleto,
        responsavelPerfil: actor.perfil,
        dataHoraRegistro: getCurrentSystemDateTime(),
        status: StatusItemBuffetAmostra.PENDENTE
      }
    });

    revalidateModulePaths(servicoId);
    return {
      status: "success",
      message: "Item extra adicionado ao serviço."
    };
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error, "Não foi possível adicionar o item extra.")
    };
  }
}

export async function signRegistroItemAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, MODULE_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.amostras.assinar_servico", "Você não tem permissão para assinar este serviço.");

    const registroId = parsePositiveInt(getInputValue(formData, "registroId"));
    const senhaConfirmacao = getInputValue(formData, "senhaConfirmacao");

    if (!registroId) {
      throw new Error("Registro inválido para assinatura.");
    }

    const registro = await prisma.controleBuffetAmostraRegistro.findUnique({
      where: { id: registroId }
    });

    if (!registro) {
      throw new Error("Registro não encontrado.");
    }

    await ensurePeriodIsOpen(registro.data);

    if (registro.status !== StatusItemBuffetAmostra.PREENCHIDO) {
      throw new Error("Somente itens preenchidos podem ser assinados.");
    }

    if (registro.responsavelUsuarioId === actor.id) {
      throw new Error(SELF_SUPERVISION_MESSAGE);
    }

    await validateSignaturePassword({ user: actor, password: senhaConfirmacao });

    const now = getCurrentSystemDateTime();

    await prisma.controleBuffetAmostraRegistro.update({
      where: { id: registro.id },
      data: {
        assinaturaUsuarioId: actor.id,
        assinaturaNome: actor.nomeCompleto,
        assinaturaPerfil: actor.perfil,
        assinaturaDataHora: now,
        status: StatusItemBuffetAmostra.ASSINADO
      }
    });

    await createSignatureLog({
      user: actor,
      tipo: "SUPERVISOR",
      modulo: "controle-buffet-amostras/item",
      referenciaId: String(registro.id)
    });

    revalidateModulePaths(registro.servicoId);
    redirectWithFeedback(returnTo, "success", "Item Assinado com Sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(
        error,
        "Não foi possível concluir a assinatura. Verifique sua senha e tente novamente."
      )
    );
  }
}

export async function signServicoItensAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, MODULE_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.amostras.assinar_servico", "Você não tem permissão para assinar este serviço.");

    const servicoId = parsePositiveInt(getInputValue(formData, "servicoId"));
    const dataInput = getInputValue(formData, "data");
    const senhaConfirmacao = getInputValue(formData, "senhaConfirmacao");

    if (!servicoId) {
      throw new Error("Serviço inválido para assinatura.");
    }

    const data = parseDateInput(dataInput);
    if (!data) {
      throw new Error("Data inválida para assinatura do serviço.");
    }

    await ensurePeriodIsOpen(data);

    const servico = await prisma.controleBuffetAmostraServico.findUnique({
      where: { id: servicoId },
      include: {
        itens: {
          where: {
            item: { ativo: true }
          },
          include: { item: true },
          orderBy: [{ item: { ordem: "asc" } }, { item: { nome: "asc" } }]
        }
      }
    });

    if (!servico) {
      throw new Error("Serviço não encontrado.");
    }
    ensureServicoPrevistoNaData(servico, data);

    const registros = await prisma.controleBuffetAmostraRegistro.findMany({
      where: {
        data,
        servicoId
      }
    });

    if (servico.itens.length === 0 && registros.length === 0) {
      throw new Error("Não há itens ativos configurados neste serviço para assinatura.");
    }

    const registroPorItem = new Map<number, (typeof registros)[number]>();
    for (const registro of registros) {
      if (registro.itemId !== null) {
        registroPorItem.set(registro.itemId, registro);
      }
    }

    const itensPendentes = servico.itens.filter((vinculo) => {
      const registro = registroPorItem.get(vinculo.itemId);
      return !registro || registro.status === StatusItemBuffetAmostra.PENDENTE;
    });
    const itensExtrasPendentes = registros.filter(
      (registro) =>
        registro.itemExtra && registro.status === StatusItemBuffetAmostra.PENDENTE
    );

    if (itensPendentes.length > 0 || itensExtrasPendentes.length > 0) {
      throw new Error(
        "Ainda existem itens não preenchidos neste serviço. Preencha todos os itens antes de assinar."
      );
    }

    const registrosParaAssinar = registros.filter(
      (registro) => registro.status === StatusItemBuffetAmostra.PREENCHIDO
    );

    if (registrosParaAssinar.length === 0) {
      throw new Error("Não há itens preenchidos aguardando assinatura neste serviço.");
    }

    if (registrosParaAssinar.some((registro) => registro.responsavelUsuarioId === actor.id)) {
      throw new Error(SELF_SUPERVISION_MESSAGE);
    }

    await validateSignaturePassword({ user: actor, password: senhaConfirmacao });

    const now = getCurrentSystemDateTime();

    await prisma.$transaction(async (tx) => {
      await tx.controleBuffetAmostraRegistro.updateMany({
        where: {
          id: { in: registrosParaAssinar.map((registro) => registro.id) }
        },
        data: {
          assinaturaUsuarioId: actor.id,
          assinaturaNome: actor.nomeCompleto,
          assinaturaPerfil: actor.perfil,
          assinaturaDataHora: now,
          status: StatusItemBuffetAmostra.ASSINADO
        }
      });
    });

    await createSignatureLog({
      user: actor,
      tipo: "SUPERVISOR",
      modulo: "controle-buffet-amostras/servico",
      referenciaId: `${servicoId}:${dataInput || formatDateInput(now)}`
    });

    revalidateModulePaths(servicoId);
    redirectWithFeedback(returnTo, "success", "Todos os Itens do Serviço Foram Assinados com Sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(
        error,
        "Não foi possível concluir a assinatura. Verifique sua senha e tente novamente."
      )
    );
  }
}

export async function signServicoNutricionistaAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, HISTORY_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.amostras.assinar_historico", "Você não tem permissão para assinar o histórico de amostras.");

    const servicoId = parsePositiveInt(getInputValue(formData, "servicoId"));
    const dataInput = getInputValue(formData, "data");
    const senhaConfirmacao = getInputValue(formData, "senhaConfirmacao");

    if (!servicoId) {
      throw new Error("Serviço inválido para assinatura do supervisor.");
    }

    const data = parseDateInput(dataInput);
    if (!data) {
      throw new Error("Data inválida para assinatura do supervisor.");
    }

    const registros = await prisma.controleBuffetAmostraRegistro.findMany({
      where: { data, servicoId },
      select: {
        id: true,
        status: true,
        assinaturaNutricionistaDataHora: true
      }
    });

    if (registros.length === 0) {
      throw new Error("Não há registros para assinar neste serviço.");
    }

    const registrosPendentes = registros.filter(
      (registro) => registro.status === StatusItemBuffetAmostra.PENDENTE
    );
    if (registrosPendentes.length > 0) {
      throw new Error("Finalize os itens pendentes antes da assinatura do supervisor.");
    }

    const registrosParaAssinar = registros.filter(
      (registro) => !registro.assinaturaNutricionistaDataHora
    );
    if (registrosParaAssinar.length === 0) {
      throw new Error("Este serviço já foi assinado pelo supervisor.");
    }

    await validateSignaturePassword({ user: actor, password: senhaConfirmacao });

    const now = getCurrentSystemDateTime();
    await prisma.controleBuffetAmostraRegistro.updateMany({
      where: {
        id: { in: registrosParaAssinar.map((registro) => registro.id) }
      },
      data: {
        assinaturaNutricionistaUsuarioId: actor.id,
        assinaturaNutricionistaNome: actor.nomeCompleto,
        assinaturaNutricionistaPerfil: actor.perfil,
        assinaturaNutricionistaDataHora: now
      }
    });

    await createSignatureLog({
      user: actor,
      tipo: "REVISAO_NUTRICIONISTA",
      modulo: "controle-buffet-amostras/servico",
      referenciaId: `${servicoId}:${dataInput}`
    });

    revalidateModulePaths(servicoId);
    redirectWithFeedback(returnTo, "success", "Serviço assinado com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(
        error,
        "Não foi possível assinar o serviço como revisado pelo supervisor."
      )
    );
  }
}

export async function closeMonthAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, MODULE_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.amostras.fechar_mes", "Seu perfil não pode assinar fechamento mensal de amostras.");

    const mes = parsePositiveInt(getInputValue(formData, "mes"));
    const ano = parsePositiveInt(getInputValue(formData, "ano"));
    const senhaConfirmacao = getInputValue(formData, "senhaConfirmacao");

    if (!mes || mes < 1 || mes > 12 || !ano) {
      throw new Error("Informe um mês e ano válidos para fechamento.");
    }

    await validateSignaturePassword({ user: actor, password: senhaConfirmacao });

    if (await isMonthSigned(mes, ano)) {
      throw new Error(`O mês ${String(mes).padStart(2, "0")}/${ano} já está assinado.`);
    }

    const range = getMonthDateRange(mes, ano);
    const totalRegistros = await prisma.controleBuffetAmostraRegistro.count({
      where: { data: { gte: range.start, lte: range.end } }
    });

    if (totalRegistros === 0) {
      throw new Error("Não há registros no período selecionado para fechamento.");
    }

    const registrosNaoAssinados = await prisma.controleBuffetAmostraRegistro.count({
      where: {
        data: { gte: range.start, lte: range.end },
        status: {
          notIn: [
            StatusItemBuffetAmostra.ASSINADO,
            StatusItemBuffetAmostra.NAO_SERVIDO
          ]
        }
      }
    });

    if (registrosNaoAssinados > 0) {
      throw new Error(
        "Existem itens ainda não assinados no período. Conclua as assinaturas antes de fechar o mês."
      );
    }

    const dataAssinatura = getCurrentSystemDateTime();

    await prisma.controleBuffetAmostraFechamento.upsert({
      where: { mes_ano: { mes, ano } },
      create: {
        mes,
        ano,
        responsavelTecnico: actor.nomeCompleto,
        dataAssinatura,
        status: StatusFechamentoBuffetAmostra.ASSINADO
      },
      update: {
        responsavelTecnico: actor.nomeCompleto,
        dataAssinatura,
        status: StatusFechamentoBuffetAmostra.ASSINADO
      }
    });

    await createSignatureLog({
      user: actor,
      tipo: "FECHAMENTO_MENSAL",
      modulo: "controle-buffet-amostras",
      referenciaId: `${mes}-${ano}`
    });

    revalidateModulePaths();
    redirectWithFeedback(
      returnTo,
      "success",
      `Mês ${String(mes).padStart(2, "0")}/${ano} Fechado com Sucesso.`
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível fechar o mês. Verifique se ainda existem pendências.")
    );
  }
}

export async function reopenMonthAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, MODULE_PATH);

  try {
    const actor = await getCurrentUserForAction();

    const mes = parsePositiveInt(getInputValue(formData, "mes"));
    const ano = parsePositiveInt(getInputValue(formData, "ano"));

    if (!mes || mes < 1 || mes > 12 || !ano) {
      throw new Error("Informe um mês e ano válidos para reabertura.");
    }

    await reopenOperationalMonth({ user: actor, moduleCode: "amostras", mes, ano });

    revalidateModulePaths();
    redirectWithFeedback(
      returnTo,
      "success",
      `Mês ${String(mes).padStart(2, "0")}/${ano} Reaberto com Sucesso.`
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível processar a operação.")
    );
  }
}

export async function createServicoAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, OPTIONS_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.amostras.gerenciar_cadastros", "Você não tem permissão para gerenciar cadastros de amostras.");

    const nome = sanitizeCatalogValue(getInputValue(formData, "nome"));
    const ordem = parsePositiveInt(getInputValue(formData, "ordem")) ?? 1;
    const servicoConfig = parseServicoConfig(formData);

    if (!nome) {
      throw new Error("Informe o nome do serviço.");
    }

    if (await hasServicoWithSameName(nome)) {
      throw new Error("Este serviço já está cadastrado.");
    }

    await prisma.controleBuffetAmostraServico.create({
      data: {
        nome,
        ...servicoConfig,
        ordem,
        ativo: true
      }
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Serviço Cadastrado com Sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível processar a operação.")
    );
  }
}

export async function updateServicoAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, OPTIONS_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.amostras.gerenciar_cadastros", "Você não tem permissão para gerenciar cadastros de amostras.");

    const servicoId = parsePositiveInt(getInputValue(formData, "servicoId"));
    if (!servicoId) {
      throw new Error("Serviço inválido para edição.");
    }

    const existing = await prisma.controleBuffetAmostraServico.findUnique({
      where: { id: servicoId }
    });
    if (!existing) {
      throw new Error("Serviço não encontrado.");
    }

    const nome = sanitizeCatalogValue(getInputValue(formData, "nome"));
    const ordem = parsePositiveInt(getInputValue(formData, "ordem")) ?? existing.ordem;
    const ativo = getInputValue(formData, "ativo") === "true";
    const servicoConfig = parseServicoConfig(formData, existing);

    if (!nome) {
      throw new Error("Informe o nome do serviço.");
    }

    if (await hasServicoWithSameName(nome, existing.id)) {
      throw new Error("Já existe outro serviço com este nome.");
    }

    await prisma.controleBuffetAmostraServico.update({
      where: { id: existing.id },
      data: {
        nome,
        ...servicoConfig,
        ordem,
        ativo
      }
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Serviço Atualizado com Sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível processar a operação.")
    );
  }
}

export async function toggleServicoStatusAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, OPTIONS_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.amostras.gerenciar_cadastros", "Você não tem permissão para gerenciar cadastros de amostras.");

    const servicoId = parsePositiveInt(getInputValue(formData, "servicoId"));
    const ativo = getInputValue(formData, "ativo") === "true";

    if (!servicoId) {
      throw new Error("Serviço inválido para atualização.");
    }

    const existing = await prisma.controleBuffetAmostraServico.findUnique({
      where: { id: servicoId }
    });
    if (!existing) {
      throw new Error("Serviço não encontrado.");
    }

    await prisma.controleBuffetAmostraServico.update({
      where: { id: existing.id },
      data: { ativo }
    });

    revalidateModulePaths();
    redirectWithFeedback(
      returnTo,
      "success",
      ativo ? "Serviço Ativado com Sucesso." : "Serviço Inativado com Sucesso."
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível processar a operação.")
    );
  }
}

export async function createItemAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, OPTIONS_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.amostras.gerenciar_cadastros", "Você não tem permissão para gerenciar cadastros de amostras.");

    const nome = sanitizeCatalogValue(getInputValue(formData, "nome"));
    const classificacao = parseItemClassification(getInputValue(formData, "classificacao"));
    const usaGarrafaTermica = getInputValue(formData, "usaGarrafaTermica") === "true";
    const ordem = parsePositiveInt(getInputValue(formData, "ordem")) ?? 1;
    const servicoIds = getInputNumberList(formData, "servicoIds");

    if (!nome || !classificacao) {
      throw new Error(!nome ? "Informe o nome do item." : INVALID_ITEM_CLASSIFICATION_MESSAGE);
    }

    if (servicoIds.length === 0) {
      throw new Error("Selecione ao menos um serviço para o item.");
    }

    if (await hasItemWithSameName(nome)) {
      throw new Error("Este item já está cadastrado.");
    }

    const servicos = await prisma.controleBuffetAmostraServico.findMany({
      where: { id: { in: servicoIds } },
      select: { id: true }
    });

    if (servicos.length !== servicoIds.length) {
      throw new Error("Selecione serviços válidos para o item.");
    }

    await prisma.$transaction(async (tx) => {
      const item = await tx.controleBuffetAmostraItem.create({
        data: {
          nome,
          classificacao,
          usaGarrafaTermica,
          ordem,
          ativo: true
        }
      });

      await tx.controleBuffetAmostraItemServico.createMany({
        data: servicoIds.map((servicoId) => ({
          servicoId,
          itemId: item.id
        })),
        skipDuplicates: true
      });
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Item Cadastrado com Sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível processar a operação.")
    );
  }
}

export async function updateItemAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, OPTIONS_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.amostras.gerenciar_cadastros", "Você não tem permissão para gerenciar cadastros de amostras.");

    const itemId = parsePositiveInt(getInputValue(formData, "itemId"));
    if (!itemId) {
      throw new Error("Item inválido para edição.");
    }

    const existing = await prisma.controleBuffetAmostraItem.findUnique({
      where: { id: itemId }
    });
    if (!existing) {
      throw new Error("Item não encontrado.");
    }

    const nome = sanitizeCatalogValue(getInputValue(formData, "nome"));
    const classificacao = parseItemClassification(getInputValue(formData, "classificacao"));
    const usaGarrafaTermica = getInputValue(formData, "usaGarrafaTermica") === "true";
    const ordem = parsePositiveInt(getInputValue(formData, "ordem")) ?? existing.ordem;
    const ativo = getInputValue(formData, "ativo") === "true";
    const servicoIds = getInputNumberList(formData, "servicoIds");

    if (!nome || !classificacao) {
      throw new Error(!nome ? "Informe o nome do item." : INVALID_ITEM_CLASSIFICATION_MESSAGE);
    }

    if (servicoIds.length === 0) {
      throw new Error("Selecione ao menos um serviço para o item.");
    }

    if (await hasItemWithSameName(nome, existing.id)) {
      throw new Error("Já existe outro item com este nome.");
    }

    const servicos = await prisma.controleBuffetAmostraServico.findMany({
      where: { id: { in: servicoIds } },
      select: { id: true }
    });

    if (servicos.length !== servicoIds.length) {
      throw new Error("Selecione serviços válidos para o item.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.controleBuffetAmostraItem.update({
        where: { id: existing.id },
        data: {
          nome,
          classificacao,
          usaGarrafaTermica,
          ordem,
          ativo
        }
      });

      await tx.controleBuffetAmostraItemServico.deleteMany({
        where: { itemId: existing.id }
      });

      await tx.controleBuffetAmostraItemServico.createMany({
        data: servicoIds.map((servicoId) => ({
          servicoId,
          itemId: existing.id
        })),
        skipDuplicates: true
      });
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Item Atualizado com Sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível processar a operação.")
    );
  }
}

export async function toggleItemStatusAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, OPTIONS_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.amostras.gerenciar_cadastros", "Você não tem permissão para gerenciar cadastros de amostras.");

    const itemId = parsePositiveInt(getInputValue(formData, "itemId"));
    const ativo = getInputValue(formData, "ativo") === "true";

    if (!itemId) {
      throw new Error("Item inválido para atualização.");
    }

    const existing = await prisma.controleBuffetAmostraItem.findUnique({
      where: { id: itemId }
    });
    if (!existing) {
      throw new Error("Item não encontrado.");
    }

    await prisma.controleBuffetAmostraItem.update({
      where: { id: existing.id },
      data: { ativo }
    });

    revalidateModulePaths();
    redirectWithFeedback(
      returnTo,
      "success",
      ativo ? "Item Ativado com Sucesso." : "Item Inativado com Sucesso."
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível processar a operação.")
    );
  }
}

export async function createAcaoCorretivaAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, OPTIONS_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.amostras.gerenciar_cadastros", "Você não tem permissão para gerenciar cadastros de amostras.");

    const nome = sanitizeCatalogValue(getInputValue(formData, "nome"));
    const ordem = parsePositiveInt(getInputValue(formData, "ordem")) ?? 1;

    if (!nome) {
      throw new Error("Informe o nome da ação corretiva.");
    }

    if (await hasAcaoCorretivaWithSameName(nome)) {
      throw new Error("Esta ação corretiva já está cadastrada.");
    }

    await prisma.controleBuffetAmostraAcaoCorretiva.create({
      data: {
        nome,
        ordem,
        ativo: true
      }
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Ação Corretiva Cadastrada com Sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível processar a operação.")
    );
  }
}

export async function updateAcaoCorretivaAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, OPTIONS_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.amostras.gerenciar_cadastros", "Você não tem permissão para gerenciar cadastros de amostras.");

    const acaoId = parsePositiveInt(getInputValue(formData, "acaoId"));
    if (!acaoId) {
      throw new Error("Ação corretiva inválida para edição.");
    }

    const existing = await prisma.controleBuffetAmostraAcaoCorretiva.findUnique({
      where: { id: acaoId }
    });
    if (!existing) {
      throw new Error("Ação corretiva não encontrada.");
    }

    const nome = sanitizeCatalogValue(getInputValue(formData, "nome"));
    const ordem = parsePositiveInt(getInputValue(formData, "ordem")) ?? existing.ordem;
    const ativo = getInputValue(formData, "ativo") === "true";

    if (!nome) {
      throw new Error("Informe o nome da ação corretiva.");
    }

    if (await hasAcaoCorretivaWithSameName(nome, existing.id)) {
      throw new Error("Já existe outra ação corretiva com este nome.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.controleBuffetAmostraAcaoCorretiva.update({
        where: { id: existing.id },
        data: {
          nome,
          ordem,
          ativo
        }
      });

      if (existing.nome !== nome) {
        await tx.controleBuffetAmostraRegistro.updateMany({
          where: { acaoCorretiva: existing.nome },
          data: { acaoCorretiva: nome }
        });
      }
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Ação Corretiva Atualizada com Sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível processar a operação.")
    );
  }
}

export async function toggleAcaoCorretivaStatusAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, OPTIONS_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensurePermission(actor, "modulo.amostras.gerenciar_cadastros", "Você não tem permissão para gerenciar cadastros de amostras.");

    const acaoId = parsePositiveInt(getInputValue(formData, "acaoId"));
    const ativo = getInputValue(formData, "ativo") === "true";

    if (!acaoId) {
      throw new Error("Ação corretiva inválida para atualização.");
    }

    const existing = await prisma.controleBuffetAmostraAcaoCorretiva.findUnique({
      where: { id: acaoId }
    });
    if (!existing) {
      throw new Error("Ação corretiva não encontrada.");
    }

    await prisma.controleBuffetAmostraAcaoCorretiva.update({
      where: { id: existing.id },
      data: { ativo }
    });

    revalidateModulePaths();
    redirectWithFeedback(
      returnTo,
      "success",
      ativo
        ? "Ação Corretiva Ativada com Sucesso."
        : "Ação Corretiva Inativada com Sucesso."
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithFeedback(
      returnTo,
      "error",
      getErrorMessage(error, "Não foi possível processar a operação.")
    );
  }
}


