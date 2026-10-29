import "server-only";
import { Prisma, type FluxoOperacional } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth-session";
import { getAppDate, getAppNow } from "@/lib/date-time";
import { isOperationalMonthClosed } from "@/lib/monthly-reopening";
import type { OperationalSignatureModuleCode } from "@/lib/module-signatures";
import { prisma } from "@/lib/prisma";
import { assertWorkflowContent, type WorkflowAdapter, type WorkflowContent } from "./contracts";
import { assertWorkflowAccess, assertWorkflowEdit, assertWorkflowReopen, assertWorkflowVersion, stateAfterSave, WORKFLOW_STATES, type WorkflowState } from "./policy";

type Tx = Prisma.TransactionClient;
type Actor = (tx: Tx) => Promise<AuthenticatedUser>;
type Preparation = (tx: Tx, user: AuthenticatedUser) => Promise<void | { legacySignaturePreserved: true }>;
const author = (user: AuthenticatedUser) => ({ usuarioId: user.id, usuarioNome: user.nomeCompleto, usuarioPerfil: user.perfil });

function state(value: string): WorkflowState {
  if (!WORKFLOW_STATES.includes(value as WorkflowState)) throw new Error("Estado operacional inválido.");
  return value as WorkflowState;
}

async function lock(tx: Tx, module: OperationalSignatureModuleCode) {
  // Same lock/order as monthly closing and controlled deletion.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${module}), 17326)`;
}

async function openPeriod(tx: Tx, module: OperationalSignatureModuleCode, date: Date) {
  if (await isOperationalMonthClosed(module, date.getUTCMonth() + 1, date.getUTCFullYear(), tx)) {
    throw new Error("A competência está fechada. Reabra o mês antes de alterar o registro.");
  }
}

async function event(tx: Tx, unit: FluxoOperacional, user: AuthenticatedUser, operation: string,
  previous: FluxoOperacional | null, signatureId?: string | null, reason?: string) {
  await tx.fluxoEvento.create({ data: {
    fluxoId: unit.id, operacao: operation, estadoAnterior: previous?.estado ?? null,
    estadoNovo: unit.estado, versaoAnterior: previous?.versao ?? null, versaoNova: unit.versao,
    assinaturaId: signatureId, justificativa: reason, ...author(user)
  } });
}

async function revision(tx: Tx, unit: FluxoOperacional, content: WorkflowContent, user: AuthenticatedUser) {
  assertWorkflowContent(content);
  await tx.fluxoVersao.create({ data: {
    fluxoId: unit.id, versao: unit.versao, dados: content.snapshot, rascunho: content.draft,
    completo: content.complete, resolvidos: content.resolved, obrigatorios: content.required, ...author(user)
  } });
}

// Internal server API: callers supply a server-owned adapter and authenticate
// inside the transaction. No public action accepts an adapter or completion flag.
export async function saveWorkflow(params: {
  actor: Actor; adapter: WorkflowAdapter; key: string; expectedVersion: number; input: unknown; prepare?: Preparation;
}) {
  const { adapter, key } = params;
  return prisma.$transaction(async tx => {
    await lock(tx, adapter.module);
    const user = await params.actor(tx);
    assertWorkflowAccess(user, adapter.module);
    await params.prepare?.(tx, user);
    const original = await tx.fluxoOperacional.findUnique({ where: { modulo_chave: { modulo: adapter.module, chave: key } } });
    assertWorkflowVersion(original?.versao ?? 0, params.expectedVersion);
    if (original?.excluidoEm) throw new Error("Registro excluído.");
    const source = await adapter.load(tx, key);
    // Enrolling an existing record needs a separately reviewed legacy adapter;
    // do not silently infer a signed version from its current content.
    if (!original && source.legacy) throw new Error("Registro legado: preserve o fluxo histórico até definir o vínculo de validação.");
    const date = original?.dataReferencia ?? source.date;
    if (date.getTime() !== source.date.getTime()) throw new Error("A data de referência foi alterada. Recarregue os dados.");
    await openPeriod(tx, adapter.module, date);
    if (adapter.authorizeSave) adapter.authorizeSave(user, params.input, { date, today: getAppDate(), creating: !original });
    else assertWorkflowEdit({ user, module: adapter.module, date, today: getAppDate(), creating: !original });
    if (original?.estado === "FECHADO") throw new Error("Registro fechado. Confirme a reabertura antes de editar.");
    const initial = original ?? await tx.fluxoOperacional.create({ data: { modulo: adapter.module, chave: key, dataReferencia: date } });
    const content = await adapter.save(tx, key, params.input, user, initial);
    assertWorkflowContent(content);
    const nextState = stateAfterSave(original ? state(original.estado) : "PENDENTE", content.complete);
    const unit = await tx.fluxoOperacional.update({ where: { id: initial.id, versao: initial.versao }, data: {
      ...(original ? { versao: { increment: 1 } } : {}), estado: nextState, preenchimentoCompleto: content.complete
    } });
    await revision(tx, unit, content, user);
    await event(tx, unit, user, original ? "SALVAMENTO" : "CRIACAO", original);
    if (content.complete && (!original || original.estado === "PENDENTE")) {
      await event(tx, unit, user, "CONCLUSAO_PREENCHIMENTO", original);
    }
    return unit;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function reopenWorkflow(params: {
  actor: Actor; module: OperationalSignatureModuleCode; id: string; expectedVersion: number;
  reason: string; fromEdit: boolean; prepare?: Preparation;
}) {
  return prisma.$transaction(async tx => {
    await lock(tx, params.module);
    const user = await params.actor(tx);
    assertWorkflowAccess(user, params.module);
    const evidence = await params.prepare?.(tx, user);
    const original = await tx.fluxoOperacional.findUnique({ where: { id: params.id, modulo: params.module } });
    if (!original || original.excluidoEm) throw new Error("Registro operacional não encontrado.");
    assertWorkflowVersion(original.versao, params.expectedVersion);
    await openPeriod(tx, params.module, original.dataReferencia);
    assertWorkflowReopen({ user, module: params.module, date: original.dataReferencia, today: getAppDate(),
      state: evidence?.legacySignaturePreserved && ["temperatura","oleo"].includes(params.module) && /^legacy:\d+$/.test(original.chave) ? "FECHADO" : state(original.estado), reason: params.reason, fromEdit: params.fromEdit });
    const previousContent = await tx.fluxoVersao.findUniqueOrThrow({ where: { fluxoId_versao: { fluxoId: original.id, versao: original.versao } } });
    const unit = await tx.fluxoOperacional.update({ where: { id: original.id, versao: original.versao }, data: {
      estado: "REABERTO", versao: { increment: 1 }, assinaturaVigenteId: null
    } });
    await revision(tx, unit, { snapshot: previousContent.dados as Prisma.InputJsonObject,
      draft: previousContent.rascunho as Prisma.InputJsonObject, complete: previousContent.completo,
      resolved: previousContent.resolvidos, required: previousContent.obrigatorios }, user);
    await event(tx, unit, user, "INVALIDACAO_VIGENCIA", original, original.assinaturaVigenteId, params.reason.trim());
    await event(tx, unit, user, "REABERTURA", original, original.assinaturaVigenteId, params.reason.trim());
    return unit;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export type WorkflowSignatureBridge = {
  module: OperationalSignatureModuleCode;
  mechanism: string;
  // Must validate the original mechanism's permission/password, separation of
  // duties and exact displayed scope; must write its legacy signature using tx.
  sign(tx: Tx, user: AuthenticatedUser, units: readonly FluxoOperacional[], signedAt: Date): Promise<string>;
  // Revalidate the actual domain data in this transaction, not a UI boolean.
  validate(tx: Tx, unit: FluxoOperacional): Promise<WorkflowContent>;
};

export async function signWorkflow(params: {
  actor: Actor; bridge: WorkflowSignatureBridge; scope: readonly { id: string; version: number }[]; prepare?: Preparation;
}) {
  const { bridge, scope } = params;
  if (!scope.length || new Set(scope.map(item => item.id)).size !== scope.length) throw new Error("Selecione um conjunto válido de registros para assinar.");
  return prisma.$transaction(async tx => {
    await lock(tx, bridge.module);
    const user = await params.actor(tx);
    assertWorkflowAccess(user, bridge.module);
    await params.prepare?.(tx, user);
    const originals: FluxoOperacional[] = [];
    for (const item of scope) {
      const unit = await tx.fluxoOperacional.findUnique({ where: { id: item.id, modulo: bridge.module } });
      if (!unit || unit.excluidoEm) throw new Error("Registro operacional não encontrado.");
      assertWorkflowVersion(unit.versao, item.version);
      if (!["COMPLETO", "REABERTO"].includes(unit.estado)) throw new Error("O registro não está disponível para assinatura.");
      await openPeriod(tx, bridge.module, unit.dataReferencia);
      const content = await bridge.validate(tx, unit);
      assertWorkflowContent(content);
      if (!content.complete) throw new Error("Resolva os campos obrigatórios antes da assinatura.");
      const stored = await tx.fluxoVersao.findUniqueOrThrow({ where: { fluxoId_versao: { fluxoId: unit.id, versao: unit.versao } } });
      if (!stored.completo || canonical(stored.dados) !== canonical(content.snapshot) || canonical(stored.rascunho) !== canonical(content.draft)) {
        throw new Error("O conteúdo mudou desde o último salvamento. Recarregue e salve antes de assinar.");
      }
      originals.push(unit);
    }
    const signedAt = getAppNow();
    const reference = await bridge.sign(tx, user, originals, signedAt);
    const signature = await tx.fluxoAssinatura.create({ data: {
      modulo: bridge.module, mecanismo: bridge.mechanism, referencia: reference, assinadoEm: signedAt, ...author(user)
    } });
    for (const original of originals) {
      await tx.fluxoAssinaturaVinculo.create({ data: { assinaturaId: signature.id, fluxoId: original.id, versao: original.versao } });
      const unit = await tx.fluxoOperacional.update({ where: { id: original.id, versao: original.versao }, data: {
        estado: "FECHADO", assinaturaVigenteId: signature.id
      } });
      await event(tx, unit, user, original.estado === "REABERTO" ? "NOVA_ASSINATURA" : "ASSINATURA", original, signature.id);
      await event(tx, unit, user, "FECHAMENTO", original, signature.id);
    }
    return signature;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export async function assertNoReopenedWorkflow(tx: Tx, module: OperationalSignatureModuleCode, start: Date, end: Date) {
  const pending = await tx.fluxoOperacional.findMany({ where: {
    modulo: module, estado: "REABERTO", excluidoEm: null, dataReferencia: { gte: start, lt: end }
  }, select: { chave: true }, take: 20 });
  if (pending.length) throw new Error(`Existem registros reabertos aguardando nova assinatura: ${pending.map(item => item.chave).join(", ")}.`);
}
