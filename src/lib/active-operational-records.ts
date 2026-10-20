import type { Prisma } from "@prisma/client";

export const OPERATIONAL_MODELS = new Set([
  "HigienizacaoHortifruti", "ControleTemperaturaEquipamento", "ControleQualidadeOleoRegistro",
  "RastreabilidadeRecebimentoNota", "RastreabilidadeRecebimentoRegistro",
  "PlanoLimpezaDiarioRegistro", "PlanoLimpezaSemanalExecucao", "ControleBuffetAmostraRegistro",
  "ChamadoManutencao", "EtiquetaValidadeEmissao"
]);

// Applied at the shared Prisma boundary, including transactions, counts and reports.
// Catalogs, signatures, closures and immutable deletion snapshots are not filtered.
export const activeOperationalRecords: Prisma.Middleware = async (params, next) => {
  if (params.model && OPERATIONAL_MODELS.has(params.model)) {
    if (params.action === "delete" || (params.action === "deleteMany" && !["PlanoLimpezaDiarioRegistro", "PlanoLimpezaSemanalExecucao"].includes(params.model))) {
      throw new Error("Registros operacionais exigem exclusão controlada com justificativa e auditoria.");
    }
    if (params.action === "deleteMany") {
      // Existing checklist generation prunes empty scheduled placeholders, never
      // performed procedures, signatures or previously excluded originals.
      params.args.where = { AND: [params.args.where ?? {}, { excluidoEm: null, status: "PENDENTE", assinaturaResponsavel: "", assinaturaSupervisor: "", assinaturaResponsavelDataHora: null, assinaturaSupervisorDataHora: null }] };
    }
    if (["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy", "update", "updateMany"].includes(params.action)) {
      params.args ??= {};
      params.args.where = { ...params.args.where, excluidoEm: null };
    }
  }
  // The only operational child collection: receiving note -> items. Also applies
  // when selected under a category, service or buffet catalog item.
  const children: Record<string, string[]> = {
    RastreabilidadeRecebimentoNota: ["itens"], RastreabilidadeRecebimentoCategoria: ["registros"],
    ControleBuffetAmostraServico: ["registros"], ControleBuffetAmostraItem: ["registros"],
    PlanoLimpezaDiarioItem: ["execucoes"], PlanoLimpezaSemanalItem: ["execucoes"]
  };
  for (const key of children[params.model ?? ""] ?? []) {
    for (const selection of [params.args?.include, params.args?.select, params.args?.include?._count?.select, params.args?.select?._count?.select]) {
      if (selection?.[key]) {
        const options = selection[key] === true ? {} : selection[key];
        selection[key] = { ...options, where: { ...options.where, excluidoEm: null } };
      }
    }
  }
  return next(params);
};
