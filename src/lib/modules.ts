import { hasAnyPermission, hasPermission, type PermissionAwareUser } from "@/lib/permissions";
import type { UserRole } from "@/lib/rbac";

export type AppModule = {
  name: string;
  href: string;
  allowedRoles: UserRole[];
  permissionCode?: string;
  permissionCodes?: string[];
};

export const modules: AppModule[] = [
  {
    name: "Personalização Visual",
    href: "/personalizacao",
    allowedRoles: ["DEV", "GERENTE"],
    permissionCode: "modulo.personalizacao.acessar"
  },
  {
    name: "Higienização de Hortifruti",
    href: "/higienizacao-hortifruti",
    allowedRoles: ["DEV", "GERENTE", "NUTRICIONISTA", "COLABORADOR"],
    permissionCode: "modulo.hortifruti.acessar"
  },
  {
    name: "Controle de Temperatura de Equipamentos",
    href: "/controle-temperatura-equipamentos",
    allowedRoles: ["DEV", "GERENTE", "NUTRICIONISTA", "COLABORADOR"],
    permissionCode: "modulo.temperatura.acessar"
  },
  {
    name: "Controle de Qualidade do Óleo",
    href: "/controle-qualidade-oleo",
    allowedRoles: ["DEV", "GERENTE", "NUTRICIONISTA", "COLABORADOR"],
    permissionCode: "modulo.oleo.acessar"
  },
  {
    name: "Rastreabilidade de Recebimento",
    href: "/rastreabilidade-recebimento",
    allowedRoles: ["DEV", "GERENTE", "NUTRICIONISTA", "COLABORADOR"],
    permissionCode: "modulo.rastreabilidade.acessar"
  },
  {
    name: "Controle de Buffet / Amostras",
    href: "/controle-buffet-amostras",
    allowedRoles: ["DEV", "GERENTE", "NUTRICIONISTA", "COLABORADOR"],
    permissionCode: "modulo.amostras.acessar"
  },
  {
    name: "Plano de Limpeza",
    href: "/plano-limpeza",
    allowedRoles: ["DEV", "GERENTE", "NUTRICIONISTA", "COLABORADOR"],
    permissionCodes: ["modulo.limpeza_diaria.acessar", "modulo.limpeza_semanal.acessar"]
  },
  {
    name: "Chamados de Manutenção",
    href: "/chamados-manutencao",
    allowedRoles: ["DEV", "GERENTE", "NUTRICIONISTA", "COLABORADOR"],
    permissionCode: "modulo.chamados.acessar"
  },
  {
    name: "Etiquetas de Validade",
    href: "/etiquetas-validade",
    allowedRoles: ["DEV"],
    permissionCode: "modulo.etiquetas.acessar"
  },
  {
    name: "Anexos e Documentos",
    href: "/documentos-tecnicos",
    allowedRoles: ["DEV", "GERENTE", "NUTRICIONISTA"],
    permissionCode: "modulo.documentos.acessar"
  },
  {
    name: "Relatórios e Auditoria",
    href: "/relatorios",
    allowedRoles: ["DEV", "GERENTE", "NUTRICIONISTA"],
    permissionCode: "modulo.relatorios.acessar"
  },
];

export function getModulesForRole(role: UserRole): AppModule[] {
  return modules.filter((module) => module.allowedRoles.includes(role));
}

export function getModulesForUser(user: PermissionAwareUser): AppModule[] {
  return modules.filter((module) => {
    if (module.permissionCodes) {
      return hasAnyPermission(user, module.permissionCodes);
    }

    if (module.permissionCode) {
      return hasPermission(user, module.permissionCode);
    }

    return module.allowedRoles.includes(user.perfil);
  });
}
