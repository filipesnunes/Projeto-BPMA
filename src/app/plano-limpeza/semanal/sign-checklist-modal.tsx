import { WeeklyExecutionFields } from "@/components/forms/weekly-execution-fields";
import { StatusPlanoLimpeza } from "@prisma/client";
import Link from "next/link";

import {
  signWeeklyAreaPendingItemsAction,
  signWeeklyAreaSupervisorAction,
  updateWeeklyRecordAction
} from "../actions";
import { StatusBadge } from "../status-badge";
import { formatDateDisplay, formatDateInput } from "../utils";

type WeeklySignChecklistModalProps = {
  selectedDate?: string;
  closeHref: string;
  returnTo: string;
  usuarioAssinando: string;
  podeAssinarSupervisor: boolean;
  podeAssinarItens: boolean;
  podeAssinarTodosItens: boolean;
  isHistorico: boolean;
  dataHoraAtual: string;
  execution: {
    executionId: number;
    area: string;
    dayLabel?: string;
    dayDate?: Date;
    weekStart: Date;
    weekEnd: Date;
    status: StatusPlanoLimpeza;
    statusGeral: "Pendente" | "Parcial" | "Concluído";
    assinaturaResponsavel: string;
    assinaturaSupervisor: string;
    totalRegistrosOriginais: number;
    completedItems: number;
    pendingItems: number;
  };
  items: Array<{
    id: number;
    status: StatusPlanoLimpeza;
    assinaturaResponsavel: string;
    observacaoResponsavel: string | null;
    etapa: "responsavel" | "supervisor" | null;
    quandoAssinado: string;
    item: {
      id: number;
      ordem: number;
      oQueLimpar: string;
    };
  }>;
};

export function WeeklySignChecklistModal({
  selectedDate,
  closeHref,
  returnTo,
  usuarioAssinando,
  podeAssinarSupervisor,
  podeAssinarItens,
  podeAssinarTodosItens,
  isHistorico,
  dataHoraAtual,
  execution,
  items
}: WeeklySignChecklistModalProps) {
  const supervisorAssumesPendingItems = execution.pendingItems > 0;

  return (
    <div className="bpma-modal-backdrop">
      <div className="bpma-modal-panel max-w-6xl">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Execução Semanal dos Itens
        </h3>

        <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Área</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">{execution.area}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Itens</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">
              {execution.completedItems} de {execution.totalRegistrosOriginais} concluídos
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {execution.pendingItems} pendente(s)
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Semana</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">
              {formatDateDisplay(execution.weekStart)} até {formatDateDisplay(execution.weekEnd)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Supervisor (área)</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">
              {execution.assinaturaSupervisor || "-"}
            </p>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Status geral da área</p>
            <div className="mt-1">
              <StatusBadge status={execution.statusGeral} />
            </div>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Assinatura Atual
            </p>
            <p className="font-medium text-slate-800 dark:text-slate-100">{usuarioAssinando}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Data e Hora: {dataHoraAtual}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Assinatura do Supervisor
              </h4>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Esta assinatura valida a revisão de todos os itens desta área nesta semana.
              </p>
            </div>
            {execution.assinaturaSupervisor.trim() ? (
              <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                Assinado pelo Supervisor
              </span>
            ) : (
              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                Pendente de assinatura do supervisor
              </span>
            )}
          </div>

          {!execution.assinaturaSupervisor.trim() && !podeAssinarSupervisor ? (
            <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              Seu perfil não possui permissão para assinar esta área da semana.
            </p>
          ) : null}

          {!execution.assinaturaSupervisor.trim() &&
          podeAssinarSupervisor &&
          execution.pendingItems > 0 ? (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Existem {execution.pendingItems} item(ns) sem responsável pela limpeza. Ao
              assinar como supervisor, você também será registrado como responsável pela
              limpeza desses itens pendentes. Deseja continuar?
            </p>
          ) : null}

          {!execution.assinaturaSupervisor.trim() &&
          podeAssinarSupervisor ? (
            <form action={signWeeklyAreaSupervisorAction} className="mt-4 grid gap-3 md:grid-cols-2">
              <input type="hidden" name="area" value={execution.area} />
              <input type="hidden" name="weekStart" value={formatDateInput(execution.weekStart)} />
{execution.pendingItems > 0 && <WeeklyExecutionFields defaultDate={selectedDate} weekStart={formatDateInput(execution.weekStart)} />}
              <input type="hidden" name="returnTo" value={returnTo} />
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Senha para confirmar
                <input
                  type="password"
                  name="senhaConfirmacao"
                  required
                  autoComplete="current-password"
                  className="bpma-input"
                />
              </label>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Observação
                <input
                  type="text"
                  name="observacaoAssinatura"
                  className="bpma-input"
                  placeholder="Opcional"
                />
              </label>
              <div className="md:col-span-2">
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                  {supervisorAssumesPendingItems ? (
                    <Link href={closeHref} className="btn-secondary text-center">
                      Cancelar
                    </Link>
                  ) : null}
                  <button type="submit" className="btn-primary">
                    {supervisorAssumesPendingItems
                      ? "Assinar como supervisor e assumir itens pendentes"
                      : "Assinar área da semana como supervisor"}
                  </button>
                </div>
              </div>
            </form>
          ) : null}
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="border-b border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <span>Itens/Locais da Área ({items.length})</span>
              {podeAssinarTodosItens && execution.pendingItems > 0 ? (
                <form
                  action={signWeeklyAreaPendingItemsAction}
                  className="grid w-full gap-2 md:w-auto md:min-w-[520px] md:grid-cols-[1fr_1fr_auto]"
                >
                  <input type="hidden" name="area" value={execution.area} />
                  <input type="hidden" name="weekStart" value={formatDateInput(execution.weekStart)} />
<WeeklyExecutionFields defaultDate={selectedDate} weekStart={formatDateInput(execution.weekStart)} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <input
                    type="password"
                    name="senhaConfirmacao"
                    required
                    placeholder="Confirme sua senha"
                    className="bpma-input text-xs"
                  />
                  <input
                    type="text"
                    name="observacaoAssinatura"
                    placeholder="Observação (Opcional)"
                    className="bpma-input text-xs"
                  />
                  <button type="submit" className="btn-primary whitespace-nowrap">
                    Assinar itens pendentes
                  </button>
                </form>
              ) : null}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[820px] divide-y divide-slate-200 text-xs dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <tr>
                  <th className="px-3 py-2">O que limpar</th>
                  <th className="px-3 py-2">Quando</th>
                  <th className="px-3 py-2">Responsável pela limpeza</th>
                  <th className="px-3 py-2">Status do item</th>
                  <th className="px-3 py-2">Observações</th>
                  <th className="px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-2 text-slate-500 dark:text-slate-400">
                      Nenhum item encontrado para esta execução semanal.
                    </td>
                  </tr>
                ) : (
                  items.map((executionItem) => (
                    <tr key={executionItem.id}>
                      <td className="px-3 py-2">{executionItem.item.oQueLimpar}</td>
                      <td className="px-3 py-2">{executionItem.quandoAssinado}</td>
                      <td className="px-3 py-2">
                        {executionItem.assinaturaResponsavel || "-"}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={executionItem.status} />
                      </td>
                      <td className="px-3 py-2">
                        {executionItem.observacaoResponsavel || "-"}
                      </td>
                      <td className="px-3 py-2">
                        {executionItem.etapa === "responsavel" && podeAssinarItens ? (
                          <form action={updateWeeklyRecordAction} className="grid min-w-[320px] gap-2">
                            <input type="hidden" name="id" value={String(executionItem.id)} />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <input type="hidden" name="etapa" value="responsavel" />
<WeeklyExecutionFields defaultDate={selectedDate} weekStart={formatDateInput(execution.weekStart)} />
                            <input
                              type="password"
                              name="senhaConfirmacao"
                              required
                              placeholder="Confirme sua senha"
                              className="bpma-input text-xs"
                            />
                            <input
                              type="text"
                              name="observacaoAssinatura"
                              placeholder="Observação (Opcional)"
                              className="bpma-input text-xs"
                            />
                            <button type="submit" className="btn-primary whitespace-nowrap">
                              Assinar item
                            </button>
                          </form>
                        ) : executionItem.etapa === "responsavel" && isHistorico ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Sem permissão para assinar item histórico
                          </span>
                        ) : executionItem.etapa === "responsavel" ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Sem permissão para assinar item
                          </span>
                        ) : executionItem.etapa === "supervisor" ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Aguardando assinatura da área da semana
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Item Concluído
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 btn-group">
          <Link href={closeHref} className="btn-secondary">
            Fechar
          </Link>
        </div>
      </div>
    </div>
  );
}
