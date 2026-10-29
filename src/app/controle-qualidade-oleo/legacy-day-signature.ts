import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuthenticatedUser } from "@/lib/auth-session";
import { canSignModuleDay } from "@/lib/module-signatures";
import { getAppDate, getAppNow, formatAppDateInput } from "@/lib/date-time";
import { isOperationalMonthClosed } from "@/lib/monthly-reopening";
import { verifyPassword } from "@/lib/password";
import { refreshWorkflowActor } from "./workflow-adapter";
// Preserve the original daily mechanism, using the same lock as corrections.
export async function signLegacyOilDay(authenticated:AuthenticatedUser,date:Date,password:string,observation:string) {
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"oleo"}), 17326)`;
    const user=await refreshWorkflowActor(tx,authenticated);
    if(!canSignModuleDay(user,"oleo"))throw Error("Seu perfil não pode assinar dias como responsável técnico.");
    if(date>getAppDate())throw Error("Não é possível assinar uma data futura.");
    if(await isOperationalMonthClosed("oleo",date.getUTCMonth()+1,date.getUTCFullYear(),tx))throw Error("A competência está fechada.");
    const credentials=await tx.usuario.findUniqueOrThrow({where:{id:user.id},select:{senhaHash:true}});
    if(!password.trim()||!verifyPassword(password.trim(),credentials.senhaHash))throw Error("Senha inválida para confirmar a assinatura.");
    const rows=await tx.controleQualidadeOleoRegistro.findMany({where:{data:date,fluxoId:null,excluidoEm:null},select:{id:true,updatedAt:true}});
    if(!rows.length)throw Error("Selecione as unidades e suas versões no histórico do módulo para assinar.");
    const existing=await tx.assinaturaDiariaModulo.findUnique({where:{moduloCodigo_dataReferencia:{moduloCodigo:"oleo",dataReferencia:date}}});
    if(existing)throw Error("Este dia já foi assinado pelo supervisor.");
    const at=getAppNow(),scope=JSON.stringify({observacao:observation,escopoLegado:rows.map(row=>({id:row.id,updatedAt:row.updatedAt.toISOString()}))});
    await tx.assinaturaDiariaModulo.create({data:{moduloCodigo:"oleo",dataReferencia:date,usuarioId:user.id,usuarioNomeSnapshot:user.nomeCompleto,usuarioPerfilSnapshot:user.perfil,responsavelTecnico:true,assinadoEm:at,observacao:scope}});
    await tx.logAssinatura.create({data:{usuarioId:user.id,nomeUsuario:user.nomeUsuario,nomeCompleto:user.nomeCompleto,perfil:user.perfil,tipo:"RESPONSAVEL_TECNICO",modulo:"oleo",referenciaId:formatAppDateInput(date),assinadoEm:at,observacao:scope}});
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
