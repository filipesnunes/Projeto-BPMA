import { hasPermission, type PermissionAwareUser } from "@/lib/permissions";
import { formatAppDateInput } from "@/lib/date-time";
import type { OperationalSignatureModuleCode } from "@/lib/module-signatures";

export const WORKFLOW_STATES = ["PENDENTE", "COMPLETO", "FECHADO", "REABERTO"] as const;
export type WorkflowState = (typeof WORKFLOW_STATES)[number];
export type WorkflowOperation = "CREATE" | "SAVE" | "REOPEN" | "SIGN";

export function assertWorkflowVersion(actual: number, expected: number) {
  if (!Number.isSafeInteger(expected) || expected < 0 || actual !== expected) {
    throw new Error("Este registro foi atualizado. Recarregue os dados antes de continuar.");
  }
}

export function stateAfterSave(state: WorkflowState, complete: boolean): WorkflowState {
  if (state === "FECHADO") throw new Error("Registro fechado. Confirme uma reabertura autorizada antes de editar.");
  return state === "REABERTO" ? "REABERTO" : complete ? "COMPLETO" : "PENDENTE";
}

export function assertWorkflowAccess(user: PermissionAwareUser, module: OperationalSignatureModuleCode) {
  if (!hasPermission(user, `modulo.${module}.acessar`)) throw new Error("Sem acesso a este módulo.");
}

export function assertWorkflowEdit(params: {
  user: PermissionAwareUser; module: OperationalSignatureModuleCode; date: Date; today: Date; creating?: boolean;
}) {
  const { user, module, date, today, creating } = params;
  assertWorkflowAccess(user, module);
  const reference = formatAppDateInput(date), current = formatAppDateInput(today);
  if (reference > current) throw new Error("A data do procedimento não pode estar no futuro.");
  if (module === "oleo" && !creating && reference.slice(0,7) !== current.slice(0,7)) throw new Error("A edição de óleo é permitida somente no mês vigente.");
  if (module === "oleo" && !creating && hasPermission(user,"modulo.oleo.editar_registros_mes_vigente")) return;
  if (module === "temperatura" && !creating && reference.slice(0,7) === current.slice(0,7) &&
      hasPermission(user,"modulo.temperatura.editar_registros_mes_vigente")) return;
  const permission = reference < current ? "editar_historico" : creating ? "criar_registro" : "editar_registro_do_dia";
  if (!hasPermission(user, `modulo.${module}.${permission}`)) throw new Error("Sem permissão para editar registros nesta data.");
}

export function assertWorkflowReopen(params: {
  user: PermissionAwareUser; module: OperationalSignatureModuleCode; date: Date; today: Date;
  state: WorkflowState; reason: string; fromEdit: boolean;
}) {
  assertWorkflowAccess(params.user, params.module);
  if (!hasPermission(params.user, `modulo.${params.module}.reabrir_registro`)) throw new Error("Sem permissão para reabrir este registro.");
  if (["temperatura", "oleo"].includes(params.module) && (formatAppDateInput(params.date).slice(0,7) !== formatAppDateInput(params.today).slice(0,7) || params.date > params.today)) {
    throw new Error("A reabertura individual é permitida somente na competência vigente, sem datas futuras.");
  }
  if (params.fromEdit) assertWorkflowEdit(params);
  if (params.state !== "FECHADO") throw new Error("Somente registros fechados podem ser reabertos.");
  if (!params.reason.trim() || params.reason.trim().length > 4000) throw new Error("Informe a justificativa da reabertura (até 4000 caracteres).");
}

export function isWorkflowQueueItem(state: WorkflowState, date: Date, today: Date) {
  return state === "REABERTO" || (state === "PENDENTE" && formatAppDateInput(date) === formatAppDateInput(today));
}
