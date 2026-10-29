import "server-only";
import { Prisma, type ControleQualidadeOleoRegistro } from "@prisma/client";
import type { WorkflowAdapter, WorkflowContent } from "@/lib/operational-workflow/contracts";
import type { WorkflowSignatureBridge } from "@/lib/operational-workflow/service";
import { formatAppDateInput, getAppDate, parseAppDateInput } from "@/lib/date-time";
import { readExecutionTime } from "@/lib/procedure-time";
import { hasPermission } from "@/lib/permissions";
import { canSignModuleDay } from "@/lib/module-signatures";
import { verifyPassword } from "@/lib/password";
import { getRegistroPayload, preserveOilStrip } from "./record-payload";
import { oilCorrectionAudit } from "./correction-audit";
export { refreshWorkflowActor } from "../controle-temperatura-equipamentos/workflow-adapter";
export type OilDraft = Record<string,string>;
export function parseOilKey(key: string) {
  const match = /^(\d{4}-\d{2}-\d{2}):([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.exec(key);
  const date = match && parseAppDateInput(match[1]);
  if (!date) throw new Error("Identificação da verificação inválida.");
  return { date };
}
export function oilSnapshot(record: ControleQualidadeOleoRegistro): Prisma.InputJsonObject {
  const { assinaturaSupervisorUsuarioId, assinaturaSupervisorNome, assinaturaSupervisorPerfil, assinaturaSupervisorEm, updatedAt, ...content } = record;
  void assinaturaSupervisorUsuarioId; void assinaturaSupervisorNome; void assinaturaSupervisorPerfil; void assinaturaSupervisorEm; void updatedAt;
  return JSON.parse(JSON.stringify(content));
}
export const oilAdapter: WorkflowAdapter = {
  module: "oleo",
  async load(tx, key) {
    if (/^legacy:\d+$/.test(key)) {
      const record=await tx.controleQualidadeOleoRegistro.findFirst({where:{fluxo:{modulo:"oleo",chave:key},excluidoEm:null}});
      if(!record)throw Error("Registro legado indisponível.");
      return {date:record.data,legacy:false,content:{snapshot:{},draft:{},complete:false,resolved:0,required:1}};
    }
    return { date: parseOilKey(key).date, legacy: false, content: { snapshot:{}, draft:{}, complete:false, resolved:0, required:1 } };
  },
  async save(tx, key, input, user, unit) {
    if (!(input instanceof FormData)) throw new Error("Formulário inválido.");
    const previous = await tx.fluxoOperacional.findUniqueOrThrow({where:{id:unit.id},include:{oleo:true,versoes:{orderBy:{versao:"desc"},take:1}}});
    const date=previous.oleo?.data??parseOilKey(key).date;
    const form = preserveOilStrip(input, previous.oleo);
    const previousDraft = previous.versoes[0]?.rascunho as OilDraft | undefined;
    if(previous.oleo) {
      for(const field of ["temperatura","semUtilizacao","observacao"] as const)if(!form.has(field))form.set(field,String(previous.oleo[field]??""));
      // Corrections cannot rewrite the original execution time or responsible.
      form.set("horarioExecucao",previous.oleo.horarioExecucao??"");form.set("horarioNaoInformado",String(previous.oleo.horarioNaoInformado));form.set("justificativaHorario",previous.oleo.justificativaHorario??"");
    }
    if (!form.has("fitaOleo") && previousDraft?.fitaOleo) form.set("fitaOleo", previousDraft.fitaOleo);
    const draft: OilDraft = {};
    for (const field of ["temperatura","fitaOleo","semUtilizacao","observacao","horarioExecucao","horarioNaoInformado","justificativaHorario"]) {
      draft[field] = typeof form.get(field) === "string" ? String(form.get(field)).trim() : "";
      if (draft[field].length>4000) throw new Error("Texto excede 4000 caracteres.");
    }
    for(const field of ["registroLegadoOriginal","assinaturaDiariaOriginal"])if(previousDraft?.[field])draft[field]=previousDraft[field];
    const unused = draft.semUtilizacao === "true";
    const retro = formatAppDateInput(date) < formatAppDateInput(getAppDate());
    let complete = unused || Boolean(draft.temperatura);
    if (!previous.oleo && !unused && retro && !draft.horarioExecucao && draft.horarioNaoInformado !== "true") complete=false;
    if (!previous.oleo && !unused && draft.horarioNaoInformado === "true" && (!retro || !draft.justificativaHorario)) complete=false;
    if (!complete) {
      if(previous.oleo)throw Error("Informe uma temperatura válida ou confirme Sem utilização. Os dados salvos foram preservados.");
      if (form.get("intent") === "complete") throw new Error("Preencha os dados obrigatórios e o horário antes de concluir. É possível salvar o rascunho.");
      return {snapshot:{}, draft, complete:false,resolved:0,required:1};
    }
    const payload = await getRegistroPayload(form,previous.oleo?.responsavel??user.nomeCompleto,tx,previous.oleo);
    const time = previous.oleo ? {horarioExecucao:previous.oleo.horarioExecucao,horarioNaoInformado:previous.oleo.horarioNaoInformado,justificativaHorario:previous.oleo.justificativaHorario} : readExecutionTime(form,date,"",!unused);
    const data = {...payload,...time,data:date};
    const record = previous.oleo ? await tx.controleQualidadeOleoRegistro.update({where:{id:previous.oleo.id},data}) : await tx.controleQualidadeOleoRegistro.create({data:{...data,fluxoId:unit.id}});
    if(previous.oleo)await oilCorrectionAudit(tx,unit,user,previous.oleo,record);
    draft.horarioExecucao=time.horarioExecucao??"";
    return {snapshot:oilSnapshot(record),draft,complete:true,resolved:1,required:1};
  }
};
export function oilSignatureBridge(password: string, daily: boolean): WorkflowSignatureBridge {
  return {
    module: "oleo", mechanism: daily ? "ASSINATURA_DIARIA" : "REVISAO_INDIVIDUAL",
    async validate(tx, unit): Promise<WorkflowContent> {
      const source = await tx.fluxoOperacional.findUniqueOrThrow({ where: { id: unit.id }, include: {
        oleo: true, versoes: { where: { versao: unit.versao } }
      } });
      const version = source.versoes[0];
      if (!source.oleo || source.oleo.excluidoEm || !version?.completo) throw new Error("Verificação incompleta ou excluída.");
      return { snapshot: oilSnapshot(source.oleo), draft: version.rascunho as Prisma.InputJsonObject,
        complete: true, resolved: 1, required: 1 };
    },
    async sign(tx, user, units, signedAt) {
      if (daily ? !canSignModuleDay(user, "oleo") : !hasPermission(user, "modulo.oleo.assinar_historico")) throw new Error("Sem permissão para esta assinatura.");
      if (!daily && units.length !== 1) throw new Error("A revisão individual abrange uma única verificação.");
      const day = formatAppDateInput(units[0].dataReferencia);
      if (units.some(unit => formatAppDateInput(unit.dataReferencia) !== day)) throw new Error("A assinatura diária deve abranger uma única data.");
      const credentials = await tx.usuario.findUniqueOrThrow({ where: { id: user.id }, select: { senhaHash: true } });
      if (!password.trim() || !verifyPassword(password.trim(), credentials.senhaHash)) throw new Error("Senha inválida para confirmar a assinatura.");
      // Versioned daily scope lives in FluxoAssinatura; never create a blanket
      // legacy daily row that could implicitly validate unsigned legacy records.
      const log = await tx.logAssinatura.create({ data: { usuarioId: user.id, nomeUsuario: user.nomeUsuario,
        nomeCompleto: user.nomeCompleto, perfil: user.perfil, tipo: daily ? "RESPONSAVEL_TECNICO" : "SUPERVISOR",
        modulo: "oleo", referenciaId: day, assinadoEm: signedAt,
        observacao: JSON.stringify({ mecanismo: daily ? "DIARIA" : "INDIVIDUAL", unidades: units.map(u => ({ id: u.id, versao: u.versao })) }) } });
      return `log:${log.id}`;
    }
  };
}
