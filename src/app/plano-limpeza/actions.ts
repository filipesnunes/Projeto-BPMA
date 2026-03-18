"use server";

import {
  Prisma,
  StatusFechamentoPlanoLimpeza,
  StatusPlanoLimpeza,
  TipoPlanoLimpeza
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
  ensureCanSignSupervisor,
  validateSignaturePassword
} from "@/lib/authz";
import { prisma } from "@/lib/prisma";

import { WEEKLY_AREAS } from "./constants";
import {
  buildDailyTurnoFlags,
  consolidateWeeklyExecutionsByAreaWeek,
  ensureDailyTurnoSelection,
  ensureWeeklyChecklistForDateRange,
  getDailySignStage,
  getWeeklySignStage
} from "./service";
import {
  getCurrentSystemDateTime,
  getMonthDateRange,
  getMonthYear,
  parseDateInput,
  parseWeeklyDay,
  parsePositiveInt
} from "./utils";

const MODULE_PATH = "/plano-limpeza";
const DIARIO_PATH = "/plano-limpeza/diario";
const DIARIO_HISTORY_PATH = "/plano-limpeza/diario/historico";
const DIARIO_OPCOES_PATH = "/plano-limpeza/diario/opcoes";
const SEMANAL_PATH = "/plano-limpeza/semanal";
const SEMANAL_HISTORY_PATH = "/plano-limpeza/semanal/historico";
const SEMANAL_OPCOES_PATH = "/plano-limpeza/semanal/opcoes";

type FeedbackType = "success" | "error";

function getInputValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
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
  url.searchParams.delete("editId");
  url.searchParams.delete("editItemId");
  url.searchParams.set("feedbackType", feedbackType);
  url.searchParams.set("feedback", feedback);

  redirect(`${url.pathname}?${url.searchParams.toString()}`);
}

function revalidateModulePaths() {
  revalidatePath(MODULE_PATH);
  revalidatePath(DIARIO_PATH);
  revalidatePath(DIARIO_HISTORY_PATH);
  revalidatePath(DIARIO_OPCOES_PATH);
  revalidatePath(SEMANAL_PATH);
  revalidatePath(SEMANAL_HISTORY_PATH);
  revalidatePath(SEMANAL_OPCOES_PATH);
}

async function isMonthSigned(tipo: TipoPlanoLimpeza, mes: number, ano: number): Promise<boolean> {
  const fechamento = await prisma.planoLimpezaFechamento.findUnique({
    where: { tipo_mes_ano: { tipo, mes, ano } }
  });

  return fechamento?.status === StatusFechamentoPlanoLimpeza.ASSINADO;
}

function ensureNonEmpty(value: string, label: string) {
  if (!value) {
    throw new Error(`O campo ${label} é obrigatório.`);
  }
}

function ensureAreaIsValid(value: string, areas: readonly string[], label: string): string {
  if (!areas.includes(value)) {
    throw new Error(`Selecione uma ${label.toLowerCase()} válida.`);
  }

  return value;
}

export async function updateDailyRecordAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, DIARIO_PATH);

  try {
    const actor = await getCurrentUserForAction();
    const id = parsePositiveInt(getInputValue(formData, "id"));
    if (!id) {
      throw new Error("Registro diário inválido para edição.");
    }

    const existing = await prisma.planoLimpezaDiarioRegistro.findUnique({
      where: { id }
    });

    if (!existing) {
      throw new Error("Registro diário não encontrado.");
    }

    const period = getMonthYear(existing.data);
    if (await isMonthSigned(TipoPlanoLimpeza.DIARIO, period.mes, period.ano)) {
      throw new Error("Este registro pertence a um período fechado e não pode ser alterado.");
    }

    const etapa = getInputValue(formData, "etapa");
    const senhaConfirmacao = getInputValue(formData, "senhaConfirmacao");
    const observacaoAssinatura = getInputValue(formData, "observacaoAssinatura");

    const etapaPermitida = getDailySignStage(existing);
    if (!etapaPermitida) {
      throw new Error("Este checklist não está disponível para nova assinatura.");
    }

    if (etapa !== etapaPermitida) {
      throw new Error("A etapa de assinatura informada é inválida para este checklist.");
    }

    await validateSignaturePassword({ user: actor, password: senhaConfirmacao });

    if (etapaPermitida === "responsavel") {
      ensureCanSignResponsible(actor.perfil);

      await prisma.planoLimpezaDiarioRegistro.update({
        where: { id },
        data: {
          assinaturaResponsavel: actor.nomeCompleto,
          status: StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR,
          observacaoResponsavel: observacaoAssinatura || null
        }
      });
      await createSignatureLog({
        user: actor,
        tipo: "RESPONSAVEL",
        modulo: "plano-limpeza/diario",
        referenciaId: String(id),
        observacao: observacaoAssinatura || null
      });
    } else {
      ensureCanSignSupervisor(actor.perfil);
      if (!existing.assinaturaResponsavel) {
        throw new Error("A assinatura do responsável é obrigatória antes da assinatura do supervisor.");
      }

      await prisma.planoLimpezaDiarioRegistro.update({
        where: { id },
        data: {
          assinaturaSupervisor: actor.nomeCompleto,
          status: StatusPlanoLimpeza.CONCLUIDO,
          observacaoSupervisor: observacaoAssinatura || null
        }
      });
      await createSignatureLog({
        user: actor,
        tipo: "SUPERVISOR",
        modulo: "plano-limpeza/diario",
        referenciaId: String(id),
        observacao: observacaoAssinatura || null
      });
    }

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Checklist Diário Assinado com Sucesso.");
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function createDailyAreaConfigAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, DIARIO_OPCOES_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

    const nome = getInputValue(formData, "nome");
    const ordem = parsePositiveInt(getInputValue(formData, "ordem")) ?? 1;
    const turnos = buildDailyTurnoFlags(formData);

    ensureNonEmpty(nome, "Área");
    ensureDailyTurnoSelection(turnos);

    await prisma.planoLimpezaDiarioArea.create({
      data: {
        nome,
        ordem,
        turnoManha: turnos.turnoManha,
        turnoTarde: turnos.turnoTarde,
        turnoNoite: turnos.turnoNoite,
        ativo: true
      }
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Área do Plano Diário Criada com Sucesso.");
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function updateDailyAreaConfigAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, DIARIO_OPCOES_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

    const areaId = parsePositiveInt(getInputValue(formData, "areaId"));
    if (!areaId) {
      throw new Error("Área do plano diário inválida para edição.");
    }

    const existing = await prisma.planoLimpezaDiarioArea.findUnique({
      where: { id: areaId }
    });

    if (!existing) {
      throw new Error("Área do plano diário não encontrada.");
    }

    const nome = getInputValue(formData, "nome");
    const ordem = parsePositiveInt(getInputValue(formData, "ordem")) ?? existing.ordem;
    const ativo = getInputValue(formData, "ativo") === "true";
    const turnos = buildDailyTurnoFlags(formData);

    ensureNonEmpty(nome, "Área");
    ensureDailyTurnoSelection(turnos);

    await prisma.planoLimpezaDiarioArea.update({
      where: { id: areaId },
      data: {
        nome,
        ordem,
        ativo,
        turnoManha: turnos.turnoManha,
        turnoTarde: turnos.turnoTarde,
        turnoNoite: turnos.turnoNoite
      }
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Área do Plano Diário Atualizada com Sucesso.");
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function toggleDailyAreaConfigStatusAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, DIARIO_OPCOES_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

    const areaId = parsePositiveInt(getInputValue(formData, "areaId"));
    if (!areaId) {
      throw new Error("Área do plano diário inválida para atualização.");
    }

    const existing = await prisma.planoLimpezaDiarioArea.findUnique({
      where: { id: areaId }
    });

    if (!existing) {
      throw new Error("Área do plano diário não encontrada.");
    }

    const ativo = getInputValue(formData, "ativo") === "true";

    await prisma.planoLimpezaDiarioArea.update({
      where: { id: areaId },
      data: { ativo }
    });

    revalidateModulePaths();
    redirectWithFeedback(
      returnTo,
      "success",
      ativo ? "Área Ativada com Sucesso." : "Área Inativada com Sucesso."
    );
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function bulkSignDailyByDateAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, DIARIO_HISTORY_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanSignSupervisor(actor.perfil);

    const dataRaw = getInputValue(formData, "data");
    const senhaConfirmacao = getInputValue(formData, "senhaConfirmacao");
    const assinarComoResponsavel = formData.get("assinarComoResponsavel") === "on";
    const observacao = getInputValue(formData, "observacao");
    if (assinarComoResponsavel) {
      ensureCanSignResponsible(actor.perfil);
    }

    const data = parseDateInput(dataRaw);
    if (!data) {
      throw new Error("Data inválida para assinatura retroativa.");
    }

    await validateSignaturePassword({ user: actor, password: senhaConfirmacao });

    const period = getMonthYear(data);
    if (await isMonthSigned(TipoPlanoLimpeza.DIARIO, period.mes, period.ano)) {
      throw new Error("Este dia pertence a um período fechado e não pode ser alterado.");
    }

    const registrosDoDia = await prisma.planoLimpezaDiarioRegistro.findMany({
      where: { data },
      select: {
        id: true,
        status: true,
        assinaturaResponsavel: true,
        assinaturaSupervisor: true
      }
    });

    if (registrosDoDia.length === 0) {
      throw new Error("Não há registros para este dia.");
    }

    const aguardandoIds: number[] = [];
    const pendentesSemResponsavelIds: number[] = [];

    for (const registro of registrosDoDia) {
      const hasResponsavel = registro.assinaturaResponsavel.trim().length > 0;
      const hasSupervisor = registro.assinaturaSupervisor.trim().length > 0;

      if (
        registro.status === StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR &&
        hasResponsavel &&
        !hasSupervisor
      ) {
        aguardandoIds.push(registro.id);
      }

      if (
        registro.status === StatusPlanoLimpeza.PENDENTE &&
        !hasResponsavel &&
        !hasSupervisor
      ) {
        pendentesSemResponsavelIds.push(registro.id);
      }
    }

    if (aguardandoIds.length === 0 && (!assinarComoResponsavel || pendentesSemResponsavelIds.length === 0)) {
      throw new Error("Não há pendências elegíveis para assinatura retroativa neste dia.");
    }

    await prisma.$transaction(async (tx) => {
      if (aguardandoIds.length > 0) {
        const updateData: {
          assinaturaSupervisor: string;
          status: StatusPlanoLimpeza;
          observacaoSupervisor?: string;
        } = {
          assinaturaSupervisor: actor.nomeCompleto,
          status: StatusPlanoLimpeza.CONCLUIDO
        };
        if (observacao) {
          updateData.observacaoSupervisor = observacao;
        }

        await tx.planoLimpezaDiarioRegistro.updateMany({
          where: { id: { in: aguardandoIds } },
          data: updateData
        });
      }

      if (assinarComoResponsavel && pendentesSemResponsavelIds.length > 0) {
        const dataUpdate: {
          assinaturaResponsavel: string;
          assinaturaSupervisor: string;
          status: StatusPlanoLimpeza;
          observacaoResponsavel?: string;
          observacaoSupervisor?: string;
        } = {
          assinaturaResponsavel: actor.nomeCompleto,
          assinaturaSupervisor: actor.nomeCompleto,
          status: StatusPlanoLimpeza.CONCLUIDO
        };

        if (observacao) {
          dataUpdate.observacaoResponsavel = observacao;
          dataUpdate.observacaoSupervisor = observacao;
        }

        await tx.planoLimpezaDiarioRegistro.updateMany({
          where: { id: { in: pendentesSemResponsavelIds } },
          data: dataUpdate
        });
      }
    });

    if (aguardandoIds.length > 0) {
      await createSignatureLog({
        user: actor,
        tipo: "SUPERVISOR",
        modulo: "plano-limpeza/diario",
        referenciaId: dataRaw
      });
    }

    if (assinarComoResponsavel && pendentesSemResponsavelIds.length > 0) {
      await createSignatureLog({
        user: actor,
        tipo: "RESPONSAVEL",
        modulo: "plano-limpeza/diario",
        referenciaId: dataRaw,
        observacao: observacao || null
      });
    }

    revalidatePath(returnTo.split("?")[0]);
    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Assinatura Retroativa do Dia Aplicada com Sucesso.");
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function updateWeeklyRecordAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, SEMANAL_PATH);

  try {
    const actor = await getCurrentUserForAction();
    const id = parsePositiveInt(getInputValue(formData, "id"));
    if (!id) {
      throw new Error("Registro semanal inválido para assinatura.");
    }

    const existing = await prisma.planoLimpezaSemanalExecucao.findUnique({
      where: { id }
    });

    if (!existing) {
      throw new Error("Registro semanal não encontrado.");
    }

    const period = getMonthYear(existing.dataExecucao);
    if (await isMonthSigned(TipoPlanoLimpeza.SEMANAL, period.mes, period.ano)) {
      throw new Error("Este registro pertence a um período fechado e não pode ser alterado.");
    }

    const etapa = getInputValue(formData, "etapa");
    const senhaConfirmacao = getInputValue(formData, "senhaConfirmacao");
    const observacaoAssinatura = getInputValue(formData, "observacaoAssinatura");

    const etapaPermitida = getWeeklySignStage({
      status: existing.status,
      assinaturaResponsavel: existing.assinaturaResponsavel,
      assinaturaSupervisor: existing.assinaturaSupervisor
    });
    if (!etapaPermitida) {
      throw new Error("Este checklist não está disponível para nova assinatura.");
    }

    if (etapa !== etapaPermitida) {
      throw new Error("A etapa de assinatura informada é inválida para este checklist.");
    }

    await validateSignaturePassword({ user: actor, password: senhaConfirmacao });

    if (etapaPermitida === "responsavel") {
      ensureCanSignResponsible(actor.perfil);

      await prisma.planoLimpezaSemanalExecucao.update({
        where: { id },
        data: {
          assinaturaResponsavel: actor.nomeCompleto,
          status: StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR,
          observacaoResponsavel: observacaoAssinatura || null
        }
      });
      await createSignatureLog({
        user: actor,
        tipo: "RESPONSAVEL",
        modulo: "plano-limpeza/semanal",
        referenciaId: String(id),
        observacao: observacaoAssinatura || null
      });
    } else {
      ensureCanSignSupervisor(actor.perfil);
      if (!existing.assinaturaResponsavel.trim()) {
        throw new Error("A assinatura do responsável é obrigatória antes da assinatura do supervisor.");
      }

      await prisma.planoLimpezaSemanalExecucao.update({
        where: { id },
        data: {
          assinaturaSupervisor: actor.nomeCompleto,
          status: StatusPlanoLimpeza.CONCLUIDO,
          observacaoSupervisor: observacaoAssinatura || null
        }
      });
      await createSignatureLog({
        user: actor,
        tipo: "SUPERVISOR",
        modulo: "plano-limpeza/semanal",
        referenciaId: String(id),
        observacao: observacaoAssinatura || null
      });
    }

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Checklist Semanal Assinado com Sucesso.");
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

async function normalizeWeeklyOrderForArea(
  tx: Prisma.TransactionClient,
  area: string
) {
  const items = await tx.planoLimpezaSemanalItem.findMany({
    where: { area },
    orderBy: [{ ordem: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, ordem: true }
  });

  for (const [index, item] of items.entries()) {
    const expectedOrder = index + 1;
    if (item.ordem === expectedOrder) {
      continue;
    }

    await tx.planoLimpezaSemanalItem.update({
      where: { id: item.id },
      data: { ordem: expectedOrder }
    });
  }
}

async function normalizeWeeklyOrderForAreas(
  tx: Prisma.TransactionClient,
  areas: string[]
) {
  for (const area of new Set(areas)) {
    await normalizeWeeklyOrderForArea(tx, area);
  }
}

export async function createWeeklyConfigItemAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, SEMANAL_OPCOES_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

    const area = ensureAreaIsValid(getInputValue(formData, "area"), WEEKLY_AREAS, "Área");
    const oQueLimpar = getInputValue(formData, "oQueLimpar");
    const quem = getInputValue(formData, "quem");
    const ordem = parsePositiveInt(getInputValue(formData, "ordem")) ?? 1;
    const ativo = getInputValue(formData, "ativo") !== "false";
    const qualProduto = getInputValue(formData, "qualProduto") || "-";
    const quandoSelecionado = parseWeeklyDay(getInputValue(formData, "quando"));

    ensureNonEmpty(oQueLimpar, "O que limpar");
    ensureNonEmpty(quem, "Quem");
    if (!quandoSelecionado) {
      throw new Error("Selecione um dia da semana válido.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.planoLimpezaSemanalItem.create({
        data: {
          area,
          oQueLimpar,
          qualProduto,
          quando: quandoSelecionado,
          quem,
          ordem,
          ativo
        }
      });

      await normalizeWeeklyOrderForArea(tx, area);
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Item do Plano Semanal Criado com Sucesso.");
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function updateWeeklyConfigItemAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, SEMANAL_OPCOES_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

    const itemId = parsePositiveInt(getInputValue(formData, "itemId"));
    if (!itemId) {
      throw new Error("Item semanal inválido para edição.");
    }

    const existing = await prisma.planoLimpezaSemanalItem.findUnique({
      where: { id: itemId }
    });

    if (!existing) {
      throw new Error("Item semanal não encontrado.");
    }

    const area = ensureAreaIsValid(getInputValue(formData, "area"), WEEKLY_AREAS, "Área");
    const oQueLimpar = getInputValue(formData, "oQueLimpar");
    const quem = getInputValue(formData, "quem");
    const ordem = parsePositiveInt(getInputValue(formData, "ordem")) ?? existing.ordem;
    const ativo = getInputValue(formData, "ativo") === "true";
    const qualProduto = getInputValue(formData, "qualProduto") || existing.qualProduto || "-";
    const quandoSelecionado = parseWeeklyDay(getInputValue(formData, "quando"));

    ensureNonEmpty(oQueLimpar, "O que limpar");
    ensureNonEmpty(quem, "Quem");
    if (!quandoSelecionado) {
      throw new Error("Selecione um dia da semana válido.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.planoLimpezaSemanalItem.update({
        where: { id: itemId },
        data: {
          area,
          oQueLimpar,
          qualProduto,
          quando: quandoSelecionado,
          quem,
          ordem,
          ativo
        }
      });

      await normalizeWeeklyOrderForAreas(tx, [existing.area, area]);
    });

    revalidateModulePaths();
    redirectWithFeedback(returnTo, "success", "Item do Plano Semanal Atualizado com Sucesso.");
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function toggleWeeklyConfigItemStatusAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, SEMANAL_OPCOES_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

    const itemId = parsePositiveInt(getInputValue(formData, "itemId"));
    if (!itemId) {
      throw new Error("Item semanal inválido para atualização.");
    }

    const existing = await prisma.planoLimpezaSemanalItem.findUnique({
      where: { id: itemId }
    });

    if (!existing) {
      throw new Error("Item semanal não encontrado.");
    }

    const ativo = getInputValue(formData, "ativo") === "true";

    await prisma.planoLimpezaSemanalItem.update({
      where: { id: itemId },
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

export async function moveWeeklyConfigItemAction(formData: FormData) {
  const returnTo = getReturnToPath(formData, SEMANAL_OPCOES_PATH);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanManageOptions(actor.perfil);

    const itemId = parsePositiveInt(getInputValue(formData, "itemId"));
    if (!itemId) {
      throw new Error("Item semanal inválido para reordenação.");
    }

    const direction = getInputValue(formData, "direction");
    if (direction !== "up" && direction !== "down") {
      throw new Error("Direção de reordenação inválida.");
    }

    const moved = await prisma.$transaction(async (tx) => {
      const current = await tx.planoLimpezaSemanalItem.findUnique({
        where: { id: itemId },
        select: { id: true, area: true }
      });

      if (!current) {
        throw new Error("Item semanal não encontrado.");
      }

      const items = await tx.planoLimpezaSemanalItem.findMany({
        where: { area: current.area },
        orderBy: [{ ordem: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: { id: true }
      });

      const index = items.findIndex((item) => item.id === itemId);
      if (index < 0) {
        throw new Error("Item semanal não encontrado para reordenação.");
      }

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= items.length) {
        return false;
      }

      const reordered = [...items];
      const [currentItem] = reordered.splice(index, 1);
      reordered.splice(targetIndex, 0, currentItem);

      for (const [orderIndex, item] of reordered.entries()) {
        await tx.planoLimpezaSemanalItem.update({
          where: { id: item.id },
          data: { ordem: orderIndex + 1 }
        });
      }

      return true;
    });

    revalidateModulePaths();
    redirectWithFeedback(
      returnTo,
      "success",
      moved
        ? "Ordem do Item Atualizada com Sucesso."
        : "O Item Já Está no Limite da Reordenação."
    );
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

async function closeMonthByType(params: {
  formData: FormData;
  tipo: TipoPlanoLimpeza;
  returnPath: string;
  countRecords: (range: { start: Date; end: Date }) => Promise<number>;
  successLabel: string;
}) {
  const returnTo = getReturnToPath(params.formData, params.returnPath);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanCloseMonth(actor.perfil);

    const mes = parsePositiveInt(getInputValue(params.formData, "mes"));
    const ano = parsePositiveInt(getInputValue(params.formData, "ano"));
    const senhaConfirmacao = getInputValue(params.formData, "senhaConfirmacao");
    const responsavelTecnico = actor.nomeCompleto;

    if (!mes || mes < 1 || mes > 12 || !ano) {
      throw new Error("Informe um mês e ano válidos para fechamento.");
    }

    await validateSignaturePassword({ user: actor, password: senhaConfirmacao });

    if (await isMonthSigned(params.tipo, mes, ano)) {
      throw new Error(`O mês ${String(mes).padStart(2, "0")}/${ano} já está assinado.`);
    }

    const range = getMonthDateRange(mes, ano);
    const quantidade = await params.countRecords(range);
    if (quantidade === 0) {
      throw new Error("Não há registros no período selecionado para fechamento.");
    }

    await prisma.planoLimpezaFechamento.upsert({
      where: { tipo_mes_ano: { tipo: params.tipo, mes, ano } },
      create: {
        tipo: params.tipo,
        mes,
        ano,
        responsavelTecnico,
        dataAssinatura: getCurrentSystemDateTime(),
        status: StatusFechamentoPlanoLimpeza.ASSINADO
      },
      update: {
        responsavelTecnico,
        dataAssinatura: getCurrentSystemDateTime(),
        status: StatusFechamentoPlanoLimpeza.ASSINADO
      }
    });

    await createSignatureLog({
      user: actor,
      tipo: "FECHAMENTO_MENSAL",
      modulo: params.tipo === TipoPlanoLimpeza.DIARIO ? "plano-limpeza/diario" : "plano-limpeza/semanal",
      referenciaId: `${params.tipo}-${mes}-${ano}`
    });

    revalidateModulePaths();
    redirectWithFeedback(
      returnTo,
      "success",
      `${params.successLabel} ${String(mes).padStart(2, "0")}/${ano} Fechado com Sucesso.`
    );
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

async function reopenMonthByType(params: {
  formData: FormData;
  tipo: TipoPlanoLimpeza;
  returnPath: string;
  successLabel: string;
}) {
  const returnTo = getReturnToPath(params.formData, params.returnPath);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanReopenMonth(actor.perfil);

    const mes = parsePositiveInt(getInputValue(params.formData, "mes"));
    const ano = parsePositiveInt(getInputValue(params.formData, "ano"));

    if (!mes || mes < 1 || mes > 12 || !ano) {
      throw new Error("Informe um mês e ano válidos para reabertura.");
    }

    const fechamento = await prisma.planoLimpezaFechamento.findUnique({
      where: { tipo_mes_ano: { tipo: params.tipo, mes, ano } }
    });

    if (!fechamento || fechamento.status !== StatusFechamentoPlanoLimpeza.ASSINADO) {
      throw new Error(`O mês ${String(mes).padStart(2, "0")}/${ano} não está assinado.`);
    }

    await prisma.planoLimpezaFechamento.update({
      where: { id: fechamento.id },
      data: {
        status: StatusFechamentoPlanoLimpeza.ABERTO
      }
    });

    revalidateModulePaths();
    redirectWithFeedback(
      returnTo,
      "success",
      `${params.successLabel} ${String(mes).padStart(2, "0")}/${ano} Reaberto com Sucesso.`
    );
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function closeDailyMonthAction(formData: FormData) {
  await closeMonthByType({
    formData,
    tipo: TipoPlanoLimpeza.DIARIO,
    returnPath: DIARIO_PATH,
    countRecords: async ({ start, end }) =>
      prisma.planoLimpezaDiarioRegistro.count({
        where: { data: { gte: start, lte: end } }
      }),
    successLabel: "Plano Diário"
  });
}

export async function reopenDailyMonthAction(formData: FormData) {
  await reopenMonthByType({
    formData,
    tipo: TipoPlanoLimpeza.DIARIO,
    returnPath: DIARIO_PATH,
    successLabel: "Plano Diário"
  });
}

export async function closeWeeklyMonthAction(formData: FormData) {
  await closeMonthByType({
    formData,
    tipo: TipoPlanoLimpeza.SEMANAL,
    returnPath: SEMANAL_PATH,
    countRecords: async ({ start, end }) => {
      await ensureWeeklyChecklistForDateRange({ start, end });
      const records = await prisma.planoLimpezaSemanalExecucao.findMany({
        where: { dataExecucao: { gte: start, lte: end } },
        select: {
          id: true,
          dataExecucao: true,
          area: true,
          assinaturaResponsavel: true,
          assinaturaSupervisor: true,
          status: true
        }
      });

      return consolidateWeeklyExecutionsByAreaWeek(records).length;
    },
    successLabel: "Plano Semanal"
  });
}

export async function reopenWeeklyMonthAction(formData: FormData) {
  await reopenMonthByType({
    formData,
    tipo: TipoPlanoLimpeza.SEMANAL,
    returnPath: SEMANAL_PATH,
    successLabel: "Plano Semanal"
  });
}
