import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { formatAppDateInput } from "@/lib/date-time";
import { positivePage } from "./history-data";
import { temperatureHistoryReturnTo, withTemperatureHistory } from "../history-navigation";
const PAGE_SIZE=20;
const first=(value:string|string[]|undefined)=>Array.isArray(value)?value[0]??"":value??"";
export async function TemperatureHistoryWorkflows({where,query}:{where:Prisma.ControleTemperaturaEquipamentoWhereInput;query:Record<string,string|string[]|undefined>}) {
  const filters:Prisma.FluxoOperacionalWhereInput={modulo:"temperatura",excluidoEm:null,dataReferencia:where.data as Prisma.DateTimeFilter,...(where.AND?{AND:{dataReferencia:(where.AND as Prisma.ControleTemperaturaEquipamentoWhereInput).data as Prisma.DateTimeFilter}}:{})};
  if(where.equipamento){const equipment=await prisma.controleTemperaturaEquipamentoOpcao.findMany({where:{tipo:"EQUIPAMENTO",nome:where.equipamento as Prisma.StringFilter},select:{id:true}});filters.OR=[{temperatura:{equipamento:where.equipamento}},...equipment.map(row=>({chave:{startsWith:`${row.id}:`}}))];}
  if(where.status||where.responsavel)filters.temperatura={...(where.status?{status:where.status,statusOperacionalEquipamento:"EM_OPERACAO"}:{}),...(where.responsavel?{responsavel:where.responsavel}:{})};
  const total=await prisma.fluxoOperacional.count({where:filters});if(!total)return null;
  const pages=Math.ceil(total/PAGE_SIZE),page=Math.min(positivePage(first(query.fluxoPagina)),pages);
  const units=await prisma.fluxoOperacional.findMany({where:filters,select:{id:true,chave:true,dataReferencia:true,estado:true,preenchimentoCompleto:true,temperatura:{select:{id:true,equipamento:true,turno:true}},assinaturaVigente:{select:{usuarioNome:true}}},orderBy:[{dataReferencia:"desc"},{id:"desc"}],skip:(page-1)*PAGE_SIZE,take:PAGE_SIZE});
  const ids=units.filter(unit=>!unit.temperatura&&!unit.chave.startsWith("legacy:")).map(unit=>Number(unit.chave.split(":")[0])).filter(Number.isSafeInteger);
  const catalog=ids.length?await prisma.controleTemperaturaEquipamentoOpcao.findMany({where:{id:{in:ids}},select:{id:true,nome:true}}):[];
  const names=new Map(catalog.map(row=>[row.id,row.nome]));
  const recordHref=(unit:typeof units[number])=>{
    const params=new URLSearchParams();
    for(const [key,value]of Object.entries(query))if(value!==undefined)params.set(key,first(value));
    params.set("fluxoPagina",String(page));
    const returnTo=temperatureHistoryReturnTo(`/controle-temperatura-equipamentos/historico?${params}`,unit.dataReferencia);
    return withTemperatureHistory(unit.temperatura?`/controle-temperatura-equipamentos/registro/${unit.temperatura.id}`:`/controle-temperatura-equipamentos/fluxo?chave=${encodeURIComponent(unit.chave)}`,returnTo);
  };
  const href=(n:number)=>{const params=new URLSearchParams();for(const[k,v]of Object.entries(query)){if(v!==undefined&&!['dia','fotoId','detalhePagina','fluxoPagina'].includes(k))params.set(k,first(v));}params.set("fluxoPagina",String(n));return `/controle-temperatura-equipamentos/historico?${params}`;};
  return <section className="bpma-card space-y-3" aria-label="Preenchimentos salvos e revisões"><h2 className="text-lg font-semibold">Validações e preenchimentos salvos ({total})</h2>
    <ul className="divide-y divide-slate-200 dark:divide-slate-700">{units.map(unit=><li key={unit.id} className="flex flex-wrap items-center justify-between gap-3 py-3 [overflow-wrap:anywhere]"><div><p>{unit.temperatura?.equipamento??names.get(Number(unit.chave.split(":")[0]))??"Equipamento"} — {formatAppDateInput(unit.dataReferencia)} — {(unit.temperatura?.turno??unit.chave.split(":")[2])==="MANHA"?"Manhã":"Tarde"}</p><p>{unit.estado==="REABERTO"?"Revisão pendente — nova assinatura necessária":unit.assinaturaVigente?`Assinado por ${unit.assinaturaVigente.usuarioNome}`:unit.preenchimentoCompleto?"Preenchimento salvo — aguardando assinatura":"Preenchimento em andamento"}</p></div><Link prefetch={false} className="btn-secondary" href={recordHref(unit)}>{unit.assinaturaVigente?"Consultar registro":"Abrir registro"}</Link></li>)}</ul>
    {pages>1&&<nav className="btn-group" aria-label="Páginas dos preenchimentos"><span>Página {page} de {pages}</span>{page>1&&<Link prefetch={false} className="btn-secondary" href={href(page-1)}>Preenchimentos anteriores</Link>}{page<pages&&<Link prefetch={false} className="btn-secondary" href={href(page+1)}>Mais preenchimentos</Link>}</nav>}
  </section>;
}
