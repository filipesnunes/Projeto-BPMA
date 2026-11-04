import "server-only";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "./auth-session";
import { prisma } from "./prisma";
import { getAppDate, getAppNow, formatAppDateInput } from "./date-time";
import type { OperationalSignatureModuleCode } from "./module-signatures";
import { isOperationalMonthClosed } from "./monthly-reopening";
import { canReviewRetroactively, retroactiveReviewNature } from "./retroactive-review-permissions";
import { verifyPassword } from "./password";
import { refreshWorkflowActor, temperatureSignatureBridge } from "@/app/controle-temperatura-equipamentos/workflow-adapter";
import { oilSignatureBridge } from "@/app/controle-qualidade-oleo/workflow-adapter";
import { oilExecutionEvidence } from "@/app/controle-qualidade-oleo/signature-policy";
import { groupSignatureBridge } from "./operational-workflow/group-signatures";
import { signWorkflow, type WorkflowSignatureBridge } from "./operational-workflow/service";
import { buffetAuthorshipReservations } from "@/app/controle-buffet-amostras/authorship";
import { legacyReviewScope } from "./legacy-review-scope";
import { isNonTechnicalRetroactive, retroactiveNature } from "./review-presentation";

export type RetroactiveScope = { module: OperationalSignatureModuleCode; date: Date; flowId?: string; recordIds?: number[]; legacyRecordId?: number };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const versioned = (module: OperationalSignatureModuleCode) => ["oleo", "temperatura", "amostras", "rastreabilidade"].includes(module);
function domainBridge(module: OperationalSignatureModuleCode): WorkflowSignatureBridge {
  if (module === "oleo") return oilSignatureBridge("", false);
  if (module === "temperatura") return temperatureSignatureBridge("", false);
  if (module === "amostras" || module === "rastreabilidade") return groupSignatureBridge(module, module === "amostras" ? "SERVICO" : "DIARIA", "");
  throw Error("Módulo sem fluxo versionado.");
}

// Shared by the preview and by the transaction. No authorization is inferred from UI state.
export async function retroactiveReviewScope(tx: Prisma.TransactionClient, user: AuthenticatedUser, scope: RetroactiveScope) {
  const warnings: string[] = [];
  let reason = "";
  if (!canReviewRetroactively(user, scope.module)) reason = `É necessária a permissão modulo.${scope.module}.assinar_retroativo e acesso ao módulo.`;
  if (scope.date >= getAppDate()) reason ||= "A assinatura retroativa é exclusiva de datas anteriores ao dia atual.";
  if (await isOperationalMonthClosed(scope.module, scope.date.getUTCMonth() + 1, scope.date.getUTCFullYear(), tx)) reason ||= "Competência fechada. Solicite a reabertura mensal autorizada.";
  if (scope.legacyRecordId) {
    if (!["oleo","temperatura"].includes(scope.module) || scope.flowId || scope.recordIds?.length) throw Error("Seleção legada inválida.");
    const record=scope.module==="oleo" ? await tx.controleQualidadeOleoRegistro.findUniqueOrThrow({where:{id:scope.legacyRecordId}}) : await tx.controleTemperaturaEquipamento.findUniqueOrThrow({where:{id:scope.legacyRecordId}});
    if(record.excluidoEm || record.fluxoId || +record.data!==+scope.date) throw Error("O registro legado mudou. Recarregue sua consulta.");
    const daily=await tx.assinaturaDiariaModulo.findUnique({where:{moduloCodigo_dataReferencia:{moduloCodigo:scope.module,dataReferencia:scope.date}}});
    if(daily || ("assinaturaSupervisorEm" in record ? record.assinaturaSupervisorEm || record.assinaturaSupervisorUsuarioId || record.assinaturaSupervisorNome : record.assinaturaNutricionistaDataHora)) reason ||= "O registro já possui assinatura vigente.";
    if("semUtilizacao" in record ? !record.semUtilizacao && record.temperatura===null : record.statusOperacionalEquipamento==="EM_OPERACAO" && record.temperaturaAferida===null) reason ||= "Procedimento sem aferição persistida. A revisão não pode inventar uma execução.";
    warnings.push("Registro anterior ao versionamento: autoria original não comprovada. Será preservada uma cópia integral do registro antes da revisão, com vínculo criado na data atual.");
    warnings.push("Esta assinatura registra a revisão presente, sem atestar presença na execução histórica.");
    return {allowed:!reason,reason,warnings,token:digest(record),version:0,records:JSON.parse(JSON.stringify(record)) as Prisma.JsonValue,rows:[] as Awaited<ReturnType<typeof legacyReviewScope>>["rows"]};
  }
  if (versioned(scope.module)) {
    if (!scope.flowId) throw Error("Selecione um registro ou serviço específico.");
    const unit = await tx.fluxoOperacional.findUniqueOrThrow({ where: { id: scope.flowId }, include: {
      versoes: { orderBy: { versao: "asc" } }, eventos: { orderBy: { id: "asc" } }, amostras: { where: { excluidoEm: null }, orderBy: { id: "asc" } }, oleo: true, assinaturaVigente: true
    } });
    if (unit.modulo !== scope.module || +unit.dataReferencia !== +scope.date || unit.excluidoEm) throw Error("Escopo inválido para esta revisão.");
    const technicalUpgrade = unit.estado === "FECHADO" && isNonTechnicalRetroactive(unit.assinaturaVigente?.mecanismo) && retroactiveReviewNature(user) === "Revisão técnica retroativa";
    if (unit.assinaturaVigenteId && !technicalUpgrade || !["COMPLETO", "REABERTO"].includes(unit.estado) && !technicalUpgrade) reason ||= "Registro já assinado ou com preenchimento pendente.";
    if (technicalUpgrade) warnings.push("A revisão técnica complementa a revisão anterior, que permanece preservada na auditoria.");
    const bridge = domainBridge(scope.module);
    let content: Awaited<ReturnType<typeof bridge.validate>> | undefined;
    try { content = await bridge.validate(tx, unit); } catch (error) { reason ||= error instanceof Error ? error.message : "Dados incompletos."; }
    const current = unit.versoes.find(v => v.versao === unit.versao);
    if (!unit.preenchimentoCompleto || !current?.completo || !content?.complete || !isDeepStrictEqual(current.dados, content.snapshot) || !isDeepStrictEqual(current.rascunho, content.draft)) reason ||= "Versão incompleta ou divergente dos registros persistidos. Solicite conferência; não altere aferições para liberar a assinatura.";
    if (scope.module === "amostras") {
      warnings.push(...buffetAuthorshipReservations(unit, user.id));
      const notServed = unit.amostras.filter(r => r.status === "NAO_SERVIDO");
      if (notServed.length) warnings.push(`${notServed.length} item(ns) Não servido: declaração de não execução; não representam aferições realizadas.`);
    } else if (scope.module === "oleo" && unit.oleo) {
      const evidence = await oilExecutionEvidence(tx, unit.oleo, unit.versao);
      if (!evidence.proven) warnings.push("Autoria original inconclusiva. Esta revisão não comprova quem executou a aferição.");
      if (evidence.participantIds.includes(user.id)) warnings.push("O revisor participou do preenchimento ou de correções anteriores.");
    } else {
      if (unit.eventos.some(e => e.operacao === "VINCULO_LEGADO")) warnings.push("Registro legado: evidência de autoria original limitada.");
      if (unit.versoes.some(v => v.usuarioId === user.id)) warnings.push("O revisor participou de versões anteriores.");
    }
    warnings.push("A revisão é realizada agora e não atesta presença do revisor na execução histórica.");
    return { allowed: !reason, reason, warnings, token: digest({ unit, content }), version: unit.versao, records: current?.dados ?? null, rows: [] as Awaited<ReturnType<typeof legacyReviewScope>>["rows"] };
  }
  const all = await legacyReviewScope(tx, scope.module, scope.date);
  const rows = scope.recordIds?.length ? all.rows.filter(r => scope.recordIds!.includes(r.id)) : all.rows;
  let currentDay: Awaited<ReturnType<typeof tx.assinaturaDiariaModulo.findUnique>> = null;
  if (!rows.length || scope.recordIds && new Set(scope.recordIds).size !== rows.length) reason ||= "Seleção de registros inválida ou vazia.";
  if (scope.module === "hortifruti") {
    if (scope.recordIds?.length) reason ||= "A revisão de Hortifruti abrange o dia completo.";
    currentDay = await tx.assinaturaDiariaModulo.findUnique({ where: { moduloCodigo_dataReferencia: { moduloCodigo: scope.module, dataReferencia: scope.date } } });
    const nature = retroactiveNature(currentDay?.observacao);
    if (currentDay && !(nature && nature !== "Revisão técnica retroativa" && retroactiveReviewNature(user) === "Revisão técnica retroativa")) reason ||= "Este dia já possui revisão vigente.";
  } else {
    for (const row of rows) {
      if (!("assinaturaResponsavel" in row)) continue;
      if (!row.assinaturaResponsavel.trim() || !["AGUARDANDO_SUPERVISOR", "CONCLUIDO"].includes(row.status)) reason ||= "Há atividades sem execução assinada. A revisão não pode criar assinaturas de executores.";
      const nature = retroactiveNature(row.observacaoSupervisor);
      if (row.assinaturaSupervisor.trim() && !(nature && nature !== "Revisão técnica retroativa" && retroactiveReviewNature(user) === "Revisão técnica retroativa")) reason ||= "A seleção contém atividade já supervisionada. Selecione somente pendências.";
      if (!row.assinaturaResponsavelUsuarioId) warnings.push(`Registro #${row.id}: executor histórico sem identificação completa.`);
      if (row.assinaturaResponsavelUsuarioId === user.id) warnings.push(`Registro #${row.id}: o revisor participou da execução.`);
    }
  }
  warnings.push("A revisão é realizada agora e não altera os responsáveis nem as datas operacionais originais.");
  return { allowed: !reason, reason, warnings, token: digest({ rows, currentDay }), version: 0, records: JSON.parse(JSON.stringify(rows)) as Prisma.JsonValue, rows };
}

export async function signRetroactiveReview(params: { authenticated: AuthenticatedUser; scope: RetroactiveScope; token: string; password: string; justification: string; confirmed: boolean }) {
  if (!params.confirmed) throw Error("Confirme explicitamente a revisão e suas ressalvas.");
  if (!params.justification.trim() || params.justification.trim().length > 4000) throw Error("Informe a justificativa da revisão (até 4000 caracteres).");
  const { scope } = params;
  const check = async (tx: Prisma.TransactionClient, user: AuthenticatedUser) => {
    const review = await retroactiveReviewScope(tx, user, scope);
    if (!review.allowed) throw Error(review.reason);
    if (!params.token || params.token !== review.token) throw Error("O conteúdo ou a situação mudou. Recarregue a revisão antes de assinar.");
    const credentials = await tx.usuario.findUniqueOrThrow({ where: { id: user.id }, select: { senhaHash: true } });
    if (!params.password || !verifyPassword(params.password, credentials.senhaHash)) throw Error("Senha inválida para assinatura.");
    return review;
  };
  const audit = (user: AuthenticatedUser, review: Awaited<ReturnType<typeof check>>) => ({
    operacao: "REVISAO_RETROATIVA", natureza: retroactiveReviewNature(user), ressalvas: review.warnings,
    justificativa: params.justification.trim(), permissao: `modulo.${scope.module}.assinar_retroativo`,
    escopo: params.token, dataOperacional: formatAppDateInput(scope.date), fluxoId: scope.flowId,
    versao: review.version, registroLegado:scope.legacyRecordId, registros: review.rows.map(r => r.id), confirmacaoExplicita: true
  });
  if (versioned(scope.module)) {
    const initial = await retroactiveReviewScope(prisma, params.authenticated, scope);
    const bridge = domainBridge(scope.module);
    let prepared: Awaited<ReturnType<typeof check>> | undefined;
    const legacyOil = await import("@/app/controle-qualidade-oleo/legacy-workflow");
    const legacyTemperature = await import("@/app/controle-temperatura-equipamentos/legacy-workflow");
    const flowId=scope.legacyRecordId ? (scope.module==="oleo"?legacyOil.legacyOilFlowId(scope.legacyRecordId):legacyTemperature.legacyTemperatureFlowId(scope.legacyRecordId)) : scope.flowId!;
    return signWorkflow({ actor: tx => refreshWorkflowActor(tx, params.authenticated), scope: [{ id: flowId, version: scope.legacyRecordId?1:initial.version }],
      prepare:scope.legacyRecordId?async(tx,user)=>{
        prepared=await check(tx,user);
        const source=prepared.records as Prisma.JsonObject;
        const adopt=scope.module==="oleo"?legacyOil.adoptLegacyOil:legacyTemperature.adoptLegacyTemperature;
        await adopt(tx,user,scope.legacyRecordId!,String(source.updatedAt),"sign");
      }:undefined,
      bridge: {
      ...bridge, mechanism: user => `${retroactiveReviewNature(user)} com ressalvas`,
      async canReplaceSignature(tx, user) { return (await retroactiveReviewScope(tx, user, scope)).allowed; },
      async sign(tx, user, units, signedAt) {
        const review = prepared ?? await check(tx, user);
        const evidence = audit(user, review);
        const log = await tx.logAssinatura.create({ data: { usuarioId: user.id, nomeUsuario: user.nomeUsuario, nomeCompleto: user.nomeCompleto, perfil: user.perfil,
          tipo: evidence.natureza === "Revisão técnica retroativa" ? "RESPONSAVEL_TECNICO" : "SUPERVISOR", modulo: scope.module,
          referenciaId: formatAppDateInput(scope.date), assinadoEm: signedAt, observacao: JSON.stringify(evidence) } });
        await tx.fluxoEvento.create({ data: { fluxoId: units[0].id, operacao: "REVISAO_RETROATIVA", estadoAnterior: units[0].estado, estadoNovo: units[0].estado,
          versaoAnterior: units[0].versao, versaoNova: units[0].versao, usuarioId: user.id, usuarioNome: user.nomeCompleto, usuarioPerfil: user.perfil, justificativa: JSON.stringify(evidence) } });
        return `log:${log.id}`;
      }
    } });
  }
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scope.module}),17326)`;
    const user = await refreshWorkflowActor(tx, params.authenticated);
    const review = await check(tx, user), evidence = audit(user, review), signedAt = getAppNow();
    if (scope.module === "hortifruti") {
      const data = { usuarioId: user.id, usuarioNomeSnapshot: user.nomeCompleto, usuarioPerfilSnapshot: user.perfil, responsavelTecnico: evidence.natureza === "Revisão técnica retroativa", assinadoEm: signedAt, observacao: JSON.stringify(evidence) };
      await tx.assinaturaDiariaModulo.upsert({ where: { moduloCodigo_dataReferencia: { moduloCodigo: scope.module, dataReferencia: scope.date } }, create: { moduloCodigo: scope.module, dataReferencia: scope.date, ...data }, update: data });
    } else {
      for (const row of review.rows) {
        if (!("assinaturaSupervisor" in row)) throw Error("Atividade incompatível com a revisão selecionada.");
        const data = { assinaturaSupervisor: user.nomeCompleto, assinaturaSupervisorUsuarioId: user.id, assinaturaSupervisorNomeUsuario: user.nomeUsuario,
          assinaturaSupervisorPerfil: user.perfil, assinaturaSupervisorDataHora: signedAt, status: "CONCLUIDO" as const, observacaoSupervisor: JSON.stringify(evidence) };
        const where = { id: row.id, updatedAt: row.updatedAt, assinaturaSupervisor: row.assinaturaSupervisor };
        if (scope.module === "limpeza_diaria") await tx.planoLimpezaDiarioRegistro.update({ where, data });
        else await tx.planoLimpezaSemanalExecucao.update({ where, data });
      }
    }
    await tx.logAssinatura.create({ data: { usuarioId: user.id, nomeUsuario: user.nomeUsuario, nomeCompleto: user.nomeCompleto, perfil: user.perfil,
      tipo: evidence.natureza === "Revisão técnica retroativa" ? "RESPONSAVEL_TECNICO" : "SUPERVISOR", modulo: scope.module,
      referenciaId: formatAppDateInput(scope.date), assinadoEm: signedAt, observacao: JSON.stringify(evidence) } });
    return { assinadoEm: signedAt, usuarioNome: user.nomeCompleto };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
