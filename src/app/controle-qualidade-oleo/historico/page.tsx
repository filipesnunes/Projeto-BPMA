import { getMonthRangesForBounds, parseFilterMonth, parseFilterYear } from "@/lib/month-filter";
import { Prisma, StatusQualidadeOleo } from "@prisma/client";
import Link from "next/link";

import { MonthlyClosureSection, SignDayForm, SupervisorSignatureStatus } from "@/components/historico/technical-signature";
import { ActionModal } from "@/components/ui/action-modal";
import { getCurrentUser } from "@/lib/auth-session";
import { formatAppDate, formatAppDateInput, getAppDate, getAppMonthDateRange, getAppMonthYear } from "@/lib/date-time";
import { canSignModuleDay, canSignModuleMonthlyClosure } from "@/lib/module-signatures";
import { prisma } from "@/lib/prisma";

import { OilStatusBadge } from "../oil-status-badge";
import {
  formatDateDisplay,
  formatTemperatureDisplay,
  getMonthDateRange,
  getYearDateRange,
  parseDateInput
} from "../utils";

const PAGE_PATH = "/controle-qualidade-oleo/historico";
const CARD_CLASS = "bpma-card";
const INPUT_CLASS = "bpma-input";
const MODULE_CODE = "oleo";

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

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams: Promise<SearchParams> };

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function buildPathWithParams(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${PAGE_PATH}?${query}` : PAGE_PATH;
}

function parseStatusFilter(value: string): StatusQualidadeOleo | null {
  if (value === StatusQualidadeOleo.ADEQUADO) return StatusQualidadeOleo.ADEQUADO;
  if (value === StatusQualidadeOleo.ATENCAO) return StatusQualidadeOleo.ATENCAO;
  if (value === StatusQualidadeOleo.ULTIMA_UTILIZACAO) return StatusQualidadeOleo.ULTIMA_UTILIZACAO;
  if (value === StatusQualidadeOleo.DESCARTAR) return StatusQualidadeOleo.DESCARTAR;
  if (value === StatusQualidadeOleo.SEM_UTILIZACAO) return StatusQualidadeOleo.SEM_UTILIZACAO;
  return null;
}

function isOilAlert(registro: { status: StatusQualidadeOleo | null; temperaturaCritica: boolean }): boolean {
  return (
    registro.temperaturaCritica ||
    registro.status === StatusQualidadeOleo.ATENCAO ||
    registro.status === StatusQualidadeOleo.ULTIMA_UTILIZACAO ||
    registro.status === StatusQualidadeOleo.DESCARTAR
  );
}

export default async function ControleQualidadeOleoHistoricoPage({ searchParams }: PageProps) {
  const authUser = await getCurrentUser();
  const canSignDay = authUser ? canSignModuleDay(authUser, MODULE_CODE) : false;
  const canSignMonthly = authUser ? canSignModuleMonthlyClosure(authUser, MODULE_CODE) : false;

  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";
  const filtroData = firstParam(params.filtroData).trim();
  const filtroMes = parseFilterMonth(firstParam(params.filtroMes));
  const filtroAno = parseFilterYear(firstParam(params.filtroAno));
  const filtroFita = firstParam(params.filtroFita).trim();
  const filtroStatus = parseStatusFilter(firstParam(params.filtroStatus).trim());
  const filtroResponsavel = firstParam(params.filtroResponsavel).trim();
  const diaAberto = firstParam(params.dia).trim();

  const todayMonth = getAppMonthYear(getAppDate());
  const selectedMonth = filtroMes && filtroMes <= 12 ? filtroMes : todayMonth.mes;
  const selectedYear = filtroAno ?? todayMonth.ano;
  const selectedMonthRange = getAppMonthDateRange(selectedMonth, selectedYear);

  const where: Prisma.ControleQualidadeOleoRegistroWhereInput = {};
  const dataFiltro = parseDateInput(filtroData);

  if (dataFiltro) {
    where.data = dataFiltro;
  } else if (filtroMes && filtroAno && filtroMes <= 12) {
    const { start, end } = getMonthDateRange(filtroMes, filtroAno);
    where.data = { gte: start, lte: end };
  } else if (filtroAno) {
    const { start, end } = getYearDateRange(filtroAno);
    where.data = { gte: start, lte: end };
  } else if (filtroMes) {
    const bounds = await prisma.controleQualidadeOleoRegistro.aggregate({
      _min: { data: true },
      _max: { data: true }
    });
    where.OR = getMonthRangesForBounds(filtroMes, bounds._min.data, bounds._max.data)
      .map(({ start, end }) => ({ data: { gte: start, lte: end } }));
  }

  if (filtroFita) {
    where.fitaOleo = { contains: filtroFita, mode: "insensitive" };
  }

  if (filtroStatus) {
    where.status = filtroStatus;
  }

  if (filtroResponsavel) {
    where.responsavel = { contains: filtroResponsavel, mode: "insensitive" };
  }

  const [registros, registrosMensais, fitaOptions, fechamentoMensal] = await Promise.all([
    prisma.controleQualidadeOleoRegistro.findMany({
      where,
      orderBy: [{ data: "desc" }, { createdAt: "desc" }]
    }),
    prisma.controleQualidadeOleoRegistro.findMany({
      where: { data: { gte: selectedMonthRange.start, lte: selectedMonthRange.end } },
      orderBy: [{ data: "desc" }, { createdAt: "desc" }]
    }),
    prisma.controleQualidadeOleoOpcaoFita.findMany({
      orderBy: [{ ativo: "desc" }, { ordem: "asc" }, { rotulo: "asc" }]
    }),
    prisma.fechamentoMensalModulo.findUnique({
      where: {
        moduloCodigo_ano_mes: {
          moduloCodigo: MODULE_CODE,
          ano: selectedYear,
          mes: selectedMonth
        }
      }
    })
  ]);

  const gruposPorDia = new Map<string, { data: Date; registros: typeof registros }>();
  for (const registro of registros) {
    const key = formatAppDateInput(registro.data);
    const group = gruposPorDia.get(key) ?? { data: registro.data, registros: [] };
    group.registros.push(registro);
    gruposPorDia.set(key, group);
  }
  const grupos = Array.from(gruposPorDia.values()).sort(
    (a, b) => b.data.getTime() - a.data.getTime()
  );

  const datasHistorico = grupos.map((grupo) => grupo.data);
  const datasMensais = Array.from(
    new Map(registrosMensais.map((registro) => [formatAppDateInput(registro.data), registro.data])).values()
  );
  const [assinaturasHistorico, assinaturasMensais] = await Promise.all([
    datasHistorico.length
      ? prisma.assinaturaDiariaModulo.findMany({
          where: { moduloCodigo: MODULE_CODE, dataReferencia: { in: datasHistorico } }
        })
      : Promise.resolve([]),
    datasMensais.length
      ? prisma.assinaturaDiariaModulo.findMany({
          where: { moduloCodigo: MODULE_CODE, dataReferencia: { in: datasMensais } }
        })
      : Promise.resolve([])
  ]);
  const assinaturasPorData = new Map(
    assinaturasHistorico.map((assinatura) => [formatAppDateInput(assinatura.dataReferencia), assinatura])
  );
  const assinaturasMensaisPorData = new Set(
    assinaturasMensais.map((assinatura) => formatAppDateInput(assinatura.dataReferencia))
  );

  const parametrosRetorno = new URLSearchParams();
  if (filtroData) parametrosRetorno.set("filtroData", filtroData);
  if (filtroMes) parametrosRetorno.set("filtroMes", String(filtroMes));
  if (filtroAno) parametrosRetorno.set("filtroAno", String(filtroAno));
  if (filtroFita) parametrosRetorno.set("filtroFita", filtroFita);
  if (filtroStatus) parametrosRetorno.set("filtroStatus", filtroStatus);
  if (filtroResponsavel) parametrosRetorno.set("filtroResponsavel", filtroResponsavel);
  const returnTo = buildPathWithParams(parametrosRetorno);

  const grupoSelecionado = diaAberto ? grupos.find((grupo) => formatAppDateInput(grupo.data) === diaAberto) : null;
  const buildOpenDayHref = (dateInput: string): string => {
    const query = new URLSearchParams(parametrosRetorno);
    query.set("dia", dateInput);
    return buildPathWithParams(query);
  };

  const totalAlertasMensais = registrosMensais.filter(isOilAlert).length;
  const trocaRecomendada = registrosMensais.filter(
    (registro) => registro.status === StatusQualidadeOleo.DESCARTAR
  ).length;
  const diasComRegistro = new Set(registrosMensais.map((registro) => formatAppDateInput(registro.data)));
  const indicadoresMensais = {
    "Mês/Ano": `${String(selectedMonth).padStart(2, "0")}/${selectedYear}`,
    "Medições realizadas": registrosMensais.length,
    "Medições conformes": registrosMensais.filter(
      (registro) => registro.status === StatusQualidadeOleo.ADEQUADO
    ).length,
    "Medições não conformes": totalAlertasMensais,
    "Trocas recomendadas": trocaRecomendada,
    "Ações corretivas": registrosMensais.filter((registro) => registro.observacao?.trim()).length,
    "Dias com registro": diasComRegistro.size,
    "Dias assinados": assinaturasMensaisPorData.size,
    "Dias pendentes de assinatura": Math.max(diasComRegistro.size - assinaturasMensaisPorData.size, 0)
  };

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Histórico Completo
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Consulta por dia, revisão do supervisor e fechamento mensal da qualidade do óleo.
            </p>
          </div>
          <div className="btn-group">
            <Link href="/controle-qualidade-oleo" className="btn-secondary">
              Voltar ao Módulo
            </Link>
          </div>
        </div>
      </section>

      {feedback ? (
        <section
          className={`rounded-xl border p-4 text-sm ${
            feedbackType === "error"
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          }`}
        >
          {feedback}
        </section>
      ) : null}

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Filtros</h2>

        <form method="get" className="grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-6 dark:bg-slate-800">
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Data
            <input type="date" name="filtroData" defaultValue={filtroData} className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Mês
            <select name="filtroMes" defaultValue={filtroMes ? String(filtroMes) : ""} className={INPUT_CLASS}>
              <option value="">Todos</option>
              {MONTH_OPTIONS.map((month) => (
                <option key={month.value} value={String(month.value)}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Ano
            <input type="number" name="filtroAno" min={2020} max={2100} defaultValue={filtroAno ?? ""} className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            % da Fita
            <select name="filtroFita" defaultValue={filtroFita} className={INPUT_CLASS}>
              <option value="">Todas</option>
              {fitaOptions.map((option) => (
                <option key={option.id} value={option.rotulo}>
                  {option.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Status
            <select name="filtroStatus" defaultValue={filtroStatus ?? ""} className={INPUT_CLASS}>
              <option value="">Todos</option>
              <option value={StatusQualidadeOleo.ADEQUADO}>Adequado</option>
              <option value={StatusQualidadeOleo.ATENCAO}>Atenção</option>
              <option value={StatusQualidadeOleo.ULTIMA_UTILIZACAO}>Última Utilização</option>
              <option value={StatusQualidadeOleo.DESCARTAR}>Descartar</option>
              <option value={StatusQualidadeOleo.SEM_UTILIZACAO}>Sem Utilização</option>
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Responsável
            <input type="text" name="filtroResponsavel" defaultValue={filtroResponsavel} className={INPUT_CLASS} />
          </label>

          <div className="btn-group md:col-span-6">
            <button type="submit" className="btn-primary">Aplicar Filtros</button>
            <Link href={PAGE_PATH} className="btn-secondary">Limpar</Link>
          </div>
        </form>
      </section>

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Dias no Histórico ({grupos.length})
        </h2>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Registros</th>
                <th className="px-3 py-2">Status operacional</th>
                <th className="px-3 py-2">Alertas</th>
                <th className="px-3 py-2">Assinatura</th>
                <th className="px-3 py-2">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {grupos.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-500 dark:text-slate-400" colSpan={6}>
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                grupos.map((grupo) => {
                  const key = formatAppDateInput(grupo.data);
                  const alertas = grupo.registros.filter(isOilAlert).length;
                  const assinatura = assinaturasPorData.get(key) ?? null;

                  return (
                    <tr key={key}>
                      <td className="px-3 py-2">{formatDateDisplay(grupo.data)}</td>
                      <td className="px-3 py-2">{grupo.registros.length}</td>
                      <td className="px-3 py-2">{alertas > 0 ? "Com alerta" : "Completo"}</td>
                      <td className="px-3 py-2">{alertas}</td>
                      <td className="px-3 py-2">
                        <SupervisorSignatureStatus signature={assinatura} />
                      </td>
                      <td className="px-3 py-2">
                        <Link href={buildOpenDayHref(key)} scroll={false} className="btn-action">
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <MonthlyClosureSection
        moduleCode={MODULE_CODE}
        month={selectedMonth}
        year={selectedYear}
        returnTo={returnTo}
        indicators={indicadoresMensais}
        signedClosure={fechamentoMensal}
        canSign={canSignMonthly}
        pendingDailySignatures={indicadoresMensais["Dias pendentes de assinatura"]}
      />

      {grupoSelecionado ? (
        <ActionModal
          title={`Registros de ${formatAppDate(grupoSelecionado.data)}`}
          cancelHref={returnTo}
          maxWidthClassName="max-w-5xl"
          description={
            <p>
              Esta assinatura valida a revisão de todos os registros deste dia.
            </p>
          }
        >
          <div className="mb-4">
            <SupervisorSignatureStatus
              signature={assinaturasPorData.get(formatAppDateInput(grupoSelecionado.data)) ?? null}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <tr>
                  <th className="px-3 py-2">% da Fita</th>
                  <th className="px-3 py-2">Temperatura</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Responsável</th>
                  <th className="px-3 py-2">Observação / ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {grupoSelecionado.registros.map((registro) => (
                  <tr key={registro.id}>
                    <td className="px-3 py-2">{registro.fitaOleo ?? "-"}</td>
                    <td className={`px-3 py-2 ${registro.temperaturaCritica ? "text-red-600 dark:text-red-300" : ""}`}>
                      {formatTemperatureDisplay(registro.temperatura)}
                    </td>
                    <td className="px-3 py-2">
                      <OilStatusBadge status={registro.status} temperaturaCritica={registro.temperaturaCritica} />
                    </td>
                    <td className="px-3 py-2">{registro.responsavel}</td>
                    <td className="px-3 py-2 max-w-80 whitespace-normal break-words">
                      {registro.observacao ?? registro.orientacao}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SignDayForm
            moduleCode={MODULE_CODE}
            dateInput={formatAppDateInput(grupoSelecionado.data)}
            returnTo={buildOpenDayHref(formatAppDateInput(grupoSelecionado.data))}
            canSign={canSignDay}
            alreadySigned={Boolean(assinaturasPorData.get(formatAppDateInput(grupoSelecionado.data)))}
            hasOperationalWarnings={grupoSelecionado.registros.some(isOilAlert)}
          />
        </ActionModal>
      ) : null}
    </div>
  );
}
