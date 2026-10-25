import "server-only";
import {Prisma} from "@prisma/client";
import type {AuthenticatedUser} from "@/lib/auth-session";
import {canDeleteOperationalRecord} from "@/lib/operational-deletion-permission";
import {getAppNow} from "@/lib/date-time";
export function assertGroupDeletion(user:AuthenticatedUser,module:"amostras"|"rastreabilidade",reason:string){if(!canDeleteOperationalRecord(user,module))throw Error("Sem permissão para excluir registros.");if(!reason.trim()||reason.length>4000)throw Error("Informe a justificativa da exclusão.");}
export async function auditGroupDeletion(tx:Prisma.TransactionClient,user:AuthenticatedUser,module:"amostras"|"rastreabilidade",model:string,record:{id:number},reason:string){assertGroupDeletion(user,module,reason);await tx.exclusaoRegistroOperacional.create({data:{modulo:module,modelo:model,registroId:record.id,dadosOriginais:JSON.parse(JSON.stringify(record)),usuarioId:user.id,usuarioNome:user.nomeCompleto,usuarioPerfil:user.perfil,excluidoEm:getAppNow(),justificativa:reason}});}
