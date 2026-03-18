export const USER_ROLE_VALUES = [
  "DEV",
  "GESTOR",
  "SUPERVISOR",
  "RESPONSAVEL_TECNICO",
  "FUNCIONARIO"
] as const;

export type UserRole = (typeof USER_ROLE_VALUES)[number];

export function getRoleLabel(role: UserRole): string {
  if (role === "RESPONSAVEL_TECNICO") {
    return "Responsável Técnico";
  }

  return role
    .toLocaleLowerCase("pt-BR")
    .replace("_", " ")
    .replace(/(^\w|\s\w)/g, (chunk) => chunk.toUpperCase());
}

const MODULE_ACCESS: Record<UserRole, string[]> = {
  DEV: [
    "/higienizacao-hortifruti",
    "/controle-temperatura-equipamentos",
    "/controle-qualidade-oleo",
    "/rastreabilidade-recebimento",
    "/controle-buffet-amostras",
    "/plano-limpeza",
    "/chamados-manutencao"
  ],
  GESTOR: [
    "/higienizacao-hortifruti",
    "/controle-temperatura-equipamentos",
    "/controle-qualidade-oleo",
    "/rastreabilidade-recebimento",
    "/controle-buffet-amostras",
    "/plano-limpeza",
    "/chamados-manutencao"
  ],
  SUPERVISOR: [
    "/higienizacao-hortifruti",
    "/controle-temperatura-equipamentos",
    "/controle-qualidade-oleo",
    "/rastreabilidade-recebimento",
    "/controle-buffet-amostras",
    "/plano-limpeza",
    "/chamados-manutencao"
  ],
  RESPONSAVEL_TECNICO: [
    "/higienizacao-hortifruti",
    "/controle-temperatura-equipamentos",
    "/controle-qualidade-oleo",
    "/rastreabilidade-recebimento",
    "/controle-buffet-amostras",
    "/plano-limpeza",
    "/chamados-manutencao"
  ],
  FUNCIONARIO: [
    "/higienizacao-hortifruti",
    "/controle-temperatura-equipamentos",
    "/controle-qualidade-oleo",
    "/rastreabilidade-recebimento",
    "/controle-buffet-amostras",
    "/plano-limpeza",
    "/chamados-manutencao"
  ]
};

export function canAccessModule(role: UserRole, href: string): boolean {
  return MODULE_ACCESS[role].includes(href);
}

export function canManageUsers(role: UserRole): boolean {
  return role === "DEV" || role === "GESTOR";
}

export function canViewResetRequests(role: UserRole): boolean {
  return role === "DEV" || role === "GESTOR" || role === "SUPERVISOR";
}

export function canManageModuleOptions(role: UserRole): boolean {
  return role === "DEV" || role === "GESTOR";
}

export function canViewFullHistory(role: UserRole): boolean {
  return role !== "FUNCIONARIO";
}

export function canCloseMonth(role: UserRole): boolean {
  return role === "DEV" || role === "GESTOR" || role === "RESPONSAVEL_TECNICO";
}

export function canReopenMonth(role: UserRole): boolean {
  return role === "DEV";
}

export function canSignAsSupervisor(role: UserRole): boolean {
  return role === "DEV" || role === "GESTOR" || role === "SUPERVISOR";
}

export function canSignAsResponsible(role: UserRole): boolean {
  return role !== "RESPONSAVEL_TECNICO";
}

export function canSignTechnical(role: UserRole): boolean {
  return role === "DEV" || role === "GESTOR" || role === "RESPONSAVEL_TECNICO";
}

export function canResetPassword(actorRole: UserRole, targetRole: UserRole): boolean {
  if (actorRole === "DEV") {
    return true;
  }

  if (actorRole === "GESTOR") {
    return (
      targetRole === "SUPERVISOR" ||
      targetRole === "RESPONSAVEL_TECNICO" ||
      targetRole === "FUNCIONARIO"
    );
  }

  if (actorRole === "SUPERVISOR") {
    return targetRole === "FUNCIONARIO";
  }

  return false;
}

export function canOpenMaintenanceTicket(role: UserRole): boolean {
  return MODULE_ACCESS[role].includes("/chamados-manutencao");
}

export function canUpdateMaintenanceTicket(role: UserRole): boolean {
  return role === "DEV" || role === "GESTOR" || role === "SUPERVISOR";
}

export function canAccessPath(role: UserRole, pathname: string): boolean {
  if (
    pathname === "/" ||
    pathname.startsWith("/trocar-senha") ||
    pathname.startsWith("/acesso-negado")
  ) {
    return true;
  }

  if (pathname.startsWith("/usuarios/solicitacoes")) {
    return canViewResetRequests(role);
  }

  if (pathname.startsWith("/usuarios")) {
    return canManageUsers(role);
  }

  if (pathname.includes("/opcoes")) {
    return canManageModuleOptions(role);
  }

  if (pathname.includes("/historico")) {
    return canViewFullHistory(role);
  }

  const knownModule = Object.values(MODULE_ACCESS)
    .flat()
    .find((href) => pathname === href || pathname.startsWith(`${href}/`));
  if (!knownModule) {
    return true;
  }

  return canAccessModule(role, knownModule);
}
