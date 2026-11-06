import "server-only";
import type { Prisma, PerfilUsuario } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth-session";
import { formatAppDate, formatAppDateInput, getAppDate } from "@/lib/date-time";
import { isNonTechnicalRetroactive, technicalReviewPending } from "@/lib/review-presentation";
import { workflowReviewEligibility } from "@/lib/operational-workflow/review-eligibility";
import { isOperationalMonthClosed } from "@/lib/monthly-reopening";
import { canReviewRetroactively } from "@/lib/retroactive-review-permissions";
import { temperatureNameChanges, type TemperatureNameChange } from "./nomenclature";

type Signature={id:string;modulo:string;usuarioNome:string;usuarioPerfil:string;mecanismo:string;assinadoEm:Date;vinculos:{fluxoId:string;versao:number}[]};
export type TemperatureSignatureScope={id:string;modulo:string;estado:string;versao:number;assinaturaVigenteId:string|null;assinaturaVigente:Signature|null;eventos:{operacao:string;assinaturaId:string|null}[]};
export function currentTemperatureSignature(unit:TemperatureSignatureScope) {
  const signature=unit.assinaturaVigente;
  return unit.modulo==="temperatura"&&unit.estado==="FECHADO"&&signature?.id===unit.assinaturaVigenteId&&signature.modulo==="temperatura"
    &&signature.vinculos.some(link=>link.fluxoId===unit.id&&link.versao===unit.versao)
    &&!unit.eventos.some(event=>["REVOGACAO_ASSINATURA","INVALIDACAO_VIGENCIA"].includes(event.operacao)&&event.assinaturaId===signature.id)?signature:null;
}
export function temperatureSignatureForDisplay(unit:TemperatureSignatureScope) {
  const signature=currentTemperatureSignature(unit);
  return signature&&(signature.usuarioPerfil==="NUTRICIONISTA"||isNonTechnicalRetroactive(signature.mecanismo))?signature:null;
}
export const temperatureSignatureEvidence={assinaturaVigente:{include:{vinculos:true}},eventos:{where:{operacao:{in:["REVOGACAO_ASSINATURA","INVALIDACAO_VIGENCIA"]}},select:{operacao:true,assinaturaId:true}}} satisfies Prisma.FluxoOperacionalInclude;
const materialSelect={id:true,fluxoId:true,data:true,equipamento:true,turno:true,responsavel:true,createdAt:true,excluidoEm:true,assinaturaNutricionistaNome:true,assinaturaNutricionistaPerfil:true,assinaturaNutricionistaDataHora:true} satisfies Prisma.ControleTemperaturaEquipamentoSelect;
type SummarySignature={usuarioNomeSnapshot:string;usuarioPerfilSnapshot:PerfilUsuario|null;assinadoEm:Date;observacao?:string|null};

// Bounded metadata reads: never load evidence photos or version JSON for month counters.
export async function loadTemperatureDayReviews(db:Prisma.TransactionClient,dates:Date[],user?:AuthenticatedUser) {
  const unique=[...new Map(dates.map(date=>[formatAppDateInput(date),date])).values()];
  if(!unique.length)return new Map<string,TemperatureDayReview>();
  const [units,legacy,daily]=await Promise.all([
    db.fluxoOperacional.findMany({where:{modulo:"temperatura",dataReferencia:{in:unique},excluidoEm:null},select:{id:true,modulo:true,estado:true,versao:true,assinaturaVigenteId:true,dataReferencia:true,preenchimentoCompleto:true,...temperatureSignatureEvidence,temperatura:{select:materialSelect}}}),
    db.controleTemperaturaEquipamento.findMany({where:{fluxoId:null,data:{in:unique},excluidoEm:null},select:materialSelect}),
    db.assinaturaDiariaModulo.findMany({where:{moduloCodigo:"temperatura",dataReferencia:{in:unique}}})
  ]);
  const records=[...legacy.map(record=>({record,unit:null})),...units.filter(unit=>unit.temperatura&&!unit.temperatura.excluidoEm).map(unit=>({record:unit.temperatura!,unit}))];
  const result=new Map<string,TemperatureDayReview>();
  for(const date of unique){
    const key=formatAppDateInput(date),daySignature=daily.find(signature=>+signature.dataReferencia===+date);
    const assessments:TemperatureDayRow[]=[];
    const closed=user?await isOperationalMonthClosed("temperatura",date.getUTCMonth()+1,date.getUTCFullYear(),db):false;
    for(const {record,unit}of records.filter(row=>+row.record.data===+date)){
      const current=unit?currentTemperatureSignature(unit):null;
      const individual=!unit&&record.assinaturaNutricionistaNome&&record.assinaturaNutricionistaPerfil==="NUTRICIONISTA"&&record.assinaturaNutricionistaDataHora&&record.assinaturaNutricionistaDataHora>=record.createdAt
        ?{usuarioNomeSnapshot:record.assinaturaNutricionistaNome,usuarioPerfilSnapshot:record.assinaturaNutricionistaPerfil,assinadoEm:record.assinaturaNutricionistaDataHora}:null;
      const covered=!unit&&daySignature?.responsavelTecnico&&daySignature.usuarioPerfilSnapshot==="NUTRICIONISTA"&&!technicalReviewPending(daySignature.observacao)&&daySignature.assinadoEm>=record.createdAt?daySignature:individual;
      const technical=current?current.usuarioPerfil==="NUTRICIONISTA"&&!isNonTechnicalRetroactive(current.mecanismo):Boolean(covered);
      const managerial=Boolean(current&&isNonTechnicalRetroactive(current.mecanismo));
      const signature:SummarySignature|null=current&&(technical||managerial)?{usuarioNomeSnapshot:current.usuarioNome,usuarioPerfilSnapshot:current.usuarioPerfil as PerfilUsuario,assinadoEm:current.assinadoEm,observacao:current.mecanismo.includes("retroativa")?JSON.stringify({operacao:"REVISAO_RETROATIVA",natureza:current.mecanismo,revisaoTecnicaPendente:managerial}):null}:covered;
      let reason=technical?"":managerial?"Revisão gerencial ou operacional registrada; ainda é necessária validação técnica.":unit?.estado==="REABERTO"?"Aferição reaberta: é necessária uma nova assinatura.":unit?.estado==="FECHADO"?"A assinatura não é válida para a versão atual ou foi invalidada. Solicite conferência e reabertura autorizada.":!unit?"Registro legado: utilize a revisão retroativa autorizada, preservando a autoria original.":"Aguardando assinatura técnica.";
      let eligible=false;let nomenclature:TemperatureNameChange[]=[];
      if(user&&!technical){
        if(date>getAppDate())reason="Não é possível assinar aferições de datas futuras.";
        else if(closed)reason="Competência fechada. Solicite a reabertura mensal autorizada.";
        else if(unit&&unit.preenchimentoCompleto&&["COMPLETO","REABERTO"].includes(unit.estado)){
          const decision=await workflowReviewEligibility(db,user,"temperatura",unit.id,unit.versao,"modulo.temperatura.assinar_dia");
          reason=decision.reason;
          if(decision.allowed){try{nomenclature=await temperatureNameChanges(db,[{id:unit.id,version:unit.versao}]);eligible=true;reason="";}catch(error){reason=error instanceof Error&&!/prisma|p20\d|transaction/i.test(error.message)?error.message:"Não foi possível conferir a versão. Atualize a consulta.";}}
        }else if(unit&&!unit.preenchimentoCompleto)reason="Aferição incompleta: confira os campos e salve o registro.";
      }
      const retroHref=user&&!technical&&!eligible&&!closed&&date<getAppDate()&&canReviewRetroactively(user,"temperatura")&&(!unit||managerial||["COMPLETO","REABERTO"].includes(unit.estado))
        ?`/historico-operacional/revisao-retroativa?modulo=temperatura&data=${key}&${unit?`fluxo=${unit.id}`:`legado=${record.id}`}`:undefined;
      assessments.push({id:record.id,equipment:record.equipamento,shift:record.turno,executor:record.responsavel,flowId:unit?.id??null,version:unit?.versao??0,technical,managerial,signature,eligible,reason,retroHref,nomenclature});
    }
    const signed=assessments.filter(row=>row.technical).length,total=assessments.length;
    const evidence=assessments.flatMap(row=>row.technical&&row.signature?[row.signature]:[]).sort((a,b)=>+b.assinadoEm-+a.assinadoEm);
    const names=[...new Set(evidence.map(signature=>signature.usuarioNomeSnapshot))];
    const summary:SummarySignature|undefined=total>0&&signed===total?{usuarioNomeSnapshot:names.join(", "),usuarioPerfilSnapshot:names.length===1?evidence[0].usuarioPerfilSnapshot:null,assinadoEm:evidence[0].assinadoEm,observacao:evidence.find(signature=>signature.observacao)?.observacao}:undefined;
    result.set(key,{date:key,total,signed,pending:total-signed,managerial:assessments.filter(row=>row.managerial).length,rows:assessments,summary});
  }
  return result;
}
export type TemperatureDayRow={id:number;equipment:string;shift:string;executor:string;flowId:string|null;version:number;technical:boolean;managerial:boolean;signature:SummarySignature|null;eligible:boolean;reason:string;retroHref?:string;nomenclature:TemperatureNameChange[]};
export type TemperatureDayReview={date:string;total:number;signed:number;pending:number;managerial:number;rows:TemperatureDayRow[];summary?:SummarySignature};
export function temperatureDayStatus(day:TemperatureDayReview) {return day.total>0&&day.signed===day.total?"Assinado pelo Supervisor":day.signed>0?`Assinatura parcial — ${day.signed} de ${day.total} aferições`:"Pendente assinatura";}
export function temperatureDayResult(day:TemperatureDayReview) {return day.total>0&&!day.pending?`Dia ${formatAppDate(new Date(day.date))} assinado com sucesso. ${day.signed} de ${day.total} aferições validadas.`:`Assinaturas registradas. ${day.signed} de ${day.total} aferições validadas. Existem ${day.pending} pendência(s). Confira os motivos no Histórico.`;}
