import {
  Prisma,
  StatusFechamentoHortifruti,
  TipoOpcaoHigienizacao
} from "@prisma/client";
import Link from "next/link";

import { getCurrentUser } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

import {
  closeMonthAction,
  createRegistroAction,
  deleteRegistroAction,
  reopenMonthAction,
  updateRegistroAction
} from "./actions";
import { ReopenMonthModal } from "./reopen-month-modal";
import { SearchableOptionField } from "./searchable-option-field";
import { ThemeToggleButton } from "./theme-toggle-button";
import {
  formatDateDisplay,
  formatDateTimeDisplay,
  getCurrentSystemDateTime,
  getMonthDateRange,
  getMonthYear,
  getYearDateRange,
  parseDateInput,
  parsePositiveInt,
  periodKey
} from "./utils";

const MODULE_PATH = "/higienizacao-hortifruti";
const CARD_CLASS =
  "rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900";
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

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
  const queryString = params.toString();
  return queryString ? `${MODULE_PATH}?${queryString}` : MODULE_PATH;
}

export default async function HigienizacaoHortifrutiPage({
  searchParams
}: PageProps) {
  const authUser = await getCurrentUser();
  const responsavelLogado = authUser?.nomeCompleto ?? "Usuário logado";

  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";

  const filtroData = firstParam(params.filtroData).trim();
  const filtroMes = parsePositiveInt(firstParam(params.filtroMes));
  const filtroAno = parsePositiveInt(firstParam(params.filtroAno));
  const filtroHortifruti = firstParam(params.filtroHortifruti).trim();
  const filtroResponsavel = firstParam(params.filtroResponsavel).trim();

  const where: Prisma.HigienizacaoHortifrutiWhereInput = {};
  const dataFiltro = parseDateInput(filtroData);

  if (dataFiltro) {
    where.data = dataFiltro;
  } else if (filtroMes && filtroAno && filtroMes <= 12) {
    const { start, end } = getMonthDateRange(filtroMes, filtroAno);
    where.data = { gte: start, lte: end };
  } else if (filtroAno) {
    const { start, end } = getYearDateRange(filtroAno);
    where.data = { gte: start, lte: end };
  }

  if (filtroHortifruti) {
    where.hortifruti = { contains: filtroHortifruti, mode: "insensitive" };
  }

  if (filtroResponsavel) {
    where.responsavel = { contains: filtroResponsavel, mode: "insensitive" };
  }

  const [registros, options] = await Promise.all([
    prisma.higienizacaoHortifruti.findMany({
      where,
      orderBy: [{ data: "desc" }, { inicioProcesso: "asc" }]
    }),
    prisma.higienizacaoHortifrutiOpcao.findMany({
      orderBy: [{ tipo: "asc" }, { nome: "asc" }]
    })
  ]);

  const hortifrutiOptions = options
    .filter((option) => option.tipo === TipoOpcaoHigienizacao.HORTIFRUTI)
    .map((option) => option.nome);
  const produtoUtilizadoOptions = options
    .filter((option) => option.tipo === TipoOpcaoHigienizacao.PRODUTO_UTILIZADO)
    .map((option) => option.nome);
  const catalogoDisponivel =
    hortifrutiOptions.length > 0 && produtoUtilizadoOptions.length > 0;

  const editId = parsePositiveInt(firstParam(params.editId));
  const novoRegistroSelecionado = firstParam(params.new) === "1";
  const registroEmEdicao = editId
    ? await prisma.higienizacaoHortifruti.findUnique({ where: { id: editId } })
    : null;

  const now = getCurrentSystemDateTime();
  const fechamentoMesRaw = parsePositiveInt(firstParam(params.fechamentoMes));
  const fechamentoAnoRaw = parsePositiveInt(firstParam(params.fechamentoAno));
  const fechamentoMes =
    fechamentoMesRaw && fechamentoMesRaw >= 1 && fechamentoMesRaw <= 12
      ? fechamentoMesRaw
      : now.getMonth() + 1;
  const fechamentoAno = fechamentoAnoRaw ?? now.getFullYear();

  const periodos = new Map<string, { mes: number; ano: number }>();
  for (const registro of registros) {
    const periodo = getMonthYear(registro.data);
    periodos.set(periodKey(periodo.mes, periodo.ano), periodo);
  }
  if (registroEmEdicao) {
    const periodo = getMonthYear(registroEmEdicao.data);
    periodos.set(periodKey(periodo.mes, periodo.ano), periodo);
  }
  periodos.set(periodKey(fechamentoMes, fechamentoAno), {
    mes: fechamentoMes,
    ano: fechamentoAno
  });

  const periodosAssinados = periodos.size
    ? await prisma.higienizacaoHortifrutiFechamento.findMany({
        where: {
          status: StatusFechamentoHortifruti.ASSINADO,
          OR: Array.from(periodos.values()).map((periodo) => ({
            mes: periodo.mes,
            ano: periodo.ano
          }))
        }
      })
    : [];

  const assinadosSet = new Set(
    periodosAssinados.map((item) => periodKey(item.mes, item.ano))
  );
  const periodoEdicao = registroEmEdicao ? getMonthYear(registroEmEdicao.data) : null;
  const registroEmEdicaoBloqueado = periodoEdicao
    ? assinadosSet.has(periodKey(periodoEdicao.mes, periodoEdicao.ano))
    : false;

  const parametrosRetorno = new URLSearchParams();
  if (filtroData) parametrosRetorno.set("filtroData", filtroData);
  if (filtroMes) parametrosRetorno.set("filtroMes", String(filtroMes));
  if (filtroAno) parametrosRetorno.set("filtroAno", String(filtroAno));
  if (filtroHortifruti) parametrosRetorno.set("filtroHortifruti", filtroHortifruti);
  if (filtroResponsavel) parametrosRetorno.set("filtroResponsavel", filtroResponsavel);
  parametrosRetorno.set("fechamentoMes", String(fechamentoMes));
  parametrosRetorno.set("fechamentoAno", String(fechamentoAno));

  const returnTo = buildPathWithParams(parametrosRetorno);
  const hrefNovoRegistro = (() => {
    const query = new URLSearchParams(parametrosRetorno);
    query.set("new", "1");
    return buildPathWithParams(query);
  })();
  const hrefCancelarFormulario = buildPathWithParams(parametrosRetorno);
  const mostrarFormulario = novoRegistroSelecionado || Boolean(registroEmEdicao);

  const rangeFechamento = getMonthDateRange(fechamentoMes, fechamentoAno);
  const registrosFechamento = await prisma.higienizacaoHortifruti.findMany({
    where: { data: { gte: rangeFechamento.start, lte: rangeFechamento.end } },
    orderBy: [{ data: "asc" }, { inicioProcesso: "asc" }]
  });
  const fechamentoAtual = await prisma.higienizacaoHortifrutiFechamento.findUnique({
    where: { mes_ano: { mes: fechamentoMes, ano: fechamentoAno } }
  });
  const fechamentoAssinado = fechamentoAtual?.status === StatusFechamentoHortifruti.ASSINADO;
  const reaberturaFormId = `reabertura-form-${fechamentoMes}-${fechamentoAno}`;

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Higienização de Hortifruti
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Registro diário de higienização
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/higienizacao-hortifruti/opcoes" className="btn-secondary">
              Gerenciar Opções
            </Link>
            <ThemeToggleButton />
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
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {registroEmEdicao ? "Editar Registro" : "Cadastro de Registro"}
          </h2>
          {mostrarFormulario ? (
            <Link href={hrefCancelarFormulario} className="btn-secondary">
              Cancelar
            </Link>
          ) : null}
        </div>

        {!mostrarFormulario ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Clique em <strong>Novo Registro</strong> ou <strong>Editar</strong> para abrir o formulário.
          </p>
        ) : !catalogoDisponivel ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            Nenhuma opção de hortifruti ou produto foi cadastrada ainda. Use
            {" "}
            <strong>Gerenciar Opções</strong>
            {" "}
            para iniciar o módulo.
          </p>
        ) : registroEmEdicao && registroEmEdicaoBloqueado ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            Este registro pertence a um mês fechado e não pode ser alterado.
          </p>
        ) : (
          <form action={registroEmEdicao ? updateRegistroAction : createRegistroAction} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="returnTo" value={returnTo} />
            {registroEmEdicao ? <input type="hidden" name="id" value={registroEmEdicao.id} /> : null}

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 md:col-span-2 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Data do Procedimento</p>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {registroEmEdicao ? formatDateDisplay(registroEmEdicao.data) : formatDateTimeDisplay(now)} (Automática)
              </p>
            </div>

            <label className="text-sm text-slate-700 dark:text-slate-200">
              Hortifruti *
              <SearchableOptionField name="hortifruti" options={hortifrutiOptions} defaultValue={registroEmEdicao?.hortifruti ?? ""} placeholder="Digite para buscar..." />
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-200">
              Produto Utilizado *
              <SearchableOptionField name="produtoUtilizado" options={produtoUtilizadoOptions} defaultValue={registroEmEdicao?.produtoUtilizado ?? ""} placeholder="Digite para buscar..." />
            </label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Responsável
              </p>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {responsavelLogado}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Preenchido automaticamente pelo usuário logado.
              </p>
            </div>
            <label className="text-sm text-slate-700 dark:text-slate-200">
              Início do Processo *
              <input type="time" name="inicioProcesso" required defaultValue={registroEmEdicao?.inicioProcesso ?? ""} className={INPUT_CLASS} />
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-200">
              Término do Processo *
              <input type="time" name="terminoProcesso" required defaultValue={registroEmEdicao?.terminoProcesso ?? ""} className={INPUT_CLASS} />
            </label>
            <label className="text-sm text-slate-700 md:col-span-2 dark:text-slate-200">
              Observações (Opcional)
              <textarea name="observacoes" rows={3} defaultValue={registroEmEdicao?.observacoes ?? ""} className={INPUT_CLASS} />
            </label>
            <div className="md:col-span-2">
              <button type="submit" className="btn-primary">
                {registroEmEdicao ? "Salvar Alterações" : "Salvar Registro"}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className={CARD_CLASS}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Registros</h2>
          {catalogoDisponivel ? (
            <Link href={hrefNovoRegistro} className="btn-primary">Novo Registro</Link>
          ) : null}
        </div>
        <form method="get" className="grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-5 dark:bg-slate-800">
          <input type="hidden" name="fechamentoMes" value={String(fechamentoMes)} />
          <input type="hidden" name="fechamentoAno" value={String(fechamentoAno)} />
          <label className="text-sm text-slate-700 dark:text-slate-200">Data<input type="date" name="filtroData" defaultValue={filtroData} className={INPUT_CLASS} /></label>
          <label className="text-sm text-slate-700 dark:text-slate-200">Mês<select name="filtroMes" defaultValue={filtroMes ? String(filtroMes) : ""} className={INPUT_CLASS}><option value="">Todos</option>{MONTH_OPTIONS.map((month) => <option key={month.value} value={String(month.value)}>{month.label}</option>)}</select></label>
          <label className="text-sm text-slate-700 dark:text-slate-200">Ano<input type="number" name="filtroAno" min={2020} max={2100} defaultValue={filtroAno ?? ""} className={INPUT_CLASS} /></label>
          <label className="text-sm text-slate-700 dark:text-slate-200">Hortifruti<input type="text" name="filtroHortifruti" defaultValue={filtroHortifruti} className={INPUT_CLASS} /></label>
          <label className="text-sm text-slate-700 dark:text-slate-200">Responsável<input type="text" name="filtroResponsavel" defaultValue={filtroResponsavel} className={INPUT_CLASS} /></label>
          <div className="btn-group md:col-span-5">
            <button type="submit" className="btn-primary">Aplicar Filtros</button>
            <Link href={buildPathWithParams(new URLSearchParams({ fechamentoMes: String(fechamentoMes), fechamentoAno: String(fechamentoAno) }))} className="btn-secondary">Limpar</Link>
          </div>
        </form>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Hortifruti</th>
                <th className="px-3 py-2">Produto Utilizado</th>
                <th className="px-3 py-2">Início</th>
                <th className="px-3 py-2">Término</th>
                <th className="px-3 py-2">Duração</th>
                <th className="px-3 py-2">Responsável</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {registros.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-500 dark:text-slate-400" colSpan={8}>
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                registros.map((registro) => {
                  const periodo = getMonthYear(registro.data);
                  const bloqueado = assinadosSet.has(periodKey(periodo.mes, periodo.ano));
                  const hrefEditar = (() => {
                    const query = new URLSearchParams(parametrosRetorno);
                    query.set("editId", String(registro.id));
                    return buildPathWithParams(query);
                  })();

                  return (
                    <tr key={registro.id}>
                      <td className="px-3 py-2">{formatDateDisplay(registro.data)}</td>
                      <td className="px-3 py-2">{registro.hortifruti}</td>
                      <td className="px-3 py-2">{registro.produtoUtilizado}</td>
                      <td className="px-3 py-2">{registro.inicioProcesso}</td>
                      <td className="px-3 py-2">{registro.terminoProcesso}</td>
                      <td className="px-3 py-2">{registro.duracaoMinutos} min</td>
                      <td className="px-3 py-2">{registro.responsavel}</td>
                      <td className="px-3 py-2">
                        <div className="btn-group">
                          <Link href={hrefEditar} className="btn-action">
                            Editar
                          </Link>
                          <form action={deleteRegistroAction} className="m-0">
                            <input type="hidden" name="id" value={registro.id} />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <button
                              type="submit"
                              disabled={bloqueado}
                              className="btn-danger"
                            >
                              Excluir
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Fechamento Mensal</h2>
        <form method="get" className="grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-4 dark:bg-slate-800">
          <input type="hidden" name="filtroData" value={filtroData} />
          <input type="hidden" name="filtroMes" value={filtroMes ? String(filtroMes) : ""} />
          <input type="hidden" name="filtroAno" value={filtroAno ? String(filtroAno) : ""} />
          <input type="hidden" name="filtroHortifruti" value={filtroHortifruti} />
          <input type="hidden" name="filtroResponsavel" value={filtroResponsavel} />
          <label className="text-sm text-slate-700 dark:text-slate-200">Mês<select name="fechamentoMes" defaultValue={String(fechamentoMes)} className={INPUT_CLASS}>{MONTH_OPTIONS.map((month) => <option key={month.value} value={String(month.value)}>{month.label}</option>)}</select></label>
          <label className="text-sm text-slate-700 dark:text-slate-200">Ano<input type="number" name="fechamentoAno" min={2020} max={2100} defaultValue={fechamentoAno} className={INPUT_CLASS} /></label>
          <div className="md:col-span-2 md:flex md:items-end"><button type="submit" className="btn-secondary">Carregar Período</button></div>
        </form>

        <div className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <p className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-200">
            Período: {String(fechamentoMes).padStart(2, "0")}/{fechamentoAno} - {fechamentoAssinado ? "Assinado" : "Aberto"}
          </p>

          <div className="mb-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Hortifruti</th>
                  <th className="px-3 py-2">Responsável</th>
                  <th className="px-3 py-2">Duração</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {registrosFechamento.length === 0 ? (
                  <tr>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400" colSpan={4}>
                      Nenhum registro no período selecionado.
                    </td>
                  </tr>
                ) : (
                  registrosFechamento.map((registro) => (
                    <tr key={registro.id}>
                      <td className="px-3 py-2">{formatDateDisplay(registro.data)}</td>
                      <td className="px-3 py-2">{registro.hortifruti}</td>
                      <td className="px-3 py-2">{registro.responsavel}</td>
                      <td className="px-3 py-2">{registro.duracaoMinutos} min</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {fechamentoAssinado ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
              <p>Mês assinado por <strong>{fechamentoAtual?.responsavelTecnico}</strong>.</p>
              <p>Data da assinatura: <strong>{fechamentoAtual ? formatDateTimeDisplay(fechamentoAtual.dataAssinatura) : "-"}</strong></p>
              <form id={reaberturaFormId} action={reopenMonthAction} className="mt-4">
                <input type="hidden" name="mes" value={String(fechamentoMes)} />
                <input type="hidden" name="ano" value={String(fechamentoAno)} />
                <input type="hidden" name="returnTo" value={returnTo} />
              </form>
              <ReopenMonthModal mes={fechamentoMes} ano={fechamentoAno} formId={reaberturaFormId} />
            </div>
          ) : (
            <form action={closeMonthAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="mes" value={String(fechamentoMes)} />
              <input type="hidden" name="ano" value={String(fechamentoAno)} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <label className="text-sm text-slate-700 dark:text-slate-200">
                Confirme sua Senha *
                <input type="password" name="senhaConfirmacao" required className={INPUT_CLASS} />
              </label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Data da assinatura</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{formatDateTimeDisplay(now)}</p>
              </div>
              <div className="md:col-span-2"><button type="submit" className="btn-primary">Fechar Mês</button></div>
            </form>
          )}
        </div>
      </section>

    </div>
  );
}
