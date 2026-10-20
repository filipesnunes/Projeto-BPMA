import { hasPermission, type PermissionAwareUser } from "@/lib/permissions";

export function canDeleteOperationalRecord(user: PermissionAwareUser | null, moduleCode: string) {
  if (moduleCode === "etiquetas" && user?.perfil !== "DEV") return false;
  return Boolean(user && ["DEV", "GERENTE", "NUTRICIONISTA"].includes(user.perfil) &&
    hasPermission(user, `modulo.${moduleCode}.acessar`) &&
    hasPermission(user, `modulo.${moduleCode}.excluir_registro`));
}
