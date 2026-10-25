"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {getCurrentUserForAction} from "@/lib/auth-session";
import {refreshWorkflowActor} from "@/app/controle-temperatura-equipamentos/workflow-adapter";
import {reopenWorkflow,signWorkflow} from "@/lib/operational-workflow/service";
import {groupSignatureBridge,type GroupModule} from "@/lib/operational-workflow/group-signatures";
import {rethrowIfRedirectError} from "@/lib/redirect-error";
const paths={amostras:"/controle-buffet-amostras",rastreabilidade:"/rastreabilidade-recebimento"};
const text=(f:FormData,k:string)=>typeof f.get(k)==="string"?String(f.get(k)).trim():"";
export async function groupWorkflowAction(form:FormData){const moduleCode=text(form,"modulo") as GroupModule;if(!Object.hasOwn(paths,moduleCode))throw Error("Módulo inválido.");const root=paths[moduleCode],requested=text(form,"returnTo"),url=new URL(requested.startsWith(root)?requested:root,"http://localhost");url.searchParams.delete("confirmar");
 try{const user=await getCurrentUserForAction();if(text(form,"operation")==="reopen"){if(text(form,"confirmar")!=="true")throw Error("Confirme a reabertura.");await reopenWorkflow({actor:tx=>refreshWorkflowActor(tx,user),module:moduleCode,id:text(form,"fluxoId"),expectedVersion:Number(text(form,"versao")),reason:text(form,"justificativa"),fromEdit:true});url.searchParams.set("feedback","Registro reaberto. É necessária nova assinatura.");}
 else{const scope=form.getAll("unidade").map(entry=>{const[id,version]=String(entry).split(":");if(!id||!/^\d+$/.test(version))throw Error("Escopo inválido.");return{id,version:Number(version)};});await signWorkflow({actor:tx=>refreshWorkflowActor(tx,user),bridge:groupSignatureBridge(moduleCode,text(form,"mecanismo"),text(form,"senha")),scope});url.searchParams.set("feedback","Assinatura registrada para as versões selecionadas.");}
 revalidatePath(root,"layout");revalidatePath("/relatorios","layout");revalidatePath("/");url.searchParams.set("feedbackType","success");
 }catch(error){rethrowIfRedirectError(error);url.searchParams.set("feedbackType","error");url.searchParams.set("feedback",error instanceof Error&&!/prisma|p20\d|transaction|stack/i.test(error.message)?error.message:"Não foi possível concluir. Recarregue os dados.");}redirect(url.pathname+url.search);}
