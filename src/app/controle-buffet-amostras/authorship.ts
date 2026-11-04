import type { Prisma } from "@prisma/client";

const object = (value: Prisma.JsonValue): Prisma.JsonObject => value && !Array.isArray(value) && typeof value === "object" ? value : {};
export function buffetVersionRecords(value: Prisma.JsonValue): Prisma.JsonObject[] {
  const records = object(value).records;
  return Array.isArray(records) ? records.filter((r): r is Prisma.JsonObject => Boolean(r) && !Array.isArray(r) && typeof r === "object") : [];
}

// An empty extra-item placeholder is not evidence of a performed procedure.
export function hasBuffetExecution(record: { status?: unknown; temperaturaAmbiente?: unknown; primeiraTc?: unknown; tcEquipamento?: unknown }) {
  return record.status === "NAO_SERVIDO" || record.temperaturaAmbiente === true ||
    typeof record.primeiraTc === "number" || typeof record.tcEquipamento === "number";
}

type Evidence = {
  versoes: Array<{ versao: number; dados: Prisma.JsonValue; rascunho: Prisma.JsonValue; usuarioId: number }>;
  eventos: Array<{ operacao: string; versaoNova: number; usuarioId: number }>;
  amostras: Array<{ id: number; itemNome: string; responsavelUsuarioId: number }>;
};
export function buffetAuthorshipEligibility(source: Evidence, reviewerId: number) {
  const unknown = (item?: string) => ({ allowed: false, reason: `Não é possível comprovar a autoria original${item ? ` de ${item}` : ""}. A validação exige regularização autorizada.` });
  if (source.eventos.some(e => e.operacao === "VINCULO_LEGADO") || source.versoes.some(v => object(v.rascunho).registroLegadoOriginal)) return unknown();
  if (!source.amostras.length) return unknown();
  const versions = [...source.versoes].sort((a, b) => a.versao - b.versao);
  for (const row of source.amostras) {
    const history = versions.flatMap(v => buffetVersionRecords(v.dados).filter(r => r.id === row.id).map(record => ({ version: v, record })));
    // If an item changes from Not served to an actual measurement, the first
    // measurement needs its own attribution; the earlier label cannot prove it.
    const first = history.find(entry => hasBuffetExecution(entry.record) && entry.record.status !== "NAO_SERVIDO")
      ?? history.find(entry => entry.record.status === "NAO_SERVIDO");
    if (!first || !Number.isSafeInteger(row.responsavelUsuarioId) || row.responsavelUsuarioId < 1) return unknown(row.itemNome);
    const originalId = first.record.responsavelUsuarioId;
    // The original persisted execution must have both an author and its matching event.
    // Later SALVAMENTO/CORRECAO_REGISTRO authors are correctors, not original executors.
    if (originalId !== row.responsavelUsuarioId || first.version.usuarioId !== originalId ||
      !source.eventos.some(e => e.versaoNova === first.version.versao && e.usuarioId === originalId && ["CRIACAO", "SALVAMENTO", "CORRECAO_REGISTRO"].includes(e.operacao)) ||
      history.some(entry => entry.record.responsavelUsuarioId !== originalId)) return unknown(row.itemNome);
    if (originalId === reviewerId) return { allowed: false, reason: `Quem preencheu o lançamento original de ${row.itemNome} não pode assinar sua própria execução. A permissão de corrigir e assinar se aplica à revisão de procedimentos executados por outra pessoa.` };
  }
  return { allowed: true, reason: "" };
}
