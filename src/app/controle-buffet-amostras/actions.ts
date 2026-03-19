"use server";

import {
  StatusFechamentoBuffetAmostra,
  StatusItemBuffetAmostra
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUserForAction } from "@/lib/auth-session";
import {
  createSignatureLog,
  ensureCanCloseMonth,
  ensureCanManageOptions,
  ensureCanReopenMonth,
  ensureCanSignResponsible,
  validateSignaturePassword
} from "@/lib/authz";
import { prisma } from "@/lib/prisma";

import {
  findAcaoCorretivaByName,
  getAcoesCorretivas,
  hasAcaoCorretivaWithSameName,
  hasItemWithSameName,
  hasServicoWithSameName,
  parseItemClassification,
  sanitizeCatalogValue
} from "./catalog";
import { normalizeOption } from "./options";
import {
  avaliarTemperaturaBuffet,
  getCurrentSystemDateTime,
  getMonthDateRange,
  getMonthYear,
  parseDateInput,
  parsePositiveInt,
  parseTemperatureInput
} from "./utils";

const MODULE_PATH = "/controle-buffet-amostras";
const SERVICE_PATH = "/controle-buffet-amostras/servico";
const HISTORY_PATH = "/controle-buffet-amostras/historico";
const OPTIONS_PATH = "/controle-buffet-amostras/opcoes";
const NAO_SE_APLICA_NORMALIZED = normalizeOption("Não se aplica");

type FeedbackType = "success" | "error";

function getInputValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Não foi possível processar a operação.";
}

function redirectWithFeedback(
  returnTo: string,
  feedbackType: FeedbackType,
  feedback: string
): never {
  const url = new URL(returnTo, "http://localhost");
  url.searchParams.delete("new");
  url.searchParams.delete("editServicoId");
  url.searchParams.delete("editItemId");
  url.searchParams.delete("editAcaoId");
  url.searchParams.delete("signItemId");
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

async function ensureAcoesCorretivasConfiguradas() {
  const options = await getAcoesCorretivas(true);
  if (options.length === 0) {
    throw new Error(
      "Não há ações corretivas ativas cadastradas. Configure em Gerenciar Opções antes de registrar."
    );
  }
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
    const segundaTcInput = getInputValue(formData, "segundaTc");
    const acaoCorretivaInput = getInputValue(formData, "acaoCorretiva");
    const observacao = getInputValue(formData, "observacao");

    if (!servicoId || !itemId) {
      throw new Error("Serviço ou item inválido para registro.");
    }

    const data = parseDateInput(dataInput);
    if (!data) {
      throw new Error("Data inválida para registro do item.");
    }

    await ensurePeriodIsOpen(data);
    await ensureAcoesCorretivasConfiguradas();

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

    const tcEquipamento = parseTemperatureInput(tcEquipamentoInput);
    const primeiraTc = parseTemperatureInput(primeiraTcInput);
    const segundaTc = parseTemperatureInput(segundaTcInput);

    if (tcEquipamento === null || primeiraTc === null || segundaTc === null) {
      throw new Error("Preencha TC Equipamento, 1ª TC e 2ª TC com valores válidos.");
    }

    const avaliacao = avaliarTemperaturaBuffet(item.classificacao, segundaTc);
    const acaoCorretivaOption = acaoCorretivaInput
      ? await findAcaoCorretivaByName(acaoCorretivaInput, false)
      : null;

    if (acaoCorretivaInput && !acaoCorretivaOption) {
      throw new Error("Selecione uma ação corretiva válida da lista cadastrada.");
    }

    if (
      avaliacao.exigeAcaoCorretiva &&
      (!acaoCorretivaOption ||
        normalizeOption(acaoCorretivaOption.nome) === NAO_SE_APLICA_NORMALIZED)
    ) {
      throw new Error(
        "A ação corretiva é obrigatória quando a temperatura estiver em Alerta ou Crítico."
      );
    }

    const acaoCorretiva = acaoCorretivaOption
      ? acaoCorretivaOption.nome
      : await (async () => {
          const naoSeAplica = await findAcaoCorretivaByName("Não se aplica", false);
          return naoSeAplica?.nome ?? null;
        })();

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

    const now = getCurrentSystemDateTime();
    const payload = {
      itemNome: item.nome,
      classificacao: item.classificacao,
      tcEquipamento,
      primeiraTc,
      segundaTc,
      statusTemperatura: avaliacao.status,
      acaoCorretiva,
      observacao: observacao || null,
      responsavelUsuarioId: actor.id,
      responsavelNome: actor.nomeCompleto,
      responsavelPerfil: actor.perfil,
      dataHoraRegistro: now,
      status: StatusItemBuffetAmostra.PREENCHIDO
    };

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
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function signRegistroItemAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, MODULE_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanSignResponsible(actor.perfil);

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
      tipo: "RESPONSAVEL",
      modulo: "controle-buffet-amostras/item",
      referenciaId: String(registro.id)
    });

    revalidateModulePaths(registro.servicoId);
    redirectWithFeedback(returnTo, "success", "Item Assinado com Sucesso.");
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function closeMonthAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, MODULE_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanCloseMonth(actor.perfil);

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
        status: { not: StatusItemBuffetAmostra.ASSINADO }
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
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function reopenMonthAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, MODULE_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanReopenMonth(actor.perfil);

    const mes = parsePositiveInt(getInputValue(formData, "mes"));
    const ano = parsePositiveInt(getInputValue(formData, "ano"));

    if (!mes || mes < 1 || mes > 12 || !ano) {
      throw new Error("Informe um mês e ano válidos para reabertura.");
    }

    const fechamento = await prisma.controleBuffetAmostraFechamento.findUnique({
      where: { mes_ano: { mes, ano } }
    });

    if (!fechamento || fechamento.status !== StatusFechamentoBuffetAmostra.ASSINADO) {
      throw new Error(`O mês ${String(mes).padStart(2, "0")}/${ano} não está assinado.`);
    }

    await prisma.controleBuffetAmostraFechamento.update({
      where: { id: fechamento.id },
      data: {
        status: StatusFechamentoBuffetAmostra.ABERTO
      }
    });

    revalidateModulePaths();
    redirectWithFeedback(
      returnTo,
      "success",
      `Mês ${String(mes).padStart(2, "0")}/${ano} Reaberto com Sucesso.`
    );
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function createServicoAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, OPTIONS_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

    const nome = sanitizeCatalogValue(getInputValue(formData, "nome"));
    const ordem = parsePositiveInt(getInputValue(formData, "ordem")) ?? 1;

    if (!nome) {
      throw new Error("Informe o nome do serviço.");
    }

    if (await hasServicoWithSameName(nome)) {
      throw new Error("Este serviço já está cadastrado.");
    }

    await prisma.controleBuffetAmostraServico.create({
      data: {
        nome,
        ordem,
        ativo: true
      }
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Serviço Cadastrado com Sucesso.");
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function updateServicoAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, OPTIONS_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

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
        ordem,
        ativo
      }
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Serviço Atualizado com Sucesso.");
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function toggleServicoStatusAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, OPTIONS_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

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
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function createItemAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, OPTIONS_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

    const nome = sanitizeCatalogValue(getInputValue(formData, "nome"));
    const classificacao = parseItemClassification(getInputValue(formData, "classificacao"));
    const ordem = parsePositiveInt(getInputValue(formData, "ordem")) ?? 1;
    const servicoIds = getInputNumberList(formData, "servicoIds");

    if (!nome || !classificacao) {
      throw new Error("Informe nome e classificação válidos para o item.");
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
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function updateItemAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, OPTIONS_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

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
    const ordem = parsePositiveInt(getInputValue(formData, "ordem")) ?? existing.ordem;
    const ativo = getInputValue(formData, "ativo") === "true";
    const servicoIds = getInputNumberList(formData, "servicoIds");

    if (!nome || !classificacao) {
      throw new Error("Informe nome e classificação válidos para o item.");
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
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function toggleItemStatusAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, OPTIONS_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

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
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function createAcaoCorretivaAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, OPTIONS_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

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
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function updateAcaoCorretivaAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, OPTIONS_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

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
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function toggleAcaoCorretivaStatusAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, OPTIONS_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

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
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}
