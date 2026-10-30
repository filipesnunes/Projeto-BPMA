"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUserForAction } from "@/lib/auth-session";
import { saveWorkflow, reopenWorkflow, signWorkflow } from "@/lib/operational-workflow/service";
import { deleteOperationalRecord } from "@/lib/operational-deletion";
import { prisma } from "@/lib/prisma";
import { rethrowIfRedirectError } from "@/lib/redirect-error";
import { temperatureAdapter, temperatureSignatureBridge, refreshWorkflowActor } from "./workflow-adapter";
import {adoptLegacyTemperature,legacyTemperatureId,legacyTemperatureFlowId} from "./legacy-workflow";
import { temperatureHistoryReturnTo, withTemperatureHistory } from "./history-navigation";

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
async function persistTemperature(form: FormData) {
  const authenticated = await getCurrentUserForAction();
  const key = value(form, "chave"), legacyId = legacyTemperatureId(key), revision = version(form);
  return saveWorkflow({ actor: tx => refreshWorkflowActor(tx, authenticated), adapter: temperatureAdapter,
    key, expectedVersion: legacyId && revision === 0 ? 1 : revision, input: form,
    prepare: legacyId && revision === 0 ? (tx, user) => adoptLegacyTemperature(tx, user, legacyId, value(form, "originalUpdatedAt"), "save") : undefined });
}
export async function saveTemperatureRecordAction(form: FormData): Promise<{ error: string }> {
  try {
    const saved = await persistTemperature(form);
    refresh();
    const day = saved.dataReferencia.toISOString().slice(0, 10);
    const destination = temperatureHistoryReturnTo(value(form, "returnTo"), saved.dataReferencia)
      ?? `${base}/historico?filtroData=${day}&dia=${day}`;
    result(destination, "Alterações salvas com sucesso.");
  } catch (error) { rethrowIfRedirectError(error); return { error: message(error) }; }
}
export async function saveTemperatureWorkflowAction(form: FormData) {
  const key = value(form, "chave");
  const returnTo = withTemperatureHistory(`${base}/fluxo?chave=${encodeURIComponent(key)}`, temperatureHistoryReturnTo(value(form,"returnTo")));
  try {
    const saved = await persistTemperature(form);
    refresh();
    result(temperatureHistoryReturnTo(value(form,"returnTo"), saved.dataReferencia) ?? (saved.estado === "COMPLETO" ? `${base}/historico?filtroData=${saved.dataReferencia.toISOString().slice(0,10)}&dia=${saved.dataReferencia.toISOString().slice(0,10)}` : returnTo),
      saved.estado === "COMPLETO" ? "Aferição completa. Aguardando validação do supervisor." : "Preenchimento salvo. Você pode continuar depois.");
  } catch (error) { rethrowIfRedirectError(error); result(returnTo, message(error), true); }
}
export async function reopenTemperatureWorkflowAction(form: FormData) {
  const key = value(form, "chave"); const returnTo = withTemperatureHistory(`${base}/fluxo?chave=${encodeURIComponent(key)}`, temperatureHistoryReturnTo(value(form,"returnTo")));
  try {
    if (value(form, "confirmar") !== "true") throw new Error("Confirme explicitamente a reabertura.");
    const authenticated = await getCurrentUserForAction();
    const legacyId=legacyTemperatureId(key),revision=version(form);
    await reopenWorkflow({ actor: tx => refreshWorkflowActor(tx, authenticated), module: "temperatura", id: legacyId?legacyTemperatureFlowId(legacyId):value(form,"id"),
      expectedVersion:legacyId&&revision===0?1:revision,reason:value(form,"justificativa"),fromEdit:false,
      prepare:legacyId&&revision===0?(tx,user)=>adoptLegacyTemperature(tx,user,legacyId,value(form,"originalUpdatedAt"),"reopen"):undefined });
    refresh(); result(returnTo, "Aferição reaberta. Uma nova assinatura será necessária.");
  } catch (error) { rethrowIfRedirectError(error); result(returnTo, message(error), true); }
}
export async function signTemperatureWorkflowAction(form: FormData) {
  try {
    const authenticated = await getCurrentUserForAction();
    const legacyId=Number(value(form,"legacyRecordId"));
    const scope = legacyId>0?[{id:legacyTemperatureFlowId(legacyId),version:1}]:form.getAll("unidade").map(entry => {
      const [id, revision] = String(entry).split(":");
      if (!id || !/^\d+$/.test(revision)) throw new Error("Escopo de assinatura inválido.");
      return { id, version: Number(revision) };
    });
    await signWorkflow({ actor: tx => refreshWorkflowActor(tx, authenticated), scope,
      bridge: temperatureSignatureBridge(value(form, "senha"), value(form, "mecanismo") === "diaria"),
      prepare:legacyId>0?(tx,user)=>adoptLegacyTemperature(tx,user,legacyId,value(form,"originalUpdatedAt"),"sign"):undefined });
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
