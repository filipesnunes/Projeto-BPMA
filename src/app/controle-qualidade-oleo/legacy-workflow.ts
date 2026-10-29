import "server-only";
import { Prisma, type ControleQualidadeOleoRegistro } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth-session";
import { oilSnapshot } from "./workflow-adapter";
import { NO_OIL_STRIP } from "./strip-choice";
export const legacyOilId=(key:string)=>/^legacy:([1-9]\d*)$/.test(key)?Number(key.split(":")[1]):null;
export const legacyOilFlowId=(id:number)=>`oil-legacy-${id}`;
export async function legacyOilSignature(tx:Prisma.TransactionClient,record:ControleQualidadeOleoRegistro) {
  const daily=await tx.assinaturaDiariaModulo.findUnique({where:{moduloCodigo_dataReferencia:{moduloCodigo:"oleo",dataReferencia:record.data}}});
  return {daily,signed:Boolean(record.assinaturaSupervisorEm||record.assinaturaSupervisorUsuarioId||record.assinaturaSupervisorNome||daily)};
}
// Called only by the core, under its advisory lock and Serializable transaction.
// One explicit operation adopts one record; reads never enroll records.
export async function adoptLegacyOil(tx:Prisma.TransactionClient,user:AuthenticatedUser,id:number,stamp:string,operation:"save"|"reopen"|"sign") {
  const record=await tx.controleQualidadeOleoRegistro.findUnique({where:{id}});
  if(!record||record.excluidoEm)throw Error("Registro não encontrado.");
  if(record.fluxoId||record.updatedAt.toISOString()!==stamp)throw Error("Este registro foi atualizado. Recarregue antes de continuar.");
  const {daily,signed}=await legacyOilSignature(tx,record);
  if(operation!=="reopen"&&signed)throw Error("Registro assinado. Solicite a reabertura à nutricionista ou a um usuário autorizado.");
  if(operation==="reopen"&&!signed)throw Error("Este registro não possui assinatura vigente.");
  const unit=await tx.fluxoOperacional.create({data:{id:legacyOilFlowId(id),modulo:"oleo",chave:`legacy:${id}`,dataReferencia:record.data,estado:"COMPLETO",preenchimentoCompleto:true}});
  const linked=await tx.controleQualidadeOleoRegistro.update({where:{id,updatedAt:record.updatedAt,AND:{fluxoId:null}},data:{fluxoId:unit.id}});
  const draft={fitaOleo:record.fitaOleo||NO_OIL_STRIP,temperatura:String(record.temperatura??""),semUtilizacao:String(record.semUtilizacao),observacao:record.observacao??"",horarioExecucao:record.horarioExecucao??"",horarioNaoInformado:String(record.horarioNaoInformado),justificativaHorario:record.justificativaHorario??"",registroLegadoOriginal:JSON.stringify(record),assinaturaDiariaOriginal:daily?JSON.stringify(daily):""};
  await tx.fluxoVersao.create({data:{fluxoId:unit.id,versao:1,dados:oilSnapshot(linked),rascunho:draft,completo:true,resolvidos:1,obrigatorios:1,usuarioId:user.id,usuarioNome:user.nomeCompleto,usuarioPerfil:user.perfil}});
  await tx.fluxoEvento.create({data:{fluxoId:unit.id,operacao:"VINCULO_LEGADO",estadoNovo:"COMPLETO",versaoNova:1,usuarioId:user.id,usuarioNome:user.nomeCompleto,usuarioPerfil:user.perfil,justificativa:"Registro e evidências de assinatura preservados na versão 1. Nenhuma assinatura diária ou de outro registro foi modificada."}});
  return operation==="reopen"?{legacySignaturePreserved:true as const}:undefined;
}
