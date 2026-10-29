import "server-only";
import { Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth-session";
import { temperatureSnapshot } from "./workflow-adapter";
export const legacyTemperatureId=(key:string)=>/^legacy:(\d+)$/.test(key)?Number(key.split(":")[1]):null;
export const legacyTemperatureFlowId=(id:number)=>`temperature-legacy-${id}`;

// Explicit one-record adoption, ONLY inside the core's locked transaction.
// Reading pages never adopts records. A replay cannot enroll or edit it twice.
export async function adoptLegacyTemperature(tx:Prisma.TransactionClient,user:AuthenticatedUser,id:number,stamp:string,operation:"save"|"reopen"|"sign") {
  const record=await tx.controleTemperaturaEquipamento.findUnique({where:{id}});
  if(!record||record.excluidoEm)throw Error("Registro não encontrado.");
  if(record.fluxoId||record.updatedAt.toISOString()!==stamp)throw Error("Este registro foi atualizado. Recarregue antes de continuar.");
  if(operation==="save"&&record.assinaturaNutricionistaDataHora)throw Error("Registro assinado. Solicite a reabertura a um usuário autorizado para realizar alterações.");
  if(operation==="reopen"&&!record.assinaturaNutricionistaDataHora)throw Error("Este registro não possui assinatura individual vigente.");
  if(operation==="sign"&&record.assinaturaNutricionistaDataHora)throw Error("Este registro já está assinado.");
  // Legacy evidence can lack a user ID. Do not invent a FluxoAssinatura to satisfy
  // core FK/closing constraints: preserve the original bytes, then reopen atomically.
  const state="COMPLETO";
  const unit=await tx.fluxoOperacional.create({data:{id:legacyTemperatureFlowId(id),modulo:"temperatura",chave:`legacy:${id}`,dataReferencia:record.data,estado:state,preenchimentoCompleto:true}});
  const linked=await tx.controleTemperaturaEquipamento.update({where:{id,updatedAt:record.updatedAt,AND:{fluxoId:null}},data:{fluxoId:unit.id}});
  const draft={temperaturaAferida:String(record.temperaturaAferida??""),statusOperacionalEquipamento:record.statusOperacionalEquipamento,observacaoStatusOperacional:record.observacaoStatusOperacional??record.observacoes??"",horarioAfericao:record.horarioAfericao??"",horarioNaoInformado:String(record.horarioNaoInformado),justificativaHorario:record.justificativaHorario??"",fotoBase64:record.fotoBase64??"",fotoUrl:record.fotoUrl??"",fotoMimeType:record.fotoMimeType??"",fotoNome:record.fotoNome??"",registroLegadoOriginal:JSON.stringify(record)};
  await tx.fluxoVersao.create({data:{fluxoId:unit.id,versao:1,dados:temperatureSnapshot(linked),rascunho:draft,completo:true,resolvidos:1,obrigatorios:1,usuarioId:user.id,usuarioNome:user.nomeCompleto,usuarioPerfil:user.perfil}});
  await tx.fluxoEvento.create({data:{fluxoId:unit.id,operacao:"VINCULO_LEGADO",estadoNovo:state,versaoNova:1,usuarioId:user.id,usuarioNome:user.nomeCompleto,usuarioPerfil:user.perfil,justificativa:"Preservação explícita do registro original na versão 1. Assinatura legada mantida como evidência original, sem fabricar uma assinatura do núcleo."}});
  return operation === "reopen" ? {legacySignaturePreserved:true as const} : undefined;
}
