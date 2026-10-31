import { hasPermission, type PermissionAwareUser } from "./permissions";

export type OilSignatureKind = "individual" | "daily" | "monthly";
export const oilSignaturePermissions = {
  individual: "modulo.oleo.assinar_historico",
  daily: "modulo.oleo.assinar_dia",
  monthly: "modulo.oleo.assinar_fechamento_mensal"
} as const;

// Administrative inheritance is not proof of professional qualification.
// Other roles require a separately defined formal delegation, not a generic grant.
export function canSignOilSupervisor(user: PermissionAwareUser & { status?: string; obrigarTrocaSenha?: boolean }, kind: OilSignatureKind): boolean {
  return user.perfil === "NUTRICIONISTA"
    && (user.status === undefined || user.status === "ATIVO") && !user.obrigarTrocaSenha
    && hasPermission(user, "usuarios.responsavel_tecnico")
    && hasPermission(user, oilSignaturePermissions[kind]);
}
