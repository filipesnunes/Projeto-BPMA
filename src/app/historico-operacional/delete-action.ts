"use server";
import { redirect } from "next/navigation";
import { getCurrentUserForAction } from "@/lib/auth-session";
import { deleteOperationalRecord, operationalDeletionModels, type DeletionTarget } from "@/lib/operational-deletion";
import { operationalRecordModule } from "@/lib/operational-record-modules";
import { rethrowIfRedirectError } from "@/lib/redirect-error";

export async function deleteOperationalRecordAction(form: FormData) {
  const target = String(form.get("target")) as DeletionTarget;
  if (!Object.hasOwn(operationalDeletionModels, target)) throw new Error("Módulo inválido.");
  const moduleCode = target === "nota" ? "rastreabilidade" : target;
  const path = operationalRecordModule(moduleCode).path;
  const url = new URL(path, "http://localhost");
  url.searchParams.set("exclusaoData", String(form.get("exclusaoData") ?? ""));
  try {
    const reason = form.get("justificativaExclusao");
    await deleteOperationalRecord({ user: await getCurrentUserForAction(), target, id: Number(form.get("id")), reason: typeof reason === "string" ? reason : "" });
    url.searchParams.set("feedbackType", "success");
    url.searchParams.set("feedback", "Registro excluído com justificativa e auditoria.");
  } catch (error) {
    rethrowIfRedirectError(error);
    url.searchParams.set("feedbackType", "error");
    url.searchParams.set("feedback", error instanceof Error && !/prisma|P20\d\d/i.test(error.message) ? error.message : "Não foi possível excluir o registro.");
  }
  redirect(url.pathname + url.search);
}
