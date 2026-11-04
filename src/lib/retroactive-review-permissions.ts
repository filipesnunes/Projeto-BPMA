import { hasPermission, type PermissionAwareUser } from "./permissions";
import type { OperationalSignatureModuleCode } from "./module-signatures";

export function canReviewRetroactively(user: PermissionAwareUser & { status?: string; obrigarTrocaSenha?: boolean }, module: OperationalSignatureModuleCode) {
  return (user.status === undefined || user.status === "ATIVO") && !user.obrigarTrocaSenha
    && hasPermission(user, `modulo.${module}.acessar`)
    && hasPermission(user, `modulo.${module}.assinar_retroativo`);
}

// Permission grants authorize a present review, never confer professional qualification.
export function retroactiveReviewNature(user: PermissionAwareUser) {
  if (user.perfil === "NUTRICIONISTA" && hasPermission(user, "usuarios.responsavel_tecnico")) return "Revisão técnica retroativa";
  if (user.perfil === "GERENTE") return "Revisão gerencial retroativa";
  return "Supervisão operacional retroativa";
}
