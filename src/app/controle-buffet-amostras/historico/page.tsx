import {
  ClassificacaoItemBuffetAmostra,
  Prisma,
  StatusItemBuffetAmostra
} from "@prisma/client";
import Link from "next/link";

import { getCurrentUser } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { getRoleLabel } from "@/lib/rbac";

import { ItemStatusBadge, TemperatureStatusBadge } from "../status-badges";
import {
  formatDateDisplay,
  formatDateTimeDisplay,
  getClassificacaoLabel,
  getMonthDateRange,
  getYearDateRange,
  parseDateInput,
  parsePositiveInt
} from "../utils";
import { ThemeToggleButton } from "@/app/higienizacao-hortifruti/theme-toggle-button";

const MODULE_PATH = "/controle-buffet-amostras";
const HISTORY_PATH = "/controle-buffet-amostras/historico";
const CARD_CLASS =
  "rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900";
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

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

function parseClassificacao(
  value: string
): ClassificacaoItemBuffetAmostra | null {
  if (value === ClassificacaoItemBuffetAmostra.QUENTE) {
    return ClassificacaoItemBuffetAmostra.QUENTE;
  }
  if (value === ClassificacaoItemBuffetAmostra.FRIO) {
    return ClassificacaoItemBuffetAmostra.FRIO;
  }
  if (value === ClassificacaoItemBuffetAmostra.FRIO_CRU) {
    return ClassificacaoItemBuffetAmostra.FRIO_CRU;
  }
  return null;
}

function parseStatus(value: string): StatusItemBuffetAmostra | null {
  if (value === StatusItemBuffetAmostra.PENDENTE) {
    return StatusItemBuffetAmostra.PENDENTE;
  }
  if (value === StatusItemBuffetAmostra.PREENCHIDO) {
    return StatusItemBuffetAmostra.PREENCHIDO;
  }
  if (value === StatusItemBuffetAmostra.ASSINADO) {
    return StatusItemBuffetAmostra.ASSINADO;
  }
  return null;
}

export default async function ControleBuffetAmostrasHistoricoPage({
  searchParams
}: PageProps) {
  const authUser = await getCurrentUser();
  const usuarioLogado = authUser?.nomeCompleto ?? "Usuário logado";
  const perfilLogado = authUser ? getRoleLabel(authUser.perfil) : "";

  const params = await searchParams;
  const filtroData = firstParam(params.filtroData).trim();
  const filtroMes = parsePositiveInt(firstParam(params.filtroMes).trim());
  const filtroAno = parsePositiveInt(firstParam(params.filtroAno).trim());
  const filtroServicoId = parsePositiveInt(firstParam(params.filtroServicoId).trim());
  const filtroItemId = parsePositiveInt(firstParam(params.filtroItemId).trim());
  const filtroClassificacao = parseClassificacao(firstParam(params.filtroClassificacao).trim());
  const filtroStatus = parseStatus(firstParam(params.filtroStatus).trim());
  const filtroResponsavel = firstParam(params.filtroResponsavel).trim();

  const [servicos, itens] = await Promise.all([
    prisma.controleBuffetAmostraServico.findMany({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }]
    }),
    prisma.controleBuffetAmostraItem.findMany({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }]
    })
  ]);

  const where: Prisma.ControleBuffetAmostraRegistroWhereInput = {};
  const dataFiltro = parseDateInput(filtroData);

  if (dataFiltro) {
    where.data = dataFiltro;
  } else if (filtroMes && filtroAno && filtroMes <= 12) {
    const range = getMonthDateRange(filtroMes, filtroAno);
    where.data = {
      gte: range.start,
      lte: range.end
    };
  } else if (filtroAno) {
    const range = getYearDateRange(filtroAno);
    where.data = {
      gte: range.start,
      lte: range.end
    };
  }

  if (filtroServicoId) {
    where.servicoId = filtroServicoId;
  }

  if (filtroItemId) {
    where.itemId = filtroItemId;
  }

  if (filtroClassificacao) {
    where.classificacao = filtroClassificacao;
  }

  if (filtroStatus) {
    where.status = filtroStatus;
  }

  if (filtroResponsavel) {
    where.responsavelNome = { contains: filtroResponsavel, mode: "insensitive" };
  }

  const registros = await prisma.controleBuffetAmostraRegistro.findMany({
    where,
    include: {
      servico: { select: { nome: true } },
      item: { select: { nome: true } }
    },
    orderBy: [{ data: "desc" }, { createdAt: "desc" }]
  });

  const limparHref = HISTORY_PATH;

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Histórico Completo - Controle de Buffet / Amostras
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Consulta detalhada dos registros preenchidos e assinados por serviço e item.
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Usuário logado: {usuarioLogado} ({perfilLogado})
            </p>
          </div>
          <div className="btn-group">
            <Link href={MODULE_PATH} className="btn-secondary">
              Voltar para Módulo
            </Link>
            <ThemeToggleButton />
          </div>
        </div>
      </section>

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Filtros
        </h2>

        <form method="get" className="grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-4 dark:bg-slate-800">
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Data
            <input type="date" name="filtroData" defaultValue={filtroData} className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Mês
            <select
              name="filtroMes"
              defaultValue={filtroMes ? String(filtroMes) : ""}
              className={INPUT_CLASS}
            >
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
            <input
              type="number"
              name="filtroAno"
              min={2020}
              max={2100}
              defaultValue={filtroAno ?? ""}
              className={INPUT_CLASS}
            />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Serviço
            <select
              name="filtroServicoId"
              defaultValue={filtroServicoId ? String(filtroServicoId) : ""}
              className={INPUT_CLASS}
            >
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
            <select
              name="filtroItemId"
              defaultValue={filtroItemId ? String(filtroItemId) : ""}
              className={INPUT_CLASS}
            >
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
            <select
              name="filtroClassificacao"
              defaultValue={filtroClassificacao ?? ""}
              className={INPUT_CLASS}
            >
              <option value="">Todas</option>
              <option value={ClassificacaoItemBuffetAmostra.QUENTE}>Quente</option>
              <option value={ClassificacaoItemBuffetAmostra.FRIO}>Frio</option>
              <option value={ClassificacaoItemBuffetAmostra.FRIO_CRU}>Frio Cru</option>
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Status do Item
            <select name="filtroStatus" defaultValue={filtroStatus ?? ""} className={INPUT_CLASS}>
              <option value="">Todos</option>
              <option value={StatusItemBuffetAmostra.PENDENTE}>Pendente</option>
              <option value={StatusItemBuffetAmostra.PREENCHIDO}>Preenchido</option>
              <option value={StatusItemBuffetAmostra.ASSINADO}>Assinado</option>
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Responsável
            <input
              type="text"
              name="filtroResponsavel"
              defaultValue={filtroResponsavel}
              className={INPUT_CLASS}
            />
          </label>

          <div className="btn-group md:col-span-4">
            <button type="submit" className="btn-primary">
              Aplicar Filtros
            </button>
            <Link href={limparHref} className="btn-secondary">
              Limpar
            </Link>
          </div>
        </form>
      </section>

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Registros
        </h2>

        <div className="overflow-x-auto">
          <table className="min-w-[1300px] divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Serviço</th>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Classificação</th>
                <th className="px-3 py-2">TC Equip.</th>
                <th className="px-3 py-2">1ª TC</th>
                <th className="px-3 py-2">2ª TC</th>
                <th className="px-3 py-2">Status Temperatura</th>
                <th className="px-3 py-2">Ação Corretiva</th>
                <th className="px-3 py-2">Status do Item</th>
                <th className="px-3 py-2">Responsável</th>
                <th className="px-3 py-2">Assinatura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {registros.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-3 py-3 text-slate-500 dark:text-slate-400">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                registros.map((registro) => (
                  <tr key={registro.id}>
                    <td className="px-3 py-2">{formatDateDisplay(registro.data)}</td>
                    <td className="px-3 py-2">{registro.servico.nome}</td>
                    <td className="px-3 py-2">{registro.itemNome || registro.item.nome}</td>
                    <td className="px-3 py-2">{getClassificacaoLabel(registro.classificacao)}</td>
                    <td className="px-3 py-2">
                      {registro.tcEquipamento !== null ? `${registro.tcEquipamento}°C` : "-"}
                    </td>
                    <td className="px-3 py-2">
                      {registro.primeiraTc !== null ? `${registro.primeiraTc}°C` : "-"}
                    </td>
                    <td className="px-3 py-2">
                      {registro.segundaTc !== null ? `${registro.segundaTc}°C` : "-"}
                    </td>
                    <td className="px-3 py-2">
                      <TemperatureStatusBadge status={registro.statusTemperatura} />
                    </td>
                    <td className="px-3 py-2 max-w-64 whitespace-normal break-words">
                      {registro.acaoCorretiva ?? "-"}
                    </td>
                    <td className="px-3 py-2">
                      <ItemStatusBadge status={registro.status} />
                    </td>
                    <td className="px-3 py-2">
                      {registro.responsavelNome}
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatDateTimeDisplay(registro.dataHoraRegistro)}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      {registro.assinaturaNome ? (
                        <>
                          <p>{registro.assinaturaNome}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {registro.assinaturaDataHora
                              ? formatDateTimeDisplay(registro.assinaturaDataHora)
                              : "-"}
                          </p>
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
