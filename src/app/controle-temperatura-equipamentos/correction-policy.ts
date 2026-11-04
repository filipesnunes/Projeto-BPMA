import { hasPermission, type PermissionAwareUser } from "@/lib/permissions";
import { formatAppDateInput, getAppDate } from "@/lib/date-time";
import { assertWorkflowEdit } from "@/lib/operational-workflow/policy";
export const MONTH_EDIT = "modulo.temperatura.editar_registros_mes_vigente";
export function currentTemperatureMonth(date: Date, today = getAppDate()) {
  return date <= today && formatAppDateInput(date).slice(0,7) === formatAppDateInput(today).slice(0,7);
}
export function canCorrectTemperature(user: PermissionAwareUser, date: Date, today = getAppDate()) {
  try { assertWorkflowEdit({user,module:"temperatura",date,today,creating:false}); return true; } catch { return false; }
}
export function fullTemperatureHistory(user: PermissionAwareUser) {
  return hasPermission(user,"modulo.temperatura.acessar_historico") || hasPermission(user,"modulo.temperatura.editar_historico");
}
export function canReadTemperatureDate(user: PermissionAwareUser, date: Date) {
  return hasPermission(user,"modulo.temperatura.acessar") && (fullTemperatureHistory(user) || +date === +getAppDate() ||
    currentTemperatureMonth(date) && (hasPermission(user,MONTH_EDIT) || hasPermission(user,"modulo.temperatura.reabrir_registro")));
}
