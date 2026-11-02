import "server-only";
import type {WorkflowSignatureBridge} from "./service";
import {Prisma} from "@prisma/client";
import {hasPermission} from "@/lib/permissions";
import {canSignModuleDay} from "@/lib/module-signatures";
import {verifyPassword} from "@/lib/password";
import {buffetSnapshot, type BuffetDraft} from "@/app/controle-buffet-amostras/workflow-adapter";
import {receivingSnapshot} from "@/app/rastreabilidade-recebimento/workflow-adapter";
import {workflowReviewEligibility} from "./review-eligibility";
import {buffetProgress} from "@/app/controle-buffet-amostras/progress";
import {getRegistroItemIssue} from "@/app/controle-buffet-amostras/workflow-payload";
import {avaliarTemperaturaBuffet} from "@/app/controle-buffet-amostras/utils";
import {normalizeOption} from "@/app/controle-buffet-amostras/options";
import {getAppDate} from "@/lib/date-time";
export type GroupModule="amostras"|"rastreabilidade";
export function groupSignatureBridge(module:GroupModule,mechanism:string,password:string):WorkflowSignatureBridge {
 return{module,mechanism,
 async validate(tx,unit){if(module==="amostras"&&mechanism!=="SERVICO")throw Error("Utilize apenas a Validação do Serviço para novas assinaturas do Buffet.");const source=await tx.fluxoOperacional.findUniqueOrThrow({where:{id:unit.id},include:{amostras:{where:{excluidoEm:null},orderBy:{id:"asc"}},recebimento:{include:{itens:{where:{excluidoEm:null},orderBy:{id:"asc"}}}},versoes:{where:{versao:unit.versao}}}});const version=source.versoes[0];if(!version?.completo||!unit.preenchimentoCompleto)throw Error("Unidade incompleta.");
 let snapshot:Prisma.InputJsonObject;
 if(module==="amostras"){
 const draft=version.rascunho as unknown as BuffetDraft;
 if(!buffetProgress(source.amostras,draft.manifest).complete)throw Error("Há itens pendentes.");
 for(const row of source.amostras){
   if(row.status==="NAO_SERVIDO")continue;
   const issue=getRegistroItemIssue({nome:row.itemNome,classificacao:row.classificacao,usaGarrafaTermica:row.usaGarrafaTermica},{
     tcEquipamentoInput:String(row.tcEquipamento??""),primeiraTcInput:String(row.primeiraTc??""),
     temperaturaTipo:row.temperaturaAmbiente?"AMBIENTE":"NUMERICA",acaoCorretivaInput:row.acaoCorretiva?.trim()??"",observacao:row.observacao??"",naoServido:false
   });
   const corrective=!row.temperaturaAmbiente&&row.primeiraTc!==null&&avaliarTemperaturaBuffet(row.classificacao,row.primeiraTc).exigeAcaoCorretiva;
   if(issue||corrective&&normalizeOption(row.acaoCorretiva??"")===normalizeOption("Não se aplica"))throw Error(`Revise os campos obrigatórios e a ação corretiva de ${row.itemNome} antes de assinar.`);
 }
 snapshot=buffetSnapshot(source.amostras,draft.manifest);}
 else{if(!source.recebimento||source.recebimento.excluidoEm||source.recebimento.statusNota!=="FINALIZADA"||!source.recebimento.itens.length||source.recebimento.itens.some(i=>i.statusGeral==="PENDENTE"))throw Error("Finalize a conferência antes de assinar.");snapshot=receivingSnapshot(source.recebimento);}
 return{snapshot,draft:version.rascunho as Prisma.InputJsonObject,complete:true,resolved:version.resolvidos,required:version.obrigatorios};},
 async sign(tx,user,units,signedAt){if(module==="amostras"?mechanism!=="SERVICO":mechanism!=="DIARIA")throw Error("Mecanismo de validação inválido. Assine o serviço completo.");
 if(mechanism==="DIARIA"?!canSignModuleDay(user,module):!hasPermission(user,`modulo.${module}.${mechanism==="SERVICO"?"assinar_servico":"assinar_historico"}`))throw Error("Sem permissão para esta assinatura.");
 if(mechanism!=="DIARIA"&&units.length!==1)throw Error("Selecione um único serviço.");if(units.some(u=>+u.dataReferencia!==+units[0].dataReferencia))throw Error("A assinatura diária abrange uma única data.");
 if(units.some(u=>u.dataReferencia>getAppDate()))throw Error("Não ? possível assinar registros futuros.");
 for(const unit of units){const eligibility=await workflowReviewEligibility(tx,user,module,unit.id,unit.versao,`modulo.${module}.${module==="amostras"?"assinar_servico":"assinar_dia"}`);if(!eligibility.allowed)throw Error(eligibility.reason);}
 const credentials=await tx.usuario.findUniqueOrThrow({where:{id:user.id},select:{senhaHash:true}});if(!password||!verifyPassword(password,credentials.senhaHash))throw Error("Senha inválida para assinatura.");
 const log=await tx.logAssinatura.create({data:{usuarioId:user.id,nomeUsuario:user.nomeUsuario,nomeCompleto:user.nomeCompleto,perfil:user.perfil,tipo:mechanism==="DIARIA"?"RESPONSAVEL_TECNICO":mechanism==="SERVICO"?"SUPERVISOR":"REVISAO_NUTRICIONISTA",modulo:module,referenciaId:units[0].dataReferencia.toISOString().slice(0,10),assinadoEm:signedAt,observacao:JSON.stringify({mecanismo:mechanism,versoes:units.map(u=>({id:u.id,versao:u.versao}))})}});return `log:${log.id}`;
 }};
}
