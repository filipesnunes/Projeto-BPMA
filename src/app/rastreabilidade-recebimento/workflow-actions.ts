"use server";
import {randomUUID} from "node:crypto";
import {revalidatePath} from "next/cache";
import {getCurrentUserForAction} from "@/lib/auth-session";
import {saveWorkflow} from "@/lib/operational-workflow/service";
import {getAppDate,parseAppDateInput,formatAppDateInput} from "@/lib/date-time";
import {prisma} from "@/lib/prisma";
import {receivingAdapter,refreshWorkflowActor} from "./workflow-adapter";
export async function startReceivingWorkflow(form:FormData,operation:"xml"|"manual"){
 const user=await getCurrentUserForAction();const raw=form.get("data"),date=raw===null?getAppDate():parseAppDateInput(String(raw));if(!date)throw Error("Data inválida.");
 const unit=await saveWorkflow({actor:tx=>refreshWorkflowActor(tx,user),adapter:receivingAdapter,key:`${formatAppDateInput(date)}:${/^[a-f0-9-]{36}$/.test(String(form.get("workflowRequestId")??""))?String(form.get("workflowRequestId")):randomUUID()}`,expectedVersion:0,input:{operation,form}});
 const note=await prisma.rastreabilidadeRecebimentoNota.findFirstOrThrow({where:{fluxoId:unit.id}});revalidatePath("/rastreabilidade-recebimento","layout");return note.id;
}
export async function saveReceivingWorkflowState(form:FormData){
 try{const version=String(form.get("versao")??"");if(!/^\d+$/.test(version))throw Error("Versão ausente. Recarregue a página.");const user=await getCurrentUserForAction();const note=await prisma.rastreabilidadeRecebimentoNota.findUnique({where:{id:Number(form.get("notaId"))},include:{fluxo:true}});if(!note?.fluxo)throw Error("Recebimento não encontrado.");
 const unit=await saveWorkflow({actor:tx=>refreshWorkflowActor(tx,user),adapter:receivingAdapter,key:note.fluxo.chave,expectedVersion:Number(version),input:form});revalidatePath("/rastreabilidade-recebimento","layout");revalidatePath("/relatorios","layout");revalidatePath("/");return{status:"success" as const,message:unit.estado==="COMPLETO"?"Conferência finalizada. Aguardando assinatura.":"Preenchimento salvo. Você pode continuar depois."};
 }catch(error){return{status:"error" as const,invalidRowKey:error instanceof Error&&"invalidRowKey" in error?String(error.invalidRowKey):undefined,invalidField:error instanceof Error&&"invalidField" in error?String(error.invalidField):undefined,message:error instanceof Error&&!/prisma|transaction|p20\d|stack/i.test(error.message)?error.message:"Não foi possível salvar. Recarregue a página."};}
}

export async function mutateReceivingWorkflowAction(form:FormData){const state=await saveReceivingWorkflowState(form);const {redirect}=await import("next/navigation");const operation=String(form.get("operation"));redirect(`${operation==='deleteNote'&&state.status==='success'?'/rastreabilidade-recebimento/historico':'/rastreabilidade-recebimento/nota/'+String(form.get("notaId"))}?feedback=${encodeURIComponent(state.message)}`);}
