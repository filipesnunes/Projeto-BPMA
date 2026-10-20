import { formatAppDateInput, formatAppDateTime } from "@/lib/date-time";
import { executionTimeLabel } from "@/lib/procedure-time";

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function renderExecutionReportNotes(records: Array<{
  id: number; data?: Date; dataExecucao?: Date; createdAt?: Date;
  horarioExecucao?: string | null; horarioNaoInformado?: boolean; justificativaHorario?: string | null;
}>) {
  const timed = records.filter(r => r.horarioExecucao || r.horarioNaoInformado);
  if (!timed.length) return "";
  return `<section style="margin-top:12px;font-size:10px;overflow-wrap:anywhere"><h2 style="font-size:11px">Horários de execução e rastreabilidade</h2><ul>${timed.map(r => `<li>${escape(`${formatAppDateInput((r.data ?? r.dataExecucao)!)} — Registro ${r.id ?? "-"}: ${executionTimeLabel(r)}${r.createdAt ? `. Lançamento: ${formatAppDateTime(r.createdAt)}` : ""}`)}</li>`).join("")}</ul></section>`;
}
