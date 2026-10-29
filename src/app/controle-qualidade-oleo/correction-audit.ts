import "server-only";
import type { Prisma, FluxoOperacional, ControleQualidadeOleoRegistro } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth-session";
import { getAppNow } from "@/lib/date-time";
export async function oilCorrectionAudit(tx:Prisma.TransactionClient,unit:FluxoOperacional,user:AuthenticatedUser,before:ControleQualidadeOleoRegistro,after:ControleQualidadeOleoRegistro) {
  const keys=["fitaOleo","temperatura","status","orientacao","temperaturaCritica","semUtilizacao","observacao","responsavel","horarioExecucao","horarioNaoInformado","justificativaHorario"] as const;
  const changes=keys.filter(key=>before[key]!==after[key]).map(key=>({campo:key,anterior:before[key],novo:after[key]}));
  const reopening=await tx.fluxoEvento.findFirst({where:{fluxoId:unit.id,operacao:"REABERTURA"},orderBy:{versaoNova:"desc"},select:{id:true}});
  await tx.fluxoEvento.create({data:{fluxoId:unit.id,operacao:"CORRECAO_REGISTRO",estadoAnterior:unit.estado,estadoNovo:unit.estado==="REABERTO"?"REABERTO":"COMPLETO",versaoAnterior:unit.versao,versaoNova:unit.versao+1,usuarioId:user.id,usuarioNome:user.nomeCompleto,usuarioPerfil:user.perfil,criadoEm:getAppNow(),justificativa:JSON.stringify({registroId:before.id,campos:changes,reaberturaEventoId:reopening?.id??null})}});
}
