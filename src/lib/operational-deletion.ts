import "server-only";
import { Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth-session";
import { getAppDate, getAppNow } from "@/lib/date-time";
import type { OperationalRecordModuleCode } from "@/lib/operational-record-modules";
import { operationalRecordModule } from "@/lib/operational-record-modules";
import { revalidatePath } from "next/cache";
import { isOperationalMonthClosed, revalidateMonthlyPeriod } from "@/lib/monthly-reopening";
import { canDeleteOperationalRecord } from "@/lib/operational-deletion-permission";
import { prisma } from "@/lib/prisma";

export const operationalDeletionModels = {
  hortifruti: "higienizacaoHortifruti", temperatura: "controleTemperaturaEquipamento",
  oleo: "controleQualidadeOleoRegistro", amostras: "controleBuffetAmostraRegistro",
  limpeza_diaria: "planoLimpezaDiarioRegistro", limpeza_semanal: "planoLimpezaSemanalExecucao",
  rastreabilidade: "rastreabilidadeRecebimentoRegistro", nota: "rastreabilidadeRecebimentoNota",
  chamados: "chamadoManutencao", etiquetas: "etiquetaValidadeEmissao"
} as const;
export type DeletionTarget = keyof typeof operationalDeletionModels;

export async function operationalRecordMonthClosed(code: OperationalRecordModuleCode, date: Date, db: Prisma.TransactionClient = prisma) {
  const mes = date.getUTCMonth() + 1, ano = date.getUTCFullYear();
  if (code !== "chamados" && code !== "etiquetas") return isOperationalMonthClosed(code, mes, ano, db);
  // These modules have no legacy monthly closure. As in the existing modules,
  // absence of a generic closure means open; explicit closure is always honored.
  const period = await db.fechamentoMensalModulo.findUnique({ where: { moduloCodigo_ano_mes: { moduloCodigo: code, mes, ano } } });
  return Boolean(period && period.status !== "REABERTO");
}

// All hotel data belongs to this single-unit application. No submitted tenant or
// module/table name is trusted; only the server-owned allowlist is used.
export async function deleteOperationalRecord(params: {
  user: AuthenticatedUser; target: DeletionTarget; id: number; reason: string; expectedVersion?: number;
}) {
  const { target, id } = params;
  let user = params.user;
  const moduleCode: OperationalRecordModuleCode = target === "nota" ? "rastreabilidade" : target;
  if (!canDeleteOperationalRecord(user, moduleCode)) throw new Error("Seu perfil não pode excluir registros deste módulo.");
  const reason = params.reason.trim();
  if (!reason || reason.length > 4000) throw new Error("Informe a justificativa da exclusão (até 4000 caracteres).");
  if (!Number.isSafeInteger(id) || id < 1 || !Object.hasOwn(operationalDeletionModels, target)) throw new Error("Registro inválido.");
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${moduleCode}), 17326)`;
    if (target === "temperatura" || target === "oleo") {
      const { refreshWorkflowActor } = await import("@/app/controle-temperatura-equipamentos/workflow-adapter");
      user = await refreshWorkflowActor(tx, user);
      if (!canDeleteOperationalRecord(user, moduleCode)) throw new Error("Seu perfil não pode excluir registros deste módulo.");
    }
    const delegate = tx[operationalDeletionModels[target]];
    // The allowlisted delegates share these operations; generated overloads differ.
    const records = delegate as unknown as {
      findFirst(args: { where: { id: number; excluidoEm: null } }): Promise<Record<string, unknown> | null>;
      updateMany(args: { where: { id: number; excluidoEm: null }; data: { excluidoEm: Date } }): Promise<{ count: number }>;
    };
    const original = await records.findFirst({ where: { id, excluidoEm: null } });
    if ((target === "temperatura" || target === "oleo") && original?.fluxoId) {
      const flow = await tx.fluxoOperacional.findUniqueOrThrow({ where: { id: String(original.fluxoId) } });
      if (flow.estado === "FECHADO") throw new Error("Reabra a aferição antes de excluir um registro fechado.");
      if (flow.versao !== params.expectedVersion) throw new Error("A aferição foi atualizada. Recarregue antes de excluir.");
      await tx.fluxoOperacional.update({ where: { id: flow.id, versao: flow.versao }, data: { excluidoEm: getAppNow() } });
      await tx.fluxoEvento.create({ data: { fluxoId: flow.id, operacao: "EXCLUSAO", estadoAnterior: flow.estado,
        estadoNovo: flow.estado, versaoAnterior: flow.versao, versaoNova: flow.versao, justificativa: reason,
        usuarioId: user.id, usuarioNome: user.nomeCompleto, usuarioPerfil: user.perfil } });
    }
    if (!original) throw new Error("Registro não encontrado ou já excluído.");
    const reference = original.data ?? original.dataExecucao ?? original.dataManipulacao;
    const date = reference ?? (original.dataHoraCriacao instanceof Date ? getAppDate(original.dataHoraCriacao) : null);
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error("O registro não possui data de referência válida para conferir a competência.");
    if (await operationalRecordMonthClosed(moduleCode, date, tx)) {
      throw new Error("O mês deste registro está fechado e não permite exclusão, inclusive para DEV.");
    }
    const deletedAt = getAppNow();
    async function audit(model: string, record: Record<string, unknown>) {
      await tx.exclusaoRegistroOperacional.create({ data: {
        modulo: moduleCode, modelo: model, registroId: record.id as number,
        dadosOriginais: JSON.parse(JSON.stringify(record)) as Prisma.InputJsonValue,
        usuarioId: user.id, usuarioNome: user.nomeCompleto, usuarioPerfil: user.perfil,
        excluidoEm: deletedAt, justificativa: reason
      } });
    }
    if (target === "nota") {
      const items = await tx.rastreabilidadeRecebimentoRegistro.findMany({ where: { notaId: id, excluidoEm: null } });
      for (const item of items) {
        if (await operationalRecordMonthClosed(moduleCode, item.data, tx)) throw new Error("Um item da nota pertence a um mês fechado.");
        await audit("rastreabilidadeRecebimentoRegistro", item);
      }
      await tx.rastreabilidadeRecebimentoRegistro.updateMany({ where: { notaId: id, excluidoEm: null }, data: { excluidoEm: deletedAt } });
    }
    await audit(operationalDeletionModels[target], original);
    const result = await records.updateMany({ where: { id, excluidoEm: null }, data: { excluidoEm: deletedAt } });
    if (result.count !== 1) throw new Error("Registro já excluído. Atualize a página.");
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (moduleCode === "chamados" || moduleCode === "etiquetas") {
    revalidatePath(operationalRecordModule(moduleCode).path, "layout");
    revalidatePath("/", "layout");
    revalidatePath("/relatorios", "layout");
  } else revalidateMonthlyPeriod(moduleCode);
}
