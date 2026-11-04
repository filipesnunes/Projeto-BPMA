import "server-only";
import { Prisma, type PerfilUsuario, type StatusTemperaturaEquipamento } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatAppDateInput, getAppMonthDateRange, getAppMonthYear, parseAppDateInput } from "@/lib/date-time";
import { currentRecordSignatures } from "@/lib/operational-workflow/compatible-records";

export const HISTORY_DAY_PAGE_SIZE=15;
export const HISTORY_DETAIL_PAGE_SIZE=100;
export type TemperatureHistoryFilters={date:string;month:number|null;year:number|null;equipment:string;status:StatusTemperaturaEquipamento|null;responsible:string};
export function positivePage(value:string) {const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:1;}
export function temperatureHistoryScope(filters:TemperatureHistoryFilters,today:Date,fullHistory:boolean) {
  const current=getAppMonthYear(today),date=parseAppDateInput(filters.date);
  const requestedMonth=date?date.getUTCMonth()+1:filters.month??current.mes,requestedYear=date?date.getUTCFullYear():filters.year??current.ano;
  const month=fullHistory?requestedMonth:current.mes;
  const year=fullHistory?requestedYear:current.ano;
  const monthly=getAppMonthDateRange(month,year);
  // Month alone uses the current year; year alone is one bounded calendar year.
  const range=filters.year&&!filters.month&&!date?{start:new Date(Date.UTC(requestedYear,0,1)),end:new Date(Date.UTC(requestedYear+1,0,1)-86400000)}:getAppMonthDateRange(requestedMonth,requestedYear);
  const where:Prisma.ControleTemperaturaEquipamentoWhereInput={data:date??{gte:range.start,lte:range.end}};
  if(!fullHistory)where.AND={data:{gte:getAppMonthDateRange(current.mes,current.ano).start,lte:today}};
  if(filters.equipment)where.equipamento={contains:filters.equipment,mode:"insensitive"};
  if(filters.status){where.status=filters.status;where.statusOperacionalEquipamento="EM_OPERACAO";}
  if(filters.responsible)where.responsavel={contains:filters.responsible,mode:"insensitive"};
  return {where,month,year,monthly,monthlyEnd:!fullHistory&&monthly.end>today?today:monthly.end};
}

type MonthlyRow={data:Date|null;registros:number;alertas:number;inativos:number;acoes:number;equipamentos:number;dias:number};
// Match String.trim(), including legacy tabs, newlines, NBSP and BOM.
const trimCharacters="\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";
// Aggregate only. This explicitly mirrors the shared active/projection predicate,
// including excluded flows, so raw SQL never exposes incomplete measurements.
async function monthlySummary(start:Date,end:Date) {
  return prisma.$queryRaw<MonthlyRow[]>(Prisma.sql`
    SELECT r.data, count(*)::int AS registros,
      count(*) FILTER (WHERE r."statusOperacionalEquipamento"='EM_OPERACAO' AND r.status IN ('ALERTA','CRITICO'))::int AS alertas,
      count(*) FILTER (WHERE r."statusOperacionalEquipamento"<>'EM_OPERACAO')::int AS inativos,
      count(*) FILTER (WHERE btrim(coalesce(r."acaoCorretiva",''),${trimCharacters})<>'')::int AS acoes,
      count(DISTINCT r.equipamento)::int AS equipamentos, count(DISTINCT r.data)::int AS dias
    FROM controle_temperatura_equipamentos r
    WHERE r.data >= ${formatAppDateInput(start)}::date AND r.data <= ${formatAppDateInput(end)}::date AND r."excluidoEm" IS NULL
      AND (r."fluxoId" IS NULL OR EXISTS (SELECT 1 FROM fluxo_operacional f
        WHERE f.id=r."fluxoId" AND f."preenchimentoCompleto"=true AND f."excluidoEm" IS NULL))
    GROUP BY GROUPING SETS ((r.data), ())`);
}

// Same presentation semantics as scopedLegacyDaySignatures, with minimal selects
// and one SQL group per legacy day instead of one row per measurement.
async function signatureSummary(dates:Date[]) {
  const unique=[...new Map(dates.map(date=>[formatAppDateInput(date),date])).values()];
  const result=new Map<string,{usuarioNomeSnapshot:string;usuarioPerfilSnapshot:PerfilUsuario|null;assinadoEm:Date;observacao?:string|null}>();
  if(!unique.length)return result;
  const [daily,units,legacy]=await Promise.all([
    prisma.assinaturaDiariaModulo.findMany({where:{moduloCodigo:"temperatura",dataReferencia:{in:unique}},select:{dataReferencia:true,usuarioNomeSnapshot:true,usuarioPerfilSnapshot:true,assinadoEm:true,observacao:true}}),
    prisma.fluxoOperacional.findMany({where:{modulo:"temperatura",excluidoEm:null,dataReferencia:{in:unique}},select:{dataReferencia:true,estado:true,assinaturaVigente:{select:{id:true,usuarioNome:true,usuarioPerfil:true,assinadoEm:true}}}}),
    prisma.controleTemperaturaEquipamento.groupBy({by:["data"],where:{fluxoId:null,data:{in:unique}}})
  ]);
  const original=new Map(daily.map(signature=>[formatAppDateInput(signature.dataReferencia),signature]));
  const legacyDays=new Set(legacy.map(row=>formatAppDateInput(row.data)));
  for(const date of unique){const day=formatAppDateInput(date),scoped=units.filter(unit=>+unit.dataReferencia===+date),previous=original.get(day);
    if(!scoped.length){if(previous)result.set(day,previous);continue;}
    if(scoped.some(unit=>unit.estado!=="FECHADO"||!unit.assinaturaVigente))continue;
    if(legacyDays.has(day)){if(previous)result.set(day,previous);continue;}
    const evidence=scoped.map(unit=>unit.assinaturaVigente!).sort((a,b)=>+b.assinadoEm-+a.assinadoEm),names=[...new Set(evidence.map(signature=>signature.usuarioNome))];
    result.set(day,{usuarioNomeSnapshot:names.join(", "),usuarioPerfilSnapshot:names.length===1?evidence[0].usuarioPerfil as PerfilUsuario:null,assinadoEm:evidence[0].assinadoEm,observacao:`Resumo de assinaturas vigentes: ${[...new Set(evidence.map(signature=>signature.id))].join(", ")}`});
  }
  return result;
}

const detailSelect={id:true,fluxoId:true,data:true,equipamento:true,turno:true,status:true,statusOperacionalEquipamento:true,temperaturaAferida:true,acaoCorretiva:true,responsavel:true,observacoes:true,observacaoStatusOperacional:true,createdAt:true,horarioAfericao:true,horarioNaoInformado:true,justificativaHorario:true,assinaturaNutricionistaNome:true,assinaturaNutricionistaDataHora:true} satisfies Prisma.ControleTemperaturaEquipamentoSelect;
export async function loadTemperatureHistory(params:{filters:TemperatureHistoryFilters;today:Date;fullHistory:boolean;page:number;detailPage:number;openDay:string;photoId:number|null}) {
  const scope=temperatureHistoryScope(params.filters,params.today,params.fullHistory),{where,monthly,monthlyEnd}=scope;
  const simpleMonth=!params.filters.date&&!params.filters.equipment&&!params.filters.status&&!params.filters.responsible&&!(params.filters.year&&!params.filters.month)&&(params.filters.month??scope.month)===scope.month&&(params.filters.year??scope.year)===scope.year;
  const [monthlyRows,counts,closure]=await Promise.all([
    monthlySummary(monthly.start,monthlyEnd),
    simpleMonth?Promise.resolve(null):prisma.controleTemperaturaEquipamento.groupBy({by:["data"],where,_count:{id:true}}),
    prisma.fechamentoMensalModulo.findUnique({where:{status:"FECHADO",moduloCodigo_ano_mes:{moduloCodigo:"temperatura",ano:scope.year,mes:scope.month}}})
  ]);
  const monthlyDays=monthlyRows.filter((row):row is MonthlyRow&{data:Date}=>row.data!==null),totals=monthlyRows.find(row=>row.data===null)!;
  const totalDays=counts?.length??monthlyDays.length,totalRecords=counts?.reduce((n,row)=>n+row._count.id,0)??totals.registros;
  const pages=Math.max(1,Math.ceil(totalDays/HISTORY_DAY_PAGE_SIZE)),page=Math.min(params.page,pages);
  const days=await prisma.controleTemperaturaEquipamento.groupBy({by:["data"],where,_count:{id:true},orderBy:{data:"desc"},skip:(page-1)*HISTORY_DAY_PAGE_SIZE,take:HISTORY_DAY_PAGE_SIZE});
  const pageDates=days.map(day=>day.data);
  const dayCounts=simpleMonth?null:await prisma.controleTemperaturaEquipamento.groupBy({by:["data","status","statusOperacionalEquipamento"],where:{AND:[where,{data:{in:pageDates}}]},_count:{id:true}});
  const groups=days.map(day=>{const monthlyRow=monthlyDays.find(row=>+row.data===+day.data),filtered=dayCounts?.filter(row=>+row.data===+day.data);return{data:day.data,quantidade:day._count.id,alertas:filtered?filtered.filter(row=>row.statusOperacionalEquipamento==="EM_OPERACAO"&&["ALERTA","CRITICO"].includes(row.status)).reduce((n,row)=>n+row._count.id,0):monthlyRow?.alertas??0,inativos:filtered?filtered.filter(row=>row.statusOperacionalEquipamento!=="EM_OPERACAO").reduce((n,row)=>n+row._count.id,0):monthlyRow?.inativos??0};});
  const openDate=parseAppDateInput(params.openDay),detailWhere:Prisma.ControleTemperaturaEquipamentoWhereInput={AND:[where,{data:openDate??new Date(0)}]};
  const detailTotal=openDate?await prisma.controleTemperaturaEquipamento.count({where:detailWhere}):0;
  const selectedAlerts=openDate&&detailTotal?(groups.find(group=>+group.data===+openDate)?.alertas??await prisma.controleTemperaturaEquipamento.count({where:{AND:[detailWhere],statusOperacionalEquipamento:"EM_OPERACAO",status:{in:["ALERTA","CRITICO"]}}})):0;
  const detailPages=Math.max(1,Math.ceil(detailTotal/HISTORY_DETAIL_PAGE_SIZE)),detailPage=Math.min(params.detailPage,detailPages);
  const details=openDate&&detailTotal?await prisma.controleTemperaturaEquipamento.findMany({where:detailWhere,select:detailSelect,orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(detailPage-1)*HISTORY_DETAIL_PAGE_SIZE,take:HISTORY_DETAIL_PAGE_SIZE}):[];
  const [records,photoRows,photo]=await Promise.all([
    currentRecordSignatures(details,"temperatura"),
    details.length?prisma.controleTemperaturaEquipamento.findMany({where:{AND:[detailWhere],id:{in:details.map(row=>row.id)},OR:[{AND:[{fotoUrl:{not:null}},{fotoUrl:{not:""}}]},{AND:[{fotoBase64:{not:null}},{fotoBase64:{not:""}},{fotoMimeType:{not:null}},{fotoMimeType:{not:""}}]}]},select:{id:true}}):Promise.resolve([]),
    params.photoId&&detailTotal?prisma.controleTemperaturaEquipamento.findFirst({where:{AND:[detailWhere,{id:params.photoId}]},select:{id:true,data:true,equipamento:true,fotoBase64:true,fotoMimeType:true,fotoUrl:true}}):Promise.resolve(null)
  ]);
  const signatures=await signatureSummary([...monthlyDays.map(row=>row.data),...pageDates,...(openDate&&detailTotal?[openDate]:[])]);
  const signedDays=monthlyDays.filter(row=>signatures.has(formatAppDateInput(row.data))).length;
  return {...scope,groups,totalDays,totalRecords,page,pages,closure,signatures,photo,photoIds:new Set(photoRows.map(row=>row.id)),selected:openDate&&detailTotal?{data:openDate,registros:records}:null,selectedAlerts,detailTotal,detailPage,detailPages,indicators:{"Mês/Ano":`${String(scope.month).padStart(2,"0")}/${scope.year}`,"Dias monitorados":totals.dias,"Registros":totals.registros,"Equipamentos monitorados":totals.equipamentos,"Alertas":totals.alertas,"Ações corretivas":totals.acoes,"Manutenção/Inativos":totals.inativos,"Dias assinados":signedDays,"Dias pendentes de assinatura":Math.max(totals.dias-signedDays,0)}};
}
