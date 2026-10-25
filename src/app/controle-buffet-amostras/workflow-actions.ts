"use server";
import {revalidatePath} from "next/cache";
import {getCurrentUserForAction} from "@/lib/auth-session";
import {saveWorkflow} from "@/lib/operational-workflow/service";
import {buffetAdapter,refreshWorkflowActor} from "./workflow-adapter";
const text=(f:FormData,k:string)=>typeof f.get(k)==="string"?String(f.get(k)).trim():"";
export async function saveBuffetWorkflowState(form:FormData,operation="save"){
 try{const version=text(form,"versao");if(!/^\d+$/.test(version))throw Error("Versão ausente. Recarregue a página.");const user=await getCurrentUserForAction();form.set("operation",operation);
 const unit=await saveWorkflow({actor:tx=>refreshWorkflowActor(tx,user),adapter:buffetAdapter,key:`${text(form,"servicoId")}:${text(form,"data")}`,expectedVersion:Number(version),input:form});
 revalidatePath("/controle-buffet-amostras","layout");revalidatePath("/relatorios","layout");revalidatePath("/");return{status:"success" as const,message:unit.estado==="COMPLETO"?"Serviço completo. Aguardando assinatura do supervisor.":unit.estado==="REABERTO"?"Preenchimento salvo. Serviço reaberto aguardando nova assinatura.":"Preenchimento parcial salvo com sucesso."};
 }catch(error){return{status:"error" as const,message:error instanceof Error&&!/prisma|transaction|p20\d|stack/i.test(error.message)?error.message:"Não foi possível salvar. Recarregue os dados."};}
}

export async function deleteBuffetItemWorkflowAction(form:FormData){const state=await saveBuffetWorkflowState(form,"deleteItem");const {redirect}=await import("next/navigation");redirect(`/controle-buffet-amostras/servico/${String(form.get("servicoId"))}?data=${encodeURIComponent(String(form.get("data")))}&feedback=${encodeURIComponent(state.message)}`);}

export async function openBuffetDateAction(form:FormData) {
  const {redirect}=await import("next/navigation");
  const {getCurrentUser}=await import("@/lib/auth-session");
  const {hasPermission}=await import("@/lib/permissions");
  const {parseAppDateInput,formatAppDateInput,getAppDate}=await import("@/lib/date-time");
  const user=await getCurrentUser();
  if(!user||!hasPermission(user,"modulo.amostras.acessar"))return redirect("/acesso-negado");
  const id=Number(form.get("servicoId"));
  const date=parseAppDateInput(String(form.get("data")));
  if(!Number.isSafeInteger(id)||id<1||!date)return redirect("/controle-buffet-amostras");
  if(formatAppDateInput(date)<formatAppDateInput(getAppDate())&&!hasPermission(user,"modulo.amostras.acessar_historico")&&!hasPermission(user,"modulo.amostras.editar_historico"))return redirect("/acesso-negado");
  return redirect(`/controle-buffet-amostras/servico/${id}?data=${formatAppDateInput(date)}`);
}
