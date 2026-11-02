import { buffetLinkedItemOrder } from "./item-ordering";
import { buffetProgress } from "./progress";
import {assertGroupDeletion,auditGroupDeletion} from "@/lib/operational-workflow/group-deletion";
﻿import "server-only";
import {Prisma, type ControleBuffetAmostraRegistro} from "@prisma/client";

import {assertWorkflowEdit} from "@/lib/operational-workflow/policy";
import type {WorkflowAdapter} from "@/lib/operational-workflow/contracts";
import {getAppNow,parseAppDateInput} from "@/lib/date-time";
import {prepareBuffetRow} from "./row-save";

import {isServicoDisponivelNaData} from "./utils";

export {refreshWorkflowActor} from "../controle-temperatura-equipamentos/workflow-adapter";
export type BuffetDraft={ issues?:Record<string,string[]>; rows:Record<string,Record<string,string>>; manifest:Array<{id:number;nome:string;classificacao:"QUENTE"|"FRIO"|"TEMPERATURA_AMBIENTE";usaGarrafaTermica:boolean}> };
const text=(form:FormData,key:string)=>typeof form.get(key)==="string"?String(form.get(key)).trim():"";
export function parseBuffetKey(key:string){const m=/^(\d+):(\d{4}-\d{2}-\d{2})$/.exec(key),date=m&&parseAppDateInput(m[2]);if(!m||!date)throw Error("Serviço/data inválidos.");return {serviceId:Number(m[1]),date};}
export function buffetSnapshot(records:ControleBuffetAmostraRegistro[],manifest:BuffetDraft['manifest']):Prisma.InputJsonObject{return JSON.parse(JSON.stringify({manifest,records:records.map(record=>{const{updatedAt,assinaturaNutricionistaUsuarioId,assinaturaNutricionistaNome,assinaturaNutricionistaPerfil,assinaturaNutricionistaDataHora,...data}=record;void updatedAt;void assinaturaNutricionistaUsuarioId;void assinaturaNutricionistaNome;void assinaturaNutricionistaPerfil;void assinaturaNutricionistaDataHora;return data;})}));}
export const buffetAdapter:WorkflowAdapter={
 module:"amostras",
 authorizeSave(user,input,context){if(input instanceof FormData&&text(input,"operation")==="deleteItem"){assertGroupDeletion(user,"amostras",text(input,"justificativa"));}else if(input instanceof FormData&&text(input,"operation")==="signItem"){throw Error("Assine uma única vez o serviço completo pela Validação do Serviço.");}else assertWorkflowEdit({user,module:"amostras",...context});},
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
 throw Error("Assine o serviço completo pela Validação do Serviço.");
 }else{
 const keys=input.getAll("rowKey").map(String);if(keys.some(key=>! /^(item|extra)-[1-9]\d*$/.test(key))||new Set(keys).size!==keys.length)throw Error("Linhas inválidas ou duplicadas.");
 for(const rowKey of keys){const itemId=rowKey.startsWith("item-")?Number(rowKey.slice(5)):null;const old=source.amostras.find(r=>itemId?r.itemId===itemId:r.itemExtra&&r.id===Number(rowKey.slice(6)));
 const item=itemId?draft.manifest.find(i=>i.id===itemId):old?{nome:old.itemNome,classificacao:old.classificacao,usaGarrafaTermica:old.usaGarrafaTermica}:null;if(!item)throw Error("Item não pertence a este serviço.");
 if((old?.status==="ASSINADO"||old?.assinaturaDataHora)&&unit.estado!=="REABERTO")continue;
 const prepared=await prepareBuffetRow(tx,{form:input,rowKey,item,date,actor:user,old,previous:draft.rows[rowKey],complete:text(input,"intent")==="complete"});
 if(prepared.unchanged)continue;
 draft.rows[rowKey]=prepared.row;draft.issues??={};
 if(prepared.issues.length)draft.issues[rowKey]=prepared.issues;else delete draft.issues[rowKey];
 const payload=prepared.payload;if(!payload)continue;
 const signatureReset=unit.estado==="REABERTO"?{assinaturaUsuarioId:null,assinaturaNome:null,assinaturaPerfil:null,assinaturaDataHora:null}:{};
 if(old)await tx.controleBuffetAmostraRegistro.update({where:{id:old.id},data:{...payload,...signatureReset,dataHoraRegistro:old.dataHoraRegistro}});
 else await tx.controleBuffetAmostraRegistro.create({data:{...payload,data:date,servicoId:serviceId,fluxoId:unit.id,itemId,itemExtra:false} as Prisma.ControleBuffetAmostraRegistroUncheckedCreateInput});
 }
 }
 const records=(await tx.fluxoOperacional.findUniqueOrThrow({where:{id:unit.id},include:{amostras:{orderBy:{id:"asc"}}}})).amostras;
 // Transaction include bypasses the public report filter; drafts remain visible here.
 const active=records.filter(r=>!r.excluidoEm);
 const {required,resolved,complete}=buffetProgress(active,draft.manifest);if(!complete&&text(input,"intent")==="complete")throw Error("Resolva todos os itens antes de concluir.");
 return{snapshot:buffetSnapshot(active,draft.manifest),draft:JSON.parse(JSON.stringify(draft)),complete,resolved,required:Math.max(required,1)};
 }
};
