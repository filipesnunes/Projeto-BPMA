"use server";

import {
  OrigemChamadoManutencao,
  StatusChamadoManutencao
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUserForAction } from "@/lib/auth-session";
import {
  createSignatureLog,
  ensureCanOpenMaintenance,
  ensureCanUpdateMaintenance,
  validateSignaturePassword
} from "@/lib/authz";
import { parseImageUploadFromFormData } from "@/lib/image-upload";
import { prisma } from "@/lib/prisma";

const MODULE_PATH = "/chamados-manutencao";

type FeedbackType = "success" | "error";

function getInputValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parsePositiveInt(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseOrigem(value: string): OrigemChamadoManutencao {
  if (value === OrigemChamadoManutencao.TEMPERATURA) return OrigemChamadoManutencao.TEMPERATURA;
  if (value === OrigemChamadoManutencao.LIMPEZA) return OrigemChamadoManutencao.LIMPEZA;
  if (value === OrigemChamadoManutencao.OLEO) return OrigemChamadoManutencao.OLEO;
  if (value === OrigemChamadoManutencao.RECEBIMENTO) return OrigemChamadoManutencao.RECEBIMENTO;
  if (value === OrigemChamadoManutencao.HORTIFRUTI) return OrigemChamadoManutencao.HORTIFRUTI;
  if (value === OrigemChamadoManutencao.BUFFET_AMOSTRAS)
    return OrigemChamadoManutencao.BUFFET_AMOSTRAS;
  return OrigemChamadoManutencao.MANUAL;
}

function parseStatus(value: string): StatusChamadoManutencao | null {
  if (value === StatusChamadoManutencao.ABERTO) return StatusChamadoManutencao.ABERTO;
  if (value === StatusChamadoManutencao.EM_ANDAMENTO) return StatusChamadoManutencao.EM_ANDAMENTO;
  if (value === StatusChamadoManutencao.CONCLUIDO) return StatusChamadoManutencao.CONCLUIDO;
  if (value === StatusChamadoManutencao.CANCELADO) return StatusChamadoManutencao.CANCELADO;
  return null;
}

function getReturnToPath(formData: FormData): string {
  const value = getInputValue(formData, "returnTo");
  if (!value.startsWith(MODULE_PATH)) {
    return MODULE_PATH;
  }

  return value;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Não foi possível processar o chamado de manutenção.";
}

function redirectWithFeedback(
  returnTo: string,
  feedbackType: FeedbackType,
  feedback: string
): never {
  const url = new URL(returnTo, "http://localhost");
  url.searchParams.set("feedbackType", feedbackType);
  url.searchParams.set("feedback", feedback);
  redirect(`${url.pathname}?${url.searchParams.toString()}`);
}

function revalidatePaths(chamadoId?: number) {
  revalidatePath(MODULE_PATH);
  if (chamadoId) {
    revalidatePath(`${MODULE_PATH}/${chamadoId}`);
  }
}

export async function createChamadoAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanOpenMaintenance(actor.perfil);

    const descricao = getInputValue(formData, "descricao");
    const tituloInput = getInputValue(formData, "titulo");
    const origem = parseOrigem(getInputValue(formData, "origem"));
    const contextoModulo = getInputValue(formData, "contextoModulo");
    const contextoRegistroId = getInputValue(formData, "contextoRegistroId");
    const senhaConfirmacao = getInputValue(formData, "senhaConfirmacao");

    if (!descricao) {
      throw new Error("A descrição do chamado é obrigatória.");
    }

    await validateSignaturePassword({ user: actor, password: senhaConfirmacao });

    const foto = await parseImageUploadFromFormData({
      formData,
      key: "fotoChamado",
      required: true,
      requiredMessage: "Anexe uma foto para abrir o chamado de manutenção."
    });

    const titulo = tituloInput || "Chamado de Manutenção";
    const now = new Date();

    const chamado = await prisma.chamadoManutencao.create({
      data: {
        titulo,
        descricao,
        areaLocal: origem,
        origem,
        status: StatusChamadoManutencao.ABERTO,
        contextoModulo: contextoModulo || null,
        contextoRegistroId: contextoRegistroId || null,
        fotoNome: foto?.fileName ?? null,
        fotoMimeType: foto?.mimeType ?? null,
        fotoBase64: foto?.base64 ?? null,
        criadoPorId: actor.id,
        criadoPorNome: actor.nomeCompleto,
        assinaturaAberturaUsuarioId: actor.id,
        assinaturaAberturaNomeUsuario: actor.nomeCompleto,
        assinaturaAberturaPerfil: actor.perfil,
        assinaturaAberturaDataHora: now,
        dataHoraCriacao: now
      }
    });

    await createSignatureLog({
      user: actor,
      tipo: "RESPONSAVEL",
      modulo: "chamados-manutencao/abertura",
      referenciaId: String(chamado.id)
    });

    revalidatePaths(chamado.id);
    redirectWithFeedback(
      `${MODULE_PATH}/${chamado.id}`,
      "success",
      "Chamado de Manutenção Aberto com Sucesso."
    );
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}

export async function updateChamadoStatusAction(formData: FormData) {
  const returnTo = getReturnToPath(formData);

  try {
    const actor = await getCurrentUserForAction();
    ensureCanUpdateMaintenance(actor.perfil);

    const chamadoId = parsePositiveInt(getInputValue(formData, "chamadoId"));
    if (!chamadoId) {
      throw new Error("Chamado inválido para atualização.");
    }

    const status = parseStatus(getInputValue(formData, "status"));
    if (!status) {
      throw new Error("Status inválido para atualização.");
    }

    const observacaoConclusao = getInputValue(formData, "observacaoConclusao");

    const chamado = await prisma.chamadoManutencao.findUnique({
      where: { id: chamadoId },
      select: { id: true }
    });
    if (!chamado) {
      throw new Error("Chamado não encontrado.");
    }

    await prisma.chamadoManutencao.update({
      where: { id: chamadoId },
      data: {
        status,
        observacaoConclusao:
          status === StatusChamadoManutencao.CONCLUIDO
            ? observacaoConclusao || null
            : null,
        dataHoraConclusao:
          status === StatusChamadoManutencao.CONCLUIDO ? new Date() : null
      }
    });

    revalidatePaths(chamadoId);
    redirectWithFeedback(returnTo, "success", "Status do Chamado Atualizado com Sucesso.");
  } catch (error) {
    redirectWithFeedback(returnTo, "error", getErrorMessage(error));
  }
}
