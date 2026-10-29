import { hasPermission, type PermissionAwareUser } from "@/lib/permissions";
import { formatAppDateInput, getAppDate } from "@/lib/date-time";
import { assertWorkflowEdit } from "@/lib/operational-workflow/policy";
export const MONTH_EDIT = "modulo.oleo.editar_registros_mes_vigente";
export function currentOilMonth(date: Date, today = getAppDate()) {
  return date <= today && formatAppDateInput(date).slice(0,7) === formatAppDateInput(today).slice(0,7);
}
export function canCorrectOil(user: PermissionAwareUser, date: Date) {
  try { assertWorkflowEdit({user,module:"oleo",date,today:getAppDate(),creating:false}); return true; } catch { return false; }
}
export function fullOilHistory(user: PermissionAwareUser) {
  return hasPermission(user,"modulo.oleo.acessar_historico") || hasPermission(user,"modulo.oleo.editar_historico");
}
export function canReadOilDate(user: PermissionAwareUser, date: Date) {
  return hasPermission(user,"modulo.oleo.acessar") && (fullOilHistory(user) || +date === +getAppDate() ||
    currentOilMonth(date) && (hasPermission(user,MONTH_EDIT) || hasPermission(user,"modulo.oleo.reabrir_registro")));
}
