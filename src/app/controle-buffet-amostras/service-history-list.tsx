"use client";
import Link from "next/link";

import { useMemo, useState } from "react";


import { ItemStatusBadge, ServiceStatusBadge, TemperatureStatusBadge } from "./status-badges";
import type { BuffetServiceHistoryGroup, BuffetServiceHistoryTotals } from "./service-history";
import { normalizeSearchText } from "./utils";

type BuffetServiceHistoryListProps = {
  groups: BuffetServiceHistoryGroup[];
  totals?: BuffetServiceHistoryTotals;
  emptyMessage: string;
  canSignNutritionReview?: boolean;
  returnTo?: string;
};

function OperationalStatusPill({
  label
}: {
  label: "Preenchido" | "Não servido" | "Incompleto";
}) {
  const statusClass =
    label === "Preenchido"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
      : label === "Não servido"
        ? "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
        : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass}`}
    >
      {label}
    </span>
  );
}


function shouldShowSupervisorReview(
  group: BuffetServiceHistoryGroup,
  canSign: boolean
): boolean {
  return canSign || group.assinadoNutricionista;
}

function getSupervisorReviewSummary(group: BuffetServiceHistoryGroup): string {
  return group.assinadoNutricionista
    ? `Assinado pelo Supervisor - ${group.assinaturaNutricionistaResumo}`
    : "Pendente de assinatura do supervisor";
}

export function BuffetServiceHistoryList({
  groups,
  totals,
  emptyMessage,
  canSignNutritionReview = false
}: BuffetServiceHistoryListProps) {
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [itemSearch, setItemSearch] = useState("");

  const selectedGroup =
    groups.find((group) => group.key === selectedGroupKey) ?? null;
  const normalizedItemSearch = normalizeSearchText(itemSearch);
  const filteredItems = useMemo(() => {
    if (!selectedGroup) {
      return [];
    }

    if (!normalizedItemSearch) {
      return selectedGroup.items;
    }

    return selectedGroup.items.filter((item) =>
      normalizeSearchText(item.nome).includes(normalizedItemSearch)
    );
  }, [normalizedItemSearch, selectedGroup]);

  const openGroup = (groupKey: string) => {
    setItemSearch("");
    setSelectedGroupKey(groupKey);
  };

  return (
    <div className="space-y-4">
      {totals ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Serviços
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {totals.totalServicos}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Itens registrados
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {totals.totalItensRegistrados}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Preenchidos
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {totals.totalItensPreenchidos}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Não servidos
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {totals.totalItensNaoServidos}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Ações corretivas
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {totals.totalAcoesCorretivas}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Pendentes
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {totals.totalServicosPendentes}
            </p>
          </div>
        </div>
      ) : null}

      {groups.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
          {emptyMessage}
        </p>
      ) : (
        <div className="grid gap-3">
          {groups.map((group) => {
            const supervisorReviewVisible = shouldShowSupervisorReview(
              group,
              canSignNutritionReview
            );
            const hasOperationalPending =
              canSignNutritionReview && group.status !== "CONCLUIDO";

            return (
              <article
                key={group.key}
                className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
              >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {group.servicoNome}
                    </h3>
                    <ServiceStatusBadge status={group.status} />
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2 xl:grid-cols-4">
                    <p>
                      Data: <strong>{group.dataLabel}</strong>
                    </p>
                    <p>
                      Tipo: <strong>{group.tipoServicoLabel}</strong>
                    </p>
                    <p>
                      Responsável: <strong>{group.responsavelExecucao}</strong>
                    </p>
                    <p>
                      Itens: <strong>{group.totalItens}</strong>
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    {group.itensPreenchidos} preenchidos | {group.itensNaoServidos} não
                    servidos | {group.itensComAcaoCorretiva} ação corretiva
                  </p>
                  {hasOperationalPending ? (
                    <p className="mt-2 text-sm text-amber-700 dark:text-amber-200">
                      Pendência de preenchimento: finalize os itens pendentes antes da
                      assinatura do supervisor.
                    </p>
                  ) : null}
                  {supervisorReviewVisible ? (
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                      Assinatura do Supervisor:{" "}
                      <strong>{getSupervisorReviewSummary(group)}</strong>
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                  <button
                    type="button"
                    className="btn-action"
                    onClick={() => openGroup(group.key)}
                  >
                    Abrir Serviço
                  </button>
                </div>
              </div>
              </article>
            );
          })}
        </div>
      )}

      {selectedGroup ? (
        <div
          className="bpma-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`Itens do serviço ${selectedGroup.servicoNome}`}
        >
          <section className="bpma-modal-panel max-w-6xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {selectedGroup.servicoNome}
                </h2>
                <div className="mt-2 grid gap-1 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                  <p>
                    Data: <strong>{selectedGroup.dataLabel}</strong>
                  </p>
                  <p>
                    Responsável: <strong>{selectedGroup.responsavelExecucao}</strong>
                  </p>
                  <p>
                    Tipo: <strong>{selectedGroup.tipoServicoLabel}</strong>
                  </p>
                  <p>
                    Assinatura: <strong>{selectedGroup.assinaturaResumo}</strong>
                  </p>
                  {canSignNutritionReview && selectedGroup.status !== "CONCLUIDO" ? (
                    <p className="sm:col-span-2">
                      Pendência de preenchimento:{" "}
                      <strong>
                        finalize os itens pendentes antes da assinatura do supervisor.
                      </strong>
                    </p>
                  ) : null}
                  {shouldShowSupervisorReview(selectedGroup, canSignNutritionReview) ? (
                    <p className="sm:col-span-2">
                      Assinatura do Supervisor:{" "}
                      <strong>{getSupervisorReviewSummary(selectedGroup)}</strong>
                    </p>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary shrink-0"
                onClick={() => setSelectedGroupKey(null)}
              >
                Fechar
              </button>
            </div>

            {selectedGroup.workflowId&&<Link className="btn-secondary mt-4 inline-block" href={`/controle-buffet-amostras/servico/${selectedGroup.servicoId}?data=${selectedGroup.dataInput}`}>Abrir serviço para validação e histórico</Link>}
            <label className="mt-4 block text-sm text-slate-700 dark:text-slate-200">
              Buscar item pelo nome
              <input
                type="search"
                value={itemSearch}
                onChange={(event) => setItemSearch(event.target.value)}
                placeholder="Buscar item pelo nome..."
                className="bpma-input"
              />
            </label>

            {filteredItems.length === 0 ? (
              <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                Nenhum item encontrado.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {filteredItems.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium text-slate-900 dark:text-slate-100">
                            {item.nome}
                          </h3>
                          {item.itemExtra ? (
                            <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200">
                              Item extra
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {item.classificacaoLabel}
                        </p>
                      </div>
                      <OperationalStatusPill label={item.statusOperacionalLabel} />
                    </div>

                    <div className="mt-4 grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                      <p>
                        TC Equipamento: <strong>{item.tcEquipamentoLabel}</strong>
                      </p>
                      <p>
                        Temperatura inicial: <strong>{item.temperaturaInicialLabel}</strong>
                      </p>
                      {item.temperaturaFinalLabel ? (
                        <p>
                          Temperatura final (histórico):{" "}
                          <strong>{item.temperaturaFinalLabel}</strong>
                        </p>
                      ) : null}
                      <p>
                        Status temperatura:{" "}
                        <TemperatureStatusBadge status={item.statusTemperatura} />
                      </p>
                      <p>
                        Status do registro: <ItemStatusBadge status={item.status} />
                      </p>
                      <p>
                        Ação corretiva: <strong>{item.acaoCorretiva}</strong>
                      </p>
                      <p>
                        Executado por: <strong>{item.responsavelExecucao}</strong>
                      </p>
                      <p>
                        Data/hora: <strong>{item.dataHoraRegistroLabel}</strong>
                      </p>
                      <p>
                        Verificação: <strong>{item.responsavelVerificacao}</strong>
                      </p>
                      <p>
                        Assinatura: <strong>{item.assinaturaResumo}</strong>
                      </p>
                      <p>
                        Assinatura do Supervisor:{" "}
                        <strong>{item.assinaturaNutricionistaResumo}</strong>
                      </p>
                      <p className="sm:col-span-2">
                        Observações: <strong>{item.observacao}</strong>
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}


    </div>
  );
}
