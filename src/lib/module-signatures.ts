import { hasPermission, type PermissionAwareUser } from "@/lib/permissions";

export const OPERATIONAL_SIGNATURE_MODULES = {
  hortifruti: {
    codigo: "hortifruti",
    nome: "Higienização de Hortifruti",
    permissionPrefix: "modulo.hortifruti",
    historyPath: "/higienizacao-hortifruti/historico"
  },
  amostras: {
    codigo: "amostras",
    nome: "Controle de Buffet / Amostras",
    permissionPrefix: "modulo.amostras",
    historyPath: "/controle-buffet-amostras/historico"
  },
  temperatura: {
    codigo: "temperatura",
    nome: "Temperatura de Equipamentos",
    permissionPrefix: "modulo.temperatura",
    historyPath: "/controle-temperatura-equipamentos/historico"
  },
  oleo: {
    codigo: "oleo",
    nome: "Qualidade do Óleo",
    permissionPrefix: "modulo.oleo",
    historyPath: "/controle-qualidade-oleo/historico"
  },
  rastreabilidade: {
    codigo: "rastreabilidade",
    nome: "Rastreabilidade",
    permissionPrefix: "modulo.rastreabilidade",
    historyPath: "/rastreabilidade-recebimento/historico"
  },
  limpeza_diaria: {
    codigo: "limpeza_diaria",
    nome: "Plano de Limpeza Diário",
    permissionPrefix: "modulo.limpeza_diaria",
    historyPath: "/plano-limpeza/diario/historico"
  },
  limpeza_semanal: {
    codigo: "limpeza_semanal",
    nome: "Plano de Limpeza Semanal",
    permissionPrefix: "modulo.limpeza_semanal",
    historyPath: "/plano-limpeza/semanal/historico"
  }
} as const;

export type OperationalSignatureModuleCode = keyof typeof OPERATIONAL_SIGNATURE_MODULES;

export function isOperationalSignatureModuleCode(
  value: string
): value is OperationalSignatureModuleCode {
  return Object.hasOwn(OPERATIONAL_SIGNATURE_MODULES, value);
}

export function getOperationalSignatureModule(code: string) {
  if (!isOperationalSignatureModuleCode(code)) {
    throw new Error("Módulo inválido para assinatura operacional.");
  }

  return OPERATIONAL_SIGNATURE_MODULES[code];
}

export function canSignModuleDay(
  user: PermissionAwareUser,
  moduleCode: OperationalSignatureModuleCode
): boolean {
  const moduleConfig = OPERATIONAL_SIGNATURE_MODULES[moduleCode];
  return (
    hasPermission(user, "usuarios.responsavel_tecnico") &&
    hasPermission(user, `${moduleConfig.permissionPrefix}.assinar_dia`)
  );
}

export function canSignModuleMonthlyClosure(
  user: PermissionAwareUser,
  moduleCode: OperationalSignatureModuleCode
): boolean {
  const moduleConfig = OPERATIONAL_SIGNATURE_MODULES[moduleCode];
  return (
    hasPermission(user, "usuarios.responsavel_tecnico") &&
    hasPermission(user, `${moduleConfig.permissionPrefix}.assinar_fechamento_mensal`)
  );
}
