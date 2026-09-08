import { getMonthRangesForBounds, parseFilterMonth, parseFilterYear } from "@/lib/month-filter";
import {
  ClassificacaoItemBuffetAmostra,
  Prisma,
  StatusFechamentoBuffetAmostra,
  StatusItemBuffetAmostra
} from "@prisma/client";
import Link from "next/link";

import { MonthlyClosureSection, SignDayForm, SupervisorSignatureStatus } from "@/components/historico/technical-signature";
import { ActionModal, ModalActions } from "@/components/ui/action-modal";
import { getCurrentUser } from "@/lib/auth-session";
import { formatAppDate, formatAppDateInput, getAppDate, getAppMonthDateRange, getAppMonthYear } from "@/lib/date-time";
import { canSignModuleDay, canSignModuleMonthlyClosure } from "@/lib/module-signatures";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

import { updateHistoricoRegistroAction } from "../actions";
import {
  buildBuffetServiceHistoryGroups,
  buildBuffetServiceHistoryTotals,
  type BuffetServiceHistoryGroup
} from "../service-history";
import { ItemStatusBadge, ServiceStatusBadge, TemperatureStatusBadge } from "../status-badges";
import {
  getClassificacaoLabel,
  getMonthDateRange,
  getMonthYear,
  getYearDateRange,
  parseDateInput,
  parsePositiveInt,
  THERMAL_BOTTLE_EQUIPMENT_LABEL
} from "../utils";

const MODULE_PATH = "/controle-buffet-amostras";
const HISTORY_PATH = "/controle-buffet-amostras/historico";
const CARD_CLASS = "bpma-card";
const INPUT_CLASS = "bpma-input";
const MODULE_CODE = "amostras";

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
  return query ? `${HISTORY_PATH}?${query}` : HISTORY_PATH;
}

function parseClassificacao(value: string): ClassificacaoItemBuffetAmostra | null {
  if (value === ClassificacaoItemBuffetAmostra.QUENTE) return ClassificacaoItemBuffetAmostra.QUENTE;
  if (value === ClassificacaoItemBuffetAmostra.FRIO) return ClassificacaoItemBuffetAmostra.FRIO;
  if (value === ClassificacaoItemBuffetAmostra.TEMPERATURA_AMBIENTE) return ClassificacaoItemBuffetAmostra.TEMPERATURA_AMBIENTE;
  return null;
}

function parseStatus(value: string): StatusItemBuffetAmostra | null {
  if (value === StatusItemBuffetAmostra.PENDENTE) return StatusItemBuffetAmostra.PENDENTE;
  if (value === StatusItemBuffetAmostra.PREENCHIDO) return StatusItemBuffetAmostra.PREENCHIDO;
  if (value === StatusItemBuffetAmostra.ASSINADO) return StatusItemBuffetAmostra.ASSINADO;
  if (value === StatusItemBuffetAmostra.NAO_SERVIDO) return StatusItemBuffetAmostra.NAO_SERVIDO;
  return null;
}

function formatTemperatureInput(value: number | null): string {
  return value !== null && value !== undefined ? String(value).replace(".", ",") : "";
}

function getTemperatureTypeDefault(registro: {
  temperaturaAmbiente: boolean;
  tcEquipamento: number | null;
  primeiraTc: number | null;
}): "" | "NUMERICA" | "AMBIENTE" {
  if (registro.temperaturaAmbiente) {
    return "AMBIENTE";
  }

  if (registro.tcEquipamento !== null || registro.primeiraTc !== null) {
    return "NUMERICA";
  }

  return "";
}

function groupServicesByDay(groups: BuffetServiceHistoryGroup[]) {
  const byDay = new Map<string, { dataInput: string; dataLabel: string; services: BuffetServiceHistoryGroup[] }>();
  for (const group of groups) {
    const current = byDay.get(group.dataInput) ?? {
      dataInput: group.dataInput,
      dataLabel: group.dataLabel,
      services: []
    };
    current.services.push(group);
    byDay.set(group.dataInput, current);
  }

  return Array.from(byDay.values()).sort((a, b) => b.dataInput.localeCompare(a.dataInput));
}

export default async function ControleBuffetAmostrasHistoricoPage({
  searchParams
}: PageProps) {
  const authUser = await getCurrentUser();
  const canSignDay = authUser ? canSignModuleDay(authUser, MODULE_CODE) : false;
  const canSignMonthly = authUser ? canSignModuleMonthlyClosure(authUser, MODULE_CODE) : false;
  const canEditHistory = authUser
    ? hasPermission(authUser, "modulo.amostras.editar_historico")
    : false;

  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";
  const filtroData = firstParam(params.filtroData).trim();
  const filtroMes = parseFilterMonth(firstParam(params.filtroMes).trim());
  const filtroAno = parseFilterYear(firstParam(params.filtroAno).trim());
  const filtroServicoId = parsePositiveInt(firstParam(params.filtroServicoId).trim());
  const filtroItemId = parsePositiveInt(firstParam(params.filtroItemId).trim());
  const filtroClassificacao = parseClassificacao(firstParam(params.filtroClassificacao).trim());
  const filtroStatus = parseStatus(firstParam(params.filtroStatus).trim());
  const filtroResponsavel = firstParam(params.filtroResponsavel).trim();
  const diaAberto = firstParam(params.dia).trim();
  const editRegistroId = parsePositiveInt(firstParam(params.editRegistroId).trim());

  const todayMonth = getAppMonthYear(getAppDate());
  const selectedMonth = filtroMes && filtroMes <= 12 ? filtroMes : todayMonth.mes;
  const selectedYear = filtroAno ?? todayMonth.ano;
  const selectedMonthRange = getAppMonthDateRange(selectedMonth, selectedYear);

  const [servicos, itens, acoesCorretivasAtivas] = await Promise.all([
    prisma.controleBuffetAmostraServico.findMany({
      include: {
        itens: {
          where: { item: { ativo: true } },
          select: { itemId: true }
        }
      },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }]
    }),
    prisma.controleBuffetAmostraItem.findMany({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }]
    }),
    prisma.controleBuffetAmostraAcaoCorretiva.findMany({
      where: { ativo: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }]
    })
  ]);

  const where: Prisma.ControleBuffetAmostraRegistroWhereInput = {};
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
    const bounds = await prisma.controleBuffetAmostraRegistro.aggregate({
      _min: { data: true },
      _max: { data: true }
    });
    where.OR = getMonthRangesForBounds(filtroMes, bounds._min.data, bounds._max.data)
      .map(({ start, end }) => ({ data: { gte: start, lte: end } }));
  }
  if (filtroServicoId) where.servicoId = filtroServicoId;
  if (filtroItemId) where.itemId = filtroItemId;
  if (filtroClassificacao) where.classificacao = filtroClassificacao;
  if (filtroStatus) where.status = filtroStatus;
  if (filtroResponsavel) where.responsavelNome = { contains: filtroResponsavel, mode: "insensitive" };

  const includeServico = {
    servico: {
      select: {
        nome: true,
        tipoServico: true,
        dataInicio: true,
        dataFim: true
      }
    }
  } satisfies Prisma.ControleBuffetAmostraRegistroInclude;

  const [registros, registrosMensais, fechamentoMensal] = await Promise.all([
    prisma.controleBuffetAmostraRegistro.findMany({
      where,
      include: includeServico,
      orderBy: [
        { data: "desc" },
        { servico: { ordem: "asc" } },
        { itemExtra: "asc" },
        { itemNome: "asc" }
      ]
    }),
    prisma.controleBuffetAmostraRegistro.findMany({
      where: { data: { gte: selectedMonthRange.start, lte: selectedMonthRange.end } },
      include: includeServico,
      orderBy: [
        { data: "desc" },
        { servico: { ordem: "asc" } },
        { itemExtra: "asc" },
        { itemNome: "asc" }
      ]
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

  const expectedItemCountsByServiceId = new Map(
    servicos.map((servico) => [servico.id, servico.itens.length])
  );
  const gruposHistorico = buildBuffetServiceHistoryGroups(registros, expectedItemCountsByServiceId);
  const gruposMensais = buildBuffetServiceHistoryGroups(registrosMensais, expectedItemCountsByServiceId);
  const diasHistorico = groupServicesByDay(gruposHistorico);
  const diasMensais = groupServicesByDay(gruposMensais);

  const datasHistorico = diasHistorico.map((dia) => parseDateInput(dia.dataInput)).filter((date): date is Date => Boolean(date));
  const datasMensais = diasMensais.map((dia) => parseDateInput(dia.dataInput)).filter((date): date is Date => Boolean(date));
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
  const registroParaEditar = canEditHistory && editRegistroId
    ? registros.find((registro) => registro.id === editRegistroId) ?? null
    : null;
  const periodoRegistroParaEditar = registroParaEditar
    ? getMonthYear(registroParaEditar.data)
    : null;
  const [fechamentoBuffetRegistroEditado, fechamentoModuloRegistroEditado] =
    periodoRegistroParaEditar
      ? await Promise.all([
          prisma.controleBuffetAmostraFechamento.findUnique({
            where: {
              mes_ano: {
                mes: periodoRegistroParaEditar.mes,
                ano: periodoRegistroParaEditar.ano
              }
            }
          }),
          prisma.fechamentoMensalModulo.findUnique({
            where: {
              moduloCodigo_ano_mes: {
                moduloCodigo: MODULE_CODE,
                ano: periodoRegistroParaEditar.ano,
                mes: periodoRegistroParaEditar.mes
              }
            }
          })
        ])
      : [null, null];
  const registroEditadoMesFechado =
    fechamentoBuffetRegistroEditado?.status === StatusFechamentoBuffetAmostra.ASSINADO ||
    Boolean(fechamentoModuloRegistroEditado);
  const acaoCorretivaAtual = registroParaEditar?.acaoCorretiva?.trim() ?? "";
  const acaoCorretivaAtualEstaAtiva = acoesCorretivasAtivas.some(
    (option) => option.nome === acaoCorretivaAtual
  );
  const acoesCorretivasDoRegistroEditado =
    acaoCorretivaAtual && !acaoCorretivaAtualEstaAtiva
      ? [{ id: 0, nome: acaoCorretivaAtual, ativo: false, ordem: 0 }, ...acoesCorretivasAtivas]
      : acoesCorretivasAtivas;

  const parametrosRetorno = new URLSearchParams();
  if (filtroData) parametrosRetorno.set("filtroData", filtroData);
  if (filtroMes) parametrosRetorno.set("filtroMes", String(filtroMes));
  if (filtroAno) parametrosRetorno.set("filtroAno", String(filtroAno));
  if (filtroServicoId) parametrosRetorno.set("filtroServicoId", String(filtroServicoId));
  if (filtroItemId) parametrosRetorno.set("filtroItemId", String(filtroItemId));
  if (filtroClassificacao) parametrosRetorno.set("filtroClassificacao", filtroClassificacao);
  if (filtroStatus) parametrosRetorno.set("filtroStatus", filtroStatus);
  if (filtroResponsavel) parametrosRetorno.set("filtroResponsavel", filtroResponsavel);
  const returnTo = buildPathWithParams(parametrosRetorno);
  const buildOpenDayHref = (dateInput: string): string => {
    const query = new URLSearchParams(parametrosRetorno);
    query.set("dia", dateInput);
    return buildPathWithParams(query);
  };
  const buildEditRecordHref = (dateInput: string, registroId: number): string => {
    const query = new URLSearchParams(parametrosRetorno);
    query.set("dia", dateInput);
    query.set("editRegistroId", String(registroId));
    return buildPathWithParams(query);
  };
  const diaSelecionado = diaAberto ? diasHistorico.find((dia) => dia.dataInput === diaAberto) : null;
  const editReturnTo = diaSelecionado ? buildOpenDayHref(diaSelecionado.dataInput) : returnTo;
  const editFormReturnTo = registroParaEditar
    ? buildEditRecordHref(formatAppDateInput(registroParaEditar.data), registroParaEditar.id)
    : returnTo;

  const totaisMensais = buildBuffetServiceHistoryTotals(gruposMensais);
  const diasComRegistro = new Set(diasMensais.map((dia) => dia.dataInput));
  const alertasTemperaturaMensais = gruposMensais.reduce(
    (total, group) => total + group.items.filter((item) => item.statusTemperatura && item.statusTemperatura !== "CONFORME").length,
    0
  );
  const indicadoresMensais = {
    "Mês/Ano": `${String(selectedMonth).padStart(2, "0")}/${selectedYear}`,
    "Serviços realizados": totaisMensais.totalServicos,
    "Itens servidos": totaisMensais.totalItensPreenchidos,
    "Itens não servidos": totaisMensais.totalItensNaoServidos,
    "Alertas de temperatura": alertasTemperaturaMensais,
    "Não conformidades": alertasTemperaturaMensais,
    "Ações corretivas": totaisMensais.totalAcoesCorretivas,
    "Dias completos": diasMensais.filter((dia) => dia.services.every((service) => service.status === "CONCLUIDO")).length,
    "Dias parciais": diasMensais.filter((dia) => dia.services.some((service) => service.status !== "CONCLUIDO")).length,
    "Dias assinados": assinaturasMensaisPorData.size,
    "Dias pendentes de assinatura": Math.max(diasComRegistro.size - assinaturasMensaisPorData.size, 0)
  };

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Histórico Completo - Controle de Buffet / Amostras
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Consulta diária dos serviços, itens, revisão do supervisor e fechamento mensal.
            </p>
          </div>
          <div className="btn-group">
            <Link href={MODULE_PATH} className="btn-secondary">
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
        <form method="get" className="grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-4 dark:bg-slate-800">
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
            Serviço
            <select name="filtroServicoId" defaultValue={filtroServicoId ? String(filtroServicoId) : ""} className={INPUT_CLASS}>
              <option value="">Todos</option>
              {servicos.map((servico) => (
                <option key={servico.id} value={String(servico.id)}>
                  {servico.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Item
            <select name="filtroItemId" defaultValue={filtroItemId ? String(filtroItemId) : ""} className={INPUT_CLASS}>
              <option value="">Todos</option>
              {itens.map((item) => (
                <option key={item.id} value={String(item.id)}>
                  {item.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Classificação
            <select name="filtroClassificacao" defaultValue={filtroClassificacao ?? ""} className={INPUT_CLASS}>
              <option value="">Todas</option>
              <option value={ClassificacaoItemBuffetAmostra.QUENTE}>Quentes</option>
              <option value={ClassificacaoItemBuffetAmostra.FRIO}>Frios</option>
              <option value={ClassificacaoItemBuffetAmostra.TEMPERATURA_AMBIENTE}>Temperatura Ambiente</option>
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Status do Item
            <select name="filtroStatus" defaultValue={filtroStatus ?? ""} className={INPUT_CLASS}>
              <option value="">Todos</option>
              <option value={StatusItemBuffetAmostra.PENDENTE}>Pendente</option>
              <option value={StatusItemBuffetAmostra.PREENCHIDO}>Preenchido</option>
              <option value={StatusItemBuffetAmostra.ASSINADO}>Assinado</option>
              <option value={StatusItemBuffetAmostra.NAO_SERVIDO}>Não servido</option>
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Responsável
            <input type="text" name="filtroResponsavel" defaultValue={filtroResponsavel} className={INPUT_CLASS} />
          </label>

          <div className="btn-group md:col-span-4">
            <button type="submit" className="btn-primary">Aplicar Filtros</button>
            <Link href={HISTORY_PATH} className="btn-secondary">Limpar</Link>
          </div>
        </form>
      </section>

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Dias no Histórico ({diasHistorico.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Serviços</th>
                <th className="px-3 py-2">Itens</th>
                <th className="px-3 py-2">Status operacional</th>
                <th className="px-3 py-2">Alertas</th>
                <th className="px-3 py-2">Assinatura</th>
                <th className="px-3 py-2">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {diasHistorico.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-500 dark:text-slate-400" colSpan={7}>
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                diasHistorico.map((dia) => {
                  const totalItens = dia.services.reduce((total, service) => total + service.totalItens, 0);
                  const alertas = dia.services.reduce(
                    (total, service) => total + service.items.filter((item) => item.statusTemperatura && item.statusTemperatura !== "CONFORME").length,
                    0
                  );
                  const completo = dia.services.every((service) => service.status === "CONCLUIDO");

                  return (
                    <tr key={dia.dataInput}>
                      <td className="px-3 py-2">{dia.dataLabel}</td>
                      <td className="px-3 py-2">{dia.services.length}</td>
                      <td className="px-3 py-2">{totalItens}</td>
                      <td className="px-3 py-2">{completo ? "Completo" : "Parcial"}</td>
                      <td className="px-3 py-2">{alertas}</td>
                      <td className="px-3 py-2">
                        <SupervisorSignatureStatus signature={assinaturasPorData.get(dia.dataInput) ?? null} />
                      </td>
                      <td className="px-3 py-2">
                        <Link href={buildOpenDayHref(dia.dataInput)} scroll={false} className="btn-action">
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

      {diaSelecionado ? (
        <ActionModal
          title={`Serviços de ${formatAppDate(parseDateInput(diaSelecionado.dataInput) ?? new Date())}`}
          cancelHref={returnTo}
          maxWidthClassName="max-w-6xl"
          description={<p>Esta assinatura valida a revisão de todos os serviços deste dia.</p>}
        >
          <div className="mb-4">
            <SupervisorSignatureStatus signature={assinaturasPorData.get(diaSelecionado.dataInput) ?? null} />
          </div>
          <div className="space-y-4">
            {diaSelecionado.services.map((service) => (
              <section key={service.key} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">{service.servicoNome}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {service.tipoServicoLabel} - responsável: {service.responsavelExecucao}
                    </p>
                  </div>
                  <ServiceStatusBadge status={service.status} />
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-[1180px] divide-y divide-slate-200 text-sm dark:divide-slate-700">
                    <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      <tr>
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2">Classificação</th>
                        <th className="px-3 py-2">TC Equip.</th>
                        <th className="px-3 py-2">Temp. inicial</th>
                        <th className="px-3 py-2">Temp. final</th>
                        <th className="px-3 py-2">Status temp.</th>
                        <th className="px-3 py-2">Status item</th>
                        <th className="px-3 py-2">Ação corretiva</th>
                        <th className="px-3 py-2">Observação</th>
                        {canEditHistory ? <th className="px-3 py-2">Ação</th> : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {service.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2">{item.nome}</td>
                          <td className="px-3 py-2">{item.classificacaoLabel}</td>
                          <td className="px-3 py-2">{item.tcEquipamentoLabel}</td>
                          <td className="px-3 py-2">{item.temperaturaInicialLabel}</td>
                          <td className="px-3 py-2">{item.temperaturaFinalLabel ?? "-"}</td>
                          <td className="px-3 py-2"><TemperatureStatusBadge status={item.statusTemperatura} /></td>
                          <td className="px-3 py-2"><ItemStatusBadge status={item.status} /></td>
                          <td className="px-3 py-2">{item.acaoCorretiva}</td>
                          <td className="px-3 py-2 max-w-80 whitespace-normal break-words">{item.observacao}</td>
                          {canEditHistory ? (
                            <td className="px-3 py-2">
                              <Link
                                href={buildEditRecordHref(diaSelecionado.dataInput, item.id)}
                                scroll={false}
                                className="btn-action"
                              >
                                Editar
                              </Link>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
          <SignDayForm
            moduleCode={MODULE_CODE}
            dateInput={diaSelecionado.dataInput}
            returnTo={buildOpenDayHref(diaSelecionado.dataInput)}
            canSign={canSignDay}
            alreadySigned={Boolean(assinaturasPorData.get(diaSelecionado.dataInput))}
            hasOperationalWarnings={diaSelecionado.services.some((service) => service.status !== "CONCLUIDO")}
          />
        </ActionModal>
      ) : null}

      {registroParaEditar ? (
        <ActionModal
          title="Editar registro histórico"
          cancelHref={editReturnTo}
          maxWidthClassName="max-w-3xl"
          description={
            <p>
              {registroParaEditar.itemNome} - {formatAppDate(registroParaEditar.data)}
            </p>
          }
        >
          {registroEditadoMesFechado ? (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
              Este registro pertence a um mês fechado. A edição será permitida pela permissão
              sensível e registrada em auditoria.
            </div>
          ) : null}

          <div className="mb-4 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 sm:grid-cols-2">
            <p>
              Serviço: <strong>{registroParaEditar.servico.nome}</strong>
            </p>
            <p>
              Classificação: <strong>{getClassificacaoLabel(registroParaEditar.classificacao)}</strong>
            </p>
            <p>
              Assinatura do item: <strong>{registroParaEditar.assinaturaNome ?? "-"}</strong>
            </p>
            <p>
              Assinatura do supervisor:{" "}
              <strong>{registroParaEditar.assinaturaNutricionistaNome ?? "-"}</strong>
            </p>
          </div>

          <form action={updateHistoricoRegistroAction} className="space-y-4">
            <input type="hidden" name="registroId" value={String(registroParaEditar.id)} />
            <input type="hidden" name="returnTo" value={editFormReturnTo} />

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-slate-700 dark:text-slate-200">
                Status do item
                <select
                  name="naoServido"
                  defaultValue={
                    registroParaEditar.status === StatusItemBuffetAmostra.NAO_SERVIDO
                      ? "true"
                      : "false"
                  }
                  className={INPUT_CLASS}
                >
                  <option value="false">Servido</option>
                  <option value="true">Não servido</option>
                </select>
              </label>

              <label className="text-sm text-slate-700 dark:text-slate-200">
                Temperatura do item
                <select
                  name="temperaturaTipo"
                  defaultValue={getTemperatureTypeDefault(registroParaEditar)}
                  className={INPUT_CLASS}
                >
                  <option value="">Selecione</option>
                  <option value="NUMERICA">Numérica</option>
                  <option value="AMBIENTE">Ambiente</option>
                </select>
              </label>

              <label className="text-sm text-slate-700 dark:text-slate-200">
                TC Equipamento
                <input
                  type="text"
                  name="tcEquipamento"
                  inputMode="text"
                  placeholder={
                    registroParaEditar.usaGarrafaTermica
                      ? THERMAL_BOTTLE_EQUIPMENT_LABEL
                      : "Ex.: -18 ou 62,5"
                  }
                  defaultValue={
                    registroParaEditar.usaGarrafaTermica
                      ? THERMAL_BOTTLE_EQUIPMENT_LABEL
                      : formatTemperatureInput(registroParaEditar.tcEquipamento)
                  }
                  className={INPUT_CLASS}
                  disabled={registroParaEditar.usaGarrafaTermica}
                />
              </label>

              <label className="text-sm text-slate-700 dark:text-slate-200">
                TC do Alimento
                <input
                  type="text"
                  name="primeiraTc"
                  inputMode="text"
                  placeholder="Ex.: -12,5"
                  defaultValue={formatTemperatureInput(registroParaEditar.primeiraTc)}
                  className={INPUT_CLASS}
                />
              </label>

              <label className="text-sm text-slate-700 dark:text-slate-200">
                Ação corretiva
                <select
                  name="acaoCorretiva"
                  defaultValue={acaoCorretivaAtual}
                  className={INPUT_CLASS}
                >
                  <option value="">Selecione</option>
                  {acoesCorretivasDoRegistroEditado.map((option) => (
                    <option key={`${option.id}:${option.nome}`} value={option.nome}>
                      {option.nome}
                      {option.id === 0 ? " (Inativa)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
                Observação
                <textarea
                  name="observacao"
                  rows={3}
                  defaultValue={registroParaEditar.observacao ?? ""}
                  className={INPUT_CLASS}
                />
              </label>
            </div>

            <ModalActions>
              <Link href={editReturnTo} scroll={false} className="btn-secondary">
                Cancelar
              </Link>
              <button type="submit" className="btn-primary">
                Salvar alterações
              </button>
            </ModalActions>
          </form>
        </ActionModal>
      ) : null}
    </div>
  );
}
