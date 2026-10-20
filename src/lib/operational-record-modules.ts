import { getOperationalSignatureModule, type OperationalSignatureModuleCode } from "@/lib/module-signatures";

export type OperationalRecordModuleCode = OperationalSignatureModuleCode | "chamados" | "etiquetas";

export function operationalRecordModule(code: OperationalRecordModuleCode) {
  if (code === "chamados") return { nome: "Chamados de Manutenção", path: "/chamados-manutencao" };
  if (code === "etiquetas") return { nome: "Etiquetas de Validade", path: "/etiquetas-validade/historico" };
  const config = getOperationalSignatureModule(code);
  return { nome: config.nome, path: config.historyPath.replace(/\/historico$/, "") };
}
