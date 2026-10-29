import type { Prisma, TipoServicoBuffetAmostra } from "@prisma/client";
import { buildBuffetServiceHistoryGroups, type BuffetServiceRecord, type BuffetServiceHistoryGroup } from "./service-history";
import type { BuffetDraft } from "./workflow-adapter";
import { formatDateInput, formatDateDisplay, getClassificacaoLabel, getTipoServicoLabel } from "./utils";

export const buffetHistoryInclude={amostras:{where:{excluidoEm:null},include:{servico:{select:{nome:true,tipoServico:true,dataInicio:true,dataFim:true}}}},versoes:{orderBy:{versao:"desc"},take:1,select:{rascunho:true,obrigatorios:true,resolvidos:true,usuarioNome:true}},assinaturaVigente:true} satisfies Prisma.FluxoOperacionalInclude;
export type BuffetHistoryFlow=Prisma.FluxoOperacionalGetPayload<{include:typeof buffetHistoryInclude}>;
type Service={id:number;nome:string;tipoServico:TipoServicoBuffetAmostra};

export function buffetDraftStarted(draft:BuffetDraft|undefined) {
  return Object.values(draft?.rows??{}).some(row=>Object.entries(row).some(([key,value])=>key==="naoServido"?value==="true":Boolean(value.trim())));
}

// Read-only presentation. Draft fields never become sanitary measurements.
export function mergeBuffetWorkflowHistory(records:BuffetServiceRecord[],flows:BuffetHistoryFlow[],services:Service[],expected=new Map<number,number>()) {
  const flowKeys=new Set(flows.map(flow=>`${formatDateInput(flow.dataReferencia)}:${Number(flow.chave.split(":")[0])}`));
  const groups=new Map(buildBuffetServiceHistoryGroups(records.filter(row=>!flowKeys.has(`${formatDateInput(row.data)}:${row.servicoId}`)),expected).map(group=>[group.key,group]));
  for(const flow of flows) {
    const serviceId=Number(flow.chave.split(":")[0]),service=services.find(s=>s.id===serviceId);
    if(!service)continue;
    const key=`${formatDateInput(flow.dataReferencia)}:${serviceId}`,version=flow.versoes[0],draft=version?.rascunho as unknown as BuffetDraft|undefined;
    // Keep distinct legacy items, but prefer the versioned representation of an item.
    const linkedItems=new Set(flow.amostras.flatMap(row=>row.itemId===null?[]:[row.itemId]));
    const legacy=records.filter(row=>row.servicoId===serviceId&&+row.data===+flow.dataReferencia&&!("fluxoId" in row&&row.fluxoId)&&!("itemId" in row&&linkedItems.has(row.itemId as number)));
    const rows=[...legacy,...flow.amostras.map(row=>({...row,assinaturaNutricionistaNome:flow.estado==="FECHADO"?flow.assinaturaVigente?.usuarioNome??null:null,assinaturaNutricionistaDataHora:flow.estado==="FECHADO"?flow.assinaturaVigente?.assinadoEm??null:null}))];
    const manifest=draft?.manifest??[];
    const counts=new Map([[serviceId,manifest.length]]);
    const group:BuffetServiceHistoryGroup=buildBuffetServiceHistoryGroups(rows,counts)[0]??{
      key,servicoId:serviceId,dataInput:formatDateInput(flow.dataReferencia),servicoNome:service.nome,dataLabel:formatDateDisplay(flow.dataReferencia),tipoServicoLabel:getTipoServicoLabel(service.tipoServico),responsavelExecucao:version?.usuarioNome??"-",assinaturaResumo:"-",assinaturaNutricionistaResumo:"-",assinadoNutricionista:false,status:"PENDENTE",totalItens:0,itensPreenchidos:0,itensNaoServidos:0,itensComAcaoCorretiva:0,items:[]
    };
    const ids=new Set(rows.flatMap(row=>"itemId" in row&&row.itemId!==null?[row.itemId]:[]));
    for(const item of manifest.filter(item=>!ids.has(item.id)))group.items.push({id:-item.id,nome:item.nome,itemExtra:false,classificacaoLabel:getClassificacaoLabel(item.classificacao),tcEquipamentoLabel:"-",temperaturaInicialLabel:"-",temperaturaFinalLabel:null,statusTemperatura:null,acaoCorretiva:"-",observacao:draft?.rows[`item-${item.id}`]?"Rascunho salvo. Abra o serviço para consultar e continuar os campos digitados.":"Item pendente de preenchimento.",status:"PENDENTE",statusOperacionalLabel:"Incompleto",responsavelExecucao:version?.usuarioNome??"-",dataHoraRegistroLabel:"-",responsavelVerificacao:"-",assinaturaResumo:"-",assinaturaNutricionistaResumo:"-"});
    group.totalItens=version?.obrigatorios??group.totalItens;
    group.itensPendentes=Math.max(group.totalItens-(version?.resolvidos??group.itensPreenchidos+group.itensNaoServidos),0);
    group.status=flow.preenchimentoCompleto?"CONCLUIDO":(flow.amostras.length||buffetDraftStarted(draft)?"PARCIAL":"PENDENTE");
    group.workflowId=flow.id;group.workflowState=flow.estado;
    group.assinadoNutricionista=flow.estado==="FECHADO"&&Boolean(flow.assinaturaVigente);
    group.assinaturaNutricionistaResumo=group.assinadoNutricionista?`${flow.assinaturaVigente!.usuarioNome}`:"-";
    groups.set(key,group);
  }
  return [...groups.values()].sort((a,b)=>b.dataInput.localeCompare(a.dataInput)||a.servicoNome.localeCompare(b.servicoNome));
}
