import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getCurrentUserForAction } from "@/lib/auth-session";
import { getAppDate, formatAppDateInput, parseAppDateInput } from "@/lib/date-time";
import { saveWorkflow } from "@/lib/operational-workflow/service";
import { temperatureAdapter, refreshWorkflowActor } from "@/app/controle-temperatura-equipamentos/workflow-adapter";
import { oilAdapter } from "@/app/controle-qualidade-oleo/workflow-adapter";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { rethrowIfRedirectError } from "@/lib/redirect-error";

// The familiar single-save form writes through the same transactional adapters.
// Existing signed content and the draft/version store are never bypassed.
export async function createFromOriginalForm(module: "temperatura" | "oleo", form: FormData) {
  const base = module === "temperatura" ? "/controle-temperatura-equipamentos" : "/controle-qualidade-oleo";
  const input = (key: string) => String(form.get(key) ?? "").trim();
  const returnTo = input("returnTo");
  const target = new URL(returnTo.startsWith(base) && !returnTo.startsWith("//") ? returnTo : base, "http://localhost");
  try {
    const user = await getCurrentUserForAction();
    const date = form.has("data") ? parseAppDateInput(input("data")) : getAppDate();
    if (!date) throw new Error("Informe uma data válida para o registro.");
    let key: string;
    if (module === "temperatura") {
      const equipment = await prisma.controleTemperaturaEquipamentoOpcao.findFirst({where:{nome:input("equipamento"),tipo:"EQUIPAMENTO",ativo:true}});
      if (!equipment) throw new Error("Selecione um equipamento ativo.");
      const shift = input("turno");
      if (!["MANHA", "TARDE"].includes(shift)) throw new Error("Selecione um turno válido.");
      key = `${equipment.id}:${formatAppDateInput(date)}:${shift}`;
      // Deletion preserves the tombstone; a replacement gets an explicit identity.
      const removed = await prisma.fluxoOperacional.findUnique({where:{modulo_chave:{modulo:module,chave:key}}});
      if (removed?.excluidoEm) key += `:${randomUUID()}`;
    } else {
      const request = input("workflowRequestId");
      if (!/^[a-f0-9-]{36}$/.test(request)) throw new Error("Reabra o formulário para salvar este registro.");
      key = `${formatAppDateInput(date)}:${request}`;
    }
    form.set("intent", "complete");
    await saveWorkflow({actor:tx=>refreshWorkflowActor(tx,user),adapter:module === "temperatura" ? temperatureAdapter : oilAdapter,key,expectedVersion:0,input:form});
    revalidatePath(base,"layout"); revalidatePath("/relatorios"); revalidatePath("/");
    target.searchParams.delete("new");
    target.searchParams.set("dataRegistro",formatAppDateInput(date));
    target.searchParams.set("feedbackType","success");
    target.searchParams.set("feedback","Registro salvo com sucesso.");
  } catch (error) {
    rethrowIfRedirectError(error);
    target.searchParams.set("new","1");
    target.searchParams.set("feedbackType","error");
    target.searchParams.set("feedback", error instanceof Error && !/prisma|p20\d{2}|transaction|stack/i.test(error.message) ? error.message : "Não foi possível salvar. Confira os campos e tente novamente.");
    target.searchParams.set("formDataReferencia", input("data"));
    if (module === "oleo") {
      for (const [queryKey, field] of [["formFita","fitaOleo"],["formTemperatura","temperatura"],["formSemUtilizacao","semUtilizacao"],["formObservacao","observacao"]]) target.searchParams.set(queryKey,input(field));
    }
  }
  redirect(target.pathname+target.search);
}
