import { hasPermission, type PermissionAwareUser } from "./permissions";

type SignatureUser = PermissionAwareUser & { status?: string; obrigarTrocaSenha?: boolean };
const active = (user: SignatureUser) => (user.status === undefined || user.status === "ATIVO") && !user.obrigarTrocaSenha;

// Administrative privileges do not establish professional qualification.
// The hotel has not defined a formal delegation to other professional roles.
export function canSignTechnicalReview(user: SignatureUser, permission: string): boolean {
  return active(user) && user.perfil === "NUTRICIONISTA"
    && hasPermission(user, "usuarios.responsavel_tecnico") && hasPermission(user, permission);
}

// Cleaning supervision is operational, distinct from technical responsibility.
export function canSignCleaningReview(user: SignatureUser, permission: string): boolean {
  return active(user) && ["GERENTE", "NUTRICIONISTA"].includes(user.perfil)
    && hasPermission(user, permission);
}
