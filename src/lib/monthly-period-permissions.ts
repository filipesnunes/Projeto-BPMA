import { hasPermission, type PermissionAwareUser } from "@/lib/permissions";
import { getOperationalSignatureModule, type OperationalSignatureModuleCode } from "@/lib/module-signatures";
import { canSignOilSupervisor } from "./oil-signature-permissions";

export function canViewMonthlyPeriods(user: PermissionAwareUser, code: OperationalSignatureModuleCode) {
  const prefix = getOperationalSignatureModule(code).permissionPrefix;
  return hasPermission(user, `${prefix}.acessar`) && (
    hasPermission(user, `${prefix}.acessar_historico`) ||
    hasPermission(user, `${prefix}.assinar_fechamento_mensal`) ||
    hasPermission(user, `${prefix}.fechar_mes`) || canReopenMonthlyPeriod(user, code));
}

export function canReopenMonthlyPeriod(user: PermissionAwareUser, code: OperationalSignatureModuleCode) {
  return hasPermission(user, `${getOperationalSignatureModule(code).permissionPrefix}.acessar`)
    && (user.perfil !== "DEV" || typeof user.perfilAcessoId === "number")
    && Boolean(user.permissoes?.includes(`${getOperationalSignatureModule(code).permissionPrefix}.reabrir_mes`));
}

export function canCloseMonthlyPeriod(user: PermissionAwareUser, code: OperationalSignatureModuleCode) {
  if (code === "oleo" && !canSignOilSupervisor(user, "monthly")) return false;
  return hasPermission(user, `${getOperationalSignatureModule(code).permissionPrefix}.fechar_mes`);
}

export function monthlyPeriodsPath(code: OperationalSignatureModuleCode) {
  return `/gerenciamento-periodos/${code}`;
}
