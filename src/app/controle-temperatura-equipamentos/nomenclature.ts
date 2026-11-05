import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth-session";
import { getAppNow, formatAppDateInput } from "@/lib/date-time";
import { assertWorkflowVersion } from "@/lib/operational-workflow/policy";
import { isOperationalMonthClosed } from "@/lib/monthly-reopening";
import { isNonTechnicalRetroactive } from "@/lib/review-presentation";
import { temperatureSnapshot, temperatureSnapshotDifferences, parseTemperatureKey, assertTemperatureSnapshotIntegrity } from "./snapshot-integrity";

export type TemperatureNameChange = { id: string; version: number; recordId: number; date: string; shift: string; before: string; after: string; catalogId: number | null; proven: boolean; token: string };
export type NameConfirmation = { confirmed?: boolean; tokens?: readonly string[]; replaceNonTechnical?: boolean };
type Scope = readonly { id: string; version: number }[];

export async function temperatureNameChanges(tx: Prisma.TransactionClient, scope: Scope): Promise<TemperatureNameChange[]> {
  const changes: TemperatureNameChange[] = [];
  for (const item of scope) {
    const unit = await tx.fluxoOperacional.findUniqueOrThrow({ where: { id: item.id }, include: { temperatura: true, versoes: { where: { versao: item.version } } } });
    if (unit.modulo !== "temperatura" || unit.excluidoEm || !unit.temperatura || unit.temperatura.excluidoEm) throw Error("Aferição indisponível. Atualize a consulta.");
    assertWorkflowVersion(unit.versao, item.version);
    const saved = unit.versoes[0], record = unit.temperatura;
    if (+unit.dataReferencia!==+record.data) throw Error("A data da aferição não coincide com a verificação. Confira o registro antes de assinar.");
    if (!saved?.completo || !unit.preenchimentoCompleto) throw Error(`A aferição #${record.id} está incompleta. Confira os campos antes de assinar.`);
    const snapshot = temperatureSnapshot(record), fields = temperatureSnapshotDifferences(saved.dados, snapshot);
    if (!fields.length) continue;
    if (fields.length !== 1 || fields[0] !== "equipamento") assertTemperatureSnapshotIntegrity(record, saved.dados, snapshot);
    const original = saved.dados as Prisma.JsonObject;
    if (typeof original.equipamento !== "string" || !original.equipamento.trim() || !record.equipamento.trim()) throw Error("O equipamento não está identificado. Confira a aferição antes de assinar.");
    let catalogId: number | null = null, proven = false;
    let identity: ReturnType<typeof parseTemperatureKey> | undefined;
    try { identity = parseTemperatureKey(unit.chave); } catch { /* Legacy keys need explicit confirmation. */ }
    if (identity) {
      const catalog = await tx.controleTemperaturaEquipamentoOpcao.findUnique({ where: { id: identity.equipmentId } });
      catalogId = catalog?.id ?? null;
      proven = Boolean(catalog?.tipo === "EQUIPAMENTO" && catalog.nome === record.equipamento && catalog.categoriaEquipamento === record.categoriaEquipamento
        && +identity.date === +record.data && identity.shift === record.turno && +unit.dataReferencia === +record.data
        && original.id === record.id && original.fluxoId === unit.id);
    }
    const token = createHash("sha256").update(JSON.stringify({ id: unit.id, version: unit.versao, saved: saved.dados, current: snapshot, catalogId, proven })).digest("hex");
    changes.push({ id: unit.id, version: unit.versao, recordId: record.id, date: formatAppDateInput(record.data), shift: record.turno, before: original.equipamento, after: record.equipamento, catalogId, proven, token });
  }
  return changes;
}

// Called only inside signWorkflow's existing locked transaction, after the
// appropriate normal/retroactive authorization and password checks.
export async function reconcileTemperatureNames(tx: Prisma.TransactionClient, user: AuthenticatedUser, scope: Scope, confirmation: NameConfirmation = {}) {
  const changes = await temperatureNameChanges(tx, scope);
  for (const item of scope) {
    const unit = await tx.fluxoOperacional.findUniqueOrThrow({ where: { id: item.id }, include: { assinaturaVigente: true } });
    if (!["COMPLETO", "REABERTO"].includes(unit.estado) && !(confirmation.replaceNonTechnical && unit.estado === "FECHADO" && isNonTechnicalRetroactive(unit.assinaturaVigente?.mecanismo))) throw Error("O registro não está disponível para assinatura. Atualize a consulta.");
    if (await isOperationalMonthClosed("temperatura", unit.dataReferencia.getUTCMonth() + 1, unit.dataReferencia.getUTCFullYear(), tx)) throw Error("A competência está fechada. Solicite a reabertura autorizada antes de assinar.");
  }
  for (const change of changes) if (!change.proven && (!confirmation.confirmed || !confirmation.tokens?.includes(`${change.id}:${change.version}:${change.token}`))) throw Error("É necessário confirmar a identificação do equipamento para assinar. Atualize a consulta, confira os dois nomes e confirme que se trata do mesmo equipamento físico.");
  const versions = new Map(scope.map(item => [item.id, item.version]));
  for (const change of changes) {
    const unit = await tx.fluxoOperacional.findUniqueOrThrow({ where: { id: change.id }, include: { temperatura: true, versoes: { where: { versao: change.version } } } });
    const saved = unit.versoes[0], next = change.version + 1;
    const evidence = JSON.stringify({ operacao: "RECONCILIACAO_NOMENCLATURA", campo: "equipamento", anterior: change.before, atual: change.after,
      equipamentoCadastroId: change.catalogId, comprovacao: change.proven ? "REFERENCIA_ESTAVEL_CADASTRO" : "CONFIRMACAO_EXPLICITA", confirmouIdentidade: !change.proven,
      escopo: change.token, execucaoHistoricaReatribuida: false });
    await tx.fluxoOperacional.update({ where: { id: unit.id, versao: change.version }, data: { versao: next, ...(unit.estado === "FECHADO" ? { estado: "REABERTO", assinaturaVigenteId: null } : {}) } });
    await tx.fluxoVersao.create({ data: { fluxoId: unit.id, versao: next, dados: temperatureSnapshot(unit.temperatura!), rascunho: saved.rascunho as Prisma.InputJsonObject,
      completo: saved.completo, resolvidos: saved.resolvidos, obrigatorios: saved.obrigatorios, usuarioId: user.id, usuarioNome: user.nomeCompleto, usuarioPerfil: user.perfil } });
    await tx.fluxoEvento.create({ data: { fluxoId: unit.id, operacao: "RECONCILIACAO_NOMENCLATURA", estadoAnterior: unit.estado, estadoNovo: unit.estado === "FECHADO" ? "REABERTO" : unit.estado,
      versaoAnterior: change.version, versaoNova: next, usuarioId: user.id, usuarioNome: user.nomeCompleto, usuarioPerfil: user.perfil, criadoEm: getAppNow(), justificativa: evidence } });
    versions.set(change.id, next);
  }
  return scope.map(item => ({ id: item.id, version: versions.get(item.id)! }));
}
