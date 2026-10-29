import "server-only";
import {createHash} from "node:crypto";
import type {Prisma,FluxoOperacional,ControleTemperaturaEquipamento} from "@prisma/client";
import type {AuthenticatedUser} from "@/lib/auth-session";
import {getAppNow} from "@/lib/date-time";
export function temperatureAuditValues(record:ControleTemperaturaEquipamento|null,draft:Record<string,string>) {
  const values={...draft};
  for(const key of ["status","acaoCorretiva","categoriaEquipamento","equipamento","observacoes","responsavel","fotoTamanhoBytes"] as const)values[key]=String(record?.[key]??"");
  return values;
}
export async function temperatureCorrectionAudit(tx:Prisma.TransactionClient,unit:FluxoOperacional,user:AuthenticatedUser,before:Record<string,string>,after:Record<string,string>,complete:boolean) {
  const keys=["temperaturaAferida","statusOperacionalEquipamento","observacaoStatusOperacional","horarioAfericao","horarioNaoInformado","justificativaHorario","fotoBase64","fotoUrl","fotoNome","fotoMimeType","status","acaoCorretiva","categoriaEquipamento","equipamento","observacoes","responsavel","fotoTamanhoBytes"];
  const display=(key:string,value:string|undefined)=>key==="fotoBase64"&&value?`sha256:${createHash('sha256').update(value,'base64').digest('hex')}`:value??"";
  const changes=keys.filter(key=>(before[key]??"")!==(after[key]??"")).map(key=>({campo:key,anterior:display(key,before[key]),novo:display(key,after[key])}));
  const reopening=await tx.fluxoEvento.findFirst({where:{fluxoId:unit.id,operacao:"REABERTURA"},orderBy:{criadoEm:"desc"},select:{id:true}});
  await tx.fluxoEvento.create({data:{fluxoId:unit.id,operacao:"CORRECAO_REGISTRO",estadoAnterior:unit.estado,estadoNovo:unit.estado==="REABERTO"?"REABERTO":complete?"COMPLETO":"PENDENTE",versaoAnterior:unit.versao,versaoNova:unit.versao+1,usuarioId:user.id,usuarioNome:user.nomeCompleto,usuarioPerfil:user.perfil,criadoEm:getAppNow(),justificativa:JSON.stringify({campos:changes,reaberturaEventoId:reopening?.id??null})}});
}
