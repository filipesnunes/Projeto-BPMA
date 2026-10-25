import {assertGroupDeletion,auditGroupDeletion} from "@/lib/operational-workflow/group-deletion";
import {assertWorkflowEdit} from "@/lib/operational-workflow/policy";
﻿import "server-only";
import {Prisma} from "@prisma/client";
import type {WorkflowAdapter} from "@/lib/operational-workflow/contracts";
import {getAppNow,parseAppDateInput,formatAppDateInput} from "@/lib/date-time";
import {readExecutionTime} from "@/lib/procedure-time";
import {parseRecebimentoXml} from "./xml-parser";
import {determineCategoryForProduct,parseTemperaturaRecebimentoTipo,validateAndBuildItemPayload} from "./workflow-payload";
export {refreshWorkflowActor} from "../controle-temperatura-equipamentos/workflow-adapter";
export type ReceivingDraft={rows:Record<string,Record<string,string>>;time:Record<string,string>};
export type ReceivingCreate={operation:"xml"|"manual";form:FormData};
const text=(form:FormData,key:string)=>typeof form.get(key)==="string"?String(form.get(key)).trim():"";
export function parseReceivingKey(key:string){const m=/^(\d{4}-\d{2}-\d{2}):([a-f0-9-]{36})$/.exec(key),date=m&&parseAppDateInput(m[1]);if(!date)throw Error("Identificação do recebimento inválida.");return{date};}
export function receivingSnapshot(note:object):Prisma.InputJsonObject{return JSON.parse(JSON.stringify(note, (key,value)=>key==="updatedAt"?undefined:value));}
export const receivingAdapter:WorkflowAdapter={
 module:"rastreabilidade",
 authorizeSave(user,input,context){if(input instanceof FormData&&["deleteItem","deleteNote"].includes(text(input,"operation")))assertGroupDeletion(user,"rastreabilidade",text(input,"justificativa"));else assertWorkflowEdit({user,module:"rastreabilidade",...context});},
 async load(_tx,key){return{date:parseReceivingKey(key).date,legacy:false,content:{snapshot:{},draft:{},complete:false,resolved:0,required:1}};},
 async save(tx,key,input,user,unit){
 const{date}=parseReceivingKey(key);await tx.$executeRaw`SELECT set_config('bpma.workflow_flow',${unit.id},true)`;
 const source=await tx.fluxoOperacional.findUniqueOrThrow({where:{id:unit.id},include:{recebimento:{include:{itens:{where:{excluidoEm:null},orderBy:{id:"asc"}}}},versoes:{orderBy:{versao:"desc"},take:1}}});
 const categories=await tx.rastreabilidadeRecebimentoCategoria.findMany({where:{ativo:true},orderBy:{nome:"asc"}});if(!categories.length)throw Error("Cadastre categorias ativas para a conferência.");
 const draft:ReceivingDraft=source.versoes[0]?structuredClone(source.versoes[0].rascunho) as unknown as ReceivingDraft:{rows:{},time:{}};
 let note=source.recebimento;
 if(input instanceof FormData&&text(input,"operation")==="addItem"){
 if(!note)throw Error("Nota não encontrada.");const produto=text(input,"produto");if(!produto)throw Error("Informe o produto.");await tx.rastreabilidadeRecebimentoRegistro.create({data:{notaId:note.id,data:date,produto,fornecedor:note.fornecedor,notaFiscal:note.notaFiscal,statusGeral:"PENDENTE"}});
 await tx.rastreabilidadeRecebimentoNota.update({where:{id:note.id},data:{statusNota:"EM_CONFERENCIA"}});const changed=await tx.rastreabilidadeRecebimentoNota.findUniqueOrThrow({where:{id:note.id},include:{itens:{where:{excluidoEm:null},orderBy:{id:"asc"}}}});return{snapshot:receivingSnapshot(changed),draft:JSON.parse(JSON.stringify(draft)),complete:false,resolved:changed.itens.filter(i=>i.statusGeral!=="PENDENTE").length,required:Math.max(1,changed.itens.length+1)};
 }else if(input instanceof FormData&&["deleteItem","deleteNote"].includes(text(input,"operation"))){
 if(!note)throw Error("Nota não encontrada.");const whole=text(input,"operation")==="deleteNote",reason=text(input,"justificativa");
 const items=whole?note.itens:note.itens.filter(i=>i.id===Number(text(input,"registroId")));if(!whole&&!items.length)throw Error("Item não encontrado.");for(const item of items){await auditGroupDeletion(tx,user,"rastreabilidade","rastreabilidadeRecebimentoRegistro",item,reason);await tx.rastreabilidadeRecebimentoRegistro.update({where:{id:item.id},data:{excluidoEm:getAppNow()}});delete draft.rows[String(item.id)];}
 if(whole){await auditGroupDeletion(tx,user,"rastreabilidade","rastreabilidadeRecebimentoNota",note,reason);await tx.rastreabilidadeRecebimentoNota.update({where:{id:note.id},data:{excluidoEm:getAppNow()}});await tx.fluxoOperacional.update({where:{id:unit.id},data:{excluidoEm:getAppNow()}});return{snapshot:receivingSnapshot(note),draft:JSON.parse(JSON.stringify(draft)),complete:false,resolved:0,required:1};}
 note=(await tx.fluxoOperacional.findUniqueOrThrow({where:{id:unit.id},include:{recebimento:{include:{itens:{where:{excluidoEm:null},orderBy:{id:"asc"}}}}}})).recebimento;if(!note)throw Error("Nota não encontrada.");
 }else if(!(input instanceof FormData)){
 const creation=input as ReceivingCreate;if(!creation?.form||!['xml','manual'].includes(creation.operation)||note)throw Error("Solicitação inválida.");const form=creation.form;
 if(creation.operation==="xml"){
 if(!["DEV","GERENTE"].includes(user.perfil))throw Error("Importação XML permitida apenas para DEV e GERENTE.");const file=form.get("xmlFile");if(!(file instanceof File)||!file.name.toLowerCase().endsWith('.xml')||file.size>5*1024*1024)throw Error("Selecione XML válido (até 5 MB).");const xml=await file.text(),parsed=parseRecebimentoXml(xml);
 const existing=await tx.rastreabilidadeRecebimentoNota.findFirst({where:{OR:[...(parsed.chaveNFe?[{chaveNfe:parsed.chaveNFe}]:[]),{xmlOriginal:xml},...(parsed.cnpjFornecedor?[{notaFiscal:parsed.notaFiscal,cnpjFornecedor:parsed.cnpjFornecedor,...(parsed.serieNota?{OR:[{serieNota:parsed.serieNota},{serieNota:null},{serieNota:''}]}:{})}]:[])]}});if(existing)throw Error("Esta nota fiscal já foi importada anteriormente.");
 const created=await tx.rastreabilidadeRecebimentoNota.create({data:{data:date,fluxoId:unit.id,xmlOriginal:xml,fornecedor:parsed.fornecedor,notaFiscal:parsed.notaFiscal,chaveNfe:parsed.chaveNFe,cnpjFornecedor:parsed.cnpjFornecedor,serieNota:parsed.serieNota,identificadorFiscal:parsed.cnpjFornecedor?`${parsed.cnpjFornecedor}|${parsed.notaFiscal}${parsed.serieNota?'|'+parsed.serieNota:''}`:null,statusNota:"IMPORTADA",origemXml:true,responsavelGeral:user.nomeCompleto}});
 for(const item of parsed.items)await tx.rastreabilidadeRecebimentoRegistro.create({data:{...item,notaId:created.id,data:date,categoriaId:determineCategoryForProduct(item.produto,categories).id,origemXml:true,statusGeral:"PENDENTE"}});
 }else{
 const fornecedor=text(form,"fornecedor"),notaFiscal=text(form,"notaFiscal"),produto=text(form,"produto");if(!fornecedor||!notaFiscal||!produto)throw Error("Informe fornecedor, documento e produto.");
 const created=await tx.rastreabilidadeRecebimentoNota.create({data:{data:date,fluxoId:unit.id,fornecedor,notaFiscal,statusNota:"EM_CONFERENCIA",responsavelGeral:user.nomeCompleto}});
 const item=await tx.rastreabilidadeRecebimentoRegistro.create({data:{notaId:created.id,data:date,produto,fornecedor,notaFiscal,statusGeral:"PENDENTE"}});
 draft.rows[String(item.id)]={};for(const field of ["produto","lote","dataFabricacao","semDataFabricacao","dataValidade","validadeNaoAplicavel","sif","temperatura","temperaturaTipo","transporteEntregador","aspectoSensorial","embalagem","acaoCorretiva","observacoes"])draft.rows[String(item.id)][field]=text(form,field);
 for(const field of ["horarioExecucao","horarioNaoInformado","justificativaHorario"])draft.time[field]=text(form,field);
 }
 note=(await tx.fluxoOperacional.findUniqueOrThrow({where:{id:unit.id},include:{recebimento:{include:{itens:{where:{excluidoEm:null},orderBy:{id:"asc"}}}}}})).recebimento;
 if(!note)throw Error("Não foi possível iniciar o recebimento.");
 }else{
 if(!note)throw Error("Nota não encontrada.");
 for(const field of ["horarioExecucao","horarioNaoInformado","justificativaHorario"])draft.time[field]=text(input,field);
 for(const item of note.itens){const row:Record<string,string>={};for(const field of ["produto","lote","dataFabricacao","semDataFabricacao","dataValidade","validadeNaoAplicavel","sif","temperatura","temperaturaTipo","transporteEntregador","aspectoSensorial","embalagem","acaoCorretiva","observacoes"]){const name=`item-${item.id}-${field}`,fullRow=input.has(`item-${item.id}-present`),booleanField=["semDataFabricacao","validadeNaoAplicavel"].includes(field);
 const stored=(draft.rows[String(item.id)]??{})[field];const original=item[field as keyof typeof item];
 row[field]=input.has(name)?text(input,name):booleanField&&fullRow?"":stored??(original instanceof Date?formatAppDateInput(original):typeof original==="boolean"?String(original):original==null?"":String(original));if(row[field].length>4000)throw Error("Texto muito longo.");}if(note.origemXml&&!["DEV","GERENTE"].includes(user.perfil))row.produto=item.produto;draft.rows[String(item.id)]=row;}
 }
 let resolved=0;
 for(const item of note.itens){const row=draft.rows[String(item.id)];if(!row)continue;
 try{const payload=validateAndBuildItemPayload({...row,produto:note.origemXml&&!["DEV","GERENTE"].includes(user.perfil)?item.produto:row.produto,semDataFabricacao:["true","on"].includes(row.semDataFabricacao),validadeNaoAplicavel:["true","on"].includes(row.validadeNaoAplicavel),temperaturaTipo:parseTemperaturaRecebimentoTipo(row.temperaturaTipo)} as Parameters<typeof validateAndBuildItemPayload>[0],categories,user.nomeCompleto);
 const timeForm=new FormData();for(const[k,v]of Object.entries(draft.time))timeForm.set(k,v);const time=readExecutionTime(timeForm,date);if(item.horarioExecucao&&formatAppDateInput(date)===formatAppDateInput(getAppNow()))time.horarioExecucao=item.horarioExecucao;
 await tx.rastreabilidadeRecebimentoRegistro.update({where:{id:item.id},data:{...payload,...time}});resolved++;
 }catch(error){if(input instanceof FormData&&text(input,"intent")==="finalize"){if(error instanceof Error)Object.assign(error,{invalidRowKey:`item-${item.id}`});throw error;};await tx.rastreabilidadeRecebimentoRegistro.update({where:{id:item.id},data:{statusGeral:"PENDENTE"}});}
 }
 const allResolved=note.itens.length>0&&resolved===note.itens.length;
 const finalizing=input instanceof FormData&&text(input,"intent")==="finalize";
 const finalized=allResolved&&(finalizing||note.statusNota==="FINALIZADA");
 await tx.rastreabilidadeRecebimentoNota.update({where:{id:note.id},data:{statusNota:finalized?"FINALIZADA":note.statusNota==="IMPORTADA"&&resolved===0?"IMPORTADA":"EM_CONFERENCIA",responsavelGeral:user.nomeCompleto}});
 const current=await tx.rastreabilidadeRecebimentoNota.findUniqueOrThrow({where:{id:note.id},include:{itens:{where:{excluidoEm:null},orderBy:{id:"asc"}}}});
 return{snapshot:receivingSnapshot(current),draft:JSON.parse(JSON.stringify(draft)),complete:finalized,resolved:resolved+(finalized?1:0),required:Math.max(1,note.itens.length+1)};
 }
};
