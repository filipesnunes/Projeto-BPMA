"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUserForAction } from "@/lib/auth-session";
import { saveWorkflow, reopenWorkflow, signWorkflow } from "@/lib/operational-workflow/service";
import { deleteOperationalRecord } from "@/lib/operational-deletion";
import { prisma } from "@/lib/prisma";
import { rethrowIfRedirectError } from "@/lib/redirect-error";
import { temperatureAdapter, temperatureSignatureBridge, refreshWorkflowActor } from "./workflow-adapter";

const base = "/controle-temperatura-equipamentos";
const value = (form: FormData, key: string) => typeof form.get(key) === "string" ? String(form.get(key)).trim() : "";
function version(form: FormData) {
  const raw = value(form, "versao");
  if (!/^\d+$/.test(raw)) throw new Error("Versão ausente. Recarregue o formulário.");
  return Number(raw);
}
function refresh() {
  revalidatePath(base, "layout"); revalidatePath("/relatorios"); revalidatePath("/");
  revalidatePath("/relatorios/controle-temperatura-equipamentos/mensal");
}
function result(path: string, message: string, error = false): never {
  const url = new URL(path, "http://localhost"); url.searchParams.set("feedback", message);
  url.searchParams.set("feedbackType", error ? "error" : "success"); redirect(url.pathname + url.search);
}
function message(error: unknown) {
  return error instanceof Error && !/prisma|p20\d{2}|transaction|stack/i.test(error.message)
    ? error.message : "Não foi possível salvar. Recarregue os dados e tente novamente.";
}
export async function saveTemperatureWorkflowAction(form: FormData) {
  const key = value(form, "chave");
  const returnTo = `${base}/fluxo?chave=${encodeURIComponent(key)}`;
  try {
    const authenticated = await getCurrentUserForAction();
    const saved = await saveWorkflow({ actor: tx => refreshWorkflowActor(tx, authenticated), adapter: temperatureAdapter,
      key, expectedVersion: version(form), input: form });
    refresh();
    result(saved.estado === "COMPLETO" ? `${base}/historico?data=${saved.dataReferencia.toISOString().slice(0,10)}` : returnTo,
      saved.estado === "COMPLETO" ? "Aferição completa. Aguardando validação do supervisor." : "Preenchimento salvo. Você pode continuar depois.");
  } catch (error) { rethrowIfRedirectError(error); result(returnTo, message(error), true); }
}
export async function reopenTemperatureWorkflowAction(form: FormData) {
  const key = value(form, "chave"); const returnTo = `${base}/fluxo?chave=${encodeURIComponent(key)}`;
  try {
    if (value(form, "confirmar") !== "true") throw new Error("Confirme explicitamente a reabertura.");
    const authenticated = await getCurrentUserForAction();
    await reopenWorkflow({ actor: tx => refreshWorkflowActor(tx, authenticated), module: "temperatura", id: value(form, "id"),
      expectedVersion: version(form), reason: value(form, "justificativa"), fromEdit: value(form, "origem") === "editar" });
    refresh(); result(returnTo, "Aferição reaberta. Uma nova assinatura será necessária.");
  } catch (error) { rethrowIfRedirectError(error); result(returnTo, message(error), true); }
}
export async function signTemperatureWorkflowAction(form: FormData) {
  try {
    const authenticated = await getCurrentUserForAction();
    const scope = form.getAll("unidade").map(entry => {
      const [id, revision] = String(entry).split(":");
      if (!id || !/^\d+$/.test(revision)) throw new Error("Escopo de assinatura inválido.");
      return { id, version: Number(revision) };
    });
    await signWorkflow({ actor: tx => refreshWorkflowActor(tx, authenticated), scope,
      bridge: temperatureSignatureBridge(value(form, "senha"), value(form, "mecanismo") === "diaria") });
    refresh(); result(`${base}/historico`, "Validação registrada para as versões selecionadas.");
  } catch (error) { rethrowIfRedirectError(error); result(`${base}/historico`, message(error), true); }
}
export async function deleteTemperatureWorkflowAction(form: FormData) {
  try {
    const user = await getCurrentUserForAction();
    const record = await prisma.controleTemperaturaEquipamento.findUnique({ where: { id: Number(value(form, "registroId")) } });
    if (!record?.fluxoId) throw new Error("Aferição não encontrada.");
    await deleteOperationalRecord({ user, target: "temperatura", id: record.id,
      reason: value(form, "justificativa"), expectedVersion: version(form) });
    refresh(); result(`${base}/historico`, "Aferição excluída com auditoria.");
  } catch (error) { rethrowIfRedirectError(error); result(`${base}/historico`, message(error), true); }
}
