import { getCurrentUser } from "@/lib/auth-session";
import { formatAppDateInput, getAppDate, getStartOfAppDay, getEndOfAppDay, parseAppDateInput } from "@/lib/date-time";
import { operationalRecordModule } from "@/lib/operational-record-modules";
import { canDeleteOperationalRecord } from "@/lib/operational-deletion-permission";
import { operationalDeletionModels, operationalRecordMonthClosed, type DeletionTarget } from "@/lib/operational-deletion";
import { prisma } from "@/lib/prisma";
import { OperationalDeleteButton } from "./operational-delete-button";

export async function OperationalDeletionPanel({ target, selectedDate }: { target: DeletionTarget; selectedDate?: string | string[] }) {
  const user = await getCurrentUser();
  const code = target === "nota" ? "rastreabilidade" : target;
  if (!canDeleteOperationalRecord(user, code)) return null;
  const raw = Array.isArray(selectedDate) ? selectedDate[0] : selectedDate;
  const date = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? parseAppDateInput(raw) ?? getAppDate() : getAppDate();
  const dateText = formatAppDateInput(date);
  const closed = await operationalRecordMonthClosed(code, date);
  const delegate = prisma[operationalDeletionModels[target]] as unknown as { findMany(args: unknown): Promise<Array<Record<string, unknown>>> };
  const reference = code === "chamados" ? { dataHoraCriacao: { gte: getStartOfAppDay(date), lte: getEndOfAppDay(date) } }
    : { [code === "limpeza_semanal" ? "dataExecucao" : code === "etiquetas" ? "dataManipulacao" : "data"]: date };
  const rows = closed ? [] : await delegate.findMany({ where: { ...reference, excluidoEm: null }, orderBy: { id: "desc" } });
  return <section className="bpma-card space-y-3">
    <h2 className="font-semibold">Exclusão controlada de registros</h2>
    <form method="get" className="flex flex-wrap items-end gap-3"><label className="text-sm">Data de referência<input type="date" name="exclusaoData" defaultValue={dateText} className="bpma-input" required /></label><button type="submit" className="btn-secondary">Consultar registros</button></form>
    {closed ? <p>Competência fechada. A exclusão está bloqueada para todos os perfis.</p> : rows.length === 0 ? <p>Nenhum registro ativo nesta data.</p> : <ul className="divide-y">{rows.map(row => {
      const name = String(row.hortifruti ?? row.equipamento ?? row.itemNome ?? row.itemDescricao ?? row.produto ?? row.produtoNomeSnapshot ?? row.titulo ?? row.notaFiscal ?? row.area ?? "Aferição do óleo");
      const responsible = String(row.responsavel ?? row.responsavelNome ?? row.responsavelRecebimento ?? row.assinaturaResponsavel ?? row.responsavelGeral ?? row.criadoPorNome ?? row.responsavelNomeSnapshot ?? "Não informado");
      const description = `${operationalRecordModule(code).nome} — ${dateText} — ${name} — Responsável: ${responsible}`;
      return <li key={String(row.id)} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span>{description}</span><OperationalDeleteButton target={target} id={Number(row.id)} date={dateText} description={description} /></li>;
    })}</ul>}
  </section>;
}
