import {
  ClassificacaoItemBuffetAmostra,
  ModuloDocumento,
  TipoServicoBuffetAmostra
} from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/permissions";
import { buffetCatalogRevision } from "../catalog-order";
import { buffetManagementItemOrder } from "../item-ordering";

import { ModuleHeaderTextSettings } from "@/components/documentos/module-header-text-settings";
import { getCurrentUser } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { getRoleLabel } from "@/lib/rbac";

import {
  createAcaoCorretivaAction,
  createItemAction,
  createServicoAction,
  toggleAcaoCorretivaStatusAction,
  toggleServicoStatusAction,
  updateAcaoCorretivaAction,
  updateItemAction,
  updateServicoAction
} from "../actions";
import {
  formatDateInput,
  getClassificacaoLabel,
  getServicoPeriodoLabel,
  getTipoServicoLabel,
  parsePositiveInt
} from "../utils";
import { BuffetItemsManagementTable } from "./items-management-table";

const MODULE_PATH = "/controle-buffet-amostras";
const PAGE_PATH = "/controle-buffet-amostras/opcoes";
const CARD_CLASS =
  "bpma-card";
const INPUT_CLASS =
  "bpma-input";

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams: Promise<SearchParams> };

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ControleBuffetAmostrasOpcoesPage({
  searchParams
}: PageProps) {
  const authUser = await getCurrentUser();
  if(!authUser)redirect("/login");
  if(!hasPermission(authUser,"modulo.amostras.gerenciar_cadastros"))redirect("/acesso-negado");
  const usuarioLogado = authUser?.nomeCompleto ?? "Usuário logado";
  const perfilLogado = authUser ? getRoleLabel(authUser.perfil) : "";

  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";

  const editServicoId = parsePositiveInt(firstParam(params.editServicoId).trim());
  const editItemId = parsePositiveInt(firstParam(params.editItemId).trim());
  const editAcaoId = parsePositiveInt(firstParam(params.editAcaoId).trim());

  const [servicos, itens, acoesCorretivas] = await Promise.all([
    prisma.controleBuffetAmostraServico.findMany({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }]
    }),
    prisma.controleBuffetAmostraItem.findMany({
      include: {
        servicos: {
          include: { servico: true },
          orderBy: { servico: { ordem: "asc" } }
        }
      },
      orderBy: buffetManagementItemOrder
    }),
    prisma.controleBuffetAmostraAcaoCorretiva.findMany({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }]
    })
  ]);

  const servicoEdicao = editServicoId
    ? servicos.find((servico) => servico.id === editServicoId) ?? null
    : null;
  const itemEdicao = editItemId
    ? itens.find((item) => item.id === editItemId) ?? null
    : null;
  const acaoEdicao = editAcaoId
    ? acoesCorretivas.find((acao) => acao.id === editAcaoId) ?? null
    : null;

  const itemEdicaoServicos = new Set(
    itemEdicao?.servicos.map((vinculo) => vinculo.servicoId) ?? []
  );
  const catalogRevision=buffetCatalogRevision(itens);
  const itensGerenciamento = itens.map((item) => ({
    id: item.id,
    nome: item.nome,
    classificacaoLabel: getClassificacaoLabel(item.classificacao),
    equipamentoLabel: item.usaGarrafaTermica
      ? "Garrafa térmica"
      : "Equipamento com temperatura",
    servicosLabel:
      item.servicos.length > 0
        ? item.servicos.map((vinculo) => vinculo.servico.nome).join(", ")
        : "-",
    ordem: item.ordem,
    ativo: item.ativo,
    editHref: `${PAGE_PATH}?editItemId=${item.id}`
  }));

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Gerenciar Opções - Controle de Buffet / Amostras
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Configure serviços, itens e ações corretivas do módulo.
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Usuário logado: {usuarioLogado} ({perfilLogado})
            </p>
          </div>
          <div className="btn-group">
            <Link href={MODULE_PATH} className="btn-secondary">
              ← Voltar ao Módulo
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

      <ModuleHeaderTextSettings
        modulo={ModuloDocumento.CONTROLE_BUFFET_AMOSTRAS}
        returnTo={PAGE_PATH}
      />

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Serviços
        </h2>

        <form
          action={servicoEdicao ? updateServicoAction : createServicoAction}
          className="grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-3 dark:bg-slate-800"
        >
          <input type="hidden" name="returnTo" value={PAGE_PATH} />
          {servicoEdicao ? (
            <input type="hidden" name="servicoId" value={String(servicoEdicao.id)} />
          ) : null}

          <label className="text-sm text-slate-700 dark:text-slate-200">
            Nome do Serviço
            <input
              type="text"
              name="nome"
              required
              defaultValue={servicoEdicao?.nome ?? ""}
              className={INPUT_CLASS}
            />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Ordem
            <input
              type="number"
              name="ordem"
              min={1}
              required
              defaultValue={servicoEdicao?.ordem ?? 1}
              className={INPUT_CLASS}
            />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Tipo de serviço
            <select
              name="tipoServico"
              defaultValue={servicoEdicao?.tipoServico ?? TipoServicoBuffetAmostra.FIXO}
              className={INPUT_CLASS}
            >
              <option value={TipoServicoBuffetAmostra.FIXO}>Fixo / Recorrente</option>
              <option value={TipoServicoBuffetAmostra.ESPORADICO}>
                Esporádico / Eventual
              </option>
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Data inicial
            <input
              type="date"
              name="dataInicio"
              defaultValue={servicoEdicao?.dataInicio ? formatDateInput(servicoEdicao.dataInicio) : ""}
              className={INPUT_CLASS}
            />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Data final
            <input
              type="date"
              name="dataFim"
              defaultValue={servicoEdicao?.dataFim ? formatDateInput(servicoEdicao.dataFim) : ""}
              className={INPUT_CLASS}
            />
          </label>
          {servicoEdicao ? (
            <label className="text-sm text-slate-700 dark:text-slate-200">
              Status
              <select name="ativo" defaultValue={servicoEdicao.ativo ? "true" : "false"} className={INPUT_CLASS}>
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </label>
          ) : null}
          <p className="text-xs text-slate-500 dark:text-slate-400 md:col-span-3">
            Serviços fixos aparecem todos os dias. Para serviços esporádicos, informe ao menos
            a data inicial; se for um único dia, deixe a data final vazia.
          </p>
          <div className="btn-group md:col-span-3">
            <button type="submit" className="btn-primary">
              {servicoEdicao ? "Salvar Serviço" : "Adicionar Serviço"}
            </button>
            {servicoEdicao ? (
              <Link href={PAGE_PATH} className="btn-secondary">
                Cancelar
              </Link>
            ) : null}
          </div>
        </form>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Período</th>
                <th className="px-3 py-2">Ordem</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {servicos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-3 text-slate-500 dark:text-slate-400">
                    Nenhum serviço cadastrado.
                  </td>
                </tr>
              ) : (
                servicos.map((servico) => (
                  <tr key={servico.id}>
                    <td className="px-3 py-2">{servico.nome}</td>
                    <td className="px-3 py-2">{getTipoServicoLabel(servico.tipoServico)}</td>
                    <td className="px-3 py-2">{getServicoPeriodoLabel(servico)}</td>
                    <td className="px-3 py-2">{servico.ordem}</td>
                    <td className="px-3 py-2">{servico.ativo ? "Ativo" : "Inativo"}</td>
                    <td className="px-3 py-2">
                      <div className="btn-group">
                        <Link
                          href={`${PAGE_PATH}?editServicoId=${servico.id}`}
                          className="btn-action"
                        >
                          Editar
                        </Link>
                        <form action={toggleServicoStatusAction}>
                          <input type="hidden" name="returnTo" value={PAGE_PATH} />
                          <input type="hidden" name="servicoId" value={String(servico.id)} />
                          <input
                            type="hidden"
                            name="ativo"
                            value={servico.ativo ? "false" : "true"}
                          />
                          <button
                            type="submit"
                            className={servico.ativo ? "btn-danger" : "btn-secondary"}
                          >
                            {servico.ativo ? "Inativar" : "Ativar"}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Itens</h2>

        <form
          action={itemEdicao ? updateItemAction : createItemAction}
          className="grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-2 dark:bg-slate-800"
        >
          <input type="hidden" name="catalogRevision" value={catalogRevision} />
          <input type="hidden" name="returnTo" value={PAGE_PATH} />
          {itemEdicao ? <input type="hidden" name="itemId" value={String(itemEdicao.id)} /> : null}

          <label className="text-sm text-slate-700 dark:text-slate-200">
            Nome do Item
            <input
              type="text"
              name="nome"
              required
              defaultValue={itemEdicao?.nome ?? ""}
              className={INPUT_CLASS}
            />
          </label>

          <label className="text-sm text-slate-700 dark:text-slate-200">
            Classificação
            <select
              name="classificacao"
              required
              defaultValue={itemEdicao?.classificacao ?? ClassificacaoItemBuffetAmostra.QUENTE}
              className={INPUT_CLASS}
            >
              <option value={ClassificacaoItemBuffetAmostra.QUENTE}>Quentes</option>
              <option value={ClassificacaoItemBuffetAmostra.FRIO}>Frios</option>
              <option value={ClassificacaoItemBuffetAmostra.TEMPERATURA_AMBIENTE}>
                Temperatura Ambiente
              </option>
            </select>
          </label>

          <label className="text-sm text-slate-700 dark:text-slate-200">
            Ordem
            <input
              type="number"
              name="ordem"
              min={1}
              required
              defaultValue={itemEdicao?.ordem ?? itens.filter(item=>item.ativo).length+1}
              className={INPUT_CLASS}
            />
          </label>

          <label className="text-sm text-slate-700 dark:text-slate-200">
            Tipo de equipamento
            <select
              name="usaGarrafaTermica"
              defaultValue={itemEdicao?.usaGarrafaTermica ? "true" : "false"}
              className={INPUT_CLASS}
            >
              <option value="false">Equipamento com temperatura</option>
              <option value="true">Garrafa térmica</option>
            </select>
          </label>

          {itemEdicao ? (
            <label className="text-sm text-slate-700 dark:text-slate-200">
              Status
              <select name="ativo" defaultValue={itemEdicao.ativo ? "true" : "false"} className={INPUT_CLASS}>
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </label>
          ) : null}

          <div className="md:col-span-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Serviços em que o item aparece *
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {servicos.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cadastre serviços antes de criar itens.
                </p>
              ) : (
                servicos.map((servico) => {
                  const checked = itemEdicao ? itemEdicaoServicos.has(servico.id) : false;
                  return (
                    <label
                      key={servico.id}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    >
                      <input
                        type="checkbox"
                        name="servicoIds"
                        value={String(servico.id)}
                        defaultChecked={checked}
                      />
                      <span>{servico.nome}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="btn-group md:col-span-2">
            <button type="submit" className="btn-primary" disabled={servicos.length === 0}>
              {itemEdicao ? "Salvar Item" : "Adicionar Item"}
            </button>
            {itemEdicao ? (
              <Link href={PAGE_PATH} className="btn-secondary">
                Cancelar
              </Link>
            ) : null}
          </div>
        </form>

        <BuffetItemsManagementTable items={itensGerenciamento} pagePath={PAGE_PATH} revision={catalogRevision} />
      </section>

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Ações Corretivas
        </h2>

        <form
          action={acaoEdicao ? updateAcaoCorretivaAction : createAcaoCorretivaAction}
          className="grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-3 dark:bg-slate-800"
        >
          <input type="hidden" name="returnTo" value={PAGE_PATH} />
          {acaoEdicao ? <input type="hidden" name="acaoId" value={String(acaoEdicao.id)} /> : null}
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Nome da Ação Corretiva
            <input
              type="text"
              name="nome"
              required
              defaultValue={acaoEdicao?.nome ?? ""}
              className={INPUT_CLASS}
            />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Ordem
            <input
              type="number"
              name="ordem"
              min={1}
              required
              defaultValue={acaoEdicao?.ordem ?? 1}
              className={INPUT_CLASS}
            />
          </label>
          {acaoEdicao ? (
            <label className="text-sm text-slate-700 dark:text-slate-200">
              Status
              <select name="ativo" defaultValue={acaoEdicao.ativo ? "true" : "false"} className={INPUT_CLASS}>
                <option value="true">Ativa</option>
                <option value="false">Inativa</option>
              </select>
            </label>
          ) : null}
          <div className="btn-group md:col-span-3">
            <button type="submit" className="btn-primary">
              {acaoEdicao ? "Salvar Ação Corretiva" : "Adicionar Ação Corretiva"}
            </button>
            {acaoEdicao ? (
              <Link href={PAGE_PATH} className="btn-secondary">
                Cancelar
              </Link>
            ) : null}
          </div>
        </form>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-2">Ação Corretiva</th>
                <th className="px-3 py-2">Ordem</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {acoesCorretivas.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-slate-500 dark:text-slate-400">
                    Nenhuma ação corretiva cadastrada.
                  </td>
                </tr>
              ) : (
                acoesCorretivas.map((acao) => (
                  <tr key={acao.id}>
                    <td className="px-3 py-2">{acao.nome}</td>
                    <td className="px-3 py-2">{acao.ordem}</td>
                    <td className="px-3 py-2">{acao.ativo ? "Ativa" : "Inativa"}</td>
                    <td className="px-3 py-2">
                      <div className="btn-group">
                        <Link href={`${PAGE_PATH}?editAcaoId=${acao.id}`} className="btn-action">
                          Editar
                        </Link>
                        <form action={toggleAcaoCorretivaStatusAction}>
                          <input type="hidden" name="returnTo" value={PAGE_PATH} />
                          <input type="hidden" name="acaoId" value={String(acao.id)} />
                          <input
                            type="hidden"
                            name="ativo"
                            value={acao.ativo ? "false" : "true"}
                          />
                          <button
                            type="submit"
                            className={acao.ativo ? "btn-danger" : "btn-secondary"}
                          >
                            {acao.ativo ? "Inativar" : "Ativar"}
                          </button>
                        </form>
                      </div>
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
