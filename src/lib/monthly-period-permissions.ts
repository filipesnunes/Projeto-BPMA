import { hasPermission, type PermissionAwareUser } from "@/lib/permissions";
import { getOperationalSignatureModule, type OperationalSignatureModuleCode } from "@/lib/module-signatures";

export function canViewMonthlyPeriods(user: PermissionAwareUser, code: OperationalSignatureModuleCode) {
  const prefix = getOperationalSignatureModule(code).permissionPrefix;
  return hasPermission(user, `${prefix}.acessar`) && (
    hasPermission(user, `${prefix}.acessar_historico`) ||
    hasPermission(user, `${prefix}.assinar_fechamento_mensal`) ||
    hasPermission(user, `${prefix}.fechar_mes`) || canReopenMonthlyPeriod(user, code));
}

export function canReopenMonthlyPeriod(user: PermissionAwareUser, code: OperationalSignatureModuleCode) {
  // Preserve the existing DEV-only reopening policy; never infer this from GERENTE.
  return user.perfil === "DEV" && hasPermission(user, `${getOperationalSignatureModule(code).permissionPrefix}.reabrir_mes`);
}

export function canCloseMonthlyPeriod(user: PermissionAwareUser, code: OperationalSignatureModuleCode) {
  return hasPermission(user, `${getOperationalSignatureModule(code).permissionPrefix}.fechar_mes`);
}

export function monthlyPeriodsPath(code: OperationalSignatureModuleCode) {
  return `/gerenciamento-periodos/${code}`;
}
