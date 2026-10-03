import type { UserRole } from "@/lib/rbac";

export type PermissionDefinition = {
  codigo: string;
  nome: string;
  descricao?: string;
  grupo: string;
  modulo?: string;
  acao: string;
  sensivel?: boolean;
};

export type PermissionAwareUser = {
  perfil: UserRole;
  perfilAcessoId?: number | null;
  permissoes?: string[] | null;
};

type PathPermissionRule = {
  prefix: string;
  permissions: string[];
};

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  {
    codigo: "modulo.personalizacao.acessar",
    nome: "Acessar e editar Personalização Visual",
    descricao: "Permite personalizar a unidade e logomarca. Disponível para GERENTE e DEV.",
    grupo: "Personalização Visual",
    modulo: "personalizacao",
    acao: "acessar"
  },
  {
    codigo: "dashboard.acessar",
    nome: "Acessar Dashboard",
    grupo: "Dashboard",
    modulo: "dashboard",
    acao: "acessar"
  },
  {
    codigo: "usuarios.acessar",
    nome: "Acessar Gestão de Usuários",
    grupo: "Gestão de Usuários",
    modulo: "usuarios",
    acao: "acessar"
  },
  {
    codigo: "usuarios.criar",
    nome: "Criar usuários",
    grupo: "Gestão de Usuários",
    modulo: "usuarios",
    acao: "criar"
  },
  {
    codigo: "usuarios.editar",
    nome: "Editar usuários",
    grupo: "Gestão de Usuários",
    modulo: "usuarios",
    acao: "editar"
  },
  {
    codigo: "usuarios.desativar",
    nome: "Ativar ou desativar usuários",
    grupo: "Gestão de Usuários",
    modulo: "usuarios",
    acao: "desativar"
  },
  {
    codigo: "usuarios.redefinir_senha",
    nome: "Redefinir senha de usuários",
    grupo: "Gestão de Usuários",
    modulo: "usuarios",
    acao: "redefinir_senha",
    sensivel: true
  },
  {
    codigo: "usuarios.editar_propria_senha",
    nome: "Alterar própria senha",
    grupo: "Gestão de Usuários",
    modulo: "usuarios",
    acao: "editar_propria_senha"
  },
  {
    codigo: "usuarios.criar_perfil",
    nome: "Criar perfis",
    grupo: "Perfis e Permissões",
    modulo: "usuarios",
    acao: "criar_perfil",
    sensivel: true
  },
  {
    codigo: "usuarios.editar_perfil",
    nome: "Editar perfis",
    grupo: "Perfis e Permissões",
    modulo: "usuarios",
    acao: "editar_perfil",
    sensivel: true
  },
  {
    codigo: "usuarios.editar_permissoes",
    nome: "Editar permissões",
    grupo: "Perfis e Permissões",
    modulo: "usuarios",
    acao: "editar_permissoes",
    sensivel: true
  },
  {
    codigo: "usuarios.desativar_perfil",
    nome: "Desativar perfis",
    grupo: "Perfis e Permissões",
    modulo: "usuarios",
    acao: "desativar_perfil",
    sensivel: true
  },
  {
    codigo: "usuarios.responsavel_tecnico",
    nome: "Responsável técnico / pode assinar como supervisor",
    descricao: "Permite habilitar o perfil como responsável técnico para assinaturas de supervisão.",
    grupo: "Perfis e Permissões",
    modulo: "usuarios",
    acao: "responsavel_tecnico",
    sensivel: true
  },
  {
    codigo: "sistema.configuracoes",
    nome: "Configurações do sistema",
    grupo: "Sistema",
    modulo: "sistema",
    acao: "configuracoes",
    sensivel: true
  },
  {
    codigo: "sistema.ver_logs",
    nome: "Ver logs",
    grupo: "Sistema",
    modulo: "sistema",
    acao: "ver_logs",
    sensivel: true
  },
  {
    codigo: "sistema.executar_reset",
    nome: "Executar resets",
    grupo: "Sistema",
    modulo: "sistema",
    acao: "executar_reset",
    sensivel: true
  },
  {
    codigo: "sistema.acesso_dev",
    nome: "Acesso DEV",
    grupo: "Sistema",
    modulo: "sistema",
    acao: "acesso_dev",
    sensivel: true
  },
  ...buildModulePermissions({
    modulo: "hortifruti",
    grupo: "Higienização de Hortifruti",
    prefixo: "modulo.hortifruti",
    acoes: ["acessar", "criar_registro", "editar_registro_do_dia", "editar_historico", "excluir_registro", "gerenciar_cadastros", "assinar_dia", "assinar_fechamento_mensal", "fechar_mes", "reabrir_mes"]
  }),
  ...buildModulePermissions({
    modulo: "amostras",
    grupo: "Amostras / Controle de Buffet",
    prefixo: "modulo.amostras",
    acoes: ["acessar", "acessar_historico", "criar_registro", "editar_registro_do_dia", "editar_historico", "excluir_registro", "assinar_servico", "assinar_historico", "assinar_dia", "assinar_fechamento_mensal", "gerenciar_cadastros", "fechar_mes", "reabrir_mes"]
  }),
  ...buildModulePermissions({
    modulo: "temperatura",
    grupo: "Temperatura de Equipamentos",
    prefixo: "modulo.temperatura",
    acoes: ["acessar", "acessar_historico", "criar_registro", "editar_registro_do_dia", "editar_historico", "excluir_registro", "assinar_historico", "assinar_dia", "assinar_fechamento_mensal", "gerenciar_cadastros", "fechar_mes", "reabrir_mes"]
  }),
  ...buildModulePermissions({
    modulo: "oleo",
    grupo: "Qualidade do Óleo",
    prefixo: "modulo.oleo",
    acoes: ["acessar", "acessar_historico", "criar_registro", "editar_registro_do_dia", "editar_historico", "excluir_registro", "assinar_historico", "assinar_dia", "assinar_fechamento_mensal", "gerenciar_cadastros", "fechar_mes", "reabrir_mes"]
  }),
  ...buildModulePermissions({
    modulo: "rastreabilidade",
    grupo: "Rastreabilidade",
    prefixo: "modulo.rastreabilidade",
    acoes: ["acessar", "acessar_historico", "criar_registro", "editar_registro_do_dia", "editar_historico", "excluir_registro", "gerenciar_configuracoes", "assinar_dia", "assinar_fechamento_mensal", "fechar_mes", "reabrir_mes"]
  }),
  ...buildModulePermissions({
    modulo: "limpeza_diaria",
    grupo: "Plano de Limpeza Diário",
    prefixo: "modulo.limpeza_diaria",
    acoes: ["acessar", "acessar_historico", "criar_registro", "editar_registro_do_dia", "editar_historico", "assinar_todos", "assinar_historico", "assinar_dia", "assinar_fechamento_mensal", "gerenciar_cadastros", "fechar_mes", "reabrir_mes"]
  }),
  ...buildModulePermissions({
    modulo: "limpeza_semanal",
    grupo: "Plano de Limpeza Semanal",
    prefixo: "modulo.limpeza_semanal",
    acoes: ["acessar", "acessar_historico", "criar_registro", "editar_registro_do_dia", "editar_historico", "assinar_todos", "assinar_historico", "assinar_dia", "assinar_fechamento_mensal", "gerenciar_cadastros", "fechar_mes", "reabrir_mes"]
  }),
  ...buildModulePermissions({
    modulo: "chamados",
    grupo: "Chamados de Manutenção",
    prefixo: "modulo.chamados",
    acoes: ["acessar", "criar_registro", "editar_registro_do_dia", "editar_historico", "gerenciar_cadastros"]
  }),
  ...buildModulePermissions({
    modulo: "documentos",
    grupo: "Documentos / Anexos",
    prefixo: "modulo.documentos",
    acoes: ["acessar", "gerenciar_anexos"]
  }),
  ...buildModulePermissions({
    modulo: "relatorios",
    grupo: "Relatórios e Auditoria",
    prefixo: "modulo.relatorios",
    acoes: ["acessar", "gerenciar_configuracoes"]
  }),
  ...buildModulePermissions({
    modulo: "etiquetas",
    grupo: "Etiquetas de Validade / StayLabel",
    prefixo: "modulo.etiquetas",
    acoes: ["acessar", "acessar_historico", "criar_registro", "editar_registro_do_dia", "editar_historico", "gerenciar_cadastros"]
  })
];

export const ALL_PERMISSION_CODES = PERMISSION_DEFINITIONS.map((permission) => permission.codigo);

export const SENSITIVE_PERMISSION_CODES = new Set(
  PERMISSION_DEFINITIONS.filter((permission) => permission.sensivel).map(
    (permission) => permission.codigo
  )
);

const DEV_PERMISSIONS = new Set(ALL_PERMISSION_CODES);

const COLABORADOR_PERMISSIONS = new Set([
  "dashboard.acessar",
  "usuarios.editar_propria_senha",
  "modulo.hortifruti.acessar",
  "modulo.hortifruti.criar_registro",
  "modulo.hortifruti.editar_registro_do_dia",
  "modulo.amostras.acessar",
  "modulo.amostras.criar_registro",
  "modulo.amostras.editar_registro_do_dia",
  "modulo.temperatura.acessar",
  "modulo.temperatura.criar_registro",
  "modulo.temperatura.editar_registro_do_dia",
  "modulo.oleo.acessar",
  "modulo.oleo.criar_registro",
  "modulo.oleo.editar_registro_do_dia",
  "modulo.rastreabilidade.acessar",
  "modulo.rastreabilidade.criar_registro",
  "modulo.rastreabilidade.editar_registro_do_dia",
  "modulo.limpeza_diaria.acessar",
  "modulo.limpeza_diaria.criar_registro",
  "modulo.limpeza_diaria.editar_registro_do_dia",
  "modulo.limpeza_semanal.acessar",
  "modulo.limpeza_semanal.criar_registro",
  "modulo.limpeza_semanal.editar_registro_do_dia",
  "modulo.chamados.acessar",
  "modulo.chamados.criar_registro"
]);

const NUTRICIONISTA_PERMISSIONS = new Set([
  ...COLABORADOR_PERMISSIONS,
  "usuarios.responsavel_tecnico",
  "modulo.hortifruti.excluir_registro",
  "modulo.hortifruti.assinar_dia",
  "modulo.hortifruti.assinar_fechamento_mensal",
  "modulo.hortifruti.fechar_mes",
  "modulo.amostras.acessar_historico",
  "modulo.amostras.excluir_registro",
  "modulo.amostras.assinar_servico",
  "modulo.amostras.assinar_historico",
  "modulo.amostras.assinar_dia",
  "modulo.amostras.assinar_fechamento_mensal",
  "modulo.amostras.fechar_mes",
  "modulo.temperatura.acessar_historico",
  "modulo.temperatura.excluir_registro",
  "modulo.temperatura.assinar_historico",
  "modulo.temperatura.assinar_dia",
  "modulo.temperatura.assinar_fechamento_mensal",
  "modulo.temperatura.fechar_mes",
  "modulo.oleo.acessar_historico",
  "modulo.oleo.excluir_registro",
  "modulo.oleo.assinar_historico",
  "modulo.oleo.assinar_dia",
  "modulo.oleo.assinar_fechamento_mensal",
  "modulo.oleo.fechar_mes",
  "modulo.rastreabilidade.acessar_historico",
  "modulo.rastreabilidade.assinar_dia",
  "modulo.rastreabilidade.assinar_fechamento_mensal",
  "modulo.rastreabilidade.fechar_mes",
  "modulo.limpeza_diaria.acessar_historico",
  "modulo.limpeza_diaria.assinar_todos",
  "modulo.limpeza_diaria.assinar_historico",
  "modulo.limpeza_diaria.assinar_dia",
  "modulo.limpeza_diaria.assinar_fechamento_mensal",
  "modulo.limpeza_diaria.fechar_mes",
  "modulo.limpeza_semanal.acessar_historico",
  "modulo.limpeza_semanal.assinar_todos",
  "modulo.limpeza_semanal.assinar_historico",
  "modulo.limpeza_semanal.assinar_dia",
  "modulo.limpeza_semanal.assinar_fechamento_mensal",
  "modulo.limpeza_semanal.fechar_mes",
  "modulo.chamados.editar_registro_do_dia",
  "modulo.chamados.editar_historico",
  "modulo.documentos.acessar",
  "modulo.relatorios.acessar"
]);

const GERENTE_PERMISSIONS = new Set([
  ...NUTRICIONISTA_PERMISSIONS,
  "modulo.personalizacao.acessar",
  "usuarios.acessar",
  "usuarios.criar",
  "usuarios.editar",
  "usuarios.desativar",
  "usuarios.redefinir_senha",
  "modulo.hortifruti.gerenciar_cadastros",
  "modulo.amostras.gerenciar_cadastros",
  "modulo.temperatura.gerenciar_cadastros",
  "modulo.oleo.gerenciar_cadastros",
  "modulo.rastreabilidade.gerenciar_configuracoes",
  "modulo.limpeza_diaria.gerenciar_cadastros",
  "modulo.limpeza_semanal.gerenciar_cadastros",
  "modulo.chamados.gerenciar_cadastros",
  "modulo.documentos.gerenciar_anexos",
  "modulo.relatorios.gerenciar_configuracoes"
]);

export const DEFAULT_ROLE_PERMISSION_CODES: Record<UserRole, Set<string>> = {
  DEV: DEV_PERMISSIONS,
  GERENTE: GERENTE_PERMISSIONS,
  NUTRICIONISTA: NUTRICIONISTA_PERMISSIONS,
  COLABORADOR: COLABORADOR_PERMISSIONS
};

export function getDefaultPermissionCodes(role: UserRole): string[] {
  return Array.from(DEFAULT_ROLE_PERMISSION_CODES[role] ?? []);
}

export function hasPermission(user: PermissionAwareUser, codigo: string): boolean {
  if (user.perfil === "DEV") {
    return true;
  }

  if (codigo === "modulo.personalizacao.acessar" && user.perfil !== "GERENTE") {
    return false;
  }

  if (typeof user.perfilAcessoId === "number") {
    return Boolean(user.permissoes?.includes(codigo));
  }

  return DEFAULT_ROLE_PERMISSION_CODES[user.perfil]?.has(codigo) ?? false;
}

export function hasAnyPermission(user: PermissionAwareUser, codigos: string[]): boolean {
  return codigos.some((codigo) => hasPermission(user, codigo));
}

export function canAccessModuleByPermission(
  user: PermissionAwareUser,
  permissionCode: string
): boolean {
  return hasPermission(user, permissionCode);
}

export function canAccessPathWithPermissions(
  user: PermissionAwareUser,
  pathname: string
): boolean {
  if (
    pathname.startsWith("/trocar-senha") ||
    pathname.startsWith("/acesso-negado")
  ) {
    return true;
  }

  const permissions = getRequiredPermissionsForPath(pathname);
  if (permissions.length === 0) {
    return true;
  }

  return hasAnyPermission(user, permissions);
}

export function getRequiredPermissionsForPath(pathname: string): string[] {
  if (pathname === "/") {
    return ["dashboard.acessar"];
  }

  const exactRules: PathPermissionRule[] = [
    { prefix: "/personalizacao", permissions: ["modulo.personalizacao.acessar"] },
    { prefix: "/usuarios/solicitacoes", permissions: ["usuarios.redefinir_senha"] },
    { prefix: "/usuarios", permissions: ["usuarios.acessar"] },
    { prefix: "/relatorios/opcoes", permissions: ["modulo.relatorios.gerenciar_configuracoes"] },
    { prefix: "/relatorios", permissions: ["modulo.relatorios.acessar"] },
    { prefix: "/documentos-tecnicos", permissions: ["modulo.documentos.acessar"] },
    { prefix: "/etiquetas-validade/opcoes", permissions: ["modulo.etiquetas.gerenciar_cadastros"] },
    { prefix: "/etiquetas-validade/historico", permissions: ["modulo.etiquetas.acessar_historico"] },
    { prefix: "/etiquetas-validade", permissions: ["modulo.etiquetas.acessar"] },
    { prefix: "/controle-buffet-amostras/opcoes", permissions: ["modulo.amostras.gerenciar_cadastros"] },
    { prefix: "/controle-buffet-amostras/historico", permissions: ["modulo.amostras.acessar_historico"] },
    { prefix: "/controle-buffet-amostras", permissions: ["modulo.amostras.acessar"] },
    { prefix: "/controle-temperatura-equipamentos/opcoes", permissions: ["modulo.temperatura.gerenciar_cadastros"] },
    { prefix: "/controle-temperatura-equipamentos/historico", permissions: ["modulo.temperatura.acessar_historico"] },
    { prefix: "/controle-temperatura-equipamentos", permissions: ["modulo.temperatura.acessar"] },
    { prefix: "/controle-qualidade-oleo/opcoes", permissions: ["modulo.oleo.gerenciar_cadastros"] },
    { prefix: "/controle-qualidade-oleo/historico", permissions: ["modulo.oleo.acessar_historico"] },
    { prefix: "/controle-qualidade-oleo", permissions: ["modulo.oleo.acessar"] },
    { prefix: "/controle-oleo-fritura", permissions: ["modulo.oleo.acessar"] },
    { prefix: "/rastreabilidade-recebimento/opcoes", permissions: ["modulo.rastreabilidade.gerenciar_configuracoes"] },
    { prefix: "/rastreabilidade-recebimento/historico", permissions: ["modulo.rastreabilidade.acessar_historico"] },
    { prefix: "/rastreabilidade-recebimento", permissions: ["modulo.rastreabilidade.acessar"] },
    { prefix: "/plano-limpeza/diario/opcoes", permissions: ["modulo.limpeza_diaria.gerenciar_cadastros"] },
    { prefix: "/plano-limpeza/diario/historico", permissions: ["modulo.limpeza_diaria.acessar_historico"] },
    { prefix: "/plano-limpeza/diario", permissions: ["modulo.limpeza_diaria.acessar"] },
    { prefix: "/plano-limpeza/semanal/opcoes", permissions: ["modulo.limpeza_semanal.gerenciar_cadastros"] },
    { prefix: "/plano-limpeza/semanal/historico", permissions: ["modulo.limpeza_semanal.acessar_historico"] },
    { prefix: "/plano-limpeza/semanal", permissions: ["modulo.limpeza_semanal.acessar"] },
    {
      prefix: "/plano-limpeza",
      permissions: ["modulo.limpeza_diaria.acessar", "modulo.limpeza_semanal.acessar"]
    },
    { prefix: "/higienizacao-hortifruti/opcoes", permissions: ["modulo.hortifruti.gerenciar_cadastros"] },
    { prefix: "/higienizacao-hortifruti", permissions: ["modulo.hortifruti.acessar"] },
    { prefix: "/chamados-manutencao/opcoes", permissions: ["modulo.chamados.gerenciar_cadastros"] },
    { prefix: "/chamados-manutencao", permissions: ["modulo.chamados.acessar"] },
    { prefix: "/configuracoes-modulo", permissions: ["sistema.configuracoes"] }
  ];

  const rule = exactRules.find(
    (item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`)
  );

  return rule?.permissions ?? [];
}

export function canEditRecordDate(
  user: PermissionAwareUser,
  modulePermissionPrefix: string,
  recordDate: Date,
  today: Date
): boolean {
  if (!isSameOperationalDay(recordDate, today)) {
    return false;
  }

  return hasPermission(user, `${modulePermissionPrefix}.editar_registro_do_dia`);
}

export function canGrantSensitivePermissions(user: PermissionAwareUser): boolean {
  return user.perfil === "DEV" || hasPermission(user, "usuarios.editar_permissoes");
}

export function isSensitivePermission(codigo: string): boolean {
  return (
    SENSITIVE_PERMISSION_CODES.has(codigo) ||
    /responsavel_tecnico|editar_historico|excluir_registro/.test(codigo)
  );
}

export function getPermissionGroups() {
  const groups = new Map<string, PermissionDefinition[]>();

  for (const permission of PERMISSION_DEFINITIONS) {
    const current = groups.get(permission.grupo) ?? [];
    current.push(permission);
    groups.set(permission.grupo, current);
  }

  return Array.from(groups.entries()).map(([grupo, permissions]) => ({
    grupo,
    permissions
  }));
}

export function isSameOperationalDay(date: Date, today: Date): boolean {
  return date.getTime() === today.getTime();
}

function buildModulePermissions(params: {
  modulo: string;
  grupo: string;
  prefixo: string;
  acoes: string[];
}): PermissionDefinition[] {
  return params.acoes.map((acao) => {
    const display = getPermissionDisplay(params.modulo, acao);

    return {
      codigo: `${params.prefixo}.${acao}`,
      nome: display.nome,
      descricao: display.descricao,
      grupo: params.grupo,
      modulo: params.modulo,
      acao,
      sensivel: /editar_historico|excluir_registro|reabrir_mes/.test(acao)
    };
  });
}

function getPermissionDisplay(
  modulo: string,
  acao: string
): { nome: string; descricao?: string } {
  if (modulo === "limpeza_semanal" && acao === "assinar_dia") {
    return {
      nome: "Assinar semana como supervisor",
      descricao: "Permite assinar como supervisor a área da semana quando todos os itens estiverem executados."
    };
  }

  if (modulo === "limpeza_semanal" && acao === "editar_historico") {
    return {
      nome: "Assinar semana histórica como supervisor",
      descricao:
        "Permite validar como supervisor uma área/semana histórica após todos os itens estarem executados."
    };
  }

  if (modulo === "limpeza_semanal" && acao === "assinar_historico") {
    return {
      nome: "Assinar itens históricos como responsável pela limpeza",
      descricao:
        "Permite assinar retroativamente itens pendentes no histórico como responsável pela limpeza; não assina supervisor."
    };
  }

  if (modulo === "limpeza_semanal" && acao === "assinar_todos") {
    return {
      nome: "Assinar itens",
      descricao: "Permite assinar/executar itens pendentes da área na semana atual, inclusive em lote."
    };
  }

  return { nome: getFriendlyActionName(acao) };
}

function getFriendlyActionName(acao: string): string {
  const labels: Record<string, string> = {
    acessar: "Acessar módulo",
    acessar_historico: "Acessar histórico",
    criar_registro: "Criar registro",
    editar_registro_do_dia: "Editar registros do dia",
    editar_historico: "Editar registros históricos",
    excluir_registro: "Excluir registros",
    assinar_servico: "Assinar serviço",
    assinar_historico: "Assinar históricos",
    assinar_dia: "Assinar dias como supervisor",
    assinar_fechamento_mensal: "Assinar fechamento mensal",
    assinar_todos: "Assinar todos",
    gerenciar_cadastros: "Gerenciar cadastros",
    gerenciar_configuracoes: "Gerenciar configurações",
    gerenciar_anexos: "Gerenciar anexos",
    fechar_mes: "Fechar mês",
    reabrir_mes: "Reabrir mês"
  };

  return labels[acao] ?? acao;
}
