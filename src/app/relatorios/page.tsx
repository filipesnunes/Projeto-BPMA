import { redirect } from "next/navigation";

import { ModuloDocumento } from "@prisma/client";
import Link from "next/link";

import { APP_NAME } from "@/lib/app-branding";
import { getReportIdentity } from "@/lib/visual-personalization";
import type { ReportIdentity } from "@/lib/report-identity";
import { ReportHeader } from "@/components/report-identity-mark";
import { getInstitutionalReportLogo } from "@/lib/report-header";
import { getCurrentUser } from "@/lib/auth-session";
import { formatAppDateTime, getAppDate, getAppMonthYear } from "@/lib/date-time";
import { prisma } from "@/lib/prisma";
import { canAccessReports, canManageModuleOptions } from "@/lib/rbac";

import { ReportActions } from "./components/report-actions";
import { ReportControls } from "./components/report-controls";
import { getReportDefinition, getReportModule } from "./report-definitions";
import { generateReport, type GeneratedReport, type ReportSearchParams } from "./report-service";

type PageProps = {
  searchParams: Promise<ReportSearchParams>;
};

export const dynamic = "force-dynamic";

const MONTH_OPTIONS = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" }
];

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatDateTimeDisplay(date: Date): string {
  return formatAppDateTime(date);
}

function buildInitialFilters(params: ReportSearchParams): Record<string, string> {
  const ignored = new Set(["module", "report", "generated", "feedback", "feedbackType"]);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (ignored.has(key)) continue;
    const normalized = firstParam(value).trim();
    if (normalized) result[key] = normalized;
  }
  return result;
}

function SanitaryReportsSection({
  defaultMonth,
  defaultYear
}: {
  defaultMonth: number;
  defaultYear: number;
}) {
  return (
    <section className="bpma-card print:hidden">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        Relatórios Sanitários
      </h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <form
          method="get"
          action="/relatorios/higienizacao-hortifruti/mensal"
          target="_blank"
          className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <div className="sm:col-span-3">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Higienização de Hortifruti
            </h3>
          </div>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Mês
            <select name="mes" defaultValue={String(defaultMonth)} className="bpma-input">
              {MONTH_OPTIONS.map((month) => (
                <option key={month.value} value={String(month.value)}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Ano
            <input
              type="number"
              name="ano"
              min={2020}
              max={2100}
              defaultValue={defaultYear}
              className="bpma-input"
            />
          </label>
          <div className="flex items-end">
            <button type="submit" className="btn-primary w-full sm:w-auto">
              Gerar Relatório
            </button>
          </div>
        </form>

        <form
          method="get"
          action="/relatorios/controle-temperatura-equipamentos/mensal"
          target="_blank"
          className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <div className="sm:col-span-3">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Controle de Temperatura dos Equipamentos
            </h3>
          </div>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Mês
            <select name="mes" defaultValue={String(defaultMonth)} className="bpma-input">
              {MONTH_OPTIONS.map((month) => (
                <option key={month.value} value={String(month.value)}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Ano
            <input
              type="number"
              name="ano"
              min={2020}
              max={2100}
              defaultValue={defaultYear}
              className="bpma-input"
            />
          </label>
          <div className="flex items-end">
            <button type="submit" className="btn-primary w-full sm:w-auto">
              Gerar Relatório
            </button>
          </div>
        </form>

        <form
          method="get"
          action="/relatorios/controle-qualidade-oleo/mensal"
          target="_blank"
          className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <div className="sm:col-span-3">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Controle da Qualidade do Óleo
            </h3>
          </div>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Mês
            <select name="mes" defaultValue={String(defaultMonth)} className="bpma-input">
              {MONTH_OPTIONS.map((month) => (
                <option key={month.value} value={String(month.value)}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Ano
            <input
              type="number"
              name="ano"
              min={2020}
              max={2100}
              defaultValue={defaultYear}
              className="bpma-input"
            />
          </label>
          <div className="flex items-end">
            <button type="submit" className="btn-primary w-full sm:w-auto">
              Gerar Relatório
            </button>
          </div>
        </form>

        <form
          method="get"
          action="/relatorios/rastreabilidade-recebimento/mensal"
          target="_blank"
          className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <div className="sm:col-span-3">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Rastreabilidade e Recebimento de Mercadorias
            </h3>
          </div>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Mês
            <select name="mes" defaultValue={String(defaultMonth)} className="bpma-input">
              {MONTH_OPTIONS.map((month) => (
                <option key={month.value} value={String(month.value)}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Ano
            <input
              type="number"
              name="ano"
              min={2020}
              max={2100}
              defaultValue={defaultYear}
              className="bpma-input"
            />
          </label>
          <div className="flex items-end">
            <button type="submit" className="btn-primary w-full sm:w-auto">
              Gerar Relatório
            </button>
          </div>
        </form>

        <form
          method="get"
          action="/relatorios/controle-buffet-amostras/mensal"
          target="_blank"
          className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <div className="sm:col-span-3">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Controle de Buffet / Amostras
            </h3>
          </div>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Mês
            <select name="mes" defaultValue={String(defaultMonth)} className="bpma-input">
              {MONTH_OPTIONS.map((month) => (
                <option key={month.value} value={String(month.value)}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Ano
            <input
              type="number"
              name="ano"
              min={2020}
              max={2100}
              defaultValue={defaultYear}
              className="bpma-input"
            />
          </label>
          <div className="flex items-end">
            <button type="submit" className="btn-primary w-full sm:w-auto">
              Gerar Relatório
            </button>
          </div>
        </form>

        <form
          method="get"
          action="/relatorios/plano-limpeza-diario/mensal"
          target="_blank"
          className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <div className="sm:col-span-3">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Plano de Limpeza Diária por Área
            </h3>
          </div>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Mês
            <select name="mes" defaultValue={String(defaultMonth)} className="bpma-input">
              {MONTH_OPTIONS.map((month) => (
                <option key={month.value} value={String(month.value)}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Ano
            <input
              type="number"
              name="ano"
              min={2020}
              max={2100}
              defaultValue={defaultYear}
              className="bpma-input"
            />
          </label>
          <div className="flex items-end">
            <button type="submit" className="btn-primary w-full sm:w-auto">
              Gerar Relatório
            </button>
          </div>
        </form>

        <form
          method="get"
          action="/relatorios/plano-limpeza-semanal/mensal"
          target="_blank"
          className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <div className="sm:col-span-3">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Plano de Limpeza Semanal por Área
            </h3>
          </div>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Mês
            <select name="mes" defaultValue={String(defaultMonth)} className="bpma-input">
              {MONTH_OPTIONS.map((month) => (
                <option key={month.value} value={String(month.value)}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Ano
            <input
              type="number"
              name="ano"
              min={2020}
              max={2100}
              defaultValue={defaultYear}
              className="bpma-input"
            />
          </label>
          <div className="flex items-end">
            <button type="submit" className="btn-primary w-full sm:w-auto">
              Gerar Relatório
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function ReportResult({ report, identity }: { report: GeneratedReport; identity: ReportIdentity }) {
  return (
    <section className="bpma-report-document bpma-card space-y-5 print:rounded-none print:border-0 print:shadow-none">
      <div className="flex justify-end print:hidden"><ReportActions /></div>
      <ReportHeader identity={identity} title={report.reportLabel} reportName={report.reportLabel}
        moduleName={report.moduleLabel} period={report.periodLabel} periodLabel="Período"
        emittedAt={formatDateTimeDisplay(report.generatedAt)} institutionalLogoSrc={getInstitutionalReportLogo()} />

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-800 md:grid-cols-2 xl:grid-cols-4">
        <p><strong>Sistema:</strong> {APP_NAME}</p>
        <p><strong>Usuário que emitiu:</strong> {report.generatedBy}</p>
        <p><strong>Perfil:</strong> {report.generatedByRole}</p>
      </div>

      {report.appliedFilters.length > 0 ? (
        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Filtros aplicados</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {report.appliedFilters.map((filter) => (
              <span
                key={`${filter.label}-${filter.value}`}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {filter.label}: {filter.value}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {report.summary.map((item) => (
          <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{item.label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{item.value}</p>
          </div>
        ))}
      </div>

      {report.notes?.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {report.notes.map((note) => <p key={note}>{note}</p>)}
        </div>
      ) : null}

      <div className="bpma-table-scroll">
        <table className="bpma-data-table min-w-[56rem]">
          <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <tr>
              {report.columns.map((column) => (
                <th key={column.key} className="px-3 py-2">{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {report.rows.length === 0 ? (
              <tr>
                <td colSpan={report.columns.length} className="px-3 py-4 text-slate-500 dark:text-slate-400">
                  Nenhum dado encontrado para os filtros selecionados.
                </td>
              </tr>
            ) : (
              report.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {report.columns.map((column) => (
                    <td key={column.key} className="max-w-80 whitespace-normal break-words px-3 py-2 align-top">
                      {row[column.key] ?? "-"}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <footer className="border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Relatório gerado automaticamente pelo {APP_NAME}. Alterações manuais descaracterizam o documento.
      </footer>
    </section>
  );
}

export default async function RelatoriosPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !canAccessReports(user)) {
    redirect("/acesso-negado");
  }

  const params = await searchParams;
  const moduleParam = firstParam(params.module).trim();
  const reportParam = firstParam(params.report).trim();
  const selectedModule = getReportModule(moduleParam);
  const selectedReport = getReportDefinition(selectedModule.id, reportParam);
  const generated = firstParam(params.generated) === "1";
  const podeGerenciarOpcoes = canManageModuleOptions(user);
  const initialFilters = buildInitialFilters(params);
  const defaultMonthYear = getAppMonthYear(getAppDate());
  const [report, configuracaoCabecalho] = await Promise.all([
    generated
      ? generateReport({
          moduleId: selectedModule.id,
          reportId: selectedReport.id,
          searchParams: params,
          user
        })
      : Promise.resolve(null),
    prisma.moduloConfiguracao.findUnique({
      where: { modulo: ModuloDocumento.RELATORIOS_AUDITORIA },
      select: { textoCabecalho: true }
    })
  ]);
  const textoCabecalho = configuracaoCabecalho?.textoCabecalho?.trim() ?? "";

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className="bpma-card print:hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Relatórios e Auditoria
            </h1>
            {textoCabecalho ? (
              <div className="mt-3 max-w-4xl rounded-lg border border-amber-200 border-l-4 border-l-amber-500 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:border-l-amber-400 dark:bg-amber-950/60">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                  Orientação
                </p>
                <p className="mt-1 whitespace-pre-line text-sm leading-6 text-amber-900 dark:text-amber-100">
                  {textoCabecalho}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {podeGerenciarOpcoes ? (
        <section className="bpma-card-compact print:hidden">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Ações do módulo
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/relatorios/opcoes" className="btn-secondary">
              Gerenciar
            </Link>
          </div>
        </section>
      ) : null}

      <SanitaryReportsSection
        defaultMonth={defaultMonthYear.mes}
        defaultYear={defaultMonthYear.ano}
      />

      <ReportControls
        selectedModuleId={selectedModule.id}
        selectedReportId={selectedReport.id}
        initialFilters={initialFilters}
      />

      {report ? (
        <ReportResult report={report} identity={await getReportIdentity()} />
      ) : (
        <section className="bpma-card print:hidden">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Escolha o módulo e o tipo de relatório para exibir os filtros. Depois clique em <strong>Gerar Relatório</strong>.
          </p>
        </section>
      )}
    </div>
  );
}
