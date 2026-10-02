import { isOperationalMonthClosed } from "@/lib/monthly-reopening";
import {
  ClassificacaoItemBuffetAmostra,
  StatusItemBuffetAmostra
} from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SignatureContextCard } from "@/components/auth/signature-context-card";
import { getCurrentUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { canViewManagementSections, getRoleLabel } from "@/lib/rbac";

import { signServicoItensAction } from "../../actions";
import {
  avaliarTemperaturaBuffet,
  formatDateDisplay,
  formatDateInput,
  formatDateTimeDisplay,
  getCurrentSystemDateTime,
  getServicoPeriodoLabel,
  getTipoServicoLabel,
  isServicoDisponivelNaData,
  getMonthYear,
  parseDateInput,
  parsePositiveInt
} from "../../utils";
import { ServiceItemsForm, type ServiceItemFormRow } from "./service-items-form";

const MODULE_PATH = "/controle-buffet-amostras";
const CARD_CLASS =
  "bpma-card";
const INPUT_CLASS =
  "bpma-input";

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
};

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function buildReturnToPath(servicoId: number, dataInput: string): string {
  const params = new URLSearchParams();
  if (dataInput) {
    params.set("data", dataInput);
  }

  const query = params.toString();
  return query
    ? `${MODULE_PATH}/servico/${servicoId}?${query}`
    : `${MODULE_PATH}/servico/${servicoId}`;
}

function getGuidelineByClassificacao(
  classificacao: ClassificacaoItemBuffetAmostra
): string {
  if (classificacao === "QUENTE") {
    return "Regra: acima de 60°C (até 6h) | abaixo de 60°C (até 1h).";
  }

  if (classificacao === "FRIO") {
    return "Regra: até 10°C (até 4h) | entre 10°C e 21°C (até 2h).";
  }

  return "Regra: temperatura ambiente registrada para rastreabilidade, sem regra automática de frio ou quente.";
}

export default async function ExecucaoServicoBuffetPage({
  params,
  searchParams
}: PageProps) {
  const authUser = await getCurrentUser();
  const usuarioLogado = authUser?.nomeCompleto ?? "Usuário logado";
  const perfilLogado = authUser ? getRoleLabel(authUser.perfil) : "";
  const isColaborador = authUser?.perfil === "COLABORADOR";
  const podeAssinarSupervisor = authUser
    ? hasPermission(authUser, "modulo.amostras.assinar_servico")
    : false;
  const podeVerGestao = authUser ? canViewManagementSections(authUser) : false;
  const now = getCurrentSystemDateTime();

  const routeParams = await params;
  const servicoId = parsePositiveInt(routeParams.id);
  if (!servicoId) {
    notFound();
  }

  const query = await searchParams;
  const feedback = firstParam(query.feedback).trim();
  const feedbackType = firstParam(query.feedbackType) === "error" ? "error" : "success";

  const dataFiltroRaw = firstParam(query.data).trim();
  const dataFiltro = parseDateInput(dataFiltroRaw);
  const hoje = parseDateInput(formatDateInput(now)) ?? now;
  const dataReferencia = isColaborador ? hoje : dataFiltro ?? hoje;
  const dataReferenciaInput = formatDateInput(dataReferencia);
  const returnTo = buildReturnToPath(servicoId, dataReferenciaInput);

  const [servico, acoesCorretivasAtivas, registros] = await Promise.all([
    prisma.controleBuffetAmostraServico.findUnique({
      where: { id: servicoId },
      include: {
        itens: {
          where: { item: { ativo: true } },
          include: {
            item: true
          },
          orderBy: [{ item: { ordem: "asc" } }, { item: { nome: "asc" } }]
        }
      }
    }),
    prisma.controleBuffetAmostraAcaoCorretiva.findMany({
      where: { ativo: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }]
    }),
    prisma.controleBuffetAmostraRegistro.findMany({
      where: {
        data: dataReferencia,
        servicoId
      },
      orderBy: [{ itemExtra: "asc" }, { createdAt: "asc" }, { id: "asc" }]
    })
  ]);

  if (!servico) {
    notFound();
  }
  const servicoPrevistoNaData = isServicoDisponivelNaData(servico, dataReferencia);

  const period = getMonthYear(dataReferencia);
  const fechamentoAssinado = await isOperationalMonthClosed("amostras", period.mes, period.ano);

  const registrosByItemId = new Map<number, (typeof registros)[number]>();
  const registrosExtras = registros.filter((registro) => registro.itemExtra);
  for (const registro of registros) {
    if (registro.itemId !== null) {
      registrosByItemId.set(registro.itemId, registro);
    }
  }

  const itensConfiguradosDoDia = servicoPrevistoNaData ? servico.itens : [];
  const itensFixosPendentes = itensConfiguradosDoDia.filter((vinculo) => {
    const registro = registrosByItemId.get(vinculo.itemId);
    return !registro || registro.status === StatusItemBuffetAmostra.PENDENTE;
  }).length;
  const itensExtrasPendentes = registrosExtras.filter(
    (registro) => registro.status === StatusItemBuffetAmostra.PENDENTE
  ).length;
  const itensPendentes = itensFixosPendentes + itensExtrasPendentes;
  const itensPreenchidos = registros.filter(
    (registro) => registro.status === StatusItemBuffetAmostra.PREENCHIDO
  ).length;
  const itensAssinados = registros.filter(
    (registro) => registro.status === StatusItemBuffetAmostra.ASSINADO
  ).length;
  const itensNaoServidos = registros.filter(
    (registro) => registro.status === StatusItemBuffetAmostra.NAO_SERVIDO
  ).length;
  const totalItensServico = itensConfiguradosDoDia.length + registrosExtras.length;
  const todosItensPreenchidos = totalItensServico > 0 && itensPendentes === 0;
  const assinaturaBloqueadaPorExecutor = authUser
    ? registros.some(
        (registro) =>
          registro.status === StatusItemBuffetAmostra.PREENCHIDO &&
          registro.responsavelUsuarioId === authUser.id
      )
    : false;
  const formatTemperatureInput = (value: number | null): string =>
    value !== null && value !== undefined ? String(value).replace(".", ",") : "";
  const itemRows: ServiceItemFormRow[] = [
    ...itensConfiguradosDoDia.map((vinculo) => {
      const item = vinculo.item;
      const registro = registrosByItemId.get(item.id) ?? null;
      const bloqueado = fechamentoAssinado || registro?.status === "ASSINADO";
      const temperaturaAmbiente = registro?.temperaturaAmbiente ?? false;
      const avaliacao =
        !temperaturaAmbiente &&
        registro?.primeiraTc !== null &&
        registro?.primeiraTc !== undefined
          ? avaliarTemperaturaBuffet(item.classificacao, registro.primeiraTc)
          : null;

      return {
        rowKey: `item-${item.id}`,
        nome: item.nome,
        classificacao: item.classificacao,
        isExtra: false,
        guideline: getGuidelineByClassificacao(item.classificacao),
        status: registro?.status ?? StatusItemBuffetAmostra.PENDENTE,
        statusTemperatura: registro?.statusTemperatura ?? null,
        avaliacaoOrientacao: avaliacao?.orientacao ?? null,
        tcEquipamento: formatTemperatureInput(registro?.tcEquipamento ?? null),
        primeiraTc: formatTemperatureInput(registro?.primeiraTc ?? null),
        usaGarrafaTermica: item.usaGarrafaTermica,
        temperaturaAmbiente,
        acaoCorretiva: registro?.acaoCorretiva?.trim() ?? "",
        observacao: registro?.observacao ?? "",
        responsavelNome: registro?.responsavelNome ?? null,
        dataHoraRegistro: registro?.dataHoraRegistro
          ? formatDateTimeDisplay(registro.dataHoraRegistro)
          : null,
        assinaturaResumo: registro?.assinaturaNome
          ? `${registro.assinaturaNome}${
              registro.assinaturaDataHora
                ? ` em ${formatDateTimeDisplay(registro.assinaturaDataHora)}`
                : ""
            }`
          : null,
        bloqueado
      };
    }),
    ...registrosExtras.map((registro) => {
      const temperaturaAmbiente = registro.temperaturaAmbiente;
      const avaliacao =
        !temperaturaAmbiente &&
        registro.primeiraTc !== null &&
        registro.primeiraTc !== undefined
          ? avaliarTemperaturaBuffet(registro.classificacao, registro.primeiraTc)
          : null;

      return {
        rowKey: `extra-${registro.id}`,
        nome: registro.itemNome,
        classificacao: registro.classificacao,
        isExtra: true,
        guideline: getGuidelineByClassificacao(registro.classificacao),
        status: registro.status,
        statusTemperatura: registro.statusTemperatura,
        avaliacaoOrientacao: avaliacao?.orientacao ?? null,
        tcEquipamento: formatTemperatureInput(registro.tcEquipamento),
        primeiraTc: formatTemperatureInput(registro.primeiraTc),
        usaGarrafaTermica: registro.usaGarrafaTermica,
        temperaturaAmbiente,
        acaoCorretiva: registro.acaoCorretiva?.trim() ?? "",
        observacao: registro.observacao ?? "",
        responsavelNome: registro.responsavelNome,
        dataHoraRegistro: formatDateTimeDisplay(registro.dataHoraRegistro),
        assinaturaResumo: registro.assinaturaNome
          ? `${registro.assinaturaNome}${
              registro.assinaturaDataHora
                ? ` em ${formatDateTimeDisplay(registro.assinaturaDataHora)}`
                : ""
            }`
          : null,
        bloqueado:
          fechamentoAssinado || registro.status === StatusItemBuffetAmostra.ASSINADO
      };
    })
  ];

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Execução do Serviço
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {servico.nome} • {formatDateDisplay(dataReferencia)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {getTipoServicoLabel(servico.tipoServico)} • {getServicoPeriodoLabel(servico)}
            </p>
            {servico.observacao ? (
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                {servico.observacao}
              </p>
            ) : null}
          </div>
          <div className="btn-group">
            <Link href={MODULE_PATH} className="btn-secondary">
              ← Voltar ao Módulo
            </Link>
            {podeVerGestao ? (
              <Link href={`${MODULE_PATH}/historico`} className="btn-secondary">
                Histórico
              </Link>
            ) : null}
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

      {fechamentoAssinado ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          Este serviço pertence a um mês fechado. Os registros podem ser visualizados, mas não
          podem ser alterados.
        </section>
      ) : null}

      {!servicoPrevistoNaData ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          Este serviço não está previsto para {formatDateDisplay(dataReferencia)}. Ele não
          gera pendência nesta data.
        </section>
      ) : null}

      <section className={CARD_CLASS}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Itens do Serviço
          </h2>
          {isColaborador ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Serviço do dia em foco operacional.
            </p>
          ) : (
            <form method="get" className="flex flex-wrap items-end gap-2">
              <label className="text-sm text-slate-700 dark:text-slate-200">
                Data
                <input
                  type="date"
                  name="data"
                  defaultValue={dataReferenciaInput}
                  className={INPUT_CLASS}
                />
              </label>
              <button type="submit" className="btn-secondary">
                Carregar Data
              </button>
            </form>
          )}
        </div>

        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <p>Responsável automático: {usuarioLogado}</p>
          <p>
            Para status de temperatura em Alerta/Crítico, a ação corretiva é obrigatória.
          </p>
        </div>

        {acoesCorretivasAtivas.length === 0 ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Nenhuma ação corretiva ativa disponível. Cadastre opções antes de preencher os itens.
          </p>
        ) : null}

        <ServiceItemsForm
          servicoId={servico.id}
          dataInput={dataReferenciaInput}
          returnTo={returnTo}
          usuarioLogado={usuarioLogado}
          fechamentoAssinado={fechamentoAssinado || !servicoPrevistoNaData}
          rows={itemRows}
          acoesCorretivas={acoesCorretivasAtivas}
          inputClassName={INPUT_CLASS}
        />
      </section>

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Assinatura do Serviço
        </h2>

        <div className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800 md:grid-cols-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Itens do Serviço
            </p>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{totalItensServico}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Pendentes
            </p>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{itensPendentes}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Preenchidos
            </p>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{itensPreenchidos}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Assinados
            </p>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{itensAssinados}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Não servidos
            </p>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{itensNaoServidos}</p>
          </div>
        </div>

        {fechamentoAssinado ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            O mês deste serviço está fechado e não permite novas assinaturas.
          </p>
        ) : !servicoPrevistoNaData ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Serviço fora do período configurado para esta data.
          </p>
        ) : totalItensServico === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Não há itens ativos configurados neste serviço para assinatura.
          </p>
        ) : !todosItensPreenchidos ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            Ainda existem itens não preenchidos. Complete todos os itens antes de assinar o serviço.
          </p>
        ) : itensPreenchidos === 0 ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
            Não há itens preenchidos aguardando assinatura neste serviço.
          </p>
        ) : !podeAssinarSupervisor ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            Seu perfil não possui permissão para assinar como supervisor.
          </p>
        ) : assinaturaBloqueadaPorExecutor ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            Este registro foi executado por você. A assinatura de supervisor deve ser feita por outro usuário autorizado.
          </p>
        ) : (
          <form action={signServicoItensAction} className="grid gap-3 md:grid-cols-2">
            <input type="hidden" name="servicoId" value={String(servico.id)} />
            <input type="hidden" name="data" value={dataReferenciaInput} />
            <input type="hidden" name="returnTo" value={returnTo} />

            <label className="text-sm text-slate-700 dark:text-slate-200">
              Confirme sua Senha *
              <input type="password" name="senhaConfirmacao" required className={INPUT_CLASS} />
            </label>

            <SignatureContextCard
              nomeUsuario={usuarioLogado}
              perfil={perfilLogado}
              dataHora={formatDateTimeDisplay(now)}
            />

            <div className="md:col-span-2">
              <button type="submit" className="btn-primary">
                Assinatura Supervisor
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
