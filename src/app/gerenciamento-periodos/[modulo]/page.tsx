import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-session";
import { formatAppDateTime } from "@/lib/date-time";
import { getOperationalSignatureModule, isOperationalSignatureModuleCode } from "@/lib/module-signatures";
import { canCloseMonthlyPeriod, canReopenMonthlyPeriod, canViewMonthlyPeriods } from "@/lib/monthly-period-permissions";
import { listLegacyMonthlyClosures, monthlyPeriodCounts } from "@/lib/monthly-periods";
import { prisma } from "@/lib/prisma";
import { PeriodActionForm } from "../period-action-form";

export default async function MonthlyPeriodsPage({ params, searchParams }: { params: Promise<{ modulo: string }>; searchParams: Promise<{ feedback?: string; feedbackType?: string }> }) {
  const { modulo } = await params;
  if (!isOperationalSignatureModuleCode(modulo)) notFound();
  const config = getOperationalSignatureModule(modulo);
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canViewMonthlyPeriods(user, modulo)) redirect("/acesso-negado");
  const [generic, legacy, feedback] = await Promise.all([
    prisma.fechamentoMensalModulo.findMany({ where: { moduloCodigo: modulo }, orderBy: [{ ano: "desc" }, { mes: "desc" }] }),
    listLegacyMonthlyClosures(modulo), searchParams
  ]);
  const periods = generic.map(p => ({ mes: p.mes, ano: p.ano, status: p.status, signedAt: p.assinadoEm, signedBy: p.usuarioNomeSnapshot, reopenedAt: p.reabertoEm, reopenedBy: p.reabertoPorNome }));
  for (const old of legacy) if (!periods.some(p => p.mes === old.mes && p.ano === old.ano)) periods.push({ mes: old.mes, ano: old.ano, status: "FECHADO", signedAt: old.dataAssinatura, signedBy: old.responsavelTecnico, reopenedAt: null, reopenedBy: null });
  periods.sort((a, b) => b.ano - a.ano || b.mes - a.mes);
  const reopened = periods.find(p => p.status === "REABERTO");
  const counts = await Promise.all(periods.map(p => monthlyPeriodCounts(modulo, p.mes, p.ano)));
  return <div className="space-y-6">
    <section className="bpma-card"><h1 className="text-2xl font-semibold">Gerenciamento de Períodos</h1><p className="mt-2">{config.nome}</p><Link href={config.historyPath.replace(/\/historico$/, "")} className="btn-secondary mt-4">Voltar ao módulo</Link></section>
    {feedback.feedback ? <p role="status" className={`bpma-card ${feedback.feedbackType === "error" ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}`}>{feedback.feedback}</p> : null}
    {reopened ? <section className="bpma-card border-amber-400"><h2 className="font-semibold">Período reaberto: {String(reopened.mes).padStart(2, "0")}/{reopened.ano}</h2><p className="mt-2 text-sm">Finalize as pendências e feche este período aqui antes de reabrir outro mês. O mês corrente continua funcionando normalmente.</p></section> : null}
    <section className="bpma-card overflow-x-auto"><table className="min-w-full text-sm"><thead><tr>{["Mês/Ano", "Status", "Data do fechamento", "Responsável", "Data da reabertura", "Responsável pela reabertura", "Pendências", "Ações"].map(t => <th key={t} className="p-3 text-left">{t}</th>)}</tr></thead><tbody>
      {periods.map((period, index) => <tr key={`${period.ano}-${period.mes}`} className={`border-t border-slate-200 dark:border-slate-700 ${period.status === "REABERTO" ? "bg-amber-50 dark:bg-amber-950" : ""}`}>
        <td className="p-3">{String(period.mes).padStart(2, "0")}/{period.ano}</td><td className="p-3 font-medium">{period.status === "REABERTO" ? "Reaberto" : period.reopenedAt ? "Fechado novamente" : "Fechado"}</td>
        <td className="p-3">{formatAppDateTime(period.signedAt)}{period.status === "REABERTO" ? <p className="text-xs">Fechamento anterior</p> : null}</td><td className="p-3">{period.signedBy}</td>
        <td className="p-3">{period.reopenedAt ? formatAppDateTime(period.reopenedAt) : "—"}</td><td className="p-3">{period.reopenedBy || "—"}</td><td className="p-3">{counts[index].pending ?? "Não contabilizadas neste módulo"}</td>
        <td className="p-3"><div className="btn-group"><Link href={`${config.historyPath}?filtroMes=${period.mes}&filtroAno=${period.ano}`} className="btn-secondary">Ver registros</Link>
          {period.status === "REABERTO" ? (canCloseMonthlyPeriod(user, modulo) ? <PeriodActionForm code={modulo} month={period.mes} year={period.ano} close /> : null) : canReopenMonthlyPeriod(user, modulo) && !reopened ? <PeriodActionForm code={modulo} month={period.mes} year={period.ano} /> : null}
        </div>{period.status !== "REABERTO" && reopened ? <p className="mt-2 text-xs">Outro período já está reaberto.</p> : null}</td>
      </tr>)}
      {!periods.length ? <tr><td className="p-3" colSpan={8}>Nenhum período fechado encontrado.</td></tr> : null}
    </tbody></table><p className="mt-4 text-sm">Meses nunca fechados não aparecem nesta lista. Assinaturas diárias existentes continuam protegidas; esta área não as remove.</p></section>
  </div>;
}
