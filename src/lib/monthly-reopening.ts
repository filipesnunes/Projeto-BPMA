import "server-only";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import type { AuthenticatedUser } from "@/lib/auth-session";
import { getAppNow } from "@/lib/date-time";
import { getOperationalSignatureModule, type OperationalSignatureModuleCode } from "@/lib/module-signatures";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function findLegacyMonthlyClosure(
  code: OperationalSignatureModuleCode, mes: number, ano: number,
  db: Prisma.TransactionClient = prisma
) {
  const where = { mes_ano: { mes, ano } };
  switch (code) {
    case "hortifruti": return db.higienizacaoHortifrutiFechamento.findUnique({ where });
    case "temperatura": return db.controleTemperaturaEquipamentoFechamento.findUnique({ where });
    case "oleo": return db.controleQualidadeOleoFechamento.findUnique({ where });
    case "amostras": return db.controleBuffetAmostraFechamento.findUnique({ where });
    case "rastreabilidade": return db.rastreabilidadeRecebimentoFechamento.findUnique({ where });
    case "limpeza_diaria": case "limpeza_semanal":
      return db.planoLimpezaFechamento.findUnique({ where: { tipo_mes_ano: {
        tipo: code === "limpeza_diaria" ? "DIARIO" : "SEMANAL", mes, ano
      } } });
  }
}

async function openLegacyClosure(db: Prisma.TransactionClient, code: OperationalSignatureModuleCode, id: number) {
  const args = { where: { id }, data: { status: "ABERTO" as const } };
  switch (code) {
    case "hortifruti": return db.higienizacaoHortifrutiFechamento.update(args);
    case "temperatura": return db.controleTemperaturaEquipamentoFechamento.update(args);
    case "oleo": return db.controleQualidadeOleoFechamento.update(args);
    case "amostras": return db.controleBuffetAmostraFechamento.update(args);
    case "rastreabilidade": return db.rastreabilidadeRecebimentoFechamento.update(args);
    case "limpeza_diaria": case "limpeza_semanal": return db.planoLimpezaFechamento.update(args);
  }
}

export async function reopenOperationalMonth(params: {
  user: AuthenticatedUser; moduleCode: OperationalSignatureModuleCode; mes: number; ano: number;
}) {
  const { user, moduleCode, mes, ano } = params;
  const config = getOperationalSignatureModule(moduleCode);
  if (user.perfil !== "DEV" || !hasPermission(user, `${config.permissionPrefix}.reabrir_mes`)) {
    throw new Error("Apenas o usuário DEV pode reabrir meses.");
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(ano) || ano < 2020 || ano > 2100) {
    throw new Error("Informe um mês e ano válidos para reabertura.");
  }

  await prisma.$transaction(async (tx) => {
    const generic = await tx.fechamentoMensalModulo.findUnique({ where: {
      moduloCodigo_ano_mes: { moduloCodigo: moduleCode, ano, mes }
    } });
    const legacy = await findLegacyMonthlyClosure(moduleCode, mes, ano, tx);
    if (!generic && legacy?.status !== "ASSINADO") {
      throw new Error(`O mês ${String(mes).padStart(2, "0")}/${ano} não está fechado.`);
    }

    // Archive the entire previous closure before removing its active marker.
    // Existing signature logs, daily signatures and operational records remain intact.
    await tx.logAssinatura.create({ data: {
      usuarioId: user.id, nomeUsuario: user.nomeUsuario, nomeCompleto: user.nomeCompleto,
      perfil: user.perfil, tipo: "FECHAMENTO_MENSAL", modulo: moduleCode,
      referenciaId: `${String(mes).padStart(2, "0")}/${ano}`, assinadoEm: getAppNow(),
      observacao: JSON.stringify({ operacao: "REABERTURA_MENSAL", modulo: moduleCode, mes, ano,
        fechamentoGenericoAnterior: generic, fechamentoEspecificoAnterior: legacy,
        assinaturasDiariasPreservadas: true })
    } });
    if (legacy?.status === "ASSINADO") await openLegacyClosure(tx, moduleCode, legacy.id);
    if (generic) await tx.fechamentoMensalModulo.delete({ where: { id: generic.id } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidatePath(config.historyPath);
  revalidatePath(config.historyPath.replace(/\/historico$/, ""));
  revalidatePath("/");
  revalidatePath("/api/dashboard/insights");
  revalidatePath("/api/dashboard/details");
  revalidatePath("/relatorios", "layout");
}
