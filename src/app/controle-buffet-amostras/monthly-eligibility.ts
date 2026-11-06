import "server-only";
import { isDeepStrictEqual } from "node:util";
import type { Prisma, AssinaturaDiariaModulo } from "@prisma/client";
import { formatAppDateInput, formatAppDate } from "@/lib/date-time";
import { isNonTechnicalRetroactive, technicalReviewPending } from "@/lib/review-presentation";
import { buffetHistoryInclude, mergeBuffetWorkflowHistory, type BuffetHistoryFlow } from "./workflow-history";
import { buffetSnapshot, type BuffetDraft } from "./workflow-adapter";
import { buffetRecordValues } from "./row-save";
import { validateBuffetRow } from "./row-validation";

const recordInclude = { servico: { select: { nome:true, tipoServico:true, dataInicio:true, dataFim:true } } } satisfies Prisma.ControleBuffetAmostraRegistroInclude;
type RecordRow = Prisma.ControleBuffetAmostraRegistroGetPayload<{include:typeof recordInclude}>;
type Service = { id:number; nome:string; tipoServico:RecordRow["servico"]["tipoServico"] };
export type BuffetMonthlyIssue = { date:string; service:string; serviceId:number; item?:string; recordId?:number; reason:string; action:string; href:string };

function isTechnical(profile:string|null|undefined, observation?:string|null, mechanism?:string|null) {
  return profile === "NUTRICIONISTA" && !technicalReviewPending(observation) && !isNonTechnicalRetroactive(mechanism);
}

// One read-only interpretation for the history indicators and closing transaction.
// A status describes execution; signature evidence is evaluated at its own scope.
export function assessBuffetMonth(legacy:RecordRow[], flows:BuffetHistoryFlow[], daily:AssinaturaDiariaModulo[], services:Service[]) {
  const activeFlows=flows.filter(flow=>!flow.excluidoEm);
  const activeLegacy=legacy.filter(row=>!row.excluidoEm&&!row.fluxoId);
  const groups=mergeBuffetWorkflowHistory(activeLegacy,activeFlows,services);
  const days=new Map(daily.map(signature=>[formatAppDateInput(signature.dataReferencia),signature]));
  const results=groups.map(group=>{
    const issues:BuffetMonthlyIssue[]=[];
    const href=`/controle-buffet-amostras/servico/${group.servicoId}?data=${group.dataInput}#validacao-servico`;
    const issue=(reason:string,action:string,row?:{id:number;itemNome:string})=>issues.push({date:group.dataInput,service:group.servicoNome,serviceId:group.servicoId,item:row?.itemNome,recordId:row?.id,reason,action,href});
    const units=activeFlows.filter(flow=>`${formatAppDateInput(flow.dataReferencia)}:${Number(flow.chave.split(":")[0])}`===group.key);
    const unit=units[0], linked=unit?.amostras.filter(row=>!row.excluidoEm).sort((a,b)=>a.id-b.id)??[];
    const linkedIds=new Set(linked.flatMap(row=>row.itemId===null?[]:[row.itemId]));
    const old=activeLegacy.filter(row=>`${formatAppDateInput(row.data)}:${row.servicoId}`===group.key&&!linkedIds.has(row.itemId!));
    const rows=[...old,...linked];
    if(linked.some(row=>row.servicoId!==group.servicoId||+row.data!==+unit!.dataReferencia))issue("Há itens que não correspondem à data ou ao serviço consultado.","Solicite conferência da identificação dos itens, preservando as aferições.");
    if(units.length>1)issue("Mais de um serviço ativo representa esta data.","Solicite conferência dos serviços duplicados, preservando os registros.");
    const fixedIds=new Set<number>();
    let operationalComplete=group.status==="CONCLUIDO";
    for(const row of rows){
      if(!row.itemExtra&&row.itemId!==null){if(fixedIds.has(row.itemId))issue("Item duplicado no serviço.","Solicite conferência da duplicidade antes do fechamento.",row);fixedIds.add(row.itemId);}
      const missing=row.status==="PENDENTE"?["preenchimento não concluído"]:validateBuffetRow({nome:row.itemNome,classificacao:row.classificacao,usaGarrafaTermica:row.usaGarrafaTermica},buffetRecordValues(row));
      if(missing.length){operationalComplete=false;issue(`Item incompleto: ${missing.join(", ")}.`,"Complete e salve o item antes de validar o serviço.",row);}
    }
    if(!operationalComplete&&!issues.length)issue("Há itens previstos ainda não preenchidos.","Abra o serviço, preencha ou declare Não servido e salve os itens.");
    let managerial=false;
    if(unit){
      const signature=unit.assinaturaVigente,version=unit.versoes.find(v=>v.versao===unit.versao),draft=version?.rascunho as unknown as BuffetDraft|undefined;
      if(unit.estado==="REABERTO")issue("Serviço reaberto aguardando nova assinatura.","Confira o serviço e solicite nova validação técnica.");
      else if(unit.estado!=="FECHADO"||!signature)issue("Serviço sem assinatura técnica vigente.","Valide e assine o serviço completo.");
      else {
        managerial=isNonTechnicalRetroactive(signature.mecanismo);
        if(!isTechnical(signature.usuarioPerfil,undefined,signature.mecanismo))issue(managerial?"Revisão gerencial ou operacional não substitui a validação técnica.":"A assinatura não comprova validação técnica da nutricionista.","Solicite a revisão técnica da nutricionista autorizada.");
        if(signature.modulo!=="amostras"||!signature.vinculos?.some(link=>link.fluxoId===unit.id&&link.versao===unit.versao))issue("A assinatura não corresponde ao conteúdo atual do serviço.","Solicite conferência e nova validação técnica do serviço.");
        if(unit.eventos.some(event=>["REVOGACAO_ASSINATURA","INVALIDACAO_VIGENCIA"].includes(event.operacao)&&event.assinaturaId===signature.id))issue("A assinatura do serviço foi invalidada.","Solicite nova validação técnica do serviço.");
      }
      const snapshotRows=linked.map(({servico,...row})=>{void servico;return row;});
      const contentMatches=unit.preenchimentoCompleto&&version?.completo&&draft&&Array.isArray(draft.manifest)&&isDeepStrictEqual(version.dados,buffetSnapshot(snapshotRows,draft.manifest));
      if(!contentMatches)issue("O conteúdo salvo e a conferência do serviço não coincidem.","Solicite conferência do serviço antes de uma nova validação, sem alterar aferições para liberar o fechamento.");
      if(!contentMatches||unit.estado!=="FECHADO"||!signature?.vinculos?.some(link=>link.fluxoId===unit.id&&link.versao===unit.versao)||unit.eventos.some(event=>["REVOGACAO_ASSINATURA","INVALIDACAO_VIGENCIA"].includes(event.operacao)&&event.assinaturaId===signature?.id))managerial=false;
    }
    const day=days.get(group.dataInput);
    for(const row of old){
      const dailyCovered=day?.responsavelTecnico&&isTechnical(day.usuarioPerfilSnapshot,day.observacao)&&day.assinadoEm>=row.dataHoraRegistro;
      const individualCovered=row.assinaturaNutricionistaDataHora&&row.assinaturaNutricionistaNome?.trim()&&isTechnical(row.assinaturaNutricionistaPerfil)&&row.assinaturaNutricionistaDataHora>=row.dataHoraRegistro;
      if(!dailyCovered&&!individualCovered){
        managerial ||= Boolean(day&&technicalReviewPending(day.observacao));
        issue(day&&technicalReviewPending(day.observacao)?"Revisão gerencial não substitui assinatura técnica deste item legado.":"Item legado sem cobertura de assinatura técnica válida.","Solicite conferência da assinatura diária ou da revisão técnica autorizada deste legado.",row);
      }
    }
    const technical=operationalComplete&&!issues.length;
    // Presentation uses precisely the eligibility consumed by the closing backend.
    group.assinadoNutricionista=technical;
    if(!technical&&!managerial)group.supervisorSignature=undefined;
    if(technical&&!unit){
      const individualNames=[...new Set(old.map(row=>row.assinaturaNutricionistaNome).filter(Boolean))].join(", ");
      group.assinaturaNutricionistaResumo=day?.usuarioNomeSnapshot??individualNames;
      if(day)group.supervisorSignature={usuarioNomeSnapshot:day.usuarioNomeSnapshot,usuarioPerfilSnapshot:day.usuarioPerfilSnapshot,assinadoEm:day.assinadoEm,observacao:day.observacao};
    }
    group.status=operationalComplete?"CONCLUIDO":group.status==="CONCLUIDO"?"PARCIAL":group.status;
    return {key:group.key,date:group.dataInput,serviceId:group.servicoId,complete:operationalComplete,technical,managerial,issues,group};
  });
  const unmapped=activeFlows.filter(unit=>!results.some(service=>service.group.workflowId===unit.id));
  const unidentified:BuffetMonthlyIssue[]=unmapped.map(unit=>({date:formatAppDateInput(unit.dataReferencia),service:"Serviço sem identificação válida",serviceId:0,reason:"Não foi possível identificar o serviço desta data.",action:"Solicite conferência do vínculo com o cadastro antes do fechamento.",href:`/controle-buffet-amostras/historico?filtroData=${formatAppDateInput(unit.dataReferencia)}`}));
  const dates=[...new Set([...results.map(service=>service.date),...unidentified.map(issue=>issue.date)])];
  const signedDays=dates.filter(date=>!unidentified.some(issue=>issue.date===date)&&results.filter(s=>s.date===date).every(s=>s.technical));
  const completeDays=dates.filter(date=>!unidentified.some(issue=>issue.date===date)&&results.filter(s=>s.date===date).every(s=>s.complete));
  return {services:results,groups:results.map(s=>s.group),issues:[...results.flatMap(s=>s.issues),...unidentified],records:results.reduce((total,s)=>total+s.group.items.filter(row=>row.id>0).length,0),pending:results.filter(s=>!s.technical).length+unmapped.length,
    totalDays:dates.length,completeDays:completeDays.length,partialDays:dates.length-completeDays.length,signedDays:signedDays.length,pendingDays:dates.length-signedDays.length,
    managerialDays:dates.filter(date=>results.some(s=>s.date===date&&s.managerial)).length,signedDates:signedDays};
}

export async function buffetMonthlyEligibility(db:Prisma.TransactionClient, mes:number, ano:number) {
  const range={gte:new Date(Date.UTC(ano,mes-1,1)),lt:new Date(Date.UTC(ano,mes,1))};
  const [legacy,flows,daily,services]=await Promise.all([
    db.controleBuffetAmostraRegistro.findMany({where:{data:range,fluxoId:null,excluidoEm:null},include:recordInclude,orderBy:{id:"asc"}}),
    db.fluxoOperacional.findMany({where:{modulo:"amostras",dataReferencia:range,excluidoEm:null},include:buffetHistoryInclude}),
    db.assinaturaDiariaModulo.findMany({where:{moduloCodigo:"amostras",dataReferencia:range}}),
    db.controleBuffetAmostraServico.findMany({select:{id:true,nome:true,tipoServico:true}})
  ]);
  return assessBuffetMonth(legacy,flows,daily,services);
}

export function buffetMonthlyBlockingMessage(month:ReturnType<typeof assessBuffetMonth>,mes:number,ano:number) {
  const dates=[...new Set(month.issues.map(issue=>formatAppDate(new Date(issue.date))))];
  const details=month.issues.slice(0,8).map(issue=>`${formatAppDate(new Date(issue.date))} — ${issue.service}${issue.item?` — ${issue.item}`:""}: ${issue.reason} ${issue.action}`).join(" ");
  return `Não é possível fechar ${String(mes).padStart(2,"0")}/${ano}. Existem ${month.pending} serviço(s) com pendências: ${dates.join(", ")}. ${details}${month.issues.length>8?" Consulte a lista de pendências do fechamento no Histórico.":""}`;
}
