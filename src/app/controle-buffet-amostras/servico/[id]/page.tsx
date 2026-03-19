import { StatusFechamentoBuffetAmostra, StatusItemBuffetAmostra } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SignatureContextCard } from "@/components/auth/signature-context-card";
import { getCurrentUser } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { getRoleLabel } from "@/lib/rbac";

import { saveRegistroItemAction, signRegistroItemAction } from "../../actions";
import { ItemStatusBadge, TemperatureStatusBadge } from "../../status-badges";
import {
  avaliarTemperaturaBuffet,
  formatDateDisplay,
  formatDateInput,
  formatDateTimeDisplay,
  getClassificacaoLabel,
  getCurrentSystemDateTime,
  getMonthYear,
  parseDateInput,
  parsePositiveInt
} from "../../utils";
import { ThemeToggleButton } from "@/app/higienizacao-hortifruti/theme-toggle-button";

const MODULE_PATH = "/controle-buffet-amostras";
const CARD_CLASS =
  "rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900";
const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:disabled:bg-slate-900";

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

function buildSignHref(servicoId: number, dataInput: string, signItemId: number): string {
  const params = new URLSearchParams();
  if (dataInput) {
    params.set("data", dataInput);
  }
  params.set("signItemId", String(signItemId));
  return `${MODULE_PATH}/servico/${servicoId}?${params.toString()}`;
}

function getGuidelineByClassificacao(classificacao: "QUENTE" | "FRIO" | "FRIO_CRU"): string {
  if (classificacao === "QUENTE") {
    return "Regra: acima de 60°C (até 6h) | abaixo de 60°C (até 1h).";
  }

  if (classificacao === "FRIO") {
    return "Regra: até 10°C (até 4h) | entre 10°C e 21°C (até 2h).";
  }

  return "Regra: até 5°C (até 2h) para preparações cruas.";
}

export default async function ExecucaoServicoBuffetPage({
  params,
  searchParams
}: PageProps) {
  const authUser = await getCurrentUser();
  const usuarioLogado = authUser?.nomeCompleto ?? "Usuário logado";
  const perfilLogado = authUser ? getRoleLabel(authUser.perfil) : "";
  const now = getCurrentSystemDateTime();

  const routeParams = await params;
  const servicoId = parsePositiveInt(routeParams.id);
  if (!servicoId) {
    notFound();
  }

  const query = await searchParams;
  const feedback = firstParam(query.feedback).trim();
  const feedbackType = firstParam(query.feedbackType) === "error" ? "error" : "success";
  const signItemId = parsePositiveInt(firstParam(query.signItemId));

  const dataFiltroRaw = firstParam(query.data).trim();
  const dataFiltro = parseDateInput(dataFiltroRaw);
  const dataReferencia = dataFiltro ?? parseDateInput(formatDateInput(now)) ?? now;
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
      orderBy: [{ item: { ordem: "asc" } }, { item: { nome: "asc" } }]
    })
  ]);

  if (!servico) {
    notFound();
  }

  const period = getMonthYear(dataReferencia);
  const fechamento = await prisma.controleBuffetAmostraFechamento.findUnique({
    where: { mes_ano: { mes: period.mes, ano: period.ano } }
  });
  const fechamentoAssinado = fechamento?.status === StatusFechamentoBuffetAmostra.ASSINADO;

  const registrosByItemId = new Map<number, (typeof registros)[number]>();
  for (const registro of registros) {
    registrosByItemId.set(registro.itemId, registro);
  }

  const registroParaAssinatura =
    signItemId && registros.some((registro) => registro.id === signItemId)
      ? registros.find((registro) => registro.id === signItemId) ?? null
      : null;

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
          </div>
          <div className="btn-group">
            <Link href={MODULE_PATH} className="btn-secondary">
              Voltar
            </Link>
            <Link href={`${MODULE_PATH}/historico`} className="btn-secondary">
              Histórico Completo
            </Link>
            <Link
              href="/chamados-manutencao?origem=BUFFET_AMOSTRAS"
              className="btn-secondary"
            >
              Abrir Chamado de Manutenção
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

      {fechamentoAssinado ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          Este serviço pertence a um mês fechado. Os registros podem ser visualizados, mas não
          podem ser alterados.
        </section>
      ) : null}

      {registroParaAssinatura ? (
        <section className={CARD_CLASS}>
          <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
            Assinar Item
          </h2>

          {registroParaAssinatura.status !== StatusItemBuffetAmostra.PREENCHIDO ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Este item não está disponível para assinatura.
            </p>
          ) : fechamentoAssinado ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              O mês deste item está fechado e não permite assinatura.
            </p>
          ) : (
            <form action={signRegistroItemAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="registroId" value={String(registroParaAssinatura.id)} />
              <input type="hidden" name="returnTo" value={returnTo} />

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Item
                </p>
                <p className="font-semibold text-slate-800 dark:text-slate-100">
                  {registroParaAssinatura.itemNome}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Status atual: {registroParaAssinatura.status}
                </p>
              </div>

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
                  Assinar Item
                </button>
              </div>
            </form>
          )}
        </section>
      ) : null}

      <section className={CARD_CLASS}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Itens Configurados do Serviço
          </h2>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="signItemId" value="" />
            <label className="text-sm text-slate-700 dark:text-slate-200">
              Data
              <input type="date" name="data" defaultValue={dataReferenciaInput} className={INPUT_CLASS} />
            </label>
            <button type="submit" className="btn-secondary">
              Carregar Data
            </button>
          </form>
        </div>

        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <p>Responsável automático: {usuarioLogado}</p>
          <p>
            Para status de temperatura em Alerta/Crítico, a ação corretiva é obrigatória.
          </p>
        </div>

        {servico.itens.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Nenhum item ativo está vinculado a este serviço. Configure em Gerenciar Opções.
          </p>
        ) : acoesCorretivasAtivas.length === 0 ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Nenhuma ação corretiva ativa disponível. Cadastre opções antes de preencher os itens.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <tr>
                  <th className="px-3 py-2">Item/Produto</th>
                  <th className="px-3 py-2">Classificação</th>
                  <th className="px-3 py-2">Registro Operacional</th>
                  <th className="px-3 py-2">Responsável</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {servico.itens.map((vinculo) => {
                  const item = vinculo.item;
                  const registro = registrosByItemId.get(item.id) ?? null;
                  const bloqueado = fechamentoAssinado || registro?.status === "ASSINADO";
                  const statusItem = registro?.status ?? StatusItemBuffetAmostra.PENDENTE;
                  const avaliacao =
                    registro?.segundaTc !== null && registro?.segundaTc !== undefined
                      ? avaliarTemperaturaBuffet(item.classificacao, registro.segundaTc)
                      : null;
                  const acaoAtual = registro?.acaoCorretiva?.trim() ?? "";
                  const acaoEstaAtiva = acoesCorretivasAtivas.some(
                    (option) => option.nome === acaoAtual
                  );
                  const signHref =
                    registro && statusItem === StatusItemBuffetAmostra.PREENCHIDO
                      ? buildSignHref(servico.id, dataReferenciaInput, registro.id)
                      : null;

                  return (
                    <tr key={item.id}>
                      <td className="px-3 py-2 align-top">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{item.nome}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {getGuidelineByClassificacao(item.classificacao)}
                        </p>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <p>{getClassificacaoLabel(item.classificacao)}</p>
                        <div className="mt-1">
                          <TemperatureStatusBadge status={registro?.statusTemperatura ?? null} />
                        </div>
                        {avaliacao ? (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {avaliacao.orientacao}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-top min-w-[340px]">
                        <form action={saveRegistroItemAction} className="space-y-2">
                          <input type="hidden" name="servicoId" value={String(servico.id)} />
                          <input type="hidden" name="itemId" value={String(item.id)} />
                          <input type="hidden" name="data" value={dataReferenciaInput} />
                          <input type="hidden" name="returnTo" value={returnTo} />

                          <label className="block text-xs text-slate-600 dark:text-slate-300">
                            TC Equipamento
                          </label>
                          <input
                            type="text"
                            name="tcEquipamento"
                            inputMode="decimal"
                            placeholder="Ex.: 62,5"
                            defaultValue={
                              registro?.tcEquipamento !== null && registro?.tcEquipamento !== undefined
                                ? String(registro.tcEquipamento).replace(".", ",")
                                : ""
                            }
                            className={INPUT_CLASS}
                            disabled={bloqueado}
                          />
                          <label className="block text-xs text-slate-600 dark:text-slate-300">
                            1ª TC
                          </label>
                          <input
                            type="text"
                            name="primeiraTc"
                            inputMode="decimal"
                            placeholder="Ex.: 58"
                            defaultValue={
                              registro?.primeiraTc !== null && registro?.primeiraTc !== undefined
                                ? String(registro.primeiraTc).replace(".", ",")
                                : ""
                            }
                            className={INPUT_CLASS}
                            disabled={bloqueado}
                          />
                          <label className="block text-xs text-slate-600 dark:text-slate-300">
                            2ª TC
                          </label>
                          <input
                            type="text"
                            name="segundaTc"
                            inputMode="decimal"
                            placeholder="Ex.: 55"
                            defaultValue={
                              registro?.segundaTc !== null && registro?.segundaTc !== undefined
                                ? String(registro.segundaTc).replace(".", ",")
                                : ""
                            }
                            className={INPUT_CLASS}
                            disabled={bloqueado}
                          />
                          <label className="block text-xs text-slate-600 dark:text-slate-300">
                            Ação Corretiva
                          </label>
                          <select
                            name="acaoCorretiva"
                            defaultValue={acaoAtual}
                            className={INPUT_CLASS}
                            disabled={bloqueado}
                          >
                            <option value="">Selecione</option>
                            {!acaoEstaAtiva && acaoAtual ? (
                              <option value={acaoAtual}>{acaoAtual} (Inativa)</option>
                            ) : null}
                            {acoesCorretivasAtivas.map((option) => (
                              <option key={option.id} value={option.nome}>
                                {option.nome}
                              </option>
                            ))}
                          </select>
                          <label className="block text-xs text-slate-600 dark:text-slate-300">
                            Observação
                          </label>
                          <textarea
                            name="observacao"
                            rows={2}
                            defaultValue={registro?.observacao ?? ""}
                            className={INPUT_CLASS}
                            disabled={bloqueado}
                          />
                          <div className="grid grid-cols-1 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs dark:border-slate-700 dark:bg-slate-800">
                            <p>
                              TC Equip.:{" "}
                              <strong>
                                {registro?.tcEquipamento !== null &&
                                registro?.tcEquipamento !== undefined
                                  ? `${registro.tcEquipamento}°C`
                                  : "-"}
                              </strong>
                            </p>
                            <p>
                              1ª TC:{" "}
                              <strong>
                                {registro?.primeiraTc !== null &&
                                registro?.primeiraTc !== undefined
                                  ? `${registro.primeiraTc}°C`
                                  : "-"}
                              </strong>
                            </p>
                            <p>
                              2ª TC:{" "}
                              <strong>
                                {registro?.segundaTc !== null &&
                                registro?.segundaTc !== undefined
                                  ? `${registro.segundaTc}°C`
                                  : "-"}
                              </strong>
                            </p>
                            <p>
                              Ação: <strong>{registro?.acaoCorretiva ?? "-"}</strong>
                            </p>
                            <p>
                              Observação: <strong>{registro?.observacao ?? "-"}</strong>
                            </p>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            Responsável automático:{" "}
                            <strong>{registro?.responsavelNome ?? usuarioLogado}</strong>
                          </div>
                          <div className="btn-group">
                            <button type="submit" className="btn-primary" disabled={bloqueado}>
                              Salvar Item
                            </button>
                            {signHref ? (
                              <Link href={signHref} className="btn-action">
                                Assinar
                              </Link>
                            ) : null}
                          </div>
                        </form>
                      </td>
                      <td className="px-3 py-2 align-top">
                        {registro?.responsavelNome ?? "-"}
                        {registro?.dataHoraRegistro ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {formatDateTimeDisplay(registro.dataHoraRegistro)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <ItemStatusBadge status={statusItem} />
                        {registro?.assinaturaNome ? (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Assinado por {registro.assinaturaNome}
                            {registro.assinaturaDataHora
                              ? ` em ${formatDateTimeDisplay(registro.assinaturaDataHora)}`
                              : ""}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {bloqueado ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {fechamentoAssinado ? "Mês fechado" : "Item assinado"}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Salve o item e assine em seguida.
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
