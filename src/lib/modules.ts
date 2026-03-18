import type { UserRole } from "@/lib/rbac";

export type AppModule = {
  name: string;
  href: string;
  allowedRoles: UserRole[];
};

export const modules: AppModule[] = [
  {
    name: "Higienização de Hortifruti",
    href: "/higienizacao-hortifruti",
    allowedRoles: ["DEV", "GESTOR", "SUPERVISOR", "RESPONSAVEL_TECNICO", "FUNCIONARIO"]
  },
  {
    name: "Controle de Temperatura de Equipamentos",
    href: "/controle-temperatura-equipamentos",
    allowedRoles: ["DEV", "GESTOR", "SUPERVISOR", "RESPONSAVEL_TECNICO", "FUNCIONARIO"]
  },
  {
    name: "Controle de Qualidade do Óleo",
    href: "/controle-qualidade-oleo",
    allowedRoles: ["DEV", "GESTOR", "SUPERVISOR", "RESPONSAVEL_TECNICO", "FUNCIONARIO"]
  },
  {
    name: "Rastreabilidade de Recebimento",
    href: "/rastreabilidade-recebimento",
    allowedRoles: ["DEV", "GESTOR", "SUPERVISOR", "RESPONSAVEL_TECNICO", "FUNCIONARIO"]
  },
  {
    name: "Controle de Buffet / Amostras",
    href: "/controle-buffet-amostras",
    allowedRoles: ["DEV", "GESTOR", "SUPERVISOR", "RESPONSAVEL_TECNICO", "FUNCIONARIO"]
  },
  {
    name: "Plano de Limpeza",
    href: "/plano-limpeza",
    allowedRoles: ["DEV", "GESTOR", "SUPERVISOR", "RESPONSAVEL_TECNICO", "FUNCIONARIO"]
  },
  {
    name: "Chamados de Manutenção",
    href: "/chamados-manutencao",
    allowedRoles: ["DEV", "GESTOR", "SUPERVISOR", "RESPONSAVEL_TECNICO", "FUNCIONARIO"]
  },
];

export function getModulesForRole(role: UserRole): AppModule[] {
  return modules.filter((module) => module.allowedRoles.includes(role));
}
