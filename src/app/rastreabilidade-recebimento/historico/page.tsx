import { getMonthRangesForBounds, parseFilterMonth, parseFilterYear } from "@/lib/month-filter";
import {
  ConformidadeRecebimento,
  Prisma,
  StatusNotaRecebimento,
  StatusRecebimento
} from "@prisma/client";
import Link from "next/link";

import { MonthlyClosureSection, SignDayForm, SupervisorSignatureStatus } from "@/components/historico/technical-signature";
import { ActionModal } from "@/components/ui/action-modal";
import { getCurrentUser } from "@/lib/auth-session";
import { formatAppDate, formatAppDateInput, getAppDate, getAppMonthDateRange, getAppMonthYear } from "@/lib/date-time";
import { canSignModuleDay, canSignModuleMonthlyClosure } from "@/lib/module-signatures";
import { prisma } from "@/lib/prisma";

import {
  formatDateDisplay,
  formatTemperatureDisplay,
  getMonthDateRange,
  getYearDateRange,
  parseDateInput
} from "../utils";

const PAGE_PATH = "/rastreabilidade-recebimento/historico";
const CARD_CLASS = "bpma-card";
const INPUT_CLASS = "bpma-input";
const MODULE_CODE = "rastreabilidade";

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

function parseStatusNotaFilter(value: string): StatusNotaRecebimento | null {
  if (value === StatusNotaRecebimento.PENDENTE) return StatusNotaRecebimento.PENDENTE;
  if (value === StatusNotaRecebimento.IMPORTADA) return StatusNotaRecebimento.IMPORTADA;
  if (value === StatusNotaRecebimento.EM_CONFERENCIA) return StatusNotaRecebimento.EM_CONFERENCIA;
  if (value === StatusNotaRecebimento.FINALIZADA) return StatusNotaRecebimento.FINALIZADA;
  return null;
}

function getNotaStatusLabel(status: StatusNotaRecebimento): string {
  if (status === StatusNotaRecebimento.FINALIZADA) return "Finalizada";
  if (status === StatusNotaRecebimento.IMPORTADA) return "Importada";
  if (status === StatusNotaRecebimento.EM_CONFERENCIA) return "Em Conferência";
  return "Pendente";
}

function getNotaStatusClass(status: StatusNotaRecebimento): string {
  if (status === StatusNotaRecebimento.FINALIZADA) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  }

  if (status === StatusNotaRecebimento.IMPORTADA) {
    return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200";
  }

  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200";
}

function isItemNonConforming(item: {
  statusGeral: StatusRecebimento;
  temperaturaStatus: ConformidadeRecebimento | null;
  transporteEntregador: ConformidadeRecebimento | null;
  aspectoSensorial: ConformidadeRecebimento | null;
  embalagem: ConformidadeRecebimento | null;
}): boolean {
  return (
    item.statusGeral === StatusRecebimento.NAO_CONFORME ||
    item.temperaturaStatus === ConformidadeRecebimento.NAO_CONFORME ||
    item.transporteEntregador === ConformidadeRecebimento.NAO_CONFORME ||
    item.aspectoSensorial === ConformidadeRecebimento.NAO_CONFORME ||
    item.embalagem === ConformidadeRecebimento.NAO_CONFORME
  );
}

export default async function RastreabilidadeRecebimentoHistoricoPage({
  searchParams
}: PageProps) {
  const authUser = await getCurrentUser();
  const canSignDay = authUser ? canSignModuleDay(authUser, MODULE_CODE) : false;
  const canSignMonthly = authUser ? canSignModuleMonthlyClosure(authUser, MODULE_CODE) : false;

  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";
  const filtroData = firstParam(params.filtroData).trim();
  const filtroMes = parseFilterMonth(firstParam(params.filtroMes).trim());
  const filtroAno = parseFilterYear(firstParam(params.filtroAno).trim());
  const filtroFornecedor = firstParam(params.filtroFornecedor).trim();
  const filtroNotaFiscal = firstParam(params.filtroNotaFiscal).trim();
  const filtroResponsavel = firstParam(params.filtroResponsavel).trim();
  const filtroStatus = parseStatusNotaFilter(firstParam(params.filtroStatus).trim());
  const diaAberto = firstParam(params.dia).trim();

  const todayMonth = getAppMonthYear(getAppDate());
  const selectedMonth = filtroMes && filtroMes <= 12 ? filtroMes : todayMonth.mes;
  const selectedYear = filtroAno ?? todayMonth.ano;
  const selectedMonthRange = getAppMonthDateRange(selectedMonth, selectedYear);

  const where: Prisma.RastreabilidadeRecebimentoNotaWhereInput = {};
  const dataFiltro = parseDateInput(filtroData);

  if (dataFiltro) {
    where.data = dataFiltro;
  } else if (filtroMes && filtroAno && filtroMes <= 12) {
    const range = getMonthDateRange(filtroMes, filtroAno);
    where.data = { gte: range.start, lte: range.end };
  } else if (filtroAno) {
    const range = getYearDateRange(filtroAno);
    where.data = { gte: range.start, lte: range.end };
  } else if (filtroMes) {
    const bounds = await prisma.rastreabilidadeRecebimentoNota.aggregate({
      _min: { data: true },
      _max: { data: true }
    });
    where.OR = getMonthRangesForBounds(filtroMes, bounds._min.data, bounds._max.data)
      .map(({ start, end }) => ({ data: { gte: start, lte: end } }));
  }

  if (filtroFornecedor) {
    where.fornecedor = { contains: filtroFornecedor, mode: "insensitive" };
  }
  if (filtroNotaFiscal) {
    where.notaFiscal = { contains: filtroNotaFiscal, mode: "insensitive" };
  }
  if (filtroResponsavel) {
    where.responsavelGeral = { contains: filtroResponsavel, mode: "insensitive" };
  }
  if (filtroStatus) {
    where.statusNota = filtroStatus;
  }

  const [notas, notasMensais, fechamentoMensal] = await Promise.all([
    prisma.rastreabilidadeRecebimentoNota.findMany({
      where,
      include: { itens: true },
      orderBy: [{ data: "desc" }, { createdAt: "desc" }]
    }),
    prisma.rastreabilidadeRecebimentoNota.findMany({
      where: { data: { gte: selectedMonthRange.start, lte: selectedMonthRange.end } },
      include: { itens: true },
      orderBy: [{ data: "desc" }, { createdAt: "desc" }]
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

  const gruposPorDia = new Map<string, { data: Date; notas: typeof notas }>();
  for (const nota of notas) {
    const key = formatAppDateInput(nota.data);
    const group = gruposPorDia.get(key) ?? { data: nota.data, notas: [] };
    group.notas.push(nota);
    gruposPorDia.set(key, group);
  }
  const grupos = Array.from(gruposPorDia.values()).sort(
    (a, b) => b.data.getTime() - a.data.getTime()
  );

  const datasHistorico = grupos.map((grupo) => grupo.data);
  const datasMensais = Array.from(
    new Map(notasMensais.map((nota) => [formatAppDateInput(nota.data), nota.data])).values()
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

  const paramsRetorno = new URLSearchParams();
  if (filtroData) paramsRetorno.set("filtroData", filtroData);
  if (filtroMes) paramsRetorno.set("filtroMes", String(filtroMes));
  if (filtroAno) paramsRetorno.set("filtroAno", String(filtroAno));
  if (filtroFornecedor) paramsRetorno.set("filtroFornecedor", filtroFornecedor);
  if (filtroNotaFiscal) paramsRetorno.set("filtroNotaFiscal", filtroNotaFiscal);
  if (filtroResponsavel) paramsRetorno.set("filtroResponsavel", filtroResponsavel);
  if (filtroStatus) paramsRetorno.set("filtroStatus", filtroStatus);
  const returnTo = buildPathWithParams(paramsRetorno);
  const buildOpenDayHref = (dateInput: string): string => {
    const query = new URLSearchParams(paramsRetorno);
    query.set("dia", dateInput);
    return buildPathWithParams(query);
  };
  const grupoSelecionado = diaAberto ? grupos.find((grupo) => formatAppDateInput(grupo.data) === diaAberto) : null;

  const diasComRecebimento = new Set(notasMensais.map((nota) => formatAppDateInput(nota.data)));
  const itensMensais = notasMensais.flatMap((nota) => nota.itens);
  const itensNaoConformes = itensMensais.filter(isItemNonConforming).length;
  const diasNoMes = selectedMonthRange.end.getUTCDate();
  const indicadoresMensais = {
    "Mês/Ano": `${String(selectedMonth).padStart(2, "0")}/${selectedYear}`,
    "Notas recebidas": notasMensais.length,
    "Itens conferidos": itensMensais.length,
    "Itens não conformes": itensNaoConformes,
    "Ações corretivas": itensMensais.filter((item) => item.acaoCorretiva?.trim()).length,
    "Dias com recebimento": diasComRecebimento.size,
    "Dias sem recebimento": Math.max(diasNoMes - diasComRecebimento.size, 0),
    "Dias assinados": assinaturasMensaisPorData.size,
    "Dias pendentes de assinatura": Math.max(diasComRecebimento.size - assinaturasMensaisPorData.size, 0)
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
              Consulta diária de notas recebidas, itens de conferência, revisão e fechamento mensal.
            </p>
          </div>
          <div className="btn-group">
            <Link href="/rastreabilidade-recebimento" className="btn-secondary">
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
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Filtros
        </h2>
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
            <input type="number" min={2020} max={2100} name="filtroAno" defaultValue={filtroAno ?? ""} className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Fornecedor
            <input type="text" name="filtroFornecedor" defaultValue={filtroFornecedor} className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Número da Nota Fiscal
            <input type="text" name="filtroNotaFiscal" defaultValue={filtroNotaFiscal} className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Responsável
            <input type="text" name="filtroResponsavel" defaultValue={filtroResponsavel} className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Status da Nota
            <select name="filtroStatus" defaultValue={filtroStatus ?? ""} className={INPUT_CLASS}>
              <option value="">Todos</option>
              <option value={StatusNotaRecebimento.PENDENTE}>Pendente</option>
              <option value={StatusNotaRecebimento.IMPORTADA}>Importada</option>
              <option value={StatusNotaRecebimento.EM_CONFERENCIA}>Em Conferência</option>
              <option value={StatusNotaRecebimento.FINALIZADA}>Finalizada</option>
            </select>
          </label>
          <div className="btn-group md:col-span-6">
            <button type="submit" className="btn-primary">
              Aplicar Filtros
            </button>
            <Link href={PAGE_PATH} className="btn-secondary">
              Limpar
            </Link>
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
                <th className="px-3 py-2">Notas</th>
                <th className="px-3 py-2">Itens</th>
                <th className="px-3 py-2">Status operacional</th>
                <th className="px-3 py-2">Não conformidades</th>
                <th className="px-3 py-2">Assinatura</th>
                <th className="px-3 py-2">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {grupos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-3 text-slate-500 dark:text-slate-400">
                    Nenhuma nota encontrada.
                  </td>
                </tr>
              ) : (
                grupos.map((grupo) => {
                  const key = formatAppDateInput(grupo.data);
                  const itens = grupo.notas.flatMap((nota) => nota.itens);
                  const naoConformes = itens.filter(isItemNonConforming).length;
                  const pendentes = grupo.notas.filter(
                    (nota) => nota.statusNota !== StatusNotaRecebimento.FINALIZADA
                  ).length;

                  return (
                    <tr key={key}>
                      <td className="px-3 py-2">{formatDateDisplay(grupo.data)}</td>
                      <td className="px-3 py-2">{grupo.notas.length}</td>
                      <td className="px-3 py-2">{itens.length}</td>
                      <td className="px-3 py-2">{pendentes > 0 ? "Parcial" : "Completo"}</td>
                      <td className="px-3 py-2">{naoConformes}</td>
                      <td className="px-3 py-2">
                        <SupervisorSignatureStatus signature={assinaturasPorData.get(key) ?? null} />
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
          title={`Recebimentos de ${formatAppDate(grupoSelecionado.data)}`}
          cancelHref={returnTo}
          maxWidthClassName="max-w-6xl"
          description={<p>Esta assinatura valida a revisão de todas as notas recebidas neste dia.</p>}
        >
          <div className="mb-4">
            <SupervisorSignatureStatus
              signature={assinaturasPorData.get(formatAppDateInput(grupoSelecionado.data)) ?? null}
            />
          </div>
          <div className="space-y-4">
            {grupoSelecionado.notas.map((nota) => (
              <section key={nota.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                      Nota {nota.notaFiscal} - {nota.fornecedor}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Responsável: {nota.responsavelGeral ?? "-"}
                    </p>
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getNotaStatusClass(nota.statusNota)}`}>
                    {getNotaStatusLabel(nota.statusNota)}
                  </span>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-[1300px] divide-y divide-slate-200 text-sm dark:divide-slate-700">
                    <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      <tr>
                        <th className="px-3 py-2">Produto</th>
                        <th className="px-3 py-2">Lote</th>
                        <th className="px-3 py-2">Fabricação</th>
                        <th className="px-3 py-2">Validade</th>
                        <th className="px-3 py-2">Temperatura</th>
                        <th className="px-3 py-2">Transporte</th>
                        <th className="px-3 py-2">Aspecto</th>
                        <th className="px-3 py-2">Embalagem</th>
                        <th className="px-3 py-2">Ação corretiva</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {nota.itens.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2">{item.produto}</td>
                          <td className="px-3 py-2">{item.lote ?? "-"}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {item.dataFabricacao ? formatDateDisplay(item.dataFabricacao) : "-"}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {item.dataValidade ? formatDateDisplay(item.dataValidade) : "-"}
                          </td>
                          <td className="px-3 py-2">{formatTemperatureDisplay(item.temperatura)}</td>
                          <td className="px-3 py-2">{item.transporteEntregador ?? "-"}</td>
                          <td className="px-3 py-2">{item.aspectoSensorial ?? "-"}</td>
                          <td className="px-3 py-2">{item.embalagem ?? "-"}</td>
                          <td className="px-3 py-2 max-w-80 whitespace-normal break-words">{item.acaoCorretiva ?? "-"}</td>
                          <td className="px-3 py-2">{isItemNonConforming(item) ? "Não conforme" : "Conforme"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3">
                  <Link href={`/rastreabilidade-recebimento/nota/${nota.id}`} className="btn-secondary">
                    Abrir Nota
                  </Link>
                </div>
              </section>
            ))}
          </div>
          <SignDayForm
            moduleCode={MODULE_CODE}
            dateInput={formatAppDateInput(grupoSelecionado.data)}
            returnTo={buildOpenDayHref(formatAppDateInput(grupoSelecionado.data))}
            canSign={canSignDay}
            alreadySigned={Boolean(assinaturasPorData.get(formatAppDateInput(grupoSelecionado.data)))}
            hasOperationalWarnings={grupoSelecionado.notas.some((nota) =>
              nota.itens.some(isItemNonConforming) || nota.statusNota !== StatusNotaRecebimento.FINALIZADA
            )}
          />
        </ActionModal>
      ) : null}
    </div>
  );
}
