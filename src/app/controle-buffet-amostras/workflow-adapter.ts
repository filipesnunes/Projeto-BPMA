import { buffetLinkedItemOrder } from "./item-ordering";
import {assertGroupDeletion,auditGroupDeletion} from "@/lib/operational-workflow/group-deletion";
﻿import "server-only";
import {Prisma, type ControleBuffetAmostraRegistro} from "@prisma/client";
import {hasPermission} from "@/lib/permissions";
import {assertWorkflowEdit} from "@/lib/operational-workflow/policy";
import type {WorkflowAdapter} from "@/lib/operational-workflow/contracts";
import {getAppNow,parseAppDateInput} from "@/lib/date-time";
import {readExecutionTime} from "@/lib/procedure-time";
import {verifyPassword} from "@/lib/password";
import {isServicoDisponivelNaData} from "./utils";
import {buildRegistroPayload,buildNaoServidoPayload,getRegistroItemIssue} from "./workflow-payload";
export {refreshWorkflowActor} from "../controle-temperatura-equipamentos/workflow-adapter";
export type BuffetDraft={ rows:Record<string,Record<string,string>>; manifest:Array<{id:number;nome:string;classificacao:"QUENTE"|"FRIO"|"TEMPERATURA_AMBIENTE";usaGarrafaTermica:boolean}> };
const text=(form:FormData,key:string)=>typeof form.get(key)==="string"?String(form.get(key)).trim():"";
export function parseBuffetKey(key:string){const m=/^(\d+):(\d{4}-\d{2}-\d{2})$/.exec(key),date=m&&parseAppDateInput(m[2]);if(!m||!date)throw Error("Serviço/data inválidos.");return {serviceId:Number(m[1]),date};}
export function buffetSnapshot(records:ControleBuffetAmostraRegistro[],manifest:BuffetDraft['manifest']):Prisma.InputJsonObject{return JSON.parse(JSON.stringify({manifest,records:records.map(record=>{const{updatedAt,assinaturaNutricionistaUsuarioId,assinaturaNutricionistaNome,assinaturaNutricionistaPerfil,assinaturaNutricionistaDataHora,...data}=record;void updatedAt;void assinaturaNutricionistaUsuarioId;void assinaturaNutricionistaNome;void assinaturaNutricionistaPerfil;void assinaturaNutricionistaDataHora;return data;})}));}
export const buffetAdapter:WorkflowAdapter={
 module:"amostras",
 authorizeSave(user,input,context){if(input instanceof FormData&&text(input,"operation")==="deleteItem"){assertGroupDeletion(user,"amostras",text(input,"justificativa"));}else if(input instanceof FormData&&text(input,"operation")==="signItem"){if(!hasPermission(user,"modulo.amostras.assinar_servico"))throw Error("Sem permissão para assinar item.");}else assertWorkflowEdit({user,module:"amostras",...context});},
 async load(tx,key){const{serviceId,date}=parseBuffetKey(key);const legacy=await tx.controleBuffetAmostraRegistro.findFirst({where:{servicoId:serviceId,data:date,fluxoId:null}});return{date,legacy:Boolean(legacy),content:{snapshot:{},draft:{},complete:false,resolved:0,required:1}};},
 async save(tx,key,input,user,unit){
 if(!(input instanceof FormData))throw Error("Formulário inválido.");const{serviceId,date}=parseBuffetKey(key);
 await tx.$executeRaw`SELECT set_config('bpma.workflow_flow',${unit.id},true)`;
 const source=await tx.fluxoOperacional.findUniqueOrThrow({where:{id:unit.id},include:{amostras:{where:{excluidoEm:null},orderBy:{id:"asc"}},versoes:{orderBy:{versao:"desc"},take:1}}});
 const service=await tx.controleBuffetAmostraServico.findUniqueOrThrow({where:{id:serviceId},include:{itens:{where:{item:{ativo:true}},include:{item:true},orderBy:buffetLinkedItemOrder}}});
 if(!isServicoDisponivelNaData(service,date))throw Error("Serviço fora do período configurado.");
 const previous=source.versoes[0]?.rascunho as unknown as BuffetDraft|undefined;
 const draft:BuffetDraft=previous?structuredClone(previous):{manifest:service.itens.map(v=>({id:v.item.id,nome:v.item.nome,classificacao:v.item.classificacao,usaGarrafaTermica:v.item.usaGarrafaTermica})),rows:{}};
 const operation=text(input,"operation");
 if(operation==="deleteItem"){
 const record=source.amostras.find(r=>r.id===Number(text(input,"registroId")));if(!record)throw Error("Item não encontrado.");await auditGroupDeletion(tx,user,"amostras","controleBuffetAmostraRegistro",record,text(input,"justificativa"));await tx.controleBuffetAmostraRegistro.update({where:{id:record.id},data:{excluidoEm:getAppNow()}});if(record.itemId){draft.manifest=draft.manifest.filter(i=>i.id!==record.itemId);delete draft.rows['item-'+record.itemId];}else delete draft.rows['extra-'+record.id];
 }else if(operation==="extra"){
 const name=text(input,"itemNome")||text(input,"nome"),classification=text(input,"classificacao");if(!name||!["QUENTE","FRIO","TEMPERATURA_AMBIENTE"].includes(classification))throw Error("Informe nome e classificação do item extra.");
 if(source.amostras.some(r=>r.itemExtra&&r.itemNome.trim().toLocaleLowerCase("pt-BR")===name.toLocaleLowerCase("pt-BR")))throw Error("Item extra já adicionado.");
 await tx.controleBuffetAmostraRegistro.create({data:{data:date,servicoId:serviceId,fluxoId:unit.id,itemExtra:true,itemNome:name,classificacao:classification as "QUENTE"|"FRIO"|"TEMPERATURA_AMBIENTE",status:"PENDENTE",responsavelUsuarioId:user.id,responsavelNome:user.nomeCompleto,responsavelPerfil:user.perfil,dataHoraRegistro:getAppNow()}});
 }else if(operation==="signItem"){
 const record=source.amostras.find(r=>r.id===Number(text(input,"registroId")));if(!record||record.status!=="PREENCHIDO")throw Error("Somente itens preenchidos podem ser assinados.");if(record.responsavelUsuarioId===user.id)throw Error("A assinatura de supervisor deve ser feita por outro usuário autorizado.");
 const credentials=await tx.usuario.findUniqueOrThrow({where:{id:user.id}});if(!verifyPassword(text(input,"senhaConfirmacao"),credentials.senhaHash))throw Error("Senha inválida.");
 await tx.controleBuffetAmostraRegistro.update({where:{id:record.id},data:{status:"ASSINADO",assinaturaUsuarioId:user.id,assinaturaNome:user.nomeCompleto,assinaturaPerfil:user.perfil,assinaturaDataHora:getAppNow()}});
 await tx.logAssinatura.create({data:{usuarioId:user.id,nomeUsuario:user.nomeUsuario,nomeCompleto:user.nomeCompleto,perfil:user.perfil,tipo:"SUPERVISOR",modulo:"controle-buffet-amostras/item",referenciaId:String(record.id),observacao:`Fluxo ${unit.id}, versão ${unit.versao+1}`}});
 }else{
 const keys=input.getAll("rowKey").map(String);if(new Set(keys).size!==keys.length)throw Error("Linhas duplicadas.");
 for(const rowKey of keys){const itemId=rowKey.startsWith("item-")?Number(rowKey.slice(5)):null;const old=source.amostras.find(r=>itemId?r.itemId===itemId:r.itemExtra&&r.id===Number(rowKey.slice(6)));
 const item=itemId?draft.manifest.find(i=>i.id===itemId):old?{nome:old.itemNome,classificacao:old.classificacao,usaGarrafaTermica:old.usaGarrafaTermica}:null;if(!item)throw Error("Item não pertence a este serviço.");
 if(old?.assinaturaDataHora&&unit.estado!=="REABERTO")continue;
 const row:Record<string,string>={};for(const field of ["tcEquipamento","primeiraTc","temperaturaTipo","acaoCorretiva","observacao","naoServido","horarioExecucao","horarioNaoInformado","justificativaHorario"]){row[field]=text(input,rowKey+"-"+field);if(row[field].length>4000)throw Error("Texto muito longo.");}draft.rows[rowKey]=row;
 const fields={tcEquipamentoInput:row.tcEquipamento,primeiraTcInput:row.primeiraTc,temperaturaTipo:row.temperaturaTipo,acaoCorretivaInput:row.acaoCorretiva,observacao:row.observacao,naoServido:row.naoServido==="true"};
 let payload:Prisma.ControleBuffetAmostraRegistroUncheckedUpdateInput;
 try{const issue=getRegistroItemIssue(item,fields);if(issue){if(old)await tx.controleBuffetAmostraRegistro.update({where:{id:old.id},data:{status:"PENDENTE"}});continue;}
 payload=fields.naoServido?buildNaoServidoPayload({actor:user,item,observacao:row.observacao}):await buildRegistroPayload({actor:user,item,input:{...fields,execution:readExecutionTime(input,date,rowKey+"-")}},tx);
 }catch(error){if(text(input,"intent")==="complete")throw error;if(old)await tx.controleBuffetAmostraRegistro.update({where:{id:old.id},data:{status:"PENDENTE"}});continue;}
 const signatureReset=unit.estado==="REABERTO"?{assinaturaUsuarioId:null,assinaturaNome:null,assinaturaPerfil:null,assinaturaDataHora:null}:{};
 if(old)await tx.controleBuffetAmostraRegistro.update({where:{id:old.id},data:{...payload,...signatureReset,dataHoraRegistro:old.dataHoraRegistro}});
 else await tx.controleBuffetAmostraRegistro.create({data:{...payload,data:date,servicoId:serviceId,fluxoId:unit.id,itemId,itemExtra:false} as Prisma.ControleBuffetAmostraRegistroUncheckedCreateInput});
 }
 }
 const records=(await tx.fluxoOperacional.findUniqueOrThrow({where:{id:unit.id},include:{amostras:{orderBy:{id:"asc"}}}})).amostras;
 // Transaction include bypasses the public report filter; drafts remain visible here.
 const active=records.filter(r=>!r.excluidoEm);
 const required=draft.manifest.length+active.filter(r=>r.itemExtra).length;
 const resolved=draft.manifest.filter(i=>active.some(r=>r.itemId===i.id&&r.status!=="PENDENTE")).length+active.filter(r=>r.itemExtra&&r.status!=="PENDENTE").length;
 const complete=required>0&&resolved===required;if(!complete&&text(input,"intent")==="complete")throw Error("Resolva todos os itens antes de concluir.");
 return{snapshot:buffetSnapshot(active,draft.manifest),draft:JSON.parse(JSON.stringify(draft)),complete,resolved,required:Math.max(required,1)};
 }
};
