import "server-only";
import { prisma } from "./prisma";
import { retroactiveNature } from "./review-presentation";
import type { PerfilUsuario } from "@prisma/client";

type Signature = { dataReferencia: Date; usuarioNomeSnapshot: string; usuarioPerfilSnapshot: PerfilUsuario | null; assinadoEm: Date; observacao?: string | null };

// Summarize actual current activity signatures. Never manufacture a daily row.
// A partially reviewed day remains pending until every persisted activity is reviewed.
export async function currentCleaningDaySignatures(signatures: Signature[], module: "limpeza_diaria" | "limpeza_semanal", dates: Date[]): Promise<Signature[]> {
  if (!dates.length) return signatures;
  const rows = module === "limpeza_diaria"
    ? await prisma.planoLimpezaDiarioRegistro.findMany({ where: { data: { in: dates }, excluidoEm: null } })
    : await prisma.planoLimpezaSemanalExecucao.findMany({ where: { dataExecucao: { in: dates }, excluidoEm: null } });
  const result = new Map(signatures.map(s => [s.dataReferencia.toISOString(), s]));
  for (const date of dates) {
    const records = rows.filter(r => +("data" in r ? r.data : r.dataExecucao) === +date);
    if (!records.length || records.some(r => !r.assinaturaSupervisor.trim() || !r.assinaturaSupervisorDataHora || r.status !== "CONCLUIDO")) continue;
    const latest = [...records].sort((a,b) => +b.assinaturaSupervisorDataHora! - +a.assinaturaSupervisorDataHora!)[0];
    const natures = [...new Set(records.map(r => retroactiveNature(r.observacaoSupervisor)).filter((n): n is string => Boolean(n)))];
    // Old daily evidence remains valid; when activities have retroactive evidence,
    // present its actual nature rather than an unexplained daily pending badge.
    if (!natures.length && result.has(date.toISOString())) continue;
    const technical = records.every(r => {
      const nature = retroactiveNature(r.observacaoSupervisor);
      return nature ? nature === "Revisão técnica retroativa" : r.assinaturaSupervisorPerfil === "NUTRICIONISTA";
    });
    result.set(date.toISOString(), { dataReferencia: date,
      usuarioNomeSnapshot: [...new Set(records.map(r => r.assinaturaSupervisor))].join(", "),
      usuarioPerfilSnapshot: latest.assinaturaSupervisorPerfil, assinadoEm: latest.assinaturaSupervisorDataHora!,
      observacao: JSON.stringify({ operacao: "REVISAO_RETROATIVA", natureza: natures.join(" / ") || "Supervisão das atividades", revisaoTecnicaPendente: !technical, resumoAtividades: records.map(r => r.id) }) });
  }
  return [...result.values()];
}
